import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { createXRayGraph, type XRayGraph } from '@/lib/xray/selectors'
import { assessGraduation } from '@/lib/xray/acceptance/runner'
import { correlationKey } from '@/lib/xray/pipeline/correlation'
import { runPipeline, type PipelineRunResult } from '@/lib/xray/pipeline/run'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { emptyReviewHistory } from '@/lib/xray/review'
import { appendExecutionAudit, readExecutionAudit } from './execution-audit'
import { appendGraduationAudit, readLatestGraduation } from './graduation-audit'
import { readSnapshot, writeInitialSnapshot } from './snapshot'
import { commitNextVersion } from './version-commit'
import { loadCandidateCheckpoint, saveCandidateCheckpoint } from './workspace'

const AT = '2026-09-20T06:00:00Z'
const input = (graph: XRayGraph) => { const { index: _index, ...value } = graph;
  return JSON.parse(JSON.stringify(value)) as typeof value }
const historical = kenyattaMaralalGraph()
const base = createXRayGraph({ ...input(historical),
  claims: input(historical).claims.map((claim) => {
    if (claim.id !== 'DC003') return claim
    const { sourcePassage: _passage, ...withoutPassage } = claim
    return withoutPassage
  }) })
const candidate = createXRayGraph({ ...input(base),
  investigation: { ...base.investigation, currentVersion: 2 },
  version: { ...base.version!, version: 2, createdAt: AT, trigger: 'RE_EVALUATION',
    supersedesVersion: 1, addedSourceIds: [], addedEvidenceIds: [], reEvaluatedClaimIds: ['DC003'] },
  sourcePositions: base.sourcePositions.map((item) => item.id === 'SP-001'
    ? { ...item, relationshipDescription: 'Synthetic corrected origin context.' } : item),
  evidence: base.evidence.map((item) => item.id === 'EV-100'
    ? { ...item, knowledgeBasis: 'ADMINISTRATIVE_RECORD' as const } : item),
})
const key = correlationKey({ investigationId: candidate.investigation.id, stage: 'PLAN', inputArtifactVersion: 0 },
  { proposition: 'stable durable integration binding' })
