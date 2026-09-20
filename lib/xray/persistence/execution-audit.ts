/** Append-only execution audit, separate from the mutable candidate workspace. */
import { isDeepStrictEqual } from 'node:util'
import type { ReviewHistory, ReviewResult } from '@/lib/xray/review'
import { emptyReviewHistory } from '@/lib/xray/review'
import { RunJournal, type GateRun, type JournalEntry } from '@/lib/xray/pipeline/journal'
import type { ValidationResult } from '@/lib/xray/validation'
import type { SnapshotDatabase } from './snapshot'
import { encodeValue, decodeValue, type Encoded } from './value-codec'

export interface ValidationAuditRecord { gateRunId: string; result: ValidationResult }
export interface ExecutionAudit {
  journal: RunJournal
  validations: readonly ValidationAuditRecord[]
  reviewHistory: ReviewHistory
}

const encoded = (value: unknown) => JSON.stringify(encodeValue(value))
const decoded = <T>(value: unknown): T => decodeValue(value as Encoded) as T

function verifyReferences(audit: ExecutionAudit): void {
  const investigationId = audit.journal.investigationId
  if (audit.reviewHistory.investigationId !== investigationId) throw new Error('Review history investigation mismatch')
  const validations = new Map(audit.validations.map((record) => [record.gateRunId, record.result]))
  if (validations.size !== audit.validations.length) throw new Error('Duplicate validation gate result')
  const gates = new Map(audit.journal.gateEntries().map((run) => [run.id, run]))
  for (const record of audit.validations) {
    const gate = gates.get(record.gateRunId)
    if (gate?.gate !== 'VALIDATE' || gate.result?.kind !== 'VALIDATION')
      throw new Error(`Validation result ${record.gateRunId} has no matching gate`)
  }
  for (const [index, round] of audit.reviewHistory.rounds.entries()) {
    if (round.round !== index + 1 || round.result.investigationId !== investigationId)
      throw new Error('Review history round numbering/identity mismatch')
  }
  for (const gate of gates.values()) {
    if (gate.result?.kind === 'VALIDATION') {
      const result = validations.get(gate.id)
      if (gate.gate !== 'VALIDATE' || !result || gate.result.valid !== result.valid ||
          gate.result.errorCount !== result.summary.errorCount ||
          gate.result.warningCount !== result.summary.warningCount)
        throw new Error(`VALIDATE gate ${gate.id} does not reference its full result`)
    }
    if (gate.result?.kind === 'REVIEW_HISTORY') {
      const round = audit.reviewHistory.rounds[gate.result.roundIndex]
      if (gate.gate !== 'REVIEW' || !round || gate.result.investigationId !== investigationId ||
          round.result.graphFingerprint !== gate.result.graphFingerprint)
        throw new Error(`REVIEW gate ${gate.id} does not reference its round`)
    }
  }
}

