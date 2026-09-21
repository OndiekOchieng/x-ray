/**
 * Route-level checks for the investigation API (8c).
 *
 * Everything here goes through an exported route handler with a real `Request`
 * and real route params — not through the service underneath it. A service
 * test proves the logic; only a route test proves the parsing, the status
 * code, the serialization and, most importantly, what the body does *not*
 * contain.
 *
 * Run:  pnpm check:api-routes
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { createXRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import { writeInitialSnapshot } from '@/lib/xray/persistence/snapshot'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { getInvestigationGraph } from '@/lib/xray/investigations'
import {
  setDatabaseProvider, setExecutionRuntimeProvider, submittedInvestigation,
} from './runtime'
import { InvestigationService } from './investigation-service'
import type { ExecutionRuntime } from './inline-execution'

import { POST as createInvestigation } from '@/app/api/investigations/route'
import { POST as startExecution } from '@/app/api/investigations/[id]/executions/route'
import { GET as executionStatus } from '@/app/api/investigations/[id]/executions/[runId]/route'
import { POST as resumeExecution } from '@/app/api/investigations/[id]/executions/[runId]/resume/route'
import { GET as candidateState } from '@/app/api/investigations/[id]/candidate/route'
import { GET as committedVersion } from '@/app/api/investigations/[id]/versions/[version]/route'
import { GET as versionHistory } from '@/app/api/investigations/[id]/versions/route'

const AT = '2026-09-19T09:00:00Z'
const BASE = 'http://localhost/api/investigations'
const STORED_ID = 'XRAY-STORED-001'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []
const bodies: { route: string; text: string }[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try {
    detail = await fn()
  } catch (err) {
    detail = `threw: ${(err as Error).message}`
  }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

/** Call a route and record its body for the leakage sweep. */
async function call(route: string, response: Promise<Response>): Promise<{ status: number; body: any }> {
  const res = await response
  const text = await res.text()
  bodies.push({ route, text })
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const params = <T>(value: T) => Promise.resolve(value)
const post = (url: string, body?: unknown) =>
  new Request(url, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const get = (url: string) => new Request(url)

async function migrate(db: PGlite) {
  // 0008-0013 are included because `resumeExecution` reconstructs the run mode
  // from `execution_run_causes`, which 0013 creates. The execution layer now
  // genuinely requires that table, so a gate exercising resume must have the
  // schema the code requires rather than a subset of it.
  for (const name of ['0001_version_ownership', '0002_source_retrieval_precision',
    '0003_reevaluation_audit', '0004_source_position_knowledge_basis', '0005_execution_audit',
    '0006_graduation_audit', '0007_investigation_submissions', '0008_publication_events',
    '0009_ati_lifecycle', '0010_ati_origin_and_acceptance',
    '0011_ati_acceptance_requires_added_source', '0012_ati_intake_digest_provenance',
    '0013_ati_response_identity_and_execution_cause'])
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
}

/** The calibration corpus under a non-benchmark id, so storage is provably not the fixture. */
function storedGraph() {
  const base = kenyattaMaralalGraph()
  const input: XRayGraphInput = {
    ...base,
    claims: base.claims.map((claim) => ({
      ...claim,
      investigationId: STORED_ID,
      ...(claim.origin === 'DISCOVERED' ? { sourcePassage: undefined } : {}),
    })),
    investigation: { ...base.investigation, id: STORED_ID },
    version: { ...base.version!, investigationId: STORED_ID },
  }
  return createXRayGraph(input)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)
    setDatabaseProvider(async () => db)
    const stored = storedGraph()
    await writeInitialSnapshot(db, stored)

    // -- F1: two URLs, two investigations, neither the benchmark ------------
    let firstId = '', secondId = ''
    await check('F1 · two submitted URLs create two distinct investigations, not the fixture', async () => {
      const a = await call('POST /investigations', createInvestigation(
        post(BASE, { sourceUrl: 'https://example.org/notice-a' })))
      const b = await call('POST /investigations', createInvestigation(
        post(BASE, { sourceUrl: 'https://example.org/notice-b', focus: 'Lot 3' })))
      if (a.status !== 201 || b.status !== 201) return `status ${a.status}/${b.status}`
      firstId = a.body.investigationId
      secondId = b.body.investigationId
      if (firstId === secondId) return 'both submissions resolved to one investigation'
      if ([firstId, secondId].includes('XRAY-KE-001')) return 'a submission resolved to the benchmark'
      if (a.body.latestCommittedVersion !== null) return 'a new investigation claims a committed version'
      if (b.body.submission.focus !== 'Lot 3') return 'focus was not stored'
      return null
    })

    // -- F2/F3: start and read a run ---------------------------------------
    let runId = ''
    await check('F2 · starting execution returns the real run id and its durable status', async () => {
      const res = await call('POST /executions', startExecution(post(`${BASE}/${firstId}/executions`),
        { params: params({ id: firstId }) }))
      if (res.status !== 201) return `status ${res.status}`
      runId = res.body.executionRunId
      if (!runId || res.body.investigationId !== firstId) return 'run identity missing'
      // With no adapter configured, INGEST produces no surface Source, so FULL
      // validation stops the run at the gate. Blocked either way, and never
      // completed or committed: the point is that the status is the durable
      // one, not a particular label.
      if (!['GATE_BLOCKED', 'CAPABILITY_BLOCKED'].includes(res.body.status))
        return `status ${res.body.status}`
      if (res.body.committedVersion !== null) return 'execution committed a version'
      return res.body.stageRuns.some((r: any) => r.status === 'PENDING')
        ? null : 'no stage was recorded as scheduled-but-unrun'
    })

    await check('F3 · status exposes persisted stage progress and no internal error text', async () => {
      const res = await call('GET /executions/{runId}', executionStatus(
        get(`${BASE}/${firstId}/executions/${runId}`),
        { params: params({ id: firstId, runId }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (!Array.isArray(res.body.stageRuns) || res.body.stageRuns.length === 0)
        return 'no persisted stage runs'
      const unexpected = res.body.stageRuns.filter((r: any) => r.status !== 'PENDING')
      if (unexpected.length) return `stage run status ${unexpected[0].status}`
      return res.body.stageRuns.every((r: any) => typeof r.stage === 'string')
        ? null : 'stage runs are not serialized'
    })

    // -- F4: bare resume of unfinished work --------------------------------
    await check('F4 · a bare resume continues an unfinished execution', async () => {
      const res = await call('POST /resume', resumeExecution(post(`${BASE}/${firstId}/executions/${runId}/resume`),
        { params: params({ id: firstId, runId }) }))
      if (res.status !== 200) return `status ${res.status}`
      return res.body.executionRunId === runId ? null : 'resume started a different run'
    })

    // -- F5: revision reopens a completed run through the public payload ----
    let completedId = '', completedRun = ''
    await check('F5 · a revision payload routes a completed run back to its stage', async () => {
      const trivial = (): StageDefinition[] => [
        { stage: 'INGEST', run: (ctx) => ({ sources: [{ id: ctx.ids.source(),
          title: 'Illustrative public notice', url: 'https://example.org/notice-c',
          retrievedAt: AT, sourceType: 'OTHER', evidenceClass: 'PRIMARY',
          originStatus: 'ORIGINATING', accessibility: 'RETRIEVED' }] }) },
        { stage: 'PLAN', run: () => ({}) },
        { stage: 'TRACE', run: () => ({}) },
      ]
      const runtime: ExecutionRuntime = {
        async initial(id) {
          return { investigation: submittedInvestigation(id, AT), stages: trivial(), maxAttempts: 1 }
        },
        async resume() { return { stages: trivial(), maxAttempts: 1 } },
      }
      setExecutionRuntimeProvider(async () => runtime)
      try {
        const made = await call('POST /investigations', createInvestigation(
          post(BASE, { sourceUrl: 'https://example.org/notice-c' })))
        completedId = made.body.investigationId
        const started = await call('POST /executions', startExecution(
          post(`${BASE}/${completedId}/executions`), { params: params({ id: completedId }) }))
        completedRun = started.body.executionRunId
        if (started.body.status !== 'COMPLETED') return `run ended ${started.body.status}`

        // A bare resume of a completed run is refused, and refused as a
        // conflict rather than as an internal error.
        const bare = await call('POST /resume', resumeExecution(
          post(`${BASE}/${completedId}/executions/${completedRun}/resume`),
          { params: params({ id: completedId, runId: completedRun }) }))
        if (bare.status !== 409) return `bare resume status ${bare.status}`
        if (bare.body.error.code !== 'EXECUTION_NOT_RETRYABLE') return 'refusal was not typed'

        const revised = await call('POST /resume', resumeExecution(
          post(`${BASE}/${completedId}/executions/${completedRun}/resume`, {
            revision: { stage: 'PLAN', findingId: 'RF-001', action: 'Re-plan against located evidence',
              targets: [{ kind: 'Claim', id: 'C001' }] },
          }),
          { params: params({ id: completedId, runId: completedRun }) }))
        if (revised.status !== 200) return `revision status ${revised.status}`
        const planRuns = revised.body.stageRuns.filter((r: any) => r.stage === 'PLAN')
        return planRuns.length === 2 ? null : `${planRuns.length} PLAN run(s) after revision`
      } finally {
        setExecutionRuntimeProvider(null)
      }
    })

    await check('F5 · a revision may not route to a control gate', async () => {
      const res = await call('POST /resume', resumeExecution(
        post(`${BASE}/${completedId}/executions/${completedRun}/resume`, {
          revision: { stage: 'REVIEW', findingId: 'RF-001', action: 'x' },
        }),
        { params: params({ id: completedId, runId: completedRun }) }))
      if (res.status !== 400) return `status ${res.status}`
      return res.body.error.field === 'revision.stage' ? null : 'the offending field was not named'
    })

    // -- F6: candidate requires an explicit run id -------------------------
    await check('F6 · candidate requires an explicit run id and stays labelled CANDIDATE', async () => {
      const missing = await call('GET /candidate', candidateState(
        get(`${BASE}/${firstId}/candidate`), { params: params({ id: firstId }) }))
      if (missing.status !== 400) return `absent run id gave ${missing.status}`
      const res = await call('GET /candidate', candidateState(
        get(`${BASE}/${firstId}/candidate?executionRunId=${runId}`), { params: params({ id: firstId }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (res.body.kind !== 'CANDIDATE') return `kind ${res.body.kind}`
      return res.body.executionRunId === runId ? null : 'the wrong run was served'
    })

    // -- F7/F8: committed versions -----------------------------------------
    await check('F7 · version N is labelled COMMITTED_VERSION and reconstructs exactly', async () => {
      const res = await call('GET /versions/{n}', committedVersion(
        get(`${BASE}/${STORED_ID}/versions/1`), { params: params({ id: STORED_ID, version: '1' }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (res.body.kind !== 'COMMITTED_VERSION') return `kind ${res.body.kind}`
      if (res.body.version !== 1) return `version ${res.body.version}`
      const served = res.body.graph
      if (served.investigation.id !== STORED_ID) return 'a different investigation was served'
      for (const [name, expected] of [
        ['claims', stored.claims], ['sources', stored.sources], ['evidence', stored.evidence],
        ['findings', stored.findings], ['gaps', stored.gaps],
      ] as const) {
        const ids = (served[name] ?? []).map((a: any) => a.id).sort()
        if (JSON.stringify(ids) !== JSON.stringify(expected.map((a) => a.id).sort()))
          return `${name} did not reconstruct exactly`
      }
      const positions = (served.sourcePositions ?? []).map((p: any) => p.id).sort()
      if (JSON.stringify(positions) !== JSON.stringify(stored.sourcePositions.map((p) => p.id).sort()))
        return 'v0.3 source positions did not round-trip'
      const bases = (served.evidence ?? []).map((e: any) => e.knowledgeBasis)
      return JSON.stringify(bases) === JSON.stringify(stored.evidence.map((e) => e.knowledgeBasis))
        ? null : 'v0.3 knowledge basis did not round-trip'
    })

    await check('F8 · history is ordered and reports storage latestCommittedVersion', async () => {
      const res = await call('GET /versions', versionHistory(
        get(`${BASE}/${STORED_ID}/versions`), { params: params({ id: STORED_ID }) }))
      if (res.status !== 200) return `status ${res.status}`
      if (res.body.latestCommittedVersion !== 1) return `latest ${res.body.latestCommittedVersion}`
      const numbers = res.body.versions.map((v: any) => v.version)
      if (JSON.stringify(numbers) !== JSON.stringify([...numbers].sort((a: number, b: number) => a - b)))
        return 'history is not ordered'
      // The field must not be renamed into a publication claim.
      const text = JSON.stringify(res.body)
      return /published|public|currentTruth/i.test(text)
        ? 'history relabels the latest committed version as published' : null
    })

    // -- F9: not-found ------------------------------------------------------
    await check('F9 · unknown and wrong-owner resources are 404, never a substitute', async () => {
      const cases: [string, Promise<Response>][] = [
        ['unknown investigation', versionHistory(get(`${BASE}/NOPE/versions`),
          { params: params({ id: 'NOPE' }) })],
        ['unknown run', executionStatus(get(`${BASE}/${firstId}/executions/NOPE`),
          { params: params({ id: firstId, runId: 'NOPE' }) })],
        ['wrong-owner run', executionStatus(get(`${BASE}/${secondId}/executions/${runId}`),
          { params: params({ id: secondId, runId }) })],
        ['unknown version', committedVersion(get(`${BASE}/${STORED_ID}/versions/9`),
          { params: params({ id: STORED_ID, version: '9' }) })],
        ['missing candidate', candidateState(get(`${BASE}/${secondId}/candidate?executionRunId=NOPE`),
          { params: params({ id: secondId }) })],
      ]
      for (const [label, response] of cases) {
        const res = await call(`404 ${label}`, response)
        if (res.status !== 404) return `${label} gave ${res.status}`
        if (res.body.error.code !== 'NOT_FOUND') return `${label} code ${res.body.error.code}`
      }
      return null
    })

    // -- F10: malformed input -----------------------------------------------
    await check('F10 · malformed body, query and version are 400', async () => {
      const cases: [string, Promise<Response>, string][] = [
        ['no body', createInvestigation(post(BASE)), 'body'],
        ['array body', createInvestigation(new Request(BASE, { method: 'POST', body: '[]' })), 'body'],
        ['missing sourceUrl', createInvestigation(post(BASE, { focus: 'x' })), 'sourceUrl'],
        ['non-URL', createInvestigation(post(BASE, { sourceUrl: 'not-a-url' })), 'sourceUrl'],
        ['blank focus', createInvestigation(post(BASE, { sourceUrl: 'https://e.org/a', focus: ' ' })), 'focus'],
      ]
      for (const [label, response, field] of cases) {
        const res = await call(`400 ${label}`, response)
        if (res.status !== 400) return `${label} gave ${res.status}`
        if (res.body.error.field !== field) return `${label} named ${res.body.error.field}`
      }
      for (const raw of ['0', '-1', 'abc', '1.5']) {
        const res = await call('400 version', committedVersion(
          get(`${BASE}/${STORED_ID}/versions/${raw}`), { params: params({ id: STORED_ID, version: raw }) }))
        if (res.status !== 400) return `version "${raw}" gave ${res.status}`
      }
      return null
    })

    // -- F11: timestamps -----------------------------------------------------
    await check('F11 · every timestamp serializes as an ISO string', async () => {
      // Recorded precision is preserved on purpose: a source published in a
      // month X-Ray cannot narrow is stored as `2020-10`, not padded to a day
      // it never claimed. All three precisions are ISO 8601.
      const iso = /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2}))?)?)?$/
      const offenders: string[] = []
      const walk = (value: unknown, path: string) => {
        if (value === null || value === undefined) return
        if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[${i}]`))
        if (typeof value === 'object')
          return Object.entries(value).forEach(([k, v]) => walk(v, `${path}.${k}`))
        if (/At$|^createdAt$|^updatedAt$/.test(path.split('.').pop() ?? '')) {
          if (typeof value !== 'string' || !iso.test(value)) offenders.push(`${path}=${String(value)}`)
        }
      }
      for (const { route, text } of bodies) {
        if (!text) continue
        walk(JSON.parse(text), route)
      }
      return offenders.length ? offenders.slice(0, 3).join(', ') : null
    })

    // -- F12: leakage sweep ---------------------------------------------------
    await check('F12 · no payload leaks SQL, prompts, secrets, internals or ledger bindings', async () => {
      const forbidden: [RegExp, string][] = [
        [/\b(SELECT|INSERT INTO|UPDATE |DELETE FROM)\b/i, 'SQL'],
        [/\bpostgres(ql)?:\/\//i, 'a connection string'],
        [/\b(systemPrompt|userPrompt|promptTemplate)\b/, 'a prompt'],
        [/\bpk_[0-9a-f]{8}_/, 'a correlation ledger key'],
        [/\bledgerBindings\b|\bcorrelation\b/i, 'ledger internals'],
        [/\b(at ModuleJob|node:internal|wasm:\/\/|\.ts:\d+:\d+)\b/, 'an internal stack trace'],
        [/\bXRAY_POSTGRES_URL\b|\bprocess\.env\b/, 'environment configuration'],
      ]
      const hits: string[] = []
      for (const { route, text } of bodies) {
        for (const [pattern, what] of forbidden) if (pattern.test(text)) hits.push(`${route}: ${what}`)
      }
      return hits.length ? [...new Set(hits)].join('; ') : null
    })

    await check('F12 · an unexpected internal failure returns a fixed sentence, not its message', async () => {
      setDatabaseProvider(async () => { throw new Error('connect ECONNREFUSED 10.0.0.4:5432 secret=hunter2') })
      try {
        const res = await call('500 probe', versionHistory(get(`${BASE}/${STORED_ID}/versions`),
          { params: params({ id: STORED_ID }) }))
        if (res.status !== 500) return `status ${res.status}`
        if (/ECONNREFUSED|hunter2|10\.0\.0\.4/.test(JSON.stringify(res.body)))
          return 'the internal message reached the caller'
        return res.body.error.code === 'INTERNAL_ERROR' ? null : `code ${res.body.error.code}`
      } finally { setDatabaseProvider(async () => db) }
    })

    await check('F12 · an unconfigured deployment reports unavailable, not a defect', async () => {
      setDatabaseProvider(null)
      try {
        const res = await call('503 probe', versionHistory(get(`${BASE}/${STORED_ID}/versions`),
          { params: params({ id: STORED_ID }) }))
        return res.status === 503 && res.body.error.code === 'SERVICE_UNAVAILABLE'
          ? null : `status ${res.status}`
      } finally { setDatabaseProvider(async () => db) }
    })

    // -- F13: the UI query path ------------------------------------------------
    await check('F13 · the UI path reads a stored investigation by id', async () => {
      const storedView = await getInvestigationGraph(STORED_ID)
      if (!storedView) return 'the stored investigation did not resolve'
      return storedView.investigation.id === STORED_ID ? null : 'a different investigation was served'
    })

    // -- Storage resolution is tri-state, and only one state may reach the
    // benchmark. These four run in order: XRAY-KE-001 must be absent from
    // storage for the third, and present for the first two.

    await check('R3 · a typed unknown in storage may resolve the benchmark by its exact id', async () => {
      const benchmark = await getInvestigationGraph('XRAY-KE-001')
      return benchmark?.investigation.id === 'XRAY-KE-001'
        ? null : 'the benchmark is not reachable when storage holds no such id'
    })

    await check('R4 · an arbitrary unknown id stays null', async () => {
      for (const id of ['XRAY-DOES-NOT-EXIST', 'xray-ke-001', 'XRAY-KE-002', '../XRAY-KE-001']) {
        const result = await getInvestigationGraph(id)
        if (result !== null) return `${id} resolved to ${result.investigation.id}`
      }
      return null
    })

    await check('R1 · a stored investigation with no committed version is null, not the benchmark', async () => {
      // The benchmark id now exists in storage, with nothing committed.
      await new InvestigationService(db, () => AT, () => 'XRAY-KE-001')
        .createInvestigation({ sourceUrl: 'https://example.org/stored-benchmark-id' })
      const result = await getInvestigationGraph('XRAY-KE-001')
      if (result === null) return null
      return result.investigation.id === 'XRAY-KE-001'
        ? 'the frozen benchmark shadowed a stored investigation that has committed nothing'
        : `resolved to ${result.investigation.id}`
    })

    await check('R1 · a submitted investigation with no committed version is also null', async () => {
      const result = await getInvestigationGraph(firstId)
      return result === null ? null : 'working state was served as a committed graph'
    })

    await check('R2 · an unexpected storage failure propagates and never reaches the benchmark', async () => {
      setDatabaseProvider(async () => ({
        query: async () => { throw new Error('connection terminated unexpectedly') },
      }))
      try {
        const result = await getInvestigationGraph('XRAY-KE-001').then(
          (graph) => ({ graph }), (error: unknown) => ({ error }))
        if ('graph' in result)
          return result.graph === null
            ? 'a read failure was reported as no such investigation'
            : 'a read failure was answered with the frozen benchmark'
        return (result.error as Error).message === 'connection terminated unexpectedly'
          ? null : `propagated the wrong error: ${(result.error as Error).message}`
      } finally { setDatabaseProvider(async () => db) }
    })

    await check('R2 · a committed pointer cannot dangle: storage forbids the state', async () => {
      // Intended as a second propagation proof — a pointer claiming a version
      // that has no rows. The state turns out to be unreachable: the advance
      // trigger rejects an arbitrary number, and the foreign key rejects a
      // plausible one. Recorded as a schema guarantee rather than dropped,
      // because the reason the propagation path cannot be exercised is itself
      // worth holding in place.
      const outcome = await db.query(
        'UPDATE investigations SET latest_committed_version=1 WHERE id=$1', ['XRAY-KE-001'])
        .then(() => null, (error: unknown) => error as Error)
      if (outcome === null) return 'a version pointer with no version rows was accepted'
      return /latest_committed_fk|foreign key/.test(outcome.message)
        ? null : `rejected for the wrong reason: ${outcome.message}`
    })

    await check('R · the retrieval seam uses no catch-all', async () => {
      const source = readFileSync(new URL('../investigations.ts', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\.catch\(\s*\(\s*\)\s*=>/.test(source)) return 'a catch-all swallows storage errors'
      return /InvestigationResourceNotFound/.test(source)
        ? null : 'the typed unknown case is no longer distinguished'
    })

    // -- Report ----------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray investigation API — 8c route checks\n' + '='.repeat(width + 8))
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
