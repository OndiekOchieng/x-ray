/**
 * Discrepancy and disconfirmation selectors.
 */

import type {
  Disconfirmation,
  Discrepancy,
  DiscrepancyClassification,
} from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'

export function discrepancyById(graph: XRayGraph, id: string): Discrepancy | undefined {
  return graph.index.discrepancy.get(id)
}

export function allDiscrepancies(graph: XRayGraph): readonly Discrepancy[] {
  return graph.discrepancies
}

export function discrepanciesForClaim(graph: XRayGraph, claimId: ClaimIdLike): Discrepancy[] {
  return graph.discrepancies.filter((d) => d.claimIds.some((c) => c === claimId))
}

export function discrepanciesByClassification(
  graph: XRayGraph,
  classification: DiscrepancyClassification,
): Discrepancy[] {
  return graph.discrepancies.filter((d) => d.classification === classification)
}

export function unresolvedDiscrepancies(graph: XRayGraph): Discrepancy[] {
  return graph.discrepancies.filter((d) => !d.resolved)
}

/**
 * Discrepancies classified `GENUINE_CONTRADICTION`.
 *
 * Separately addressable because it is the constrained classification: the
 * engine must attempt the date, scope, definition, phase and unit
 * classifications before permitting it. Surfacing them is a read; judging
 * whether one is earned belongs to validation.
 */
export function genuineContradictions(graph: XRayGraph): Discrepancy[] {
  return discrepanciesByClassification(graph, 'GENUINE_CONTRADICTION')
}

/**
 * Disconfirmation records addressed to a claim.
 *
 * Plural: disconfirmation is claim-addressable, and a claim attacked twice
 * should show two records rather than silently keeping one.
 */
export function disconfirmationsForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): Disconfirmation[] {
  return graph.index.disconfirmationsByClaim.get(claimId) ?? []
}

/** The first disconfirmation for a claim, or `undefined`. */
export function disconfirmationForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): Disconfirmation | undefined {
  return disconfirmationsForClaim(graph, claimId)[0]
}
