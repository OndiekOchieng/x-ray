/**
 * Gap and action selectors.
 *
 * ATI eligibility is read from canonical `Gap.atiEligible`, never recomputed.
 * The domain binds it to `resolutionPath` through a discriminated union
 * (XR-INV-009), so a second derivation here could only introduce drift. These
 * selectors filter; they do not decide.
 */

import type { Gap, GapStatus, ResolutionPath } from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'

export function gapById(graph: XRayGraph, id: string): Gap | undefined {
  return graph.index.gap.get(id)
}

export function allGaps(graph: XRayGraph): readonly Gap[] {
  return graph.gaps
}

/** Gaps blocking a claim. One missing record can block several claims. */
export function gapsForClaim(graph: XRayGraph, claimId: ClaimIdLike): Gap[] {
  return graph.gaps.filter((g) => g.claimIds.some((c) => c === claimId))
}

export function gapsByStatus(graph: XRayGraph, status: GapStatus): Gap[] {
  return graph.gaps.filter((g) => g.status === status)
}

export function gapsByResolutionPath(graph: XRayGraph, path: ResolutionPath): Gap[] {
  return graph.gaps.filter((g) => g.resolutionPath === path)
}

export function openGaps(graph: XRayGraph): Gap[] {
  return graph.gaps.filter((g) => g.status === 'OPEN')
}

/**
 * Gaps eligible for an access-to-information request.
 *
 * Reads the canonical flag. A material gap may be ineligible — a record of an
 * event that has not happened cannot be requested (CAL-005, GAP-003 in
 * XRAY-KE-001). Materiality does not create eligibility.
 */
export function atiEligibleGaps(graph: XRayGraph): Gap[] {
  return graph.gaps.filter((g) => g.atiEligible)
}

/** Gaps that are not ATI-eligible, with the path that explains why. */
export function nonAtiEligibleGaps(graph: XRayGraph): Gap[] {
  return graph.gaps.filter((g) => !g.atiEligible)
}

export interface GapResolutionSummary {
  totalGaps: number
  openGaps: number
  atiEligibleGaps: number
  /** Material gaps that cannot be turned into a request. */
  nonAtiEligibleGaps: number
  byResolutionPath: Record<ResolutionPath, number>
  byStatus: Record<GapStatus, number>
}

const RESOLUTION_PATHS: ResolutionPath[] = [
  'PUBLIC_RECORD_REQUEST',
  'WAIT_FOR_RECORD',
  'FIELD_VERIFICATION',
  'SOURCE_CLARIFICATION',
  'DATASET_QUERY',
  'EXPERT_INTERPRETATION',
  'OTHER',
]

const GAP_STATUSES: GapStatus[] = ['OPEN', 'REQUESTED', 'RECEIVED', 'RESOLVED', 'UNRESOLVABLE']

/** Roll-up over a gap set. Scope it with `gapsForClaim` for a per-claim view. */
export function gapResolutionSummary(gaps: readonly Gap[]): GapResolutionSummary {
  const byResolutionPath = Object.fromEntries(
    RESOLUTION_PATHS.map((p) => [p, gaps.filter((g) => g.resolutionPath === p).length]),
  ) as Record<ResolutionPath, number>
  const byStatus = Object.fromEntries(
    GAP_STATUSES.map((s) => [s, gaps.filter((g) => g.status === s).length]),
  ) as Record<GapStatus, number>
  return {
    totalGaps: gaps.length,
    openGaps: gaps.filter((g) => g.status === 'OPEN').length,
    atiEligibleGaps: gaps.filter((g) => g.atiEligible).length,
    nonAtiEligibleGaps: gaps.filter((g) => !g.atiEligible).length,
    byResolutionPath,
    byStatus,
  }
}
