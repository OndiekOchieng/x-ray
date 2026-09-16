/**
 * Source selectors.
 *
 * A Source is a record. The proposition drawn from it is Evidence. These are
 * separate entities and this module never conflates them — `sourcesForClaim`
 * answers "which records did this claim's evidence come from", which is not
 * the same question as "how much evidence is there" and emphatically not
 * "how well corroborated is this claim". For that, see `selectors/provenance`.
 */

import type { Source, SourceAccessibility, EvidenceClass, OriginStatus } from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'
import { evidenceForClaim } from './evidence'

export function sourceById(graph: XRayGraph, id: string): Source | undefined {
  return graph.index.source.get(id)
}

export function allSources(graph: XRayGraph): readonly Source[] {
  return graph.sources
}

/** The investigation's surface source — the article whose claims are under test. */
export function surfaceSource(graph: XRayGraph): Source | undefined {
  return sourceById(graph, graph.investigation.surfaceSourceId)
}

export function isSurfaceSource(graph: XRayGraph, sourceId: string): boolean {
  return graph.investigation.surfaceSourceId === sourceId
}

/**
 * Distinct sources that yielded evidence bearing on this claim.
 *
 * NOT a corroboration measure, in either direction. Three of these may be
 * three reproductions of one originating record; equally, one of them may
 * carry propositions from two different origins.
 *
 * For corroboration use `independentEvidenceOriginsForClaim` or
 * `claimProvenanceSummary` in `selectors/provenance.ts`, which resolve each
 * proposition to the origin that actually carries it. Counting the result of
 * this function and calling it corroboration is FM-003.
 */
export function sourcesForClaim(graph: XRayGraph, claimId: ClaimIdLike): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const e of evidenceForClaim(graph, claimId)) {
    if (seen.has(e.sourceId)) continue
    seen.add(e.sourceId)
    const s = sourceById(graph, e.sourceId)
    if (s) out.push(s)
  }
  return out
}

export function sourcesByOriginStatus(graph: XRayGraph, status: OriginStatus): Source[] {
  return graph.sources.filter((s) => s.originStatus === status)
}

export function sourcesByEvidenceClass(graph: XRayGraph, evidenceClass: EvidenceClass): Source[] {
  return graph.sources.filter((s) => s.evidenceClass === evidenceClass)
}

export function sourcesByAccessibility(
  graph: XRayGraph,
  accessibility: SourceAccessibility,
): Source[] {
  return graph.sources.filter((s) => s.accessibility === accessibility)
}

/**
 * Sources whose contents were never obtained.
 *
 * `NOT_RETRIEVED` (identified, contents not obtained) and `NOT_LOCATED`
 * (searched, not found) are both here and remain distinguishable via
 * `source.accessibility`. Neither means the record does not exist — XR-INV-006
 * and CAL-004. There is no `DOES_NOT_EXIST` to filter on; the union has no
 * such member.
 */
export function unobtainedSources(graph: XRayGraph): Source[] {
  return graph.sources.filter(
    (s) => s.accessibility === 'NOT_RETRIEVED' || s.accessibility === 'NOT_LOCATED',
  )
}

/** Sources actually held — the only ones a proposition can honestly be quoted from. */
export function obtainedSources(graph: XRayGraph): Source[] {
  return graph.sources.filter(
    (s) => s.accessibility === 'RETRIEVED' || s.accessibility === 'PARTIAL',
  )
}
