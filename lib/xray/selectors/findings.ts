/**
 * Finding selectors.
 *
 * Findings index evidence by relationship through three lists. These selectors
 * resolve those lists; they do not recompute them. Where the canonical
 * direction of a single piece of evidence matters, read it from the Evidence
 * record (`selectors/evidence.ts`) — `challengingEvidenceIds` merges
 * `CHALLENGES` and `CONTRADICTS`.
 */

import type { Confidence, Evidence, Finding, FindingStatus } from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'
import { requireEntity } from './graph'

export function findingById(graph: XRayGraph, id: string): Finding | undefined {
  return graph.index.finding.get(id)
}

/**
 * The finding for a claim, or `undefined` if it has not been graded.
 *
 * The domain does not forbid a second finding for one claim, so
 * `findingsForClaim` exists too. This returns the first and is the normal read.
 */
export function findingForClaim(graph: XRayGraph, claimId: ClaimIdLike): Finding | undefined {
  return graph.index.findingsByClaim.get(claimId)?.[0]
}

/** Every finding for a claim. More than one is an integrity problem, not hidden here. */
export function findingsForClaim(graph: XRayGraph, claimId: ClaimIdLike): Finding[] {
  return graph.index.findingsByClaim.get(claimId) ?? []
}

export function findingsByStatus(graph: XRayGraph, status: FindingStatus): Finding[] {
  return graph.findings.filter((f) => f.status === status)
}

export function findingsByConfidence(graph: XRayGraph, confidence: Confidence): Finding[] {
  return graph.findings.filter((f) => f.confidence === confidence)
}

/**
 * Findings the evidence did not settle.
 *
 * `INSUFFICIENT_EVIDENCE` and `UNRESOLVED` are outcomes, not failures, and
 * `CONTESTED` records a live disagreement on the record. All three should
 * carry a gap — XR-INV-008.
 */
export function unresolvedFindings(graph: XRayGraph): Finding[] {
  return graph.findings.filter(
    (f) =>
      f.status === 'UNRESOLVED' ||
      f.status === 'INSUFFICIENT_EVIDENCE' ||
      f.status === 'CONTESTED',
  )
}

const resolveEvidence = (graph: XRayGraph, ids: readonly string[]): Evidence[] =>
  ids.map((id) => requireEntity(graph.index.evidence.get(id), 'Evidence', id))

/** Resolve `supportingEvidenceIds`. Throws on a dangling id. */
export function supportingEvidenceForFinding(graph: XRayGraph, finding: Finding): Evidence[] {
  return resolveEvidence(graph, finding.supportingEvidenceIds)
}

/** Resolve `challengingEvidenceIds` — `CHALLENGES` and `CONTRADICTS` together. */
export function challengingEvidenceForFinding(graph: XRayGraph, finding: Finding): Evidence[] {
  return resolveEvidence(graph, finding.challengingEvidenceIds)
}

/** Resolve `contextualEvidenceIds`. */
export function contextualEvidenceForFinding(graph: XRayGraph, finding: Finding): Evidence[] {
  return resolveEvidence(graph, finding.contextualEvidenceIds)
}

/** Every evidence record the finding indexes, across all three lists. */
export function allEvidenceForFinding(graph: XRayGraph, finding: Finding): Evidence[] {
  return [
    ...supportingEvidenceForFinding(graph, finding),
    ...challengingEvidenceForFinding(graph, finding),
    ...contextualEvidenceForFinding(graph, finding),
  ]
}
