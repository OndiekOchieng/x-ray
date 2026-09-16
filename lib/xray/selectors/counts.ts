/**
 * Derived counts.
 *
 * Every count here is computed from the canonical arrays at the moment it is
 * asked for. None is stored back into domain state, and `XRayGraph` carries no
 * count fields — so a count cannot outlive the array it describes. The v0
 * scaffold stored `receiptsCount: 11` beside a five-element array and the two
 * disagreed for the life of the fixture.
 *
 * NAMING
 * ======
 * Counts are named for what is counted. There is no `receiptCount` here:
 * "receipt" is a presentation concept that fuses Source and Evidence, and it
 * belongs to `projections/receipt-view.ts`. Counting evidence and labelling it
 * "receipts" in the query layer would reintroduce the fusion the domain
 * separates.
 *
 * There is also no count that measures corroboration. The number of sources is
 * not the number of independent observations — see
 * `provenanceSummaryForClaim` in `selectors/provenance.ts` (FM-003).
 */

import type { XRayGraph } from './graph'
import { evidenceForClaim } from './evidence'
import { gapsForClaim } from './gaps'
import { sourcesForClaim } from './sources'
import { discrepanciesForClaim } from './discrepancies'
import type { ClaimIdLike } from './graph'

export function claimCount(graph: XRayGraph): number {
  return graph.claims.length
}

export function surfaceClaimCount(graph: XRayGraph): number {
  return graph.claims.filter((c) => c.origin === 'SURFACE').length
}

export function discoveredClaimCount(graph: XRayGraph): number {
  return graph.claims.filter((c) => c.origin === 'DISCOVERED').length
}

/** Records located or attempted — not propositions, and not corroboration. */
export function sourceCount(graph: XRayGraph): number {
  return graph.sources.length
}

/** Propositions extracted from sources. One source may yield several. */
export function evidenceCount(graph: XRayGraph): number {
  return graph.evidence.length
}

export function findingCount(graph: XRayGraph): number {
  return graph.findings.length
}

export function gapCount(graph: XRayGraph): number {
  return graph.gaps.length
}

export function openGapCount(graph: XRayGraph): number {
  return graph.gaps.filter((g) => g.status === 'OPEN').length
}

export function discrepancyCount(graph: XRayGraph): number {
  return graph.discrepancies.length
}

export function disconfirmationCount(graph: XRayGraph): number {
  return graph.disconfirmations.length
}

/** Provenance edges between sources. */
export function dependencyCount(graph: XRayGraph): number {
  return graph.sourceDependencies.length
}

/** Every derived count for an investigation, computed on demand. */
export interface GraphCounts {
  claims: number
  surfaceClaims: number
  discoveredClaims: number
  sources: number
  evidence: number
  findings: number
  gaps: number
  openGaps: number
  discrepancies: number
  disconfirmations: number
  dependencies: number
}

export function graphCounts(graph: XRayGraph): GraphCounts {
  return {
    claims: claimCount(graph),
    surfaceClaims: surfaceClaimCount(graph),
    discoveredClaims: discoveredClaimCount(graph),
    sources: sourceCount(graph),
    evidence: evidenceCount(graph),
    findings: findingCount(graph),
    gaps: gapCount(graph),
    openGaps: openGapCount(graph),
    discrepancies: discrepancyCount(graph),
    disconfirmations: disconfirmationCount(graph),
    dependencies: dependencyCount(graph),
  }
}

/** Per-claim counts. `sources` is a record count, never a corroboration measure. */
export interface ClaimCounts {
  evidence: number
  sources: number
  gaps: number
  discrepancies: number
}

export function claimCounts(graph: XRayGraph, claimId: ClaimIdLike): ClaimCounts {
  return {
    evidence: evidenceForClaim(graph, claimId).length,
    sources: sourcesForClaim(graph, claimId).length,
    gaps: gapsForClaim(graph, claimId).length,
    discrepancies: discrepanciesForClaim(graph, claimId).length,
  }
}
