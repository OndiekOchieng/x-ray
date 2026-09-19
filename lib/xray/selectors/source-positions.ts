/** Contextual source-position reads. These selectors make no truth or trust judgment. */
import type { SourcePosition } from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'

export function sourcePositionById(graph: XRayGraph, id: string): SourcePosition | undefined {
  return graph.index.sourcePosition.get(id)
}

export function allSourcePositions(graph: XRayGraph): readonly SourcePosition[] {
  return graph.sourcePositions
}

export function sourcePositionsForSource(graph: XRayGraph, sourceId: string): readonly SourcePosition[] {
  return graph.index.positionsBySource.get(sourceId) ?? []
}

export function sourcePositionsForClaim(graph: XRayGraph, claimId: ClaimIdLike): readonly SourcePosition[] {
  return graph.index.positionsByClaim.get(claimId) ?? []
}
