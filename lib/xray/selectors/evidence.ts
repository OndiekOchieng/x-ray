/**
 * Evidence selectors.
 *
 * The canonical relationship lives on the Evidence record. These selectors
 * partition by it and never re-derive it from a Finding's presentation
 * buckets — `Finding.challengingEvidenceIds` deliberately merges `CHALLENGES`
 * and `CONTRADICTS`, so reading direction back from the Finding would lose the
 * distinction that XR-INV-005 turns on.
 */

import type {
  Evidence,
  EvidenceRelationship,
  EvidenceStrength,
  Measurement,
  TimeScope,
} from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'

export function evidenceById(graph: XRayGraph, id: string): Evidence | undefined {
  return graph.index.evidence.get(id)
}

/** All evidence bearing on a claim, in graph order, any relationship. */
export function evidenceForClaim(graph: XRayGraph, claimId: ClaimIdLike): Evidence[] {
  return graph.index.evidenceByClaim.get(claimId) ?? []
}

export function evidenceForClaimByRelationship(
  graph: XRayGraph,
  claimId: ClaimIdLike,
  relationship: EvidenceRelationship,
): Evidence[] {
  return evidenceForClaim(graph, claimId).filter((e) => e.relationship === relationship)
}

/** Evidence whose relationship is `SUPPORTS`. */
export function supportingEvidenceForClaim(graph: XRayGraph, claimId: ClaimIdLike): Evidence[] {
  return evidenceForClaimByRelationship(graph, claimId, 'SUPPORTS')
}

/**
 * Evidence whose relationship is `CHALLENGES` — weakening without refuting.
 *
 * Deliberately excludes `CONTRADICTS`. Use `opposingEvidenceForClaim` for the
 * union that matches `Finding.challengingEvidenceIds`.
 */
export function challengingEvidenceForClaim(graph: XRayGraph, claimId: ClaimIdLike): Evidence[] {
  return evidenceForClaimByRelationship(graph, claimId, 'CHALLENGES')
}

/**
 * Evidence whose relationship is `CONTRADICTS` — incompatible with the claim.
 *
 * Kept separately addressable precisely because it is the constrained
 * relationship. XR-INV-005 forbids asserting it from measurement-incompatible
 * evidence, and a reviewer needs to find every instance without unpacking a
 * merged bucket. In XRAY-KE-001 this returns `[]` for every claim, which is
 * the finding, not an omission (CAL-001).
 */
export function contradictingEvidenceForClaim(graph: XRayGraph, claimId: ClaimIdLike): Evidence[] {
  return evidenceForClaimByRelationship(graph, claimId, 'CONTRADICTS')
}

/** `CHALLENGES` ∪ `CONTRADICTS` — the union `Finding.challengingEvidenceIds` holds. */
export function opposingEvidenceForClaim(graph: XRayGraph, claimId: ClaimIdLike): Evidence[] {
  return evidenceForClaim(graph, claimId).filter(
    (e) => e.relationship === 'CHALLENGES' || e.relationship === 'CONTRADICTS',
  )
}

/** Evidence whose relationship is `CONTEXTUALIZES`. */
export function contextualEvidenceForClaim(graph: XRayGraph, claimId: ClaimIdLike): Evidence[] {
  return evidenceForClaimByRelationship(graph, claimId, 'CONTEXTUALIZES')
}

/** Evidence extracted from one source. One source may yield many records. */
export function evidenceForSource(graph: XRayGraph, sourceId: string): Evidence[] {
  return graph.evidence.filter((e) => e.sourceId === sourceId)
}

export function evidenceByStrength(
  graph: XRayGraph,
  claimId: ClaimIdLike,
  strength: EvidenceStrength,
): Evidence[] {
  return evidenceForClaim(graph, claimId).filter((e) => e.strength === strength)
}

/**
 * Measurements carried by evidence bearing on a claim, paired with their
 * evidence id and relationship.
 *
 * READ-ONLY. This exposes the data a compatibility judgment needs; it does not
 * make that judgment. Deciding whether a claim's measurement and a piece of
 * evidence's measurement are comparable is an epistemic ruling belonging to
 * the invariant validator (XR-INV-005), which is not implemented. No selector
 * here answers "is this contradiction valid".
 */
export function evidenceMeasurementsForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): { evidenceId: string; relationship: EvidenceRelationship; measurement: Measurement }[] {
  return evidenceForClaim(graph, claimId)
    .filter((e): e is Evidence & { measurement: Measurement } => e.measurement !== undefined)
    .map((e) => ({ evidenceId: e.id, relationship: e.relationship, measurement: e.measurement }))
}

/** Temporal scopes carried by evidence bearing on a claim. */
export function evidenceTimeScopesForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): { evidenceId: string; timeScope: TimeScope }[] {
  return evidenceForClaim(graph, claimId)
    .filter((e): e is Evidence & { timeScope: TimeScope } => e.timeScope !== undefined)
    .map((e) => ({ evidenceId: e.id, timeScope: e.timeScope }))
}