/** Append only new entries/rounds/results; reject any changed historical prefix. */
export async function appendExecutionAudit(db: SnapshotDatabase, executionRunId: string, audit: ExecutionAudit): Promise<void> {
  verifyReferences(audit)
  await db.query('BEGIN')
  try {
    const run = (await db.query('SELECT investigation_id FROM execution_runs WHERE id=$1 FOR UPDATE', [executionRunId])).rows
    if (run.length !== 1 || run[0].investigation_id !== audit.journal.investigationId)
      throw new Error('Execution audit run identity mismatch')
    const existing = await readExecutionAudit(db, executionRunId)
    if (audit.journal.length < existing.journal.length ||
        !isDeepStrictEqual(audit.journal.entries.slice(0, existing.journal.length), existing.journal.entries) ||
        audit.reviewHistory.rounds.length < existing.reviewHistory.rounds.length ||
        !isDeepStrictEqual(audit.reviewHistory.rounds.slice(0, existing.reviewHistory.rounds.length), existing.reviewHistory.rounds))
      throw new Error('Execution audit history is append-only')
    const previousValidations = new Map(existing.validations.map((record) => [record.gateRunId, record.result]))
    for (const record of existing.validations) {
      if (!isDeepStrictEqual(audit.validations.find((item) => item.gateRunId === record.gateRunId)?.result, record.result))
        throw new Error('Validation audit history is append-only')
    }
    for (const record of audit.validations) if (!previousValidations.has(record.gateRunId)) {
      await db.query('INSERT INTO run_validation_results(execution_run_id,gate_run_id,result) VALUES ($1,$2,$3)',
        [executionRunId, record.gateRunId, encoded(record.result)])
    }
    for (const [index, round] of audit.reviewHistory.rounds.entries()) if (index >= existing.reviewHistory.rounds.length) {
      await db.query('INSERT INTO run_review_rounds(execution_run_id,round_index,result) VALUES ($1,$2,$3)',
        [executionRunId, index, encoded(round.result)])
    }
    for (const entry of audit.journal.entries.slice(existing.journal.length)) {
      const { result: _result, ...runPayload } = entry.kind === 'GATE' ? entry.run : { ...entry.run, result: undefined }
      await db.query(`INSERT INTO run_journal_entries
        (execution_run_id,sequence,kind,run_id,run_payload,validation_gate_run_id,review_round_index)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [executionRunId, entry.sequence, entry.kind, entry.run.id,
        encoded(runPayload), entry.kind === 'GATE' && entry.run.result?.kind === 'VALIDATION' ? entry.run.id : null,
        entry.kind === 'GATE' && entry.run.result?.kind === 'REVIEW_HISTORY' ? entry.run.result.roundIndex : null])
    }
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

/** Rebuild gate result references from their durable records, then validate journal invariants. */
export async function readExecutionAudit(db: SnapshotDatabase, executionRunId: string): Promise<ExecutionAudit> {
  const run = (await db.query('SELECT investigation_id FROM execution_runs WHERE id=$1', [executionRunId])).rows
  if (run.length !== 1) throw new Error(`No execution run ${executionRunId}`)
  const investigationId = run[0].investigation_id as string
  const validationRows = (await db.query(`SELECT gate_run_id,result FROM run_validation_results
    WHERE execution_run_id=$1 ORDER BY gate_run_id`, [executionRunId])).rows
  const validations = validationRows.map((row) => ({ gateRunId: row.gate_run_id as string,
    result: decoded<ValidationResult>(row.result) }))
  const validationByGate = new Map(validations.map((record) => [record.gateRunId, record.result]))
  const reviewRows = (await db.query(`SELECT round_index,result FROM run_review_rounds
    WHERE execution_run_id=$1 ORDER BY round_index`, [executionRunId])).rows
  const reviewHistory: ReviewHistory = reviewRows.length === 0 ? emptyReviewHistory(investigationId) : {
    investigationId,
    rounds: reviewRows.map((row, index) => {
      if (row.round_index !== index) throw new Error('Review round ordinal gap')
      return { round: index + 1, result: decoded<ReviewResult>(row.result) }
    }),
  }
  const entries = (await db.query(`SELECT sequence,kind,run_payload,validation_gate_run_id,review_round_index
    FROM run_journal_entries WHERE execution_run_id=$1 ORDER BY sequence`, [executionRunId])).rows
    .map((row): JournalEntry => {
      const runPayload = decoded<GateRun>(row.run_payload)
      if (row.kind !== 'GATE') return { kind: row.kind, sequence: row.sequence, run: runPayload } as JournalEntry
      if (row.validation_gate_run_id !== null) {
        const result = validationByGate.get(row.validation_gate_run_id as string)
        if (!result) throw new Error('Missing durable validation result')
        runPayload.result = { kind: 'VALIDATION', valid: result.valid,
          errorCount: result.summary.errorCount, warningCount: result.summary.warningCount }
      } else if (row.review_round_index !== null) {
        const roundIndex = row.review_round_index as number
        const round = reviewHistory.rounds[roundIndex]
        if (!round) throw new Error('Missing durable review round')
        runPayload.result = { kind: 'REVIEW_HISTORY', investigationId, roundIndex,
          graphFingerprint: round.result.graphFingerprint }
      }
      return { kind: 'GATE', sequence: row.sequence as number, run: runPayload }
    })
  const journal = RunJournal.fromEntries(investigationId, entries)
  const audit = { journal, validations, reviewHistory }
  verifyReferences(audit)
  return audit
}
