/** Candidate-to-version commit. Execution/review happen before this short transaction. */
import { isDeepStrictEqual } from 'node:util'
import type { XRayGraph } from '@/lib/xray/selectors/graph'
import type { GraduationResult } from '@/lib/xray/acceptance/runner'
import { fingerprintGraph } from '@/lib/xray/review'
import { insertSnapshotRows, readSnapshot, type SnapshotDatabase } from './snapshot'

export type ReEvaluationReason = 'NEW_EVIDENCE' | 'CORRECTION' | 'REVIEW_REVISION' | 'EXTERNAL_RECORD_RESPONSE' | 'OTHER'
export type CausalReference = { kind: 'SOURCE' | 'EVIDENCE' | 'REVIEW' | 'ATI_RESPONSE'; id: string }
export interface ReEvaluationAudit {
  claimId: string
  reason: ReEvaluationReason
  detail?: string
  causes?: readonly CausalReference[]
}
export class VersionConflict extends Error {
  readonly expected: number
  readonly actual: number | null
  constructor(expected: number, actual: number | null) {
    super(`Expected predecessor v${expected}, found ${actual === null ? 'no committed version' : `v${actual}`}`)
    this.name = 'VersionConflict'
    this.expected = expected
    this.actual = actual
  }
}

const idsAdded = (oldIds: readonly string[], newIds: readonly string[]) => {
  const known = new Set(oldIds)
  return newIds.filter((id) => !known.has(id))
}
const byId = <T extends { id: string }>(values: readonly T[]) => new Map(values.map((value) => [value.id, value]))
const differs = (a: unknown, b: unknown) => !isDeepStrictEqual(a, b)

/** A documented reassessment may be listed even when no canonical value changes. */
export function changedClaimIds(previous: XRayGraph, candidate: XRayGraph): Set<string> {
  const changed = new Set<string>()
  const oldClaims = byId(previous.claims)
  for (const claim of candidate.claims) if (oldClaims.has(claim.id) && differs(oldClaims.get(claim.id), claim)) changed.add(claim.id)
  const collect = <T extends { id: string }>(
    before: readonly T[], after: readonly T[], claimsFor: (item: T, graph: XRayGraph) => readonly string[],
  ) => {
    const old = byId(before), next = byId(after)
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const a = old.get(id), b = next.get(id)
      if (!differs(a, b)) continue
      if (a) for (const claimId of claimsFor(a, previous)) changed.add(claimId)
      if (b) for (const claimId of claimsFor(b, candidate)) changed.add(claimId)
    }
  }
  collect(previous.evidence, candidate.evidence, (item) => item.claimIds)
  collect(previous.sourcePositions, candidate.sourcePositions, (item) => item.claimIds)
  collect(previous.findings, candidate.findings, (item) => [item.claimId])
  collect(previous.gaps, candidate.gaps, (item) => item.claimIds)
  collect(previous.discrepancies, candidate.discrepancies, (item) => item.claimIds)
  collect(previous.disconfirmations, candidate.disconfirmations, (item) => [item.claimId])
  const evidenceClaims = (evidenceId: string, graph: XRayGraph) => graph.evidence.find((item) => item.id === evidenceId)?.claimIds ?? []
  collect(previous.evidenceProvenance, candidate.evidenceProvenance, (item, graph) => evidenceClaims(item.evidenceId, graph))
  collect(previous.sources, candidate.sources, (item, graph) => graph.evidence.filter((evidence) => evidence.sourceId === item.id).flatMap((evidence) => evidence.claimIds))
  collect(previous.sourceDependencies, candidate.sourceDependencies, (item, graph) => graph.evidence.filter((evidence) => evidence.sourceId === item.sourceId).flatMap((evidence) => evidence.claimIds))
  // First evaluations of newly discovered claims are not re-evaluations.
  return new Set([...changed].filter((id) => oldClaims.has(id as typeof previous.claims[number]['id'])))
}

