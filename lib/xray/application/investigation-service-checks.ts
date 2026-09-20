import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { createXRayGraph, type XRayGraph } from '@/lib/xray/selectors'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import { appendExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import { insertSnapshotRows, writeInitialSnapshot } from '@/lib/xray/persistence/snapshot'
import { saveCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { emptyReviewHistory } from '@/lib/xray/review'
import { InvestigationService, InvestigationResourceNotFound, InvalidSubmissionInput } from './investigation-service'

const AT = '2026-09-20T10:00:00Z'
const fixture = createXrayKe001Graph()
const input = (graph: XRayGraph) => { const { index: _index, ...rest } = graph; return rest }
async function run() {
  const db = new PGlite()
  try {
    for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
      '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit'])
      await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
    const up = readFileSync(new URL('../../../db/migrations/0007_investigation_submissions.up.sql', import.meta.url), 'utf8')
    await db.exec(up)
    await db.exec(readFileSync(new URL('../../../db/migrations/0007_investigation_submissions.down.sql', import.meta.url), 'utf8'))
    await db.exec(up)
    let next = 0
    const service = new InvestigationService(db, () => AT, () => `XRAY-NEW-${++next}`)
    const first = await service.createInvestigation({ sourceUrl: '  https://example.org/report?a=1  ', focus: '  road project  ' })
    const second = await service.createInvestigation({ sourceUrl: 'https://other.example/claim' })
    assert.notEqual(first.investigationId, second.investigationId)
    assert.deepStrictEqual(first.submission, { sourceUrl: 'https://example.org/report?a=1', focus: 'road project', createdAt: AT })
    assert.deepStrictEqual(second.submission, { sourceUrl: 'https://other.example/claim', createdAt: AT })
    assert.deepStrictEqual(await service.getInvestigation(first.investigationId), first)
    assert.deepStrictEqual(await service.getInvestigation(second.investigationId), second)
    await assert.rejects(service.createInvestigation({ sourceUrl: 'file:///tmp/private' }),
      (error: unknown) => error instanceof InvalidSubmissionInput && error.field === 'sourceUrl')
    await assert.rejects(service.createInvestigation({ sourceUrl: 'https://example.org', focus: ' ' }),
      (error: unknown) => error instanceof InvalidSubmissionInput && error.field === 'focus')
    await assert.rejects(service.getInvestigation('MISSING'),
      (error: unknown) => error instanceof InvestigationResourceNotFound && error.resource === 'INVESTIGATION')
    for (const table of ['investigation_versions','sources','evidence','execution_runs','version_stage_runs']) {
      const rows = (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE investigation_id IN ($1,$2)`,
        [first.investigationId, second.investigationId])).rows
      assert.equal((rows[0] as {n:number}).n, 0, table)
    }
    const workspaces = (await db.query(`SELECT count(*)::int AS n FROM candidate_workspaces w
      JOIN execution_runs r ON r.id=w.execution_run_id WHERE r.investigation_id IN ($1,$2)`,
      [first.investigationId, second.investigationId])).rows[0] as {n:number}
    assert.equal(workspaces.n, 0)
    await assert.rejects(db.query(`UPDATE investigation_submissions SET submitted_source_url='https://changed.example'
      WHERE investigation_id=$1`, [first.investigationId]), /immutable|mutation/i)
    await assert.rejects(db.query(`DELETE FROM investigation_submissions WHERE investigation_id=$1`,
      [first.investigationId]), /immutable|mutation/i)
    console.log('8a: two distinct URL submissions retained; zero graph/run/version rows; typed input/ID errors PASS')

    await writeInitialSnapshot(db, fixture)
    const v1Dto = await service.getCommittedVersion(fixture.investigation.id, 1)
    assert.equal(v1Dto.kind, 'COMMITTED_VERSION')
    assert.deepStrictEqual(v1Dto.graph, input(fixture))
    assert.equal(v1Dto.graph.investigation.currentVersion, 1)
    assert.deepStrictEqual((await service.getInvestigation(fixture.investigation.id)).submission, null)
    await assert.rejects(service.getCommittedVersion(fixture.investigation.id, 8),
      (error: unknown) => error instanceof InvestigationResourceNotFound && error.resource === 'COMMITTED_VERSION')

    const v2 = createXRayGraph({ ...input(fixture),
      investigation: { ...fixture.investigation, currentVersion: 2 },
      version: { ...fixture.version!, version: 2, createdAt: AT, trigger: 'RE_EVALUATION',
        supersedesVersion: 1, addedSourceIds: [], addedEvidenceIds: [], reEvaluatedClaimIds: [] } })
    const journal = new RunJournal(fixture.investigation.id)
    journal.appendStage({ id: 'SR-8A-1', investigationId: fixture.investigation.id, stage: 'TRACE',
      status: 'FAILED', inputArtifactVersion: 0, startedAt: AT, completedAt: AT, error: 'Synthetic interrupted stage' })
    await saveCandidateCheckpoint(db, { executionRunId: 'RUN-8A', investigationId: fixture.investigation.id,
      startedAt: AT, updatedAt: AT, status: 'STAGE_FAILED', artifactVersion: 0,
      accumulator: new GraphAccumulator(v2.investigation, v2), ledger: new CorrelationLedger(), journal })
    await appendExecutionAudit(db, 'RUN-8A', { journal, validations: [],
      reviewHistory: emptyReviewHistory(fixture.investigation.id) })
    const status = await service.getExecutionStatus(fixture.investigation.id, 'RUN-8A')
    assert.equal(status.status, 'STAGE_FAILED')
    assert.equal(status.stageRuns.length, 1)
    assert.equal(status.stageRuns[0].status, 'FAILED')
    assert.equal(JSON.stringify(status).includes('Synthetic interrupted stage'), false)
    await assert.rejects(service.getExecutionStatus(first.investigationId, 'RUN-8A'),
      (error: unknown) => error instanceof InvestigationResourceNotFound && error.resource === 'EXECUTION_RUN')
    await assert.rejects(service.getCandidate(fixture.investigation.id, ''),
      (error: unknown) => error instanceof InvalidSubmissionInput && error.field === 'executionRunId')
    await assert.rejects(service.getCandidate(first.investigationId, 'RUN-8A'),
      (error: unknown) => error instanceof InvestigationResourceNotFound && error.resource === 'EXECUTION_RUN')
    await db.query(`INSERT INTO execution_runs(id,investigation_id,started_at,status)
      VALUES ('RUN-8A-NO-WORKSPACE',$1,$2,'PENDING')`, [fixture.investigation.id, AT])
    await assert.rejects(service.getCandidate(fixture.investigation.id, 'RUN-8A-NO-WORKSPACE'),
      (error: unknown) => error instanceof InvestigationResourceNotFound && error.resource === 'CANDIDATE_WORKSPACE')
    const candidate = await service.getCandidate(fixture.investigation.id, 'RUN-8A')
    assert.equal(candidate.kind, 'CANDIDATE')
    assert.equal(candidate.artifactVersion, 0)
    assert.equal(candidate.executionRunId, 'RUN-8A')
    assert.equal(candidate.graph.investigation.currentVersion, 2)
    assert.deepStrictEqual(await service.listVersions(fixture.investigation.id), {
      investigationId: fixture.investigation.id, latestCommittedVersion: 1,
      versions: [{ version: 1, createdAt: fixture.version!.createdAt, trigger: 'INITIAL_RESEARCH' }],
    })
    await db.query('BEGIN')
    try {
      await insertSnapshotRows(db, v2)
      await db.query('UPDATE investigations SET latest_committed_version=2 WHERE id=$1', [fixture.investigation.id])
      await db.query('COMMIT')
    } catch (error) { await db.query('ROLLBACK'); throw error }
    const v2Dto = await service.getCommittedVersion(fixture.investigation.id, 2)
    assert.equal(v2Dto.kind, 'COMMITTED_VERSION')
    assert.deepStrictEqual(v2Dto.graph, input(v2))
    assert.deepStrictEqual((await service.getCommittedVersion(fixture.investigation.id, 1)).graph, input(fixture))
    assert.deepStrictEqual(await service.listVersions(fixture.investigation.id), {
      investigationId: fixture.investigation.id, latestCommittedVersion: 2,
      versions: [
        { version: 1, createdAt: fixture.version!.createdAt, trigger: 'INITIAL_RESEARCH' },
        { version: 2, createdAt: AT, trigger: 'RE_EVALUATION', supersedesVersion: 1 },
      ],
    })
    assert.equal((await service.getCandidate(fixture.investigation.id, 'RUN-8A')).kind, 'CANDIDATE')
    assert.equal((await service.getExecutionStatus(fixture.investigation.id, 'RUN-8A')).committedVersion, null)
    assert.equal(typeof JSON.parse(JSON.stringify(v2Dto)).graph.investigation.createdAt, 'string')
    console.log('8a: owner-scoped run/candidate reads; exact v1/v2 snapshots; ordered history/latest pointer PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
