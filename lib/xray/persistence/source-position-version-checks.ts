import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createXRayGraph, type XRayGraph } from '@/lib/xray/selectors'
import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { assessGraduation } from '@/lib/xray/acceptance/runner'
import { changedClaimIds, commitNextVersion, readReEvaluationAudit, VersionConflict } from './version-commit'
import { readSnapshot, writeInitialSnapshot, type SnapshotDatabase } from './snapshot'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const graphInput = (graph: XRayGraph) => {
  const { index: _index, ...input } = graph
  return clone(input)
}
const ids = (values: Set<string>) => [...values].sort()
async function migrate(db: PGlite) {
  for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit','0004_source_position_knowledge_basis']) {
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
  }
}
const baseInput = graphInput(kenyattaMaralalGraph())
baseInput.claims = baseInput.claims.map((claim) => claim.id === 'DC003' ? { ...claim, sourcePassage: undefined } : claim)
const base = createXRayGraph(clone(baseInput))
const addedPosition = {
  ...base.sourcePositions[1], id: 'SP-003' as const,
  timeScope: { from: '1970-01-01' },
  basisDescription: 'A separate synthetic later position for version-commit verification.',
}
const withChanges = (patch: Partial<ReturnType<typeof graphInput>>) => createXRayGraph({ ...graphInput(base), ...patch })

