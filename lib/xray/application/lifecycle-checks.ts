/**
 * Integrated investigation lifecycle gate (8d).
 *
 * One stored investigation traverses the whole path through the public
 * boundaries 8a–8c established and the commit/graduation persistence #7 owns:
 *
 *   create → execute → inspect → candidate → revise/resume
 *   → validate/review → graduate → commit → version/history → UI projection
 *
 * This is verification, not another architecture slice. Nothing here adds a
 * publication endpoint, an ATI flow, a worker or a live provider. The stage
 * stubs are deterministic and go through the same stage ports production
 * orchestration uses; no research is claimed.
 *
 * Run:  pnpm check:lifecycle
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { createXRayGraph, type XRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import { notConfigured } from '@/lib/xray/capability'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { readSnapshot, writeInitialSnapshot } from '@/lib/xray/persistence/snapshot'
import { VersionConflict, type ReEvaluationAudit } from '@/lib/xray/persistence/version-commit'
import { getInvestigationGraph } from '@/lib/xray/investigations'
import { GraduationService } from './graduation-service'
import { InvestigationService } from './investigation-service'
import { ExecutionNotRetryable } from './inline-execution'
import type { ExecutionRuntime } from './inline-execution'
import { setDatabaseProvider, setExecutionRuntimeProvider, submittedInvestigation } from './runtime'

import { POST as createInvestigation } from '@/app/api/investigations/route'
import { POST as startExecution } from '@/app/api/investigations/[id]/executions/route'
import { GET as executionStatus } from '@/app/api/investigations/[id]/executions/[runId]/route'
import { POST as resumeExecution } from '@/app/api/investigations/[id]/executions/[runId]/resume/route'
import { GET as candidateState } from '@/app/api/investigations/[id]/candidate/route'
import { GET as committedVersion } from '@/app/api/investigations/[id]/versions/[version]/route'
import { GET as versionHistory } from '@/app/api/investigations/[id]/versions/route'

const BASE = 'http://localhost/api/investigations'
const SUBJECT = 'XRAY-LIFECYCLE-001'
const AT = '2026-09-19T10:00:00Z'
const NEW_SOURCE = 'SRC-LIFECYCLE-01'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []
const bodies: { route: string; text: string }[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

async function call(route: string, response: Promise<Response>) {
  const res = await response
  const text = await res.text()
  bodies.push({ route, text })
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const params = <T>(value: T) => Promise.resolve(value)
const post = (url: string, body?: unknown) =>
  new Request(url, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const get = (url: string) => new Request(url)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

async function migrate(db: PGlite) {
  for (const name of ['0001_version_ownership', '0002_source_retrieval_precision',
    '0003_reevaluation_audit', '0004_source_position_knowledge_basis', '0005_execution_audit',
    '0006_graduation_audit', '0007_investigation_submissions'])
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
}

/** The benchmark corpus under a given id. Storage is not the fixture. */
function corpusFor(id: string): XRayGraph {
  const base = createXrayKe001Graph()
  return createXRayGraph({
    ...(base as XRayGraphInput),
    claims: base.claims.map((claim) => ({ ...claim, investigationId: id })),
    investigation: {
      ...base.investigation,
      id,
      // StageRun carries its own investigation id, and the validator checks it
      // sits on the investigation that holds it.
      stageRuns: base.investigation.stageRuns.map((run) => ({ ...run, investigationId: id })),
    },
    version: { ...base.version!, investigationId: id },
  })
}

/**
 * Stages replaying the corpus, plus a legitimate successor change.
 *
 * `TRACE` also contributes one newly located record and widens one claim's
 * recorded ambiguity — a real re-investigation outcome, and what makes the
 * committed result a successor rather than a duplicate.
 */