function assertCommittable(graph: XRayGraph, assessment: GraduationResult) {
  if (graph.investigation.status !== 'RESEARCH_COMPLETE' || !graph.investigation.completedAt ||
      !graph.investigation.researchStop || graph.investigation.researchStop.reason !== 'SATURATION')
    throw new Error('Candidate research is incomplete')
  if (assessment.investigationId !== graph.investigation.id || assessment.graphFingerprint !== fingerprintGraph(graph))
    throw new Error('Graduation assessment does not match candidate graph identity')
  if (!assessment.validation.valid || assessment.validation.errorCount > 0 ||
      assessment.behaviors.some((behavior) => behavior.status === 'VIOLATED') ||
      assessment.reasons.some((reason) => reason.verdict === 'FAIL' || reason.verdict === 'REVISE'))
    throw new Error('Candidate has a graph failure or revision reason')
  if (assessment.verdict === 'PASS') return
  if (assessment.verdict !== 'BLOCKED' || assessment.reasons.length > 0 || assessment.blockers.length === 0 ||
      assessment.blockers.some((blocker) => blocker.ref === 'RESEARCH_STOP' || blocker.ref.startsWith('STALE/')))
    throw new Error('Candidate is not an eligible PASS/BLOCKED snapshot')
}

function assertVersionDiff(previous: XRayGraph, graph: XRayGraph, audit: readonly ReEvaluationAudit[]) {
  const version = graph.version
  if (!version || !previous.version || graph.investigation.id !== previous.investigation.id ||
      graph.investigation.currentVersion !== previous.investigation.currentVersion + 1 ||
      version.version !== graph.investigation.currentVersion || version.investigationId !== graph.investigation.id ||
      version.supersedesVersion !== previous.investigation.currentVersion)
    throw new Error('Candidate version/supersession does not match predecessor')
  for (const [kind, before, after] of [
    ['claim', previous.claims, graph.claims],
    ['source', previous.sources, graph.sources],
    ['evidence', previous.evidence, graph.evidence],
  ] as const) {
    const retained = new Set(after.map((item) => item.id))
    for (const item of before) if (!retained.has(item.id)) throw new Error(`Inherited ${kind} ${item.id} is missing`)
  }
  if (!isDeepStrictEqual(version.addedSourceIds, idsAdded(previous.sources.map((item) => item.id), graph.sources.map((item) => item.id))) ||
      !isDeepStrictEqual(version.addedEvidenceIds, idsAdded(previous.evidence.map((item) => item.id), graph.evidence.map((item) => item.id))))
    throw new Error('Added IDs must be canonical IDs new since the predecessor')
  const listed = new Set<string>(version.reEvaluatedClaimIds)
  if (listed.size !== version.reEvaluatedClaimIds.length ||
      version.reEvaluatedClaimIds.some((id) => !previous.claims.some((item) => item.id === id) || !graph.claims.some((item) => item.id === id)))
    throw new Error('Re-evaluated IDs must be unique claims present in both snapshots')
  for (const id of changedClaimIds(previous, graph)) if (!listed.has(id)) throw new Error(`Changed claim ${id} lacks re-evaluation audit`)
  if (audit.length !== listed.size || audit.some((item) => !listed.has(item.claimId)) ||
      new Set(audit.map((item) => item.claimId)).size !== audit.length)
    throw new Error('Every re-evaluated claim requires exactly one reason record')
  for (const item of audit) {
    if (!['NEW_EVIDENCE','CORRECTION','REVIEW_REVISION','EXTERNAL_RECORD_RESPONSE','OTHER'].includes(item.reason))
      throw new Error(`Unknown re-evaluation reason for ${item.claimId}`)
    if (item.reason === 'OTHER' && !item.detail) throw new Error('OTHER needs an explanatory detail')
  }
}

