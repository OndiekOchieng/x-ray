import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { createXRayGraph } from '@/lib/xray/selectors'
import { notConfigured } from '@/lib/xray/capability'
import { correlationKey } from '@/lib/xray/pipeline/correlation'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { readExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import { readSnapshot, writeInitialSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import { loadCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { InvestigationService } from './investigation-service'
import { ExecutionNotRetryable, InlineExecutionService, type ExecutionRuntime } from './inline-execution'

const AT = '2026-09-20T12:00:00Z'
const calibration = kenyattaMaralalGraph()
const graph = createXRayGraph({ ...calibration, claims: calibration.claims.map((claim) =>
  claim.id === 'DC003' ? { ...claim, sourcePassage: undefined } : claim) })
const key = correlationKey({ investigationId: graph.investigation.id, stage: 'PLAN', inputArtifactVersion: 0 },
  { proposition: '8b durable semantic identity' })
let signalTrace!: () => void, releaseTrace!: () => void
const traceEntered = new Promise<void>((resolve) => { signalTrace = resolve })
const traceRelease = new Promise<void>((resolve) => { releaseTrace = resolve })
let planCalls = 0, traceCalls = 0
const stages = (fail: boolean): StageDefinition[] => [
  { stage: 'PLAN', run(ctx) { planCalls++; ctx.ledger.assign(key, () => 'EV-100'); return {} } },
  { stage: 'TRACE', async run(ctx) {
    traceCalls++
    assert.equal(ctx.ledger.idFor(key), 'EV-100')
    if (fail) { signalTrace(); await traceRelease; throw new Error('Synthetic interrupted TRACE') }
    return {}
  } },
]
const runtime: ExecutionRuntime = {
  async initial() { return { investigation: graph.investigation, seed: graph,
    stages: stages(true), maxAttempts: 1 } },
  async resume() { return { stages: stages(false), maxAttempts: 1,
    stopEvidence: { saturationObserved: true } } },
}
async function migrate(db: PGlite) {
  for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
    '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit',
    '0007_investigation_submissions'])
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
}
async function run() {
  const db = new PGlite()
  try {
    await migrate(db)
    await writeInitialSnapshot(db, graph)
    const historical = await readSnapshot(db, graph.investigation.id, 1)
    const read = new InvestigationService(db)
    const command = new InlineExecutionService(db, runtime, () => AT, () => 'RUN-8B')
    const pending = command.startExecution(graph.investigation.id)
    await traceEntered
    const during = await read.getExecutionStatus(graph.investigation.id, 'RUN-8B')
    assert.equal(during.status, 'PENDING')
    assert.deepStrictEqual(during.stageRuns.map((item) => [item.stage, item.status]), [['PLAN','SUCCEEDED']])
    const inFlight = await read.getCandidate(graph.investigation.id, 'RUN-8B')
    assert.equal(inFlight.artifactVersion, 1)
    assert.equal(inFlight.kind, 'CANDIDATE')
    assert.equal((await loadCandidateCheckpoint(db, 'RUN-8B')).ledger.idFor(key), 'EV-100')
    releaseTrace()
    const failed = await pending
    assert.equal(failed.status, 'STAGE_FAILED')
    assert.deepStrictEqual(failed.stageRuns.map((item) => [item.stage, item.status]),
      [['PLAN','SUCCEEDED'],['TRACE','FAILED']])
    assert.equal((await read.getCandidate(graph.investigation.id, 'RUN-8B')).artifactVersion, 1)
    const auditBefore = await readExecutionAudit(db, 'RUN-8B')
    assert.equal(auditBefore.journal.stageEntries().length, 2)
    assert.equal(auditBefore.validations.length, 0)
    console.log('8b: PLAN boundary visible during blocked TRACE; failed attempt durable, no gates fabricated PASS')

    // New service instance uses only the stored candidate, ledger and audit.
    const resumed = new InlineExecutionService(db, runtime, () => AT)
    const completed = await resumed.resumeExecution(graph.investigation.id, 'RUN-8B')
    assert.equal(completed.status, 'COMPLETED')
    assert.equal(planCalls, 1)
    assert.equal(traceCalls, 2)
    assert.deepStrictEqual(completed.stageRuns.map((item) => [item.stage, item.status]),
      [['PLAN','SUCCEEDED'],['TRACE','FAILED'],['TRACE','SUCCEEDED']])
    const checkpoint = await loadCandidateCheckpoint(db, 'RUN-8B')
    assert.equal(checkpoint.artifactVersion, 2)
    assert.equal(checkpoint.ledger.idFor(key), 'EV-100')
    assert.deepStrictEqual(checkpoint.accumulator.rebuild().sourcePositions, graph.sourcePositions)
    assert.deepStrictEqual(checkpoint.accumulator.rebuild().evidence.map((item) => item.knowledgeBasis),
      graph.evidence.map((item) => item.knowledgeBasis))
    const auditAfter = await readExecutionAudit(db, 'RUN-8B')
    assert.deepStrictEqual(auditAfter.journal.entries.slice(0, auditBefore.journal.length), auditBefore.journal.entries)
    assert.equal(auditAfter.validations.length, 1)
    assert.equal(auditAfter.validations[0].result.valid, true)
    assert.equal(auditAfter.reviewHistory.rounds.length, 1)
    assert.deepStrictEqual(auditAfter.journal.gateEntries().map((item) => item.gate), ['VALIDATE','REVIEW'])
    assert.equal(auditAfter.reviewHistory.rounds[0].result.summary.fullCapability, false)
    assert.equal(completed.committedVersion, null)
    await assert.rejects(resumed.resumeExecution(graph.investigation.id, 'RUN-8B'), ExecutionNotRetryable)
    assert.deepStrictEqual(await readSnapshot(db, graph.investigation.id, 1), historical)
    assert.equal(((await db.query(`SELECT count(*)::int AS n FROM investigation_versions
      WHERE investigation_id=$1`, [graph.investigation.id])).rows[0] as {n:number}).n, 1)
    console.log('8b: restart/resume preserves identity, revision, v0.3 fields, audit and real gates; no version PASS')

    // A failure after workspace write but before journal append rolls back the
    // entire boundary. The initial PENDING checkpoint remains retryable.
    let injected = false
    const failingDb: SnapshotDatabase = { query: async (sql, params) => {
      if (!injected && sql.includes('INSERT INTO run_journal_entries')) {
        injected = true
        throw new Error('injected audit write failure')
      }
      return db.query(sql, params)
    } }
    const faultRuntime: ExecutionRuntime = { async initial() { return { investigation: graph.investigation,
      seed: graph, stages: [{ stage: 'PLAN', run: () => ({}) }] } },
      async resume() { return { stages: [{ stage: 'PLAN', run: () => ({}) }] } } }
    const faultCommand = new InlineExecutionService(failingDb, faultRuntime, () => AT, () => 'RUN-8B-FAULT')
    await assert.rejects(faultCommand.startExecution(graph.investigation.id), /injected audit write failure/)
    const faultCheckpoint = await loadCandidateCheckpoint(db, 'RUN-8B-FAULT')
    assert.equal(faultCheckpoint.status, 'PENDING')
    assert.equal(faultCheckpoint.artifactVersion, 0)
    assert.equal(faultCheckpoint.journal.length, 0)
    assert.equal((await readExecutionAudit(db, 'RUN-8B-FAULT')).journal.length, 0)
    assert.equal((await read.getExecutionStatus(graph.investigation.id, 'RUN-8B-FAULT')).stageRuns.length, 0)
    const recovered = await new InlineExecutionService(db, faultRuntime, () => AT)
      .resumeExecution(graph.investigation.id, 'RUN-8B-FAULT')
    assert.equal(recovered.status, 'COMPLETED')
    assert.deepStrictEqual(recovered.stageRuns.map((item) => item.status), ['SUCCEEDED'])
    console.log('8b: checkpoint+audit boundary rolls back atomically on injected audit failure PASS')

    const unavailableRuntime: ExecutionRuntime = {
      async initial() { return { investigation: graph.investigation, seed: graph,
        stages: [{ stage: 'TRACE', run: () => notConfigured('research-model:trace', 'Configure research model.') }] } },
      async resume() { return { stages: [] } },
    }
    const capability = await new InlineExecutionService(db, unavailableRuntime, () => AT, () => 'RUN-8B-CAP')
      .startExecution(graph.investigation.id)
    assert.equal(capability.status, 'CAPABILITY_BLOCKED')
    assert.equal(capability.stageRuns[0].status, 'PENDING')
    const capabilityAudit = await readExecutionAudit(db, 'RUN-8B-CAP')
    assert.equal(capabilityAudit.journal.activeCapabilityEntries().length, 1)
    assert.equal(capabilityAudit.journal.stageEntries()[0].error, undefined)
    assert.equal(capabilityAudit.journal.gateEntries().length, 2)
    assert.equal(capability.committedVersion, null)
    console.log('8b: unavailable adapter stays capability-blocked, not stage-failed or committed PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