let traceCalls = 0
let planCalls = 0
const stages: StageDefinition[] = [
  { stage: 'PLAN', run(ctx) { planCalls++; ctx.ledger.assign(key, () => 'DC003'); return {} } },
  { stage: 'TRACE', run(ctx) {
    traceCalls++
    assert.equal(ctx.ledger.idFor(key), 'DC003')
    if (traceCalls === 1) throw new Error('synthetic interruption before restart')
    return {}
  } },
]
async function migrate(db: PGlite) {
  for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
    '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit'])
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
}
async function run() {
  const db = new PGlite()
  try {
    await migrate(db)
    await writeInitialSnapshot(db, base)
    const v1 = await readSnapshot(db, base.investigation.id, 1)
    let partial: PipelineRunResult | undefined = await runPipeline({ investigation: candidate.investigation,
      seed: input(candidate), stages, maxAttempts: 1, clock: () => AT })
    assert.equal(partial.status, 'STAGE_FAILED')
    assert.equal(partial.artifactVersion, 1)
    assert.equal(partial.ledger.idFor(key), 'DC003')
    const interruptedEntries = structuredClone(partial.journal.entries)
    for (const runId of ['RUN-7DD-INTEGRATED','RUN-7DD-NONCOMMIT']) {
      await saveCandidateCheckpoint(db, { executionRunId: runId,
        investigationId: candidate.investigation.id, startedAt: AT, updatedAt: AT,
        status: partial.status, artifactVersion: partial.artifactVersion,
        accumulator: partial.accumulator, ledger: partial.ledger, journal: partial.journal })
      await appendExecutionAudit(db, runId, { journal: partial.journal, validations: [],
        reviewHistory: emptyReviewHistory(candidate.investigation.id) })
    }
    partial = undefined // Reload all execution state from durable storage.
    const restored = await loadCandidateCheckpoint(db, 'RUN-7DD-INTEGRATED')
    const reloadedAudit = await readExecutionAudit(db, 'RUN-7DD-INTEGRATED')
    assert.deepStrictEqual(restored.journal.entries, interruptedEntries)
    assert.deepStrictEqual(reloadedAudit.journal.entries, interruptedEntries)
    assert.equal(restored.artifactVersion, 1)
    assert.equal(restored.ledger.idFor(key), 'DC003')
    assert.deepStrictEqual(restored.accumulator.rebuild().sourcePositions, candidate.sourcePositions)
    assert.deepStrictEqual(restored.accumulator.rebuild().evidence.map((item) => item.knowledgeBasis),
      candidate.evidence.map((item) => item.knowledgeBasis))
    const finished = await runPipeline({ investigation: candidate.investigation, stages,
      resume: { accumulator: restored.accumulator, journal: restored.journal, ledger: restored.ledger },
      startArtifactVersion: restored.artifactVersion, stopEvidence: { saturationObserved: true }, clock: () => AT })
    assert.equal(finished.status, 'COMPLETED')
    assert.equal(planCalls, 1)
    assert.equal(traceCalls, 2)
    assert.equal(finished.artifactVersion, 2)
    assert.deepStrictEqual(finished.journal.entries.slice(0, interruptedEntries.length), interruptedEntries)
    assert.deepStrictEqual(finished.graph, candidate)
    assert.equal(finished.validation?.valid, true)
    assert.ok(finished.reviewHistory)
    await saveCandidateCheckpoint(db, { executionRunId: 'RUN-7DD-INTEGRATED',
      investigationId: candidate.investigation.id, startedAt: AT, updatedAt: AT,
      status: finished.status, artifactVersion: finished.artifactVersion,
      accumulator: finished.accumulator, ledger: finished.ledger, journal: finished.journal })
    const validateGate = finished.journal.gateEntries().find((item) => item.gate === 'VALIDATE')!
    await appendExecutionAudit(db, 'RUN-7DD-INTEGRATED', { journal: finished.journal,
      validations: [{ gateRunId: validateGate.id, result: finished.validation! }],
      reviewHistory: finished.reviewHistory! })
    const fullAudit = await readExecutionAudit(db, 'RUN-7DD-INTEGRATED')
    assert.deepStrictEqual(fullAudit.journal.entries, finished.journal.entries)
    assert.deepStrictEqual(fullAudit.validations[0].result, finished.validation)
    assert.deepStrictEqual(fullAudit.reviewHistory, finished.reviewHistory)
    const graduation = assessGraduation(finished.graph, { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: AT })
    assert.equal(graduation.verdict, 'BLOCKED')
    assert.deepStrictEqual(graduation.reasons, [])
    await appendGraduationAudit(db, 'RUN-7DD-INTEGRATED', finished.graph, graduation)
    assert.deepStrictEqual((await readLatestGraduation(db, 'RUN-7DD-INTEGRATED'))?.result, graduation)
    await commitNextVersion(db, { expectedPredecessor: 1, graph: finished.graph, assessment: graduation,
      reEvaluationAudit: [{ claimId: 'DC003', reason: 'REVIEW_REVISION',
        detail: 'Source position and knowledge basis reassessed.', causes: [] }],
      executionRunId: 'RUN-7DD-INTEGRATED' })
    assert.deepStrictEqual(await readSnapshot(db, candidate.investigation.id, 2), candidate)
    assert.deepStrictEqual(await readSnapshot(db, candidate.investigation.id, 1), v1)
    const link = (await db.query(`SELECT committed_version,committed_graduation_index FROM execution_runs
      WHERE id='RUN-7DD-INTEGRATED'`)).rows[0]
    assert.deepStrictEqual(link, { committed_version: 2, committed_graduation_index: 0 })
    const noncommitting = (await db.query(`SELECT status,committed_version FROM execution_runs
      WHERE id='RUN-7DD-NONCOMMIT'`)).rows[0]
    assert.deepStrictEqual(noncommitting, { status: 'STAGE_FAILED', committed_version: null })
    assert.deepStrictEqual((await readExecutionAudit(db, 'RUN-7DD-NONCOMMIT')).journal.entries, interruptedEntries)
    assert.equal(((await db.query(`SELECT count(*)::int AS n FROM investigation_versions
      WHERE investigation_id=$1`, [candidate.investigation.id])).rows[0] as {n:number}).n, 2)
    // Committed reconstruction reads no workspace or audit: removing this mutable
    // workspace cannot change the immutable version snapshot.
    await db.query(`DELETE FROM candidate_workspaces WHERE execution_run_id='RUN-7DD-INTEGRATED'`)
    assert.deepStrictEqual(await readSnapshot(db, candidate.investigation.id, 2), candidate)
    console.log('7d-d: restart → resume → gates → audit → graduation → commit; failed run stays uncommitted PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
