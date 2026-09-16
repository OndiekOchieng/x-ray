/**
 * Claim selectors. Pure reads over an `XRayGraph`.
 */

import type { Claim, ClaimOrigin, Measurement } from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'

/** A claim, or `undefined` if the graph has none with that id. */
export function claimById(graph: XRayGraph, id: ClaimIdLike): Claim | undefined {
  return graph.index.claim.get(id)
}

export function allClaims(graph: XRayGraph): readonly Claim[] {
  return graph.claims
}

/**
 * Claims decomposed from the surface source.
 *
 * XR-INV-012 keeps these in a namespace separate from discovered claims, and
 * the domain's discriminated union enforces it. Filtering on `origin` rather
 * than on an id prefix keeps the convention in one place.
 */
export function surfaceClaims(graph: XRayGraph): Claim[] {
  return graph.claims.filter((c) => c.origin === 'SURFACE')
}

/** Claims discovered while tracing evidence for other claims. */
export function discoveredClaims(graph: XRayGraph): Claim[] {
  return graph.claims.filter((c) => c.origin === 'DISCOVERED')
}

export function claimsByOrigin(graph: XRayGraph, origin: ClaimOrigin): Claim[] {
  return graph.claims.filter((c) => c.origin === origin)
}

/**
 * The claim's own measurement, if it asserts a measured quantity.
 *
 * Read-only. Whether this measurement is comparable with any piece of
 * evidence is a validation ruling, not a selector's to make — see
 * `evidenceMeasurementsForClaim` in `selectors/evidence.ts`.
 */
export function measurementForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): Measurement | undefined {
  return claimById(graph, claimId)?.measurement
}
