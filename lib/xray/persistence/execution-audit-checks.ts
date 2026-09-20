import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { available } from '@/lib/xray/capability'
import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { createXRayGraph } from '@/lib/xray/selectors'
import { RunJournal, type GateRun } from '@/lib/xray/pipeline/journal'
import { runPipeline } from '@/lib/xray/pipeline/run'
import { RESEARCH_STAGES } from '@/lib/xray/pipeline/stages'
import { validateXRayGraph, type ValidationResult } from '@/lib/xray/validation'
import { appendReviewRound, emptyReviewHistory, reviewXRayGraph,
  reviewXRayGraphWithModel, type ReviewerModel } from '@/lib/xray/review'
import { appendExecutionAudit, readExecutionAudit, type ValidationAuditRecord } from './execution-audit'

const AT = '2026-09-19T21:00:00Z'
const clean = kenyattaMaralalGraph()
const promoted = kenyattaMaralalGraph('CHARACTERIZATION_PROMOTED')
const model: ReviewerModel = { name: '7d-b-deterministic-review-stub', async judge(query) {
  const flagged = query.kind === 'EVIDENTIARY_REACH' && query.claim.id === 'DC003' &&
    query.checkId === 'V03/INSTITUTIONAL_CHARACTERIZATION_PROMOTION' &&
    query.claim.text === 'Kenyatta operationally led Mau Mau.'
  return available({ flagged, severity: 'BLOCKING',
    rationale: flagged ? 'Synthetic characterization promotion exceeds the record.' : 'No concern.',
    requiredAction: flagged ? 'Revise the claim.' : 'None.',
    targets: flagged ? [{ kind: 'Claim' as const, id: 'DC003' }] : [] })
} }
async function migrate(db: PGlite) {
  for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
    '0004_source_position_knowledge_basis']) {
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
  }
  const up = readFileSync(new URL('../../../db/migrations/0005_execution_audit.up.sql', import.meta.url), 'utf8')
  await db.exec(up)
  await db.exec(readFileSync(new URL('../../../db/migrations/0005_execution_audit.down.sql', import.meta.url), 'utf8'))
  await db.exec(up)
}
const gate = (id: string, name: GateRun['gate'], revision: number, result: GateRun['result'], outcome: GateRun['outcome']): GateRun => ({
  id, investigationId: clean.investigation.id, gate: name, status: outcome === 'SKIPPED' ? 'PENDING' : 'SUCCEEDED',
  inspectedArtifactVersion: revision, outcome, ...(result === undefined ? {} : { result }), startedAt: AT, completedAt: AT,
})
const validationRef = (result: ValidationResult) => ({ kind: 'VALIDATION' as const, valid: result.valid,
  errorCount: result.summary.errorCount, warningCount: result.summary.warningCount })
