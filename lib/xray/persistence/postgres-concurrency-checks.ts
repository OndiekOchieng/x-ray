/** Native PostgreSQL row-lock/rollback proof; intentionally not PGlite. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { createXRayGraph, type XRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { assessGraduation, type GraduationResult } from '@/lib/xray/acceptance/runner'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import { appendGraduationAudit, readLatestGraduation } from './graduation-audit'
import { readSnapshot, writeInitialSnapshot, type SnapshotDatabase } from './snapshot'
import { commitNextVersion, readReEvaluationAudit, VersionConflict,
  type ReEvaluationAudit } from './version-commit'
import { saveCandidateCheckpoint } from './workspace'

const url = process.env.XRAY_POSTGRES_URL
if (!url) throw new Error('Set XRAY_POSTGRES_URL to a native PostgreSQL test database')
const base = createXrayKe001Graph()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const AT = '2026-09-20T07:00:00Z'
const started = Date.now()
const event = (message: string) => console.log(`t+${Date.now() - started}ms ${message}`)
const adapter = (client: Client): SnapshotDatabase => ({ query: (sql, params) => client.query(sql, params) })
const audit = (tag: string): ReEvaluationAudit[] => [
  { claimId: 'C001', reason: 'NEW_EVIDENCE', causes: [{ kind: 'SOURCE', id: 'SRC-NATIVE' },
    { kind: 'EVIDENCE', id: 'EV-NATIVE' }] },
  { claimId: 'C002', reason: 'REVIEW_REVISION', detail: `${tag}: reassessed without content change`, causes: [] },
]
function candidate(tag: string): XRayGraph {
  const input: XRayGraphInput = {
    investigation: { ...clone(base.investigation), currentVersion: 2 },
    version: { ...clone(base.version!), version: 2, createdAt: AT, trigger: 'NEW_SOURCE_RECEIVED',
      supersedesVersion: 1, addedSourceIds: ['SRC-NATIVE'], addedEvidenceIds: ['EV-NATIVE'],
      reEvaluatedClaimIds: ['C001', 'C002'] },
    claims: clone(base.claims), sources: clone(base.sources), evidence: clone(base.evidence),
    sourceDependencies: clone(base.sourceDependencies), evidenceProvenance: clone(base.evidenceProvenance),
    discrepancies: clone(base.discrepancies), disconfirmations: clone(base.disconfirmations),
    findings: clone(base.findings), gaps: clone(base.gaps), atiRequests: [],
  }
  input.sources = [...input.sources, { ...input.sources[1], id: 'SRC-NATIVE', title: `Independent native candidate ${tag}`,
    retrievedAt: '2026-09-13', publishedAt: '2026-09-12' }]
  input.evidence = [...input.evidence, { ...input.evidence[0], id: 'EV-NATIVE', sourceId: 'SRC-NATIVE',
    proposition: `Candidate ${tag} additional source supports the main carriageway scope.`, claimIds: ['C001'] }]
  input.findings = input.findings.map((finding) => finding.claimId === 'C001'
    ? { ...finding, supportingEvidenceIds: [...finding.supportingEvidenceIds, 'EV-NATIVE'],
      rationale: `${finding.rationale} Candidate ${tag} independently considered.` } : finding)
  input.investigation.sourceIds.push('SRC-NATIVE')
  input.investigation.evidenceIds.push('EV-NATIVE')
  return createXRayGraph(input)
}
async function prepare(db: SnapshotDatabase, runId: string, graph: XRayGraph): Promise<GraduationResult> {
  const result = assessGraduation(graph, { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: AT })
  assert.equal(result.verdict, 'BLOCKED')
  assert.deepStrictEqual(result.reasons, [])
  await saveCandidateCheckpoint(db, { executionRunId: runId, investigationId: graph.investigation.id,
    startedAt: AT, updatedAt: AT, status: 'CAPABILITY_BLOCKED', artifactVersion: 0,
    accumulator: new GraphAccumulator(graph.investigation, graph), ledger: new CorrelationLedger(),
    journal: new RunJournal(graph.investigation.id) })
  await appendGraduationAudit(db, runId, graph, result)
  return result
}
async function client(schema: string): Promise<Client> {
  const result = new Client({ connectionString: url })
  await result.connect()
  await result.query(`SET search_path TO ${schema}`)
  return result
}
async function waitUntilLocked(observer: Client, pid: number, label: string): Promise<void> {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const rows = (await observer.query(`SELECT wait_event_type,wait_event,state
      FROM pg_stat_activity WHERE pid=$1`, [pid])).rows
    if (rows[0]?.wait_event_type === 'Lock') {
      event(`${label} backend ${pid} waiting: ${rows[0].wait_event_type}/${rows[0].wait_event}`)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${label} backend ${pid} did not visibly wait for the investigation lock`)
}
async function scenario(name: string, rollbackA: boolean): Promise<void> {
  const schema = `xray_native_${name}_${process.pid}`
  const admin = new Client({ connectionString: url })
  await admin.connect()
  let setup: Client | undefined, a: Client | undefined, b: Client | undefined, observer: Client | undefined
  try {
    await admin.query(`CREATE SCHEMA ${schema}`)
    setup = await client(schema)
    for (const migration of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
      '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit'])
      await setup.query(readFileSync(new URL(`../../../db/migrations/${migration}.up.sql`, import.meta.url), 'utf8'))
    const setupDb = adapter(setup)
    await writeInitialSnapshot(setupDb, base)
    const before = await readSnapshot(setupDb, base.investigation.id, 1)
    assert.deepStrictEqual(before, base)
    a = await client(schema); b = await client(schema); observer = await client(schema)
    const pidA = (await a.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number
    const pidB = (await b.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number
    assert.notEqual(pidA, pidB)
    event(`${name}: independent backend IDs A=${pidA}, B=${pidB}`)
    const graphA = candidate('A'), graphB = candidate('B')
    assert.notDeepStrictEqual(graphA, graphB)
    const resultA = await prepare(adapter(a), `${name}-A`, graphA)
    const resultB = await prepare(adapter(b), `${name}-B`, graphB)
    let locked!: () => void, release!: () => void
    const lockReached = new Promise<void>((resolve) => { locked = resolve })
    const mayProceed = new Promise<void>((resolve) => { release = resolve })
    const dbA: SnapshotDatabase = { query: async (sql, params) => {
      const result = await a!.query(sql, params)
      if (sql === 'COMMIT' || sql === 'ROLLBACK') event(`${name}: A ${sql} complete`)
      if (sql.includes('SELECT latest_committed_version') && sql.includes('FOR UPDATE')) {
        event(`${name}: A acquired investigation row lock`)
        locked()
        await mayProceed
      }
      if (rollbackA && sql.includes('INSERT INTO claim_reevaluation_audit'))
        throw new Error('injected native failure after snapshot rows')
      return result
    } }
    const dbB: SnapshotDatabase = { query: async (sql, params) => {
      if (sql.includes('SELECT latest_committed_version') && sql.includes('FOR UPDATE'))
        event(`${name}: B requesting investigation row lock`)
      const result = await b!.query(sql, params)
      if (sql === 'COMMIT' || sql === 'ROLLBACK') event(`${name}: B ${sql} complete`)
      if (sql.includes('SELECT latest_committed_version') && sql.includes('FOR UPDATE'))
        event(`${name}: B acquired row lock; observed predecessor ${result.rows[0]?.latest_committed_version}`)
      return result
    } }
    const runA = commitNextVersion(dbA, { expectedPredecessor: 1, graph: graphA,
      assessment: resultA, reEvaluationAudit: audit('A'), executionRunId: `${name}-A` })
    await lockReached
    const runB = commitNextVersion(dbB, { expectedPredecessor: 1, graph: graphB,
      assessment: resultB, reEvaluationAudit: audit('B'), executionRunId: `${name}-B` })
    try {
      await waitUntilLocked(observer, pidB, name)
    } finally { release() }
    const [outcomeA, outcomeB] = await Promise.allSettled([runA, runB])
    const winner = rollbackA ? graphB : graphA
    if (rollbackA) {
      assert.equal(outcomeA.status, 'rejected')
      assert.match(String(outcomeA.reason), /injected native failure/)
      assert.equal(outcomeB.status, 'fulfilled')
    } else {
      assert.equal(outcomeA.status, 'fulfilled')
      assert.equal(outcomeB.status, 'rejected')
      assert.ok(outcomeB.reason instanceof VersionConflict)
      assert.equal(outcomeB.reason.actual, 2)
    }
    const loserId = `${name}-${rollbackA ? 'A' : 'B'}`
    const winnerId = `${name}-${rollbackA ? 'B' : 'A'}`
    const pointer = (await setup.query(`SELECT latest_committed_version FROM investigations WHERE id=$1`,
      [base.investigation.id])).rows[0]
    assert.equal(pointer.latest_committed_version, 2)
    const versions = (await setup.query(`SELECT version_number,count(*)::int AS n FROM investigation_versions
      WHERE investigation_id=$1 GROUP BY version_number ORDER BY version_number`, [base.investigation.id])).rows
    assert.deepStrictEqual(versions, [{ version_number: 1, n: 1 }, { version_number: 2, n: 1 }])
    assert.deepStrictEqual(await readSnapshot(setupDb, base.investigation.id, 1), before)
    assert.deepStrictEqual(await readSnapshot(setupDb, base.investigation.id, 2), winner)
    assert.deepStrictEqual(await readReEvaluationAudit(setupDb, base.investigation.id, 2),
      audit(rollbackA ? 'B' : 'A'))
    const links = (await setup.query(`SELECT id,committed_version,committed_graduation_index
      FROM execution_runs WHERE id IN ($1,$2) ORDER BY id`, [winnerId, loserId])).rows
    const winnerLink = links.find((row) => row.id === winnerId)!
    const loserLink = links.find((row) => row.id === loserId)!
    assert.equal(winnerLink.committed_version, 2)
    assert.equal(winnerLink.committed_graduation_index, 0)
    assert.equal(loserLink.committed_version, null)
    assert.equal(loserLink.committed_graduation_index, null)
    assert.deepStrictEqual((await readLatestGraduation(setupDb, winnerId))?.result,
      rollbackA ? resultB : resultA)
    assert.deepStrictEqual((await readLatestGraduation(setupDb, loserId))?.result,
      rollbackA ? resultA : resultB)
    const childRows = (await setup.query(`SELECT count(*)::int AS n FROM sources
      WHERE investigation_id=$1 AND version_number=2 AND id='SRC-NATIVE'`, [base.investigation.id])).rows[0]
    assert.equal(childRows.n, 1)
    const lockState = (await observer.query(`SELECT count(*)::int AS n FROM pg_locks
      WHERE pid IN ($1,$2) AND NOT granted`, [pidA,pidB])).rows[0]
    assert.equal(lockState.n, 0)
    event(`${name}: SQL pointer=2, versions=1+1, v2 source rows=1, loser links=NULL, waiting locks=0`)
    console.log(`${name}: ${rollbackA ? 'rollback releases lock; B commits' : 'A commits; B VersionConflict(actual=2)'} PASS`)
  } finally {
    await Promise.allSettled([setup?.end(), a?.end(), b?.end(), observer?.end()].filter(Boolean) as Promise<void>[])
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin.end()
  }
}
async function run() {
  const probe = new Client({ connectionString: url })
  await probe.connect()
  try { console.log(`PostgreSQL: ${(await probe.query('SELECT version() AS value')).rows[0].value}`) }
  finally { await probe.end() }
  await scenario('race', false)
  await scenario('rollback', true)
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
