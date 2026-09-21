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
let signalRevised!: () => void, releaseRevised!: () => void
const revisedEntered = new Promise<void>((resolve) => { signalRevised = resolve })
const revisedRelease = new Promise<void>((resolve) => { releaseRevised = resolve })
let planCalls = 0, traceCalls = 0, revisedPlanCalls = 0
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
  // 0008-0013 are included because `resumeExecution` reconstructs the run mode
  // from `execution_run_causes`, which 0013 creates. The execution layer now
  // genuinely requires that table, so a gate exercising resume must have the
  // schema the code requires rather than a subset of it.
  for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
    '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit',
    '0007_investigation_submissions','0008_publication_events',
    '0009_ati_lifecycle','0010_ati_origin_and_acceptance',
    '0011_ati_acceptance_requires_added_source','0012_ati_intake_digest_provenance',
    '0013_ati_response_identity_and_execution_cause'])
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
    // RUNNING, not PENDING: the contract is that an observer sees the exact
    // durable state, and this run is executing rather than merely scheduled.
    assert.equal(during.status, 'RUNNING')
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

    // -- Gap 1 + 2: revision routing, and control transitions durable at the
    // exact point they are appended rather than at the next stage boundary.
    const revision = { id: 'RR-001', findingId: 'RF-001', stage: 'PLAN' as const,
      action: 'Re-plan against the located evidence.', targets: [] }
    const revisionRuntime: ExecutionRuntime = {
      async initial() { throw new Error('unused') },
      async resume() { return { revision, maxAttempts: 1,
        // An explicit named reason. This calibration graph does not satisfy the
        // structural conditions, so SATURATION is correctly never inferred
        // (D25), and TIME/COST budgets are not representable at all (D27).
        stopEvidence: { reason: 'MANUAL_STOP' },
        stages: [
          { stage: 'PLAN', async run() {
            revisedPlanCalls++
            signalRevised()
            await revisedRelease
            return {}
          } },
          { stage: 'TRACE', run() { traceCalls++; return {} } },
        ] } },
    }
    const reviser = new InlineExecutionService(db, revisionRuntime, () => AT)
    const revising = reviser.resumeExecution(graph.investigation.id, 'RUN-8B')
    await revisedEntered

    // The revised PLAN is blocked and no stage attempt boundary has fired yet,
    // so anything durable here was made durable by the control boundary alone.
    const midRevision = await readExecutionAudit(db, 'RUN-8B')
    const invalidations = midRevision.journal.invalidationEntries()
    assert.equal(invalidations.length, 1)
    assert.equal(invalidations[0].target, 'PLAN')
    assert.equal(invalidations[0].requestId, 'RR-001')
    assert.deepStrictEqual([...invalidations[0].staleStages], ['PLAN', 'TRACE'])
    assert.equal(midRevision.journal.stopEntries().at(-1)?.action, 'RESUMED')
    assert.equal((await loadCandidateCheckpoint(db, 'RUN-8B')).status, 'RUNNING')
    assert.equal((await read.getExecutionStatus(graph.investigation.id, 'RUN-8B')).status, 'RUNNING')
    releaseRevised()
    const revised = await revising
    assert.equal(revised.status, 'COMPLETED')
    // Targeted rerun: both stale stages ran again, and nothing else did.
    assert.equal(revisedPlanCalls, 1)
    assert.equal(traceCalls, 3)
    assert.equal(revised.committedVersion, null)
    const revisedAudit = await readExecutionAudit(db, 'RUN-8B')
    assert.deepStrictEqual(revisedAudit.journal.entries.slice(0, auditAfter.journal.length),
      auditAfter.journal.entries)
    // The first resume recorded no stop at all: this graph does not meet the
    // structural conditions, so saturation is not inferred from one pass.
    assert.deepStrictEqual(auditAfter.journal.stopEntries().map((entry) => entry.action), [])
    assert.deepStrictEqual(revisedAudit.journal.stopEntries().map((entry) => entry.action),
      ['RESUMED', 'STOPPED'])
    assert.equal(revisedAudit.journal.stopEntries().at(-1)?.stop?.reason, 'MANUAL_STOP')
    assert.equal(revisedAudit.reviewHistory.rounds.length, 2)
    console.log('8b: revision routes to its stage; INVALIDATION/RESUMED durable before any stage ran PASS')

    // The STOPPED transition is durable at its own boundary, not at the gate
    // that follows it: failing the VALIDATE boundary must not lose the stop.
    let failValidation = false
    const gateFailingDb: SnapshotDatabase = { query: async (sql, params) => {
      if (failValidation && sql.includes('INSERT INTO run_validation_results'))
        throw new Error('injected validation write failure')
      return db.query(sql, params)
    } }
    const stopRuntime: ExecutionRuntime = {
      async initial() { return { investigation: graph.investigation, seed: graph,
        stages: [{ stage: 'PLAN', run: () => ({}) }], maxAttempts: 1,
        stopEvidence: { reason: 'MANUAL_STOP' } } },
      async resume() { throw new Error('unused') },
    }
    failValidation = true
    await assert.rejects(
      new InlineExecutionService(gateFailingDb, stopRuntime, () => AT, () => 'RUN-8B-STOP')
        .startExecution(graph.investigation.id), /injected validation write failure/)
    const stopAudit = await readExecutionAudit(db, 'RUN-8B-STOP')
    assert.deepStrictEqual(stopAudit.journal.stopEntries().map((entry) => entry.action), ['STOPPED'])
    assert.equal(stopAudit.validations.length, 0)
    assert.equal(stopAudit.journal.gateEntries().length, 0)
    assert.equal((await loadCandidateCheckpoint(db, 'RUN-8B-STOP')).journal.stopEntries().length, 1)
    console.log('8b: STOPPED is durable at its own transition, not at the following gate PASS')

    // A plain resume of a completed run is refused; only a revision reopens it.
    await assert.rejects(
      new InlineExecutionService(db, runtime, () => AT).resumeExecution(graph.investigation.id, 'RUN-8B'),
      ExecutionNotRetryable)
    console.log('8b: completed run reopens only by revision, never by bare resume PASS')

    // -- Gap 3: a submitted URL fabricates no canonical Source.
    const submitted = await new InvestigationService(db, () => AT, () => 'XRAY-FRESH')
      .createInvestigation({ sourceUrl: 'https://example.org/illustrative-notice' })
    const fresh = {
      id: submitted.investigationId, protocolVersion: '0.1.0', status: 'CREATED' as const,
      // 1-based by the validator's rule. It is a pointer, not a claim that a
      // version exists: the assertions below prove investigation_versions is
      // empty throughout, and execution never writes it.
      surfaceSourceId: 'SRC-001', createdAt: AT, currentVersion: 1, stageRuns: [],
      claimIds: [], sourceIds: [], evidenceIds: [], discrepancyIds: [],
      disconfirmationIds: [], findingIds: [], gapIds: [],
    }
    const canonicalRowCount = async (table: string) => ((await db.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE investigation_id=$1`,
      [submitted.investigationId])).rows[0] as { n: number }).n

    let ingestSource = false
    const ingestRuntime: ExecutionRuntime = {
      async initial() { return { investigation: fresh, stages: ingestStages(), maxAttempts: 1 } },
      async resume() { return { stages: ingestStages(), maxAttempts: 1 } },
    }
    function ingestStages(): StageDefinition[] {
      return [{ stage: 'INGEST', run(ctx) {
        if (!ingestSource) {
          return notConfigured('research-adapter:retrieve', 'Configure a retrieval adapter.')
        }
        return { sources: [{ id: ctx.ids.source(), title: 'Illustrative public notice',
          url: 'https://example.org/illustrative-notice', retrievedAt: AT, sourceType: 'OTHER',
          evidenceClass: 'PRIMARY', originStatus: 'ORIGINATING', accessibility: 'RETRIEVED' }] }
      } }]
    }

    const ingestCommand = new InlineExecutionService(db, ingestRuntime, () => AT, () => 'RUN-FRESH')
    const withoutAdapter = await ingestCommand.startExecution(submitted.investigationId)
    assert.equal(withoutAdapter.committedVersion, null)
    const beforeIngest = await read.getCandidate(submitted.investigationId, 'RUN-FRESH')
    // The stored URL is a request, not evidence. Nothing canonical exists yet.
    assert.deepStrictEqual(beforeIngest.graph.sources, [])
    assert.deepStrictEqual(beforeIngest.graph.evidence, [])
    assert.equal(beforeIngest.graph.investigation.surfaceSourceId, 'SRC-001')
    for (const table of ['sources', 'evidence', 'claims', 'investigation_versions'])
      assert.equal(await canonicalRowCount(table), 0)
    const freshAudit = await readExecutionAudit(db, 'RUN-FRESH')
    assert.equal(freshAudit.journal.activeCapabilityEntries().length, 1)
    assert.equal(freshAudit.journal.stageEntries()[0].status, 'PENDING')
    console.log('8b: submitted URL alone creates no Source, Evidence or version row PASS')

    // Only actual adapter output creates the surface Source.
    ingestSource = true
    await new InlineExecutionService(db, ingestRuntime, () => AT)
      .resumeExecution(submitted.investigationId, 'RUN-FRESH')
    const afterIngest = await read.getCandidate(submitted.investigationId, 'RUN-FRESH')
    assert.equal(afterIngest.graph.sources.length, 1)
    assert.equal(afterIngest.graph.sources[0].id, 'SRC-001')
    assert.equal(afterIngest.graph.sources[0].url, 'https://example.org/illustrative-notice')
    assert.equal(afterIngest.graph.investigation.sourceIds.length, 1)
    // Execution still commits nothing: the version tables remain empty.
    assert.equal(await canonicalRowCount('investigation_versions'), 0)
    assert.equal(await canonicalRowCount('sources'), 0)
    console.log('8b: the surface Source appears only from actual INGEST output PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