export async function readReEvaluationAudit(db: SnapshotDatabase, investigationId: string, version: number): Promise<ReEvaluationAudit[]> {
  const records = (await db.query(`SELECT a.claim_id, a.reason, a.detail, a.causes_present FROM claim_reevaluation_audit a
    JOIN version_reevaluated_claims l USING (investigation_id, version_number, claim_id)
    WHERE a.investigation_id = $1 AND a.version_number = $2 ORDER BY l.ordinal`, [investigationId, version])).rows
  const result: ReEvaluationAudit[] = []
  for (const record of records) {
    const causes = (await db.query(`SELECT source_id, evidence_id, review_ref, ati_response_ref FROM claim_reevaluation_causes
      WHERE investigation_id=$1 AND version_number=$2 AND claim_id=$3 ORDER BY ordinal`, [investigationId, version, record.claim_id])).rows
    result.push({
      claimId: record.claim_id as string, reason: record.reason as ReEvaluationReason,
      ...(record.detail === null ? {} : { detail: record.detail as string }),
      ...(record.causes_present !== true ? {} : { causes: causes.map((row) => row.source_id !== null
        ? { kind: 'SOURCE' as const, id: row.source_id as string }
        : row.evidence_id !== null ? { kind: 'EVIDENCE' as const, id: row.evidence_id as string }
        : row.review_ref !== null ? { kind: 'REVIEW' as const, id: row.review_ref as string }
        : { kind: 'ATI_RESPONSE' as const, id: row.ati_response_ref as string }) }),
    })
  }
  return result
}

export interface CommitVersionOptions {
  expectedPredecessor: number
  graph: XRayGraph
  assessment: GraduationResult
  reEvaluationAudit: readonly ReEvaluationAudit[]
  executionRunId: string
}

/** Commit one assessed next version. Caller must re-assess after VersionConflict. */
export async function commitNextVersion(db: SnapshotDatabase, options: CommitVersionOptions): Promise<void> {
  const { graph, assessment, expectedPredecessor, reEvaluationAudit, executionRunId } = options
  if (!graph.version || graph.version.version !== expectedPredecessor + 1) throw new Error('Wrong candidate version')
  const previous = await readSnapshot(db, graph.investigation.id, expectedPredecessor)
  assertVersionDiff(previous, graph, reEvaluationAudit)
  assertCommittable(graph, assessment)
  const captured = structuredClone(graph)
  await db.query('BEGIN')
  try {
    const found = (await db.query('SELECT latest_committed_version FROM investigations WHERE id=$1 FOR UPDATE', [graph.investigation.id])).rows
    const actual = found.length ? found[0].latest_committed_version as number | null : null
    if (actual !== expectedPredecessor) throw new VersionConflict(expectedPredecessor, actual)
    if (!isDeepStrictEqual(graph, captured)) throw new Error('Candidate changed after assessment')
    assertCommittable(graph, assessment)
    assertVersionDiff(previous, graph, reEvaluationAudit)
    const run = (await db.query(`SELECT id FROM execution_runs WHERE id=$1 AND investigation_id=$2
      AND committed_version IS NULL AND status='COMPLETED' FOR UPDATE`, [executionRunId, graph.investigation.id])).rows
    if (run.length !== 1) throw new Error('Producing execution run is missing or incomplete')
    await insertSnapshotRows(db, graph)
    for (const item of reEvaluationAudit) {
      await db.query(`INSERT INTO claim_reevaluation_audit
        (investigation_id,version_number,claim_id,reason,detail,causes_present) VALUES ($1,$2,$3,$4,$5,$6)`,
        [graph.investigation.id, graph.version!.version, item.claimId, item.reason, item.detail ?? null, item.causes !== undefined])
      for (const [ordinal, cause] of (item.causes ?? []).entries()) {
        await db.query(`INSERT INTO claim_reevaluation_causes
          (investigation_id,version_number,claim_id,ordinal,source_id,evidence_id,review_ref,ati_response_ref)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [graph.investigation.id, graph.version!.version, item.claimId, ordinal,
          cause.kind === 'SOURCE' ? cause.id : null, cause.kind === 'EVIDENCE' ? cause.id : null,
          cause.kind === 'REVIEW' ? cause.id : null, cause.kind === 'ATI_RESPONSE' ? cause.id : null])
      }
    }
    const linked = (await db.query(`UPDATE execution_runs SET committed_version=$1 WHERE id=$2 AND committed_version IS NULL RETURNING id`,
      [graph.version.version, executionRunId])).rows
    if (linked.length !== 1) throw new Error('Execution run link failed')
    const moved = (await db.query(`UPDATE investigations SET latest_committed_version=$1
      WHERE id=$2 AND latest_committed_version=$3 RETURNING id`, [graph.version.version, graph.investigation.id, expectedPredecessor])).rows
    if (moved.length !== 1) throw new VersionConflict(expectedPredecessor, actual)
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}
