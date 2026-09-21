/** Candidate-to-version commit. Execution/review happen before this short transaction. */
import { isDeepStrictEqual } from 'node:util'
import type { XRayGraph } from '@/lib/xray/selectors/graph'
import type { GraduationResult } from '@/lib/xray/acceptance/runner'
import { fingerprintGraph } from '@/lib/xray/review'
import { insertSnapshotRows, readSnapshot, type SnapshotDatabase } from './snapshot'
import { candidateDigest, readLatestGraduation } from './graduation-audit'
import { loadCandidateCheckpoint } from './workspace'

export type ReEvaluationReason = 'NEW_EVIDENCE' | 'CORRECTION' | 'REVIEW_REVISION' | 'EXTERNAL_RECORD_RESPONSE' | 'OTHER'
export type CausalReference = { kind: 'SOURCE' | 'EVIDENCE' | 'REVIEW' | 'ATI_RESPONSE'; id: string }
export interface ReEvaluationAudit {
  claimId: string
  reason: ReEvaluationReason
  detail?: string
  causes?: readonly CausalReference[]
}
export class VersionConflict extends Error {
  /** `null` when the caller expected no committed version yet. */
  readonly expected: number | null
  readonly actual: number | null
  constructor(expected: number | null, actual: number | null) {
    const describe = (value: number | null) =>
      value === null ? 'no committed version' : `v${value}`
    super(`Expected predecessor ${describe(expected)}, found ${describe(actual)}`)
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
  if (!isEligibleAssessment(assessment))
    throw new Error('Candidate is not an eligible PASS/BLOCKED snapshot')
}

/**
 * Whether a recorded assessment authorizes exposing the version it assessed.
 *
 * `PASS`, or a `BLOCKED` whose only obstacles are capability blockers: nothing
 * is known to be wrong with the graph, only unchecked. A `BLOCKED` carrying a
 * reason against the graph, or blocked on the research stop or on staleness,
 * is not eligible — those are claims about the graph, not about our tooling.
 *
 * Exported so publication (#9) applies the rule #7 already accepted rather than
 * restating it. One rule, two callers.
 */
export function isEligibleAssessment(assessment: GraduationResult): boolean {
  if (assessment.verdict === 'PASS') return true
  return assessment.verdict === 'BLOCKED' &&
    assessment.reasons.length === 0 &&
    assessment.blockers.length > 0 &&
    !assessment.blockers.some(
      (blocker) => blocker.ref === 'RESEARCH_STOP' || blocker.ref.startsWith('STALE/'))
}

/**
 * The first version's own coherence rules.
 *
 * Deliberately the same shape of check as `assertVersionDiff`, with the
 * predecessor's role taken by "there was nothing before":
 *
 *   - it is v1, and the investigation agrees;
 *   - it supersedes nothing — an absent `supersedesVersion`, not a zero;
 *   - every Source and every Evidence is *added*, because none was inherited;
 *   - nothing was re-evaluated, so the list and the audit are both empty.
 *
 * The last one matters more than it looks: a re-evaluation audit row on a
 * first version would claim a claim had been reconsidered, and there was no
 * earlier assessment of it to reconsider.
 *
 * Exported so the gate can drive each refusal. `promote` never produces a v1
 * carrying `supersedesVersion`, so without this the branch that refuses one
 * would be unreachable by any test — and an unreachable guard is a guard
 * nobody has run.
 */
export function assertFirstVersion(
  graph: XRayGraph, audit: readonly ReEvaluationAudit[],
) {
  const version = graph.version
  if (!version || version.version !== 1 || graph.investigation.currentVersion !== 1 ||
      version.investigationId !== graph.investigation.id) {
    throw new Error('Candidate is not a coherent first version')
  }
  if (version.supersedesVersion !== undefined) {
    throw new Error('A first version supersedes nothing')
  }
  const sourceIds = graph.sources.map((item) => item.id)
  const evidenceIds = graph.evidence.map((item) => item.id)
  if (!isDeepStrictEqual([...version.addedSourceIds], sourceIds) ||
      !isDeepStrictEqual([...version.addedEvidenceIds], evidenceIds)) {
    throw new Error('A first version adds every source and every evidence it holds')
  }
  if (version.reEvaluatedClaimIds.length !== 0 || audit.length !== 0) {
    throw new Error('A first version re-evaluates nothing')
  }
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

/**
 * One intake→Source link to write inside this commit.
 *
 * Declarative rather than a callback on purpose. A post-commit hook that took
 * code would let any caller mutate canonical state inside #7's transaction;
 * this lets a caller state a link and nothing else, and the link is still
 * checked here and by 10a's acceptance trigger before it is written.
 *
 * Every `sourceId` must be one this version added. An acceptance against an
 * inherited source would manufacture causality between a response and a record
 * that predates it, which is what migration 0011 exists to refuse.
 */
export interface IntakeSourceAcceptance {
  intakeId: string
  sourceId: string
  acceptedAt: string
}

export interface CommitVersionOptions {
  /**
   * The version this candidate supersedes, or `null` for the first.
   *
   * `null` is the first-version case, and it is expressed here rather than in
   * a second commit path on purpose. `writeInitialSnapshot` exists and inserts
   * a v1 directly — with no assessment, no graduation audit and no execution
   * run link — which is right for seeding a fixture and wrong for a version
   * that claims to have been researched. Everything this function checks
   * (eligibility, the assessment fingerprint, workspace staleness, the run
   * link, the pointer race) applies to v1 exactly as it does to v2.
   */
  expectedPredecessor: number | null
  graph: XRayGraph
  assessment: GraduationResult
  reEvaluationAudit: readonly ReEvaluationAudit[]
  executionRunId: string
  /**
   * Links to write once this version is committed, in the same transaction.
   *
   * Written after the committed pointer advances, because 10a's acceptance
   * trigger requires `latest_committed_version >= committed_version` — so
   * inside one transaction the order is load-bearing, not cosmetic. Nothing is
   * written if the commit rolls back, which closes the window where an
   * acceptance could outlive the version it points at (#10 slice 10d §R/§S).
   */
  intakeAcceptances?: readonly IntakeSourceAcceptance[]
}

/** Commit one assessed next version. Caller must re-assess after VersionConflict. */
export async function commitNextVersion(db: SnapshotDatabase, options: CommitVersionOptions): Promise<void> {
  const { graph, assessment, expectedPredecessor, reEvaluationAudit, executionRunId } = options
  const acceptances = options.intakeAcceptances ?? []
  const expected = expectedPredecessor === null ? 1 : expectedPredecessor + 1
  if (!graph.version || graph.version.version !== expected) throw new Error('Wrong candidate version')
  for (const acceptance of acceptances) {
    if (!graph.version.addedSourceIds.includes(acceptance.sourceId))
      throw new Error(`Acceptance names source ${acceptance.sourceId}, which this version did not add`)
  }
  const previous = expectedPredecessor === null
    ? undefined : await readSnapshot(db, graph.investigation.id, expectedPredecessor)
  if (previous === undefined) assertFirstVersion(graph, reEvaluationAudit)
  else assertVersionDiff(previous, graph, reEvaluationAudit)
  assertCommittable(graph, assessment)
  const captured = structuredClone(graph)
  await db.query('BEGIN')
  try {
    const found = (await db.query('SELECT latest_committed_version FROM investigations WHERE id=$1 FOR UPDATE', [graph.investigation.id])).rows
    const actual = found.length ? found[0].latest_committed_version as number | null : null
    if (actual !== expectedPredecessor) throw new VersionConflict(expectedPredecessor, actual)
    if (!isDeepStrictEqual(graph, captured)) throw new Error('Candidate changed after assessment')
    assertCommittable(graph, assessment)
    if (previous === undefined) assertFirstVersion(graph, reEvaluationAudit)
    else assertVersionDiff(previous, graph, reEvaluationAudit)
    const run = (await db.query(`SELECT id,status FROM execution_runs WHERE id=$1 AND investigation_id=$2
      AND committed_version IS NULL AND status IN ('COMPLETED','CAPABILITY_BLOCKED') FOR UPDATE`,
      [executionRunId, graph.investigation.id])).rows
    if (run.length !== 1) throw new Error('Producing execution run is missing or incomplete')
    if (run[0].status === 'CAPABILITY_BLOCKED' && assessment.verdict !== 'BLOCKED')
      throw new Error('Capability-blocked execution cannot assert PASS')
    const graduation = await readLatestGraduation(db, executionRunId)
    if (!graduation || !isDeepStrictEqual(graduation.result, assessment) ||
        graduation.result.graphFingerprint !== fingerprintGraph(graph) ||
        graduation.candidateDigest !== candidateDigest(graph))
      throw new Error('Persisted graduation audit does not match candidate')
    const workspace = await loadCandidateCheckpoint(db, executionRunId)
    if (workspace.journal.staleStages().length > 0 || candidateDigest(workspace.accumulator.rebuild()) !== graduation.candidateDigest)
      throw new Error('Candidate workspace is stale or changed since graduation')
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
    const linked = (await db.query(`UPDATE execution_runs SET committed_version=$1,committed_graduation_index=$2
      WHERE id=$3 AND committed_version IS NULL RETURNING id`,
      [graph.version.version, graduation.assessmentIndex, executionRunId])).rows
    if (linked.length !== 1) throw new Error('Execution run link failed')
    /*
     * `latest_committed_version = NULL` never matches in SQL, so the first
     * version needs `IS NULL` rather than an equality against null. The race
     * it guards is the same one: the pointer must still be where the caller
     * expected when it moves.
     */
    const moved = (expectedPredecessor === null
      ? await db.query(`UPDATE investigations SET latest_committed_version=$1
          WHERE id=$2 AND latest_committed_version IS NULL RETURNING id`,
      [graph.version.version, graph.investigation.id])
      : await db.query(`UPDATE investigations SET latest_committed_version=$1
          WHERE id=$2 AND latest_committed_version=$3 RETURNING id`,
      [graph.version.version, graph.investigation.id, expectedPredecessor])).rows
    if (moved.length !== 1) throw new VersionConflict(expectedPredecessor, actual)
    // Only now: the pointer has moved, so 10a's acceptance trigger can see the
    // version as committed. Its four conditions still apply in full.
    for (const acceptance of acceptances) {
      const ordinal = Number((await db.query(
        'SELECT COALESCE(MAX(ordinal) + 1, 0) AS next FROM ati_intake_source_acceptances WHERE intake_id=$1',
        [acceptance.intakeId])).rows[0].next)
      await db.query(`INSERT INTO ati_intake_source_acceptances(intake_id, ordinal,
        investigation_id, committed_version, source_id, accepted_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [acceptance.intakeId, ordinal, graph.investigation.id, graph.version.version,
        acceptance.sourceId, acceptance.acceptedAt])
    }
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}