async function run() {
  const db = new PGlite()
  try {
    await migrate(db)
    await db.query('INSERT INTO investigations(id) VALUES ($1)', [clean.investigation.id])
    const createRun = (id: string) => db.query(`INSERT INTO execution_runs(id,investigation_id,started_at,status)
      VALUES ($1,$2,$3,'RUNNING')`, [id, clean.investigation.id, AT])

    // A real pipeline gate result: v0.3 FULL rejects missing KnowledgeBasis,
    // and the Reviewer gate is skipped without fabricating a review result.
    const invalid = createXRayGraph({ ...clean,
      evidence: clean.evidence.map((item, index) => index === 0 ? { ...item, knowledgeBasis: undefined } : item),
    })
    const blocked = await runPipeline({ investigation: invalid.investigation, seed: invalid, stages: [], clock: () => AT })
    assert.equal(blocked.status, 'GATE_BLOCKED')
    assert.equal(blocked.journal.gateEntries()[0].outcome, 'BLOCKED')
    assert.equal(blocked.journal.gateEntries()[1].outcome, 'SKIPPED')
    assert.equal(blocked.review, undefined)
    await createRun('RUN-VALIDATOR-BLOCKED')
    await appendExecutionAudit(db, 'RUN-VALIDATOR-BLOCKED', { journal: blocked.journal,
      validations: [{ gateRunId: blocked.journal.gateEntries()[0].id, result: blocked.validation! }],
      reviewHistory: emptyReviewHistory(clean.investigation.id) })
    const blockedReload = await readExecutionAudit(db, 'RUN-VALIDATOR-BLOCKED')
    assert.deepStrictEqual(blockedReload.journal.entries, blocked.journal.entries)
    assert.deepStrictEqual(blockedReload.validations[0].result, blocked.validation)
    assert.equal(blockedReload.reviewHistory.rounds.length, 0)
    assert.equal(blockedReload.journal.gateEntries()[1].result, undefined)
    console.log('7d-b: failing FULL validation persists; REVIEW remains SKIPPED without fabricated result PASS')

    const firstValidation = validateXRayGraph(promoted, { mode: 'FULL' })
    const secondValidation = validateXRayGraph(clean, { mode: 'FULL' })
    assert.equal(firstValidation.valid, true)
    assert.equal(secondValidation.valid, true)
    const firstReview = await reviewXRayGraphWithModel(promoted, { model, reviewedAt: AT })
    const secondReview = await reviewXRayGraphWithModel(clean, { model, reviewedAt: AT })
    assert.ok(firstReview.summary.blockingFindings > 0)
    assert.equal(secondReview.summary.blockingFindings, 0)
    assert.notEqual(firstReview.graphFingerprint, secondReview.graphFingerprint)
    const history1 = appendReviewRound(emptyReviewHistory(clean.investigation.id), firstReview)
    const history2 = appendReviewRound(history1, secondReview)
    const journal = new RunJournal(clean.investigation.id)
    journal.appendStage({ id: 'SR-AUDIT-1', investigationId: clean.investigation.id, stage: 'TRACE',
      status: 'FAILED', inputArtifactVersion: 0, startedAt: AT, completedAt: AT, error: 'Synthetic first attempt failed.' })
    journal.appendCapability({ id: 'CR-AUDIT-1', investigationId: clean.investigation.id,
      stage: 'TRACE', observedArtifactVersion: 0, observedAt: AT,
      unavailable: { kind: 'CAPABILITY_UNAVAILABLE', operation: 'research-model:trace', reason: 'NOT_CONFIGURED',
        detail: 'Synthetic unavailable capability.', resolvedBy: 'Supply model.' } })
    journal.appendStage({ id: 'SR-AUDIT-2', investigationId: clean.investigation.id, stage: 'TRACE',
      status: 'SUCCEEDED', inputArtifactVersion: 0, outputArtifactVersion: 1, startedAt: AT, completedAt: AT })
    journal.appendGate(gate('GR-AUDIT-1', 'VALIDATE', 1, validationRef(firstValidation), 'CLEAR'))
    journal.appendGate(gate('GR-AUDIT-2', 'REVIEW', 1, { kind: 'REVIEW_HISTORY',
      investigationId: clean.investigation.id, roundIndex: 0, graphFingerprint: firstReview.graphFingerprint }, 'CONCERNS'))
    journal.appendStop({ id: 'TR-AUDIT-1', investigationId: clean.investigation.id, action: 'STOPPED',
      stop: { reason: 'SATURATION', unresolvedHighPriorityLeads: [] }, observedAt: AT })
    await createRun('RUN-REVIEW-ROUNDS')
    const validations: ValidationAuditRecord[] = [{ gateRunId: 'GR-AUDIT-1', result: firstValidation }]
    await appendExecutionAudit(db, 'RUN-REVIEW-ROUNDS', { journal, validations, reviewHistory: history1 })
    const prior = await readExecutionAudit(db, 'RUN-REVIEW-ROUNDS')
    assert.deepStrictEqual(prior.journal.entries, journal.entries)
    assert.deepStrictEqual(prior.reviewHistory, history1)
    const revision = firstReview.revisionRequests[0]
    const staleStages = RESEARCH_STAGES.slice(RESEARCH_STAGES.indexOf(revision.stage))
    journal.appendInvalidation({ id: 'IR-AUDIT-1', investigationId: clean.investigation.id,
      requestId: revision.id, target: revision.stage, staleStages, observedAt: AT })
    journal.appendStop({ id: 'TR-AUDIT-2', investigationId: clean.investigation.id, action: 'RESUMED', observedAt: AT })
    journal.appendStage({ id: 'SR-AUDIT-3', investigationId: clean.investigation.id, stage: revision.stage,
      status: 'SUCCEEDED', inputArtifactVersion: 1, outputArtifactVersion: 2, startedAt: AT, completedAt: AT })
    journal.appendGate(gate('GR-AUDIT-3', 'VALIDATE', 2, validationRef(secondValidation), 'CLEAR'))
    journal.appendGate(gate('GR-AUDIT-4', 'REVIEW', 2, { kind: 'REVIEW_HISTORY',
      investigationId: clean.investigation.id, roundIndex: 1, graphFingerprint: secondReview.graphFingerprint }, 'CLEAR'))
    validations.push({ gateRunId: 'GR-AUDIT-3', result: secondValidation })
    await appendExecutionAudit(db, 'RUN-REVIEW-ROUNDS', { journal, validations, reviewHistory: history2 })
    const reloaded = await readExecutionAudit(db, 'RUN-REVIEW-ROUNDS')
    assert.deepStrictEqual(reloaded.journal.entries, journal.entries)
    assert.deepStrictEqual(reloaded.reviewHistory, history2)
    assert.deepStrictEqual(reloaded.validations, validations)
    assert.deepStrictEqual(reloaded.reviewHistory.rounds[0], history1.rounds[0])
    assert.equal(reloaded.journal.entries.length, 11)
    assert.deepStrictEqual(new Set(reloaded.journal.entries.map((item) => item.kind)),
      new Set(['STAGE','GATE','CAPABILITY','STOP','INVALIDATION']))
    assert.equal(Object.hasOwn(reloaded.journal.gateEntries()[0], 'outputArtifactVersion'), false)
    assert.deepStrictEqual(reloaded.journal.staleStages(), staleStages.filter((stage) => stage !== revision.stage))
    const gateStorage = (await db.query(`SELECT run_payload,validation_gate_run_id,review_round_index
      FROM run_journal_entries WHERE execution_run_id='RUN-REVIEW-ROUNDS' AND run_id='GR-AUDIT-2'`)).rows[0] as {
        run_payload: unknown; validation_gate_run_id: string | null; review_round_index: number | null
      }
    assert.equal(JSON.stringify(gateStorage.run_payload).includes('"result"'), false)
    assert.equal(gateStorage.validation_gate_run_id, null)
    assert.equal(gateStorage.review_round_index, 0)
    assert.equal(((await db.query(`SELECT count(*)::int AS n FROM run_validation_results
      WHERE execution_run_id='RUN-REVIEW-ROUNDS'`)).rows[0] as { n: number }).n, 2)
    assert.equal(((await db.query(`SELECT count(*)::int AS n FROM run_review_rounds
      WHERE execution_run_id='RUN-REVIEW-ROUNDS'`)).rows[0] as { n: number }).n, 2)
    await assert.rejects(db.query(`UPDATE run_review_rounds SET result='{}'::jsonb
      WHERE execution_run_id='RUN-REVIEW-ROUNDS' AND round_index=0`), /immutable|mutation|update/i)
    await assert.rejects(db.query(`DELETE FROM run_journal_entries
      WHERE execution_run_id='RUN-REVIEW-ROUNDS' AND sequence=0`), /immutable|mutation|delete/i)
    await assert.rejects(appendExecutionAudit(db, 'RUN-REVIEW-ROUNDS', {
      journal: RunJournal.fromEntries(clean.investigation.id, journal.entries.slice(1).map((item, index) =>
        ({ ...item, sequence: index }))), validations, reviewHistory: history2,
    }), /append-only/)
    assert.deepStrictEqual((await readExecutionAudit(db, 'RUN-REVIEW-ROUNDS')).journal.entries, journal.entries)
    console.log('7d-b: five journal kinds, failed attempts, STOP/RESUME, invalidation, two immutable review rounds PASS')

    const noModel = reviewXRayGraph(clean, { reviewedAt: AT })
    assert.equal(noModel.summary.fullCapability, false)
    assert.ok(noModel.checks.some((item) => item.outcome === 'NOT_EVALUATED' && item.notEvaluatedReason))
    const incompleteHistory = appendReviewRound(emptyReviewHistory(clean.investigation.id), noModel)
    const incompleteJournal = new RunJournal(clean.investigation.id)
    incompleteJournal.appendGate(gate('GR-INCOMPLETE-1', 'REVIEW', 0, { kind: 'REVIEW_HISTORY',
      investigationId: clean.investigation.id, roundIndex: 0, graphFingerprint: noModel.graphFingerprint }, 'CONCERNS'))
    await createRun('RUN-INCOMPLETE-REVIEW')
    await appendExecutionAudit(db, 'RUN-INCOMPLETE-REVIEW', { journal: incompleteJournal,
      validations: [], reviewHistory: incompleteHistory })
    const incompleteReload = await readExecutionAudit(db, 'RUN-INCOMPLETE-REVIEW')
    assert.deepStrictEqual(incompleteReload.reviewHistory, incompleteHistory)
    assert.equal(incompleteReload.reviewHistory.rounds[0].result.summary.fullCapability, false)
    assert.ok(incompleteReload.reviewHistory.rounds[0].result.checks.some((item) => item.outcome === 'NOT_EVALUATED'))
    console.log('7d-b: missing ReviewerModel remains NOT_EVALUATED and capability-incomplete PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