function lifecycleStages(v1: XRayGraph): StageDefinition[] {
  const surface = v1.sources.filter((s) => s.id === v1.investigation.surfaceSourceId)
  const newSource = {
    id: NEW_SOURCE, title: 'Illustrative supervision award notice', retrievedAt: AT,
    sourceType: 'PROCUREMENT_RECORD' as const, evidenceClass: 'PRIMARY' as const,
    originStatus: 'ORIGINATING' as const, accessibility: 'RETRIEVED' as const,
  }
  const revised = v1.claims.map((claim) => claim.id === 'C002'
    ? { ...clone(claim), ambiguities: [...claim.ambiguities, 'Lot 3 supervision award located at v2'] }
    : clone(claim))

  return [
    { stage: 'INGEST', run: () => ({ sources: clone(surface) }) },
    { stage: 'DECOMPOSE', run: () => ({ claims: clone(v1.claims.filter((c) => c.origin === 'SURFACE')) }) },
    { stage: 'CLASSIFY', run: () => ({ claims: clone(v1.claims.filter((c) => c.origin === 'SURFACE')) }) },
    { stage: 'PLAN', run: () => ({}) },
    { stage: 'TRACE', run: () => ({
      claims: revised,
      sources: [...clone(v1.sources), newSource],
      evidence: clone(v1.evidence),
      sourcePositions: clone(v1.sourcePositions),
    }) },
    { stage: 'PROVENANCE', run: () => ({
      evidenceProvenance: clone(v1.evidenceProvenance),
      sourceDependencies: clone(v1.sourceDependencies),
    }) },
    { stage: 'DISCONFIRM', run: () => ({ disconfirmations: clone(v1.disconfirmations) }) },
    { stage: 'RECONCILE', run: () => ({ discrepancies: clone(v1.discrepancies) }) },
    { stage: 'GRADE', run: () => ({ findings: clone(v1.findings).map((f) => ({ ...f, gapIds: [] })) }) },
    { stage: 'GAPS', run: () => ({ gaps: clone(v1.gaps), findings: clone(v1.findings) }) },
  ]
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)
    setDatabaseProvider(async () => db)

    const v1 = corpusFor(SUBJECT)
    await writeInitialSnapshot(db, v1)
    const v1Before = await readSnapshot(db, SUBJECT, 1)
    const read = new InvestigationService(db)
    const graduation = new GraduationService(db, () => AT)

    const runtime: ExecutionRuntime = {
      async initial() {
        return { investigation: clone(v1.investigation), stages: lifecycleStages(v1),
          maxAttempts: 1, stopEvidence: { saturationObserved: true } }
      },
      async resume() {
        return { stages: lifecycleStages(v1), maxAttempts: 1,
          stopEvidence: { saturationObserved: true } }
      },
    }
    setExecutionRuntimeProvider(async () => runtime)

    // =====================================================================
    // Creation continuity — one identity, created by the route
    // =====================================================================
    //
    // The successor lifecycle below starts from a seeded v1, because #7 has no
    // path that gives a route-created identity a first committed version (C0
    // proves why). These two checks close the gap the seeded subject leaves:
    // the identity `POST /api/investigations` mints is the same one that
    // executes, accumulates a candidate, and reports its own empty history.

    let createdId = ''
    await check('C1 · continuity · a POST-created identity executes and holds its own candidate', async () => {
      const made = await call('POST /investigations', createInvestigation(
        post(BASE, { sourceUrl: 'https://example.org/created-subject' })))
      if (made.status !== 201) return `create status ${made.status}`
      createdId = made.body.investigationId
      if (made.body.latestCommittedVersion !== null) return 'a new identity claims a committed version'

      const corpus = corpusFor(createdId)
      setExecutionRuntimeProvider(async () => ({
        async initial() {
          return { investigation: clone(corpus.investigation), stages: lifecycleStages(corpus),
            maxAttempts: 1, stopEvidence: { saturationObserved: true } }
        },
        async resume() {
          return { stages: lifecycleStages(corpus), maxAttempts: 1,
            stopEvidence: { saturationObserved: true } }
        },
      }))

      const started = await call('POST /executions', startExecution(
        post(`${BASE}/${createdId}/executions`), { params: params({ id: createdId }) }))
      if (started.status !== 201) return `execution status ${started.status}`
      if (started.body.investigationId !== createdId) return 'the run belongs to a different identity'
      if (started.body.status !== 'COMPLETED') return `run ended ${started.body.status}`
      if (started.body.committedVersion !== null) return 'execution committed a version'

      const candidate = await call('GET /candidate', candidateState(
        get(`${BASE}/${createdId}/candidate?executionRunId=${started.body.executionRunId}`),
        { params: params({ id: createdId }) }))
      if (candidate.status !== 200 || candidate.body.kind !== 'CANDIDATE')
        return `candidate ${candidate.status}/${candidate.body?.kind}`
      if (candidate.body.graph.investigation.id !== createdId)
        return 'the candidate belongs to a different identity'
      if (candidate.body.graph.claims.length !== corpus.claims.length)
        return 'the candidate did not accumulate the run output'

      // Research happened; nothing was published by it.
      const history = await call('GET /versions', versionHistory(get(`${BASE}/${createdId}/versions`),
        { params: params({ id: createdId }) }))
      if (history.body.latestCommittedVersion !== null) return 'a pointer advanced without a commit'
      return history.body.versions.length === 0 ? null : 'history exists without a commit'
    })

    await check('C0 · boundary · #7 has no first-version path for a route-created identity', async () => {
      // Recorded as an executable fact, because it is the reason the successor
      // lifecycle below begins from a seeded v1 rather than from this identity.
      // `writeInitialSnapshot` inserts the investigation row itself, so an id
      // that `POST` already created cannot receive a v1 through it, and
      // `commitNextVersion` needs a predecessor of at least 1.
      const outcome = await writeInitialSnapshot(db, corpusFor(createdId))
        .then(() => null, (error: unknown) => error as Error)
      if (outcome === null) return 'a route-created identity accepted an initial snapshot'
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [createdId])).rows[0] as { v: number | null }
      if (pointer.v !== null) return 'the rejected write still moved the pointer'
      return /duplicate key|unique|investigations_pkey/i.test(outcome.message)
        ? null : `rejected for the wrong reason: ${outcome.message}`
    })

    // =====================================================================
    // Successor lifecycle — seeded v1, committed v2
    // =====================================================================

    let runId = ''
    await check('L1 · execute · a run traverses every stage and both gates', async () => {
      setExecutionRuntimeProvider(async () => runtime)
      const res = await call('POST /executions', startExecution(post(`${BASE}/${SUBJECT}/executions`),
        { params: params({ id: SUBJECT }) }))
      if (res.status !== 201) return `status ${res.status}`
      runId = res.body.executionRunId
      if (res.body.status !== 'COMPLETED') {
        const { readExecutionAudit } = await import('@/lib/xray/persistence/execution-audit')
        const a = await readExecutionAudit(db, runId)
        const bad = a.journal.stageEntries().find((e) => e.status === 'FAILED')
        return `run ended ${res.body.status}${bad ? ` at ${bad.stage}: ${bad.error}` : ''}`
      }
      return res.body.committedVersion === null ? null : 'execution committed a version by itself'
    })

    await check('L2 · inspect · status exposes the persisted stage sequence', async () => {
      const res = await call('GET /executions/{runId}', executionStatus(
        get(`${BASE}/${SUBJECT}/executions/${runId}`), { params: params({ id: SUBJECT, runId }) }))
      if (res.status !== 200) return `status ${res.status}`
      const succeeded = res.body.stageRuns.filter((r: any) => r.status === 'SUCCEEDED').map((r: any) => r.stage)
      return succeeded.length === 10 ? null : `${succeeded.length} stages succeeded`
    })

    await check('L3 · candidate · working state is retrievable and labelled CANDIDATE', async () => {
      const res = await call('GET /candidate', candidateState(
        get(`${BASE}/${SUBJECT}/candidate?executionRunId=${runId}`), { params: params({ id: SUBJECT }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (res.body.kind !== 'CANDIDATE') return `kind ${res.body.kind}`
      if (!res.body.graph.sources.some((s: any) => s.id === NEW_SOURCE))
        return 'the newly located record is not in the candidate'
      return res.body.graph.investigation.currentVersion === 1
        ? null : 'the candidate already claims to be a new version'
    })

    await check('L4 · revise · a revision reopens the completed run through the route', async () => {
      const res = await call('POST /resume', resumeExecution(
        post(`${BASE}/${SUBJECT}/executions/${runId}/resume`, {
          revision: { stage: 'GRADE', findingId: 'RF-001',
            action: 'Re-grade against the newly located record',
            targets: [{ kind: 'Claim', id: 'C002' }] },
        }), { params: params({ id: SUBJECT, runId }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (res.body.status !== 'COMPLETED') return `run ended ${res.body.status}`
      const grades = res.body.stageRuns.filter((r: any) => r.stage === 'GRADE')
      return grades.length === 2 ? null : `${grades.length} GRADE run(s)`
    })

    await check('L5 · validate/review · the run recorded a real stop, validation and review', async () => {
      const { readExecutionAudit } = await import('@/lib/xray/persistence/execution-audit')
      const audit = await readExecutionAudit(db, runId)
      const stops = audit.journal.stopEntries().map((e) => e.action)
      if (!stops.includes('STOPPED')) return `stops recorded: ${stops.join(',') || 'none'}`
      if (audit.journal.stopEntries().at(-1)?.stop?.reason !== 'SATURATION')
        return 'the recorded stop is not saturation'
      if (!audit.validations.some((v) => v.result.valid)) return 'no passing validation recorded'
      if (audit.reviewHistory.rounds.length === 0) return 'no review round recorded'
      // Assurance is still incomplete: no reviewer model is configured.
      return audit.reviewHistory.rounds.at(-1)!.result.summary.fullCapability === false
        ? null : 'full capability was claimed with no model wired'
    })

    let assessment: any
    await check('L6 · graduate · the promoted candidate assesses as eligible BLOCKED', async () => {
      await graduation.promote(SUBJECT, runId, {
        expectedPredecessor: 1, trigger: 'NEW_SOURCE_RECEIVED', createdAt: AT })
      const record = await graduation.assess(SUBJECT, runId)
      assessment = record.result
      if (assessment.verdict !== 'BLOCKED') return `verdict ${assessment.verdict}`
      if (assessment.reasons.length !== 0) return `${assessment.reasons.length} reason(s) against the graph`
      return assessment.blockers.length > 0 ? null : 'BLOCKED with no capability blocker'
    })

    const audit: ReEvaluationAudit[] = [
      { claimId: 'C002', reason: 'NEW_EVIDENCE', causes: [{ kind: 'SOURCE', id: NEW_SOURCE }] },
    ]

    await check('L7 · commit · an eligible assessment commits v2 and links the exact run', async () => {
      const { version } = await graduation.commit(SUBJECT, runId,
        { expectedPredecessor: 1, reEvaluationAudit: audit })
      if (version !== 2) return `committed v${version}`
      const link = (await db.query(
        'SELECT committed_version, committed_graduation_index FROM execution_runs WHERE id=$1',
        [runId])).rows[0] as { committed_version: number; committed_graduation_index: number }
      if (link.committed_version !== 2) return `run links v${link.committed_version}`
      if (link.committed_graduation_index !== 0) return 'the linked assessment index is wrong'
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [SUBJECT])).rows[0] as { v: number }
      return pointer.v === 2 ? null : `latestCommittedVersion is ${pointer.v}`
    })

    await check('L8 · version · v2 round-trips exactly through the route', async () => {
      const res = await call('GET /versions/2', committedVersion(
        get(`${BASE}/${SUBJECT}/versions/2`), { params: params({ id: SUBJECT, version: '2' }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (res.body.kind !== 'COMMITTED_VERSION') return `kind ${res.body.kind}`
      const graph = res.body.graph
      if (graph.investigation.currentVersion !== 2) return 'reconstructed currentVersion is wrong'
      if (!graph.sources.some((s: any) => s.id === NEW_SOURCE)) return 'the new record is missing from v2'
      if (graph.version.supersedesVersion !== 1) return 'v2 does not supersede v1'
      const revised = graph.claims.find((c: any) => c.id === 'C002')
      return revised?.ambiguities.includes('Lot 3 supervision award located at v2')
        ? null : 'the re-evaluated claim did not round-trip'
    })

    await check('L9 · history · v1 is unchanged and history is ordered [1,2]', async () => {
      const after = await readSnapshot(db, SUBJECT, 1)
      if (JSON.stringify(after, (k, v) => k === 'index' ? undefined : v) !==
          JSON.stringify(v1Before, (k, v) => k === 'index' ? undefined : v))
        return 'v1 changed when v2 was committed'
      if (after.investigation.currentVersion !== 1) return 'historical v1 does not read as version 1'
      const res = await call('GET /versions', versionHistory(get(`${BASE}/${SUBJECT}/versions`),
        { params: params({ id: SUBJECT }) }))
      if (res.body.latestCommittedVersion !== 2) return `pointer ${res.body.latestCommittedVersion}`
      return JSON.stringify(res.body.versions.map((v: any) => v.version)) === '[1,2]'
        ? null : `history ${JSON.stringify(res.body.versions.map((v: any) => v.version))}`
    })

    await check('L10 · projection · the UI query path serves v2 from storage', async () => {
      const graph = await getInvestigationGraph(SUBJECT)
      if (!graph) return 'the stored investigation did not resolve'
      if (graph.investigation.id !== SUBJECT) return 'a different investigation was served'
      if (graph.investigation.currentVersion !== 2) return 'the UI path did not follow the pointer'
      return graph.sources.some((s) => s.id === NEW_SOURCE) ? null : 'v2 content is missing'
    })

    // =====================================================================
    // Failure paths
    // =====================================================================

    await check('F1 · a committed run cannot be resumed', async () => {
      const res = await call('POST /resume', resumeExecution(
        post(`${BASE}/${SUBJECT}/executions/${runId}/resume`), { params: params({ id: SUBJECT, runId }) }))
      if (res.status !== 409) return `status ${res.status}`
      return res.body.error.code === 'EXECUTION_NOT_RETRYABLE' ? null : `code ${res.body.error.code}`
    })

    await check('F1 · a committed run stays inspectable but is not active work', async () => {
      const status = await call('GET /executions/{runId}', executionStatus(
        get(`${BASE}/${SUBJECT}/executions/${runId}`), { params: params({ id: SUBJECT, runId }) }))
      if (status.status !== 200) return `status route gave ${status.status}`
      if (status.body.committedVersion !== 2) return 'the run no longer reports its commit'
      const candidate = await call('GET /candidate', candidateState(
        get(`${BASE}/${SUBJECT}/candidate?executionRunId=${runId}`), { params: params({ id: SUBJECT }) }))
      return candidate.status === 200 && candidate.body.kind === 'CANDIDATE'
        ? null : 'the committed run\'s working state became unreadable'
    })

    await check('F2 · a stale predecessor conflicts; there is no silent rebase', async () => {
      const outcome = await graduation.commit(SUBJECT, runId,
        { expectedPredecessor: 1, reEvaluationAudit: audit }).then(() => null, (e: unknown) => e)
      if (outcome === null) return 'a second commit against v1 succeeded'
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [SUBJECT])).rows[0] as { v: number }
      if (pointer.v !== 2) return `the pointer moved to ${pointer.v}`
      return outcome instanceof VersionConflict || /already committed|stale/i.test((outcome as Error).message)
        ? null : `rejected as ${(outcome as Error).name}: ${(outcome as Error).message}`
    })

    // A fresh submission with no adapters: retrievable, never committable.
    let blockedId = '', blockedRun = ''
    await check('F3 · a capability-blocked run is retrievable and not committable', async () => {
      setExecutionRuntimeProvider(null)
      const made = await call('POST /investigations', createInvestigation(
        post(BASE, { sourceUrl: 'https://example.org/unadapted' })))
      blockedId = made.body.investigationId
      const started = await call('POST /executions', startExecution(
        post(`${BASE}/${blockedId}/executions`), { params: params({ id: blockedId }) }))
      blockedRun = started.body.executionRunId
      if (started.body.committedVersion !== null) return 'a blocked run committed'
      if (started.body.status === 'COMPLETED') return 'a run with no adapter reported COMPLETED'
      const outcome = await graduation.assess(blockedId, blockedRun).then(
        (r) => r.result.verdict, (e: unknown) => (e as Error).name)
      if (outcome === 'PASS') return 'a run with no research graduated'
      const status = await call('GET /executions/{runId}', executionStatus(
        get(`${BASE}/${blockedId}/executions/${blockedRun}`), { params: params({ id: blockedId, runId: blockedRun }) }))
      return status.status === 200 ? null : 'the blocked run is not retrievable'
    })

    await check('F4 · a stage failure is retrievable and does not commit', async () => {
      setExecutionRuntimeProvider(async () => ({
        async initial() {
          return { investigation: submittedInvestigation('placeholder', AT), maxAttempts: 1,
            stages: [{ stage: 'INGEST', run: () => { throw new Error('synthetic ingest failure') } }] }
        },
        async resume() { return { stages: [], maxAttempts: 1 } },
      }))
      const made = await call('POST /investigations', createInvestigation(
        post(BASE, { sourceUrl: 'https://example.org/failing' })))
      const id = made.body.investigationId
      setExecutionRuntimeProvider(async () => ({
        async initial() {
          return { investigation: submittedInvestigation(id, AT), maxAttempts: 1,
            stages: [{ stage: 'INGEST', run: () => { throw new Error('synthetic ingest failure') } }] }
        },
        async resume() { return { stages: [], maxAttempts: 1 } },
      }))
      const started = await call('POST /executions', startExecution(
        post(`${BASE}/${id}/executions`), { params: params({ id }) }))
      if (started.body.status !== 'STAGE_FAILED') return `status ${started.body.status}`
      if (started.body.committedVersion !== null) return 'a failed run committed'
      const failed = started.body.stageRuns.find((r: any) => r.status === 'FAILED')
      if (!failed) return 'the failure is not recorded'

      // The failure is retrievable as a FAILED stage run; its raw reason is
      // deliberately not in the payload. `ExecutionStatusDto` carries no
      // `error` field, so an exception message cannot reach a caller through
      // the status route — the reason stays in the run journal, where an
      // operator reads it and a stranger does not.
      if (/synthetic ingest failure/.test(JSON.stringify(started.body)))
        return 'raw exception text reached the status payload'

      const { readExecutionAudit } = await import('@/lib/xray/persistence/execution-audit')
      const journalled = (await readExecutionAudit(db, started.body.executionRunId))
        .journal.stageEntries().find((entry) => entry.status === 'FAILED')
      return journalled?.error === 'synthetic ingest failure'
        ? null : `the journal recorded: ${journalled?.error}`
    })

    await check('F5 · a completed-but-uncommitted run does not look committed', async () => {
      setExecutionRuntimeProvider(async () => runtime)
      const started = await call('POST /executions', startExecution(post(`${BASE}/${SUBJECT}/executions`),
        { params: params({ id: SUBJECT }) }))
      const secondRun = started.body.executionRunId
      if (started.body.status !== 'COMPLETED') return `status ${started.body.status}`
      if (started.body.committedVersion !== null) return 'an uncommitted run reports a version'
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [SUBJECT])).rows[0] as { v: number }
      if (pointer.v !== 2) return 'a completed run advanced the pointer by itself'
      const served = await getInvestigationGraph(SUBJECT)
      return served?.investigation.currentVersion === 2
        ? null : 'the UI path served uncommitted working state'
    })

    await check('F6 · unknown investigation, run, version and candidate stay typed 404s', async () => {
      const cases: [string, Promise<Response>][] = [
        ['investigation', versionHistory(get(`${BASE}/NOPE/versions`), { params: params({ id: 'NOPE' }) })],
        ['run', executionStatus(get(`${BASE}/${SUBJECT}/executions/NOPE`),
          { params: params({ id: SUBJECT, runId: 'NOPE' }) })],
        ['wrong owner', executionStatus(get(`${BASE}/${blockedId}/executions/${runId}`),
          { params: params({ id: blockedId, runId }) })],
        ['version', committedVersion(get(`${BASE}/${SUBJECT}/versions/7`),
          { params: params({ id: SUBJECT, version: '7' }) })],
        ['candidate', candidateState(get(`${BASE}/${SUBJECT}/candidate?executionRunId=NOPE`),
          { params: params({ id: SUBJECT }) })],
      ]
      for (const [label, response] of cases) {
        const res = await call(`404 ${label}`, response)
        if (res.status !== 404 || res.body.error.code !== 'NOT_FOUND')
          return `${label} gave ${res.status}/${res.body?.error?.code}`
      }
      return null
    })

    await check('F7 · no path falls back to the benchmark for a stored id', async () => {
      const served = await getInvestigationGraph(SUBJECT)
      if (served?.investigation.id !== SUBJECT) return 'the subject did not resolve to itself'
      if (served.sources.some((s) => s.id === NEW_SOURCE) === false)
        return 'the benchmark corpus was served instead of stored v2'
      const submitted = await getInvestigationGraph(blockedId)
      if (submitted !== null) return 'an investigation with no version resolved to a graph'
      return (await getInvestigationGraph('XRAY-NOT-STORED')) === null
        ? null : 'an unknown id resolved to something'
    })

    await check('F8 · no response leaks SQL, prompts, secrets, stacks or ledger internals', async () => {
      const forbidden: [RegExp, string][] = [
        [/\b(SELECT|INSERT INTO|UPDATE |DELETE FROM)\b/i, 'SQL'],
        [/\bpostgres(ql)?:\/\//i, 'a connection string'],
        [/\b(systemPrompt|userPrompt|promptTemplate)\b/, 'a prompt'],
        [/\bpk_[0-9a-f]{8}_/, 'a correlation ledger key'],
        [/\bledgerBindings\b/, 'ledger internals'],
        [/\b(at ModuleJob|node:internal|wasm:\/\/|\.ts:\d+:\d+)\b/, 'a stack trace'],
        [/\bXRAY_POSTGRES_URL\b|\bprocess\.env\b/, 'environment configuration'],
      ]
      const hits: string[] = []
      for (const { route, text } of bodies)
        for (const [pattern, what] of forbidden) if (pattern.test(text)) hits.push(`${route}: ${what}`)
      return hits.length ? [...new Set(hits)].join('; ') : null
    })

    // -- Report ------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray investigation lifecycle — 8d integrated gate\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log(`\n${bodies.length} route responses inspected for leakage.\n`)
    if (failed.length) process.exitCode = 1
  } finally {
    setDatabaseProvider(null)
    setExecutionRuntimeProvider(null)
    await db.close()
  }
}
