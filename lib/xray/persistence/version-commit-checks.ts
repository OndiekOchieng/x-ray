import { checkpointCandidate, prepareAssessedRun } from './graduation-check-support'
import { appendGraduationAudit, readLatestGraduation } from './graduation-audit'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createXRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { assessGraduation } from '@/lib/xray/acceptance/runner'
import { readSnapshot, writeInitialSnapshot } from './snapshot'
import { commitNextVersion, readReEvaluationAudit, VersionConflict, type ReEvaluationAudit } from './version-commit'

const fixture = createXrayKe001Graph()
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function candidateV2() {
  const input: XRayGraphInput = {
    investigation: { ...clone(fixture.investigation), currentVersion: 2 },
    version: { ...clone(fixture.version!), version: 2, createdAt: '2026-09-19T09:00:00Z',
      trigger: 'NEW_SOURCE_RECEIVED', supersedesVersion: 1,
      addedSourceIds: ['SRC-NEW'], addedEvidenceIds: ['EV-NEW'],
      reEvaluatedClaimIds: ['C001', 'C002'] },
    claims: clone(fixture.claims), sources: clone(fixture.sources),
    evidence: clone(fixture.evidence), sourceDependencies: clone(fixture.sourceDependencies),
    evidenceProvenance: clone(fixture.evidenceProvenance),
    discrepancies: clone(fixture.discrepancies), disconfirmations: clone(fixture.disconfirmations),
    findings: clone(fixture.findings), gaps: clone(fixture.gaps), atiRequests: [],
  }
  const newSource = { ...input.sources[1], id: 'SRC-NEW', title: 'Additional received source',
    retrievedAt: '2026-09-13', publishedAt: '2026-09-12' }
  const newEvidence = { ...input.evidence[0], id: 'EV-NEW', sourceId: 'SRC-NEW',
    proposition: 'An additional source supports the main carriageway scope.', claimIds: ['C001' as const] }
  input.sources = [...input.sources, newSource]
  input.evidence = [...input.evidence, newEvidence]
  input.findings = input.findings.map((finding) => finding.claimId === 'C001'
    ? { ...finding, supportingEvidenceIds: [...finding.supportingEvidenceIds, 'EV-NEW'],
        rationale: `${finding.rationale} Additional receipt considered.` }
    : finding)
  input.investigation.sourceIds = [...input.investigation.sourceIds, 'SRC-NEW']
  input.investigation.evidenceIds = [...input.investigation.evidenceIds, 'EV-NEW']
  return createXRayGraph(input)
}
const audit: ReEvaluationAudit[] = [
  { claimId: 'C001', reason: 'NEW_EVIDENCE', causes: [{ kind: 'SOURCE', id: 'SRC-NEW' }, { kind: 'EVIDENCE', id: 'EV-NEW' }] },
  { claimId: 'C002', reason: 'REVIEW_REVISION', detail: 'Reassessed; finding unchanged.', causes: [] },
]
async function migrate(db: PGlite) {
  for (const number of ['0001_version_ownership', '0002_source_retrieval_precision', '0003_reevaluation_audit', '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit']) {
    const sql = readFileSync(new URL(`../../../db/migrations/${number}.up.sql`, import.meta.url), 'utf8')
    await db.exec(sql)
  }
  await db.exec(readFileSync(new URL('../../../db/migrations/0006_graduation_audit.down.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../db/migrations/0006_graduation_audit.up.sql', import.meta.url), 'utf8'))
}
async function run() {
  const db = new PGlite()
  try {
    await migrate(db)
    await writeInitialSnapshot(db, fixture)
    const before = await readSnapshot(db, fixture.investigation.id, 1)
    assert.deepStrictEqual(before, fixture)
    console.log('7c: v1 committed and deep-equal PASS')
    const candidate = candidateV2()
    const assessment = assessGraduation(candidate, { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: '2026-09-19T09:01:00Z' })
    if (assessment.verdict !== 'BLOCKED') console.error(JSON.stringify({validation: assessment.detail.validation.violations, reasons: assessment.reasons, blockers: assessment.blockers}, null, 2))
    assert.equal(assessment.verdict, 'BLOCKED')
    assert.equal(assessment.reasons.length, 0)
    const assessed = await prepareAssessedRun(db, 'RUN-ELIGIBILITY', candidate, assessment, 'CAPABILITY_BLOCKED')
    assert.deepStrictEqual((await readLatestGraduation(db, 'RUN-ELIGIBILITY'))?.result, assessment)
    assert.equal(assessed.assessmentIndex, 0)
    await assert.rejects(db.query(`UPDATE run_graduations SET verdict='PASS'
      WHERE execution_run_id='RUN-ELIGIBILITY' AND assessment_index=0`), /immutable|mutation|not permitted/i)
    await assert.rejects(db.query(`DELETE FROM run_graduations
      WHERE execution_run_id='RUN-ELIGIBILITY' AND assessment_index=0`), /immutable|mutation|not permitted/i)
    await assert.rejects(db.query(`INSERT INTO run_graduations
      (execution_run_id,assessment_index,investigation_id,verdict,graph_fingerprint,candidate_digest,assessed_at,result)
      VALUES ('RUN-ELIGIBILITY',1,'OTHER','BLOCKED','x',$1,$2,'{}')`,
      [assessed.candidateDigest, assessment.assessedAt]), /foreign key|violates/i)
    for (const verdict of ['REVISE', 'FAIL'] as const) {
      const rejected = { ...assessment, verdict }
      const id = `RUN-${verdict}`
      await prepareAssessedRun(db, id, candidate, rejected)
      await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
        assessment: rejected, reEvaluationAudit: audit, executionRunId: id }), /eligible PASS\/BLOCKED/)
    }
    await checkpointCandidate(db, 'RUN-NO-AUDIT', candidate, assessment.assessedAt)
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-NO-AUDIT' }), /Persisted graduation audit/)
    await prepareAssessedRun(db, 'RUN-INCOMPLETE', candidate, assessment, 'STAGE_FAILED')
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-INCOMPLETE' }), /missing or incomplete/)
    await prepareAssessedRun(db, 'RUN-MUTATED', candidate, assessment)
    const changedInput = clone(candidate) as XRayGraphInput
    changedInput.sources[0].title = `${changedInput.sources[0].title} amended`
    const changedCandidate = createXRayGraph(changedInput)
    await checkpointCandidate(db, 'RUN-MUTATED', changedCandidate, assessment.assessedAt)
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: changedCandidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-MUTATED' }),
    /does not match candidate graph identity|Persisted graduation audit/)
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-MUTATED' }), /workspace is stale or changed/)
    const reassessed = assessGraduation(changedCandidate, { behaviors: XRAY_KE_001_ACCEPTANCE,
      assessedAt: '2026-09-19T09:02:00Z' })
    const second = await appendGraduationAudit(db, 'RUN-MUTATED', changedCandidate, reassessed)
    assert.equal(second.assessmentIndex, 1)
    assert.deepStrictEqual((await readLatestGraduation(db, 'RUN-MUTATED'))?.result, reassessed)
    const premature = await db.query('SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1 AND version_number=2', [fixture.investigation.id])
    assert.equal((premature.rows[0] as {n:number}).n, 0)
    console.log('7d-c: immutable assessment history; missing/stale/incomplete/REVISE/FAIL candidates refused PASS')
    const createRun = (id: string) => db.query(`INSERT INTO execution_runs(id,investigation_id,started_at,status)
      VALUES ($1,$2,'2026-09-19T09:00:00Z','COMPLETED')`, [id, fixture.investigation.id])
    await prepareAssessedRun(db, 'RUN-FAILED', candidate, assessment)
    const invalidAudit: ReEvaluationAudit[] = [
      { ...audit[0], causes: [{ kind: 'SOURCE', id: 'SRC-NOT-IN-SNAPSHOT' }] }, audit[1],
    ]
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: invalidAudit, executionRunId: 'RUN-FAILED' }), /foreign key|violates/i)
    const pointerAfterFailure = await db.query(`SELECT latest_committed_version FROM investigations WHERE id=$1`, [fixture.investigation.id])
    assert.equal((pointerAfterFailure.rows[0] as {latest_committed_version:number}).latest_committed_version, 1)
    const v2AfterFailure = await db.query(`SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1 AND version_number=2`, [fixture.investigation.id])
    assert.equal((v2AfterFailure.rows[0] as {n:number}).n, 0)
    const auditAfterFailure = await readReEvaluationAudit(db, fixture.investigation.id, 2)
    assert.deepStrictEqual(auditAfterFailure, [])
    const childAfterFailure = await db.query(`SELECT count(*)::int AS n FROM sources WHERE investigation_id=$1 AND version_number=2`, [fixture.investigation.id])
    assert.equal((childAfterFailure.rows[0] as {n:number}).n, 0)
    const failedRun = await db.query(`SELECT committed_version FROM execution_runs WHERE id='RUN-FAILED'`)
    assert.equal((failedRun.rows[0] as {committed_version:number|null}).committed_version, null)
    assert.deepStrictEqual(await readSnapshot(db, fixture.investigation.id, 1), before)
    console.log('7c: deferred FK failure leaves no v2/audit/pointer change PASS')
    await prepareAssessedRun(db, 'RUN-2', candidate, assessment, 'CAPABILITY_BLOCKED')
    await commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-2' })
    const restored = await readSnapshot(db, fixture.investigation.id, 2)
    assert.deepStrictEqual(restored, candidate)
    assert.deepStrictEqual(await readSnapshot(db, fixture.investigation.id, 1), before)
    assert.deepStrictEqual(await readReEvaluationAudit(db, fixture.investigation.id, 2), audit)
    const link = await db.query(`SELECT committed_version,committed_graduation_index FROM execution_runs WHERE id='RUN-2'`)
    assert.deepStrictEqual(link.rows[0], { committed_version: 2, committed_graduation_index: 0 })
    assert.deepStrictEqual((await readLatestGraduation(db, 'RUN-2'))?.result, assessment)
    assert.deepStrictEqual(restored.findings.find((item) => item.claimId === 'C002'),
      before.findings.find((item) => item.claimId === 'C002'))
    const pointer = await db.query(`SELECT latest_committed_version FROM investigations WHERE id=$1`, [fixture.investigation.id])
    assert.equal((pointer.rows[0] as {latest_committed_version:number}).latest_committed_version, 2)
    const titles = await db.query(`SELECT version_number,title FROM sources WHERE investigation_id=$1 AND id='SRC-002' ORDER BY version_number`, [fixture.investigation.id])
    assert.deepStrictEqual(titles.rows.map((row) => (row as {version_number:number}).version_number), [1, 2])
    const rationales = await db.query(`SELECT version_number,rationale FROM findings WHERE investigation_id=$1 AND id='FND-C001' ORDER BY version_number`, [fixture.investigation.id])
    assert.notEqual((rationales.rows[0] as {rationale:string}).rationale, (rationales.rows[1] as {rationale:string}).rationale)
    console.log('7c: v2 deep-equal; v1 unchanged; supersession, additions, reasons PASS')
    await prepareAssessedRun(db, 'RUN-STALE', candidate, assessment)
    await assert.rejects(commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
      assessment, reEvaluationAudit: audit, executionRunId: 'RUN-STALE' }), VersionConflict)
    assert.deepStrictEqual(await readSnapshot(db, fixture.investigation.id, 1), before)
    assert.deepStrictEqual(await readSnapshot(db, fixture.investigation.id, 2), candidate)
    console.log('7c: stale expected predecessor conflicts without overwrite PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
