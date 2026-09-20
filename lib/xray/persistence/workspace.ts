/** Mutable candidate checkpoint. Immutable snapshots remain the only version source. */
import type { InvestigationId, IsoDateTime } from '@/lib/xray/domain'
import { GraphAccumulator, type AccumulatorState } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger, type CorrelationKey } from '@/lib/xray/pipeline/correlation'
import { RunJournal, type JournalEntry } from '@/lib/xray/pipeline/journal'
import type { RunStatus } from '@/lib/xray/pipeline/run'
import type { SnapshotDatabase } from './snapshot'
import { encodeValue, decodeValue, type Encoded } from './value-codec'

export type WorkspaceRunStatus = RunStatus | 'PENDING' | 'RUNNING'
export interface CandidateCheckpoint {
  executionRunId: string
  investigationId: InvestigationId
  startedAt: IsoDateTime
  updatedAt: IsoDateTime
  status: WorkspaceRunStatus
  artifactVersion: number
  accumulator: GraphAccumulator
  ledger: CorrelationLedger
  journal: RunJournal
}

interface WorkspaceEnvelope {
  format: 1
  data: Encoded
}
interface WorkspacePayload {
  artifactVersion: number
  accumulator: AccumulatorState
  ledgerBindings: readonly (readonly [CorrelationKey, string])[]
  journalEntries: readonly JournalEntry[]
}

/** Atomically checkpoint working state and the execution status on one pinned connection. */
export async function saveCandidateCheckpoint(db: SnapshotDatabase, checkpoint: CandidateCheckpoint): Promise<void> {
  if (checkpoint.artifactVersion < 0 || !Number.isInteger(checkpoint.artifactVersion) ||
      checkpoint.journal.investigationId !== checkpoint.investigationId ||
      checkpoint.accumulator.snapshot().investigation.id !== checkpoint.investigationId)
    throw new Error('Workspace identity/revision mismatch')
  const payload: WorkspacePayload = {
    artifactVersion: checkpoint.artifactVersion,
    accumulator: checkpoint.accumulator.exportState(),
    ledgerBindings: checkpoint.ledger.bindings(),
    journalEntries: checkpoint.journal.entries,
  }
  const state: WorkspaceEnvelope = { format: 1, data: encodeValue(payload) }
  await db.query('BEGIN')
  try {
    await db.query('INSERT INTO investigations(id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [checkpoint.investigationId])
    await db.query(`INSERT INTO execution_runs(id, investigation_id, started_at, status)
      VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
    [checkpoint.executionRunId, checkpoint.investigationId, checkpoint.startedAt, checkpoint.status])
    const run = (await db.query(`UPDATE execution_runs SET status=$1 WHERE id=$2 AND investigation_id=$3
      AND committed_version IS NULL RETURNING id`, [checkpoint.status, checkpoint.executionRunId, checkpoint.investigationId])).rows
    if (run.length !== 1) throw new Error('Execution run is missing, committed, or belongs to another investigation')
    await db.query(`INSERT INTO candidate_workspaces(execution_run_id,state,updated_at) VALUES ($1,$2,$3)
      ON CONFLICT (execution_run_id) DO UPDATE SET state=EXCLUDED.state, updated_at=EXCLUDED.updated_at`,
    [checkpoint.executionRunId, JSON.stringify(state), checkpoint.updatedAt])
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

/** Rebuild class instances; stale stages and capability gaps derive from the journal. */
export async function loadCandidateCheckpoint(db: SnapshotDatabase, executionRunId: string): Promise<CandidateCheckpoint> {
  const found = (await db.query(`SELECT r.investigation_id, r.started_at, r.status, w.updated_at, w.state
    FROM execution_runs r JOIN candidate_workspaces w ON w.execution_run_id=r.id WHERE r.id=$1`, [executionRunId])).rows
  if (found.length !== 1) throw new Error(`No candidate workspace for ${executionRunId}`)
  const row = found[0]
  const envelope = row.state as WorkspaceEnvelope
  if (envelope.format !== 1) throw new Error('Unsupported candidate workspace format')
  const payload = decodeValue(envelope.data) as WorkspacePayload
  if (!Number.isInteger(payload.artifactVersion) || payload.artifactVersion < 0 ||
      payload.accumulator.investigation.id !== row.investigation_id)
    throw new Error('Stored workspace identity/revision mismatch')
  return {
    executionRunId,
    investigationId: row.investigation_id as InvestigationId,
    startedAt: row.started_at as IsoDateTime,
    updatedAt: row.updated_at as IsoDateTime,
    status: row.status as WorkspaceRunStatus,
    artifactVersion: payload.artifactVersion,
    accumulator: GraphAccumulator.fromState(payload.accumulator),
    ledger: CorrelationLedger.fromBindings(payload.ledgerBindings),
    journal: RunJournal.fromEntries(row.investigation_id as InvestigationId, payload.journalEntries),
  }
}