async function run() {
  const positionOnly = withChanges({ sourcePositions: base.sourcePositions.map((position) => position.id === 'SP-001'
    ? { ...position, relationshipDescription: 'Synthetic corrected relationship context.' } : position) })
  assert.deepStrictEqual(ids(changedClaimIds(base, positionOnly)), ['DC003'])
  const timeAndBasis = withChanges({ sourcePositions: base.sourcePositions.map((position) => position.id === 'SP-002'
    ? { ...position, timeScope: { from: '1961-01-01' }, basis: 'DOCUMENTED' as const,
        basisDescription: undefined } : position) })
  assert.deepStrictEqual(ids(changedClaimIds(base, timeAndBasis)), ['DC003'])
  assert.deepStrictEqual(positionOnly.evidence, base.evidence)
  assert.deepStrictEqual(positionOnly.evidenceProvenance, base.evidenceProvenance)
  const added = withChanges({ sourcePositions: [...base.sourcePositions, addedPosition],
    investigation: { ...base.investigation, sourcePositionIds: [...base.investigation.sourcePositionIds!, 'SP-003'] } })
  assert.deepStrictEqual(ids(changedClaimIds(base, added)), ['DC003'])
  const removed = withChanges({ sourcePositions: base.sourcePositions.filter((position) => position.id !== 'SP-002'),
    investigation: { ...base.investigation, sourcePositionIds: ['SP-001'] } })
  assert.deepStrictEqual(ids(changedClaimIds(base, removed)), ['DC003'])
  const reassigned = withChanges({ sourcePositions: base.sourcePositions.map((position) => position.id === 'SP-001'
    ? { ...position, claimIds: ['DC003', 'C001'] } : position) })
  assert.deepStrictEqual(ids(changedClaimIds(base, reassigned)), ['C001', 'DC003'])
  const basisOnly = withChanges({ evidence: base.evidence.map((item) => item.id === 'EV-100'
    ? { ...item, knowledgeBasis: 'ADMINISTRATIVE_RECORD' as const } : item) })
  assert.deepStrictEqual(ids(changedClaimIds(base, basisOnly)), ['DC003'])
  assert.deepStrictEqual(basisOnly.evidenceProvenance, base.evidenceProvenance)
  console.log('15c: added/removed/changed SourcePosition and KnowledgeBasis claim impact PASS')

  const candidate = createXRayGraph({ ...graphInput(base),
    investigation: { ...base.investigation, currentVersion: 2,
      sourcePositionIds: [...base.investigation.sourcePositionIds!, 'SP-003'] },
    version: { ...base.version!, version: 2, createdAt: '2026-09-19T15:00:00Z',
      trigger: 'RE_EVALUATION', supersedesVersion: 1,
      addedSourceIds: [], addedEvidenceIds: [], reEvaluatedClaimIds: ['DC003'] },
    sourcePositions: [...base.sourcePositions.map((position) => position.id === 'SP-001'
      ? { ...position, relationshipDescription: 'Synthetic corrected relationship context.' } : position), addedPosition],
    evidence: basisOnly.evidence,
  })
  assert.deepStrictEqual(ids(changedClaimIds(base, candidate)), ['DC003'])
  assert.deepStrictEqual(candidate.version!.addedSourceIds, [])
  assert.deepStrictEqual(candidate.version!.addedEvidenceIds, [])
  assert.deepStrictEqual(candidate.evidenceProvenance, base.evidenceProvenance)
  const assessment = assessGraduation(candidate, { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: '2026-09-19T15:01:00Z' })
  assert.equal(assessment.verdict, 'BLOCKED', JSON.stringify({ reasons: assessment.reasons, blockers: assessment.blockers }))
  assert.deepStrictEqual(assessment.reasons, [])
  const audit = [{ claimId: 'DC003', reason: 'REVIEW_REVISION' as const,
    detail: 'Source context and evidence knowledge basis were reassessed.', causes: [] }]
  const db = new PGlite()
  try {
    await migrate(db)
    await writeInitialSnapshot(db, base)
    const v1 = await readSnapshot(db, base.investigation.id, 1)
    assert.deepStrictEqual(v1, base)
    const createRun = (id: string) => db.query(`INSERT INTO execution_runs(id, investigation_id, started_at, status)
      VALUES ($1,$2,'2026-09-19T15:00:00Z','COMPLETED')`, [id, base.investigation.id])

    // The 7a workspace state is an opaque JSON object. Prove its value shape
    // accommodates the full candidate without adding 7d serialization methods.
    await createRun('RUN-WORKSPACE-SHAPE')
    await db.query(`INSERT INTO candidate_workspaces(execution_run_id,state,updated_at) VALUES ($1,$2,$3)`,
      ['RUN-WORKSPACE-SHAPE', JSON.stringify({ candidate: graphInput(candidate) }), '2026-09-19T15:00:00Z'])
    const workspace = (await db.query(`SELECT state FROM candidate_workspaces WHERE execution_run_id='RUN-WORKSPACE-SHAPE'`)).rows[0] as { state: { candidate: ReturnType<typeof graphInput> } }
    const workspaceCandidate = createXRayGraph(workspace.state.candidate)
    assert.deepStrictEqual(workspaceCandidate, candidate)
    console.log('15c: opaque workspace state retains candidate collection, basis, order and identity PASS')

    await createRun('RUN-INJECTED-FAILURE')
    const failingDb: SnapshotDatabase = { query: async (sql, params) => {
      if (sql.includes('INSERT INTO claim_reevaluation_audit')) throw new Error('injected after snapshot rows')
      return db.query(sql, params)
    } }
    await assert.rejects(commitNextVersion(failingDb, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-INJECTED-FAILURE' }), /injected after snapshot rows/)
    for (const table of ['investigation_versions','source_positions','source_position_claims',
      'source_position_supporting_evidence','investigation_source_positions','evidence','claim_reevaluation_audit']) {
      const found = (await db.query(`SELECT count(*)::int AS count FROM ${table} WHERE investigation_id=$1 AND version_number=2`, [base.investigation.id])).rows[0] as { count: number }
      assert.equal(found.count, 0, `partial v2 row in ${table}`)
    }
    assert.equal(((await db.query('SELECT latest_committed_version FROM investigations WHERE id=$1', [base.investigation.id])).rows[0] as { latest_committed_version: number }).latest_committed_version, 1)
    assert.deepStrictEqual(await readSnapshot(db, base.investigation.id, 1), v1)
    console.log('15c: injected post-snapshot failure rolls back all v2 rows and pointer PASS')

    await createRun('RUN-V2')
    await commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-V2' })
    assert.deepStrictEqual(await readSnapshot(db, base.investigation.id, 1), v1)
    assert.deepStrictEqual(await readSnapshot(db, base.investigation.id, 2), candidate)
    assert.deepStrictEqual(await readReEvaluationAudit(db, base.investigation.id, 2), audit)
    assert.equal(((await db.query('SELECT latest_committed_version FROM investigations WHERE id=$1', [base.investigation.id])).rows[0] as { latest_committed_version: number }).latest_committed_version, 2)
    console.log('15c: v2 SourcePosition/KnowledgeBasis deep round-trip; v1 immutable PASS')

    await createRun('RUN-STALE-15C')
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-STALE-15C' }), VersionConflict)
    assert.deepStrictEqual(await readSnapshot(db, base.investigation.id, 2), candidate)
    console.log('15c: stale predecessor rejects without partial v2 change PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
