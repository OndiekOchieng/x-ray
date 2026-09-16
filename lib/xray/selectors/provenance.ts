/**
 * Provenance selectors — source independence.
 *
 * THE SEMANTIC DISTINCTION THIS MODULE EXISTS TO ENFORCE
 * =====================================================
 *
 *   publications            how many records carry an assertion
 *   independent origins     how many times it was independently observed
 *
 * These are different numbers and only the second bears on corroboration.
 * XR-INV-004: multiple publications derived from one originating record MUST
 * NOT be treated as multiple independent confirmations.
 *
 * Deliberate API decisions, against FM-003 (source-count inflation):
 *
 *  - There is **no** `corroborationCount`, `confirmationCount`, or
 *    `independentSourceCount`. The corroboration-relevant number is called
 *    `independentOriginCount` and nothing else is named to suggest it.
 *  - `ProvenanceSummary.sourceCount` sits next to `independentOriginCount` in
 *    the same object, so the gap between them is visible at the call site
 *    rather than discoverable only by reading the graph.
 *  - `sourcesForClaim(...).length` is a source count and is documented as such
 *    in `selectors/sources.ts`. It remains available because it is a real
 *    question; it is simply not the one that measures corroboration.
 *
 * For the XRAY-KE-001 September cluster this module yields 3 publications and
 * 1 independent originating observation — the selector-layer expression of
 * CAL-003.
 *
 * ORIGIN RESOLUTION
 * =================
 * A source with no outgoing dependency edge is its own origin. A source that
 * depends on another resolves transitively to that source's origins, so a
 * chain A → B → C yields origin C. Cycles are guarded and yield the entry
 * source rather than looping.
 *
 * A dependency edge with no `dependsOnSourceId` records an origin that was
 * described but never identified as a record. That is represented as an
 * `UNIDENTIFIED` origin rather than dropped: the graph knows the source is
 * derivative even though it cannot name the parent, and treating it as its own
 * origin would inflate the independent count. Two unidentified origins are
 * never merged — nothing establishes they are the same record.
 */

import type { Source, SourceDependency, SourceDependencyRelationship } from '@/lib/xray/domain'
import type { ClaimIdLike, XRayGraph } from './graph'
import { sourceById, sourcesForClaim } from './sources'

/** Where an assertion originated, as far as the graph can establish. */
export type OriginRef =
  | { kind: 'SOURCE'; sourceId: string }
  | { kind: 'UNIDENTIFIED'; description?: string; viaDependencyId: string }

/** Stable key for deduplicating origins. */
export function originKey(origin: OriginRef): string {
  return origin.kind === 'SOURCE'
    ? `SOURCE:${origin.sourceId}`
    : `UNIDENTIFIED:${origin.viaDependencyId}`
}

/** Outgoing edges: records this source depends on. */
export function dependenciesForSource(graph: XRayGraph, sourceId: string): SourceDependency[] {
  return graph.index.dependenciesBySource.get(sourceId) ?? []
}

/** Incoming edges: records that depend on this source. */
export function dependentsOfSource(graph: XRayGraph, sourceId: string): SourceDependency[] {
  return graph.index.dependentsBySource.get(sourceId) ?? []
}

export function dependenciesByRelationship(
  graph: XRayGraph,
  relationship: SourceDependencyRelationship,
): SourceDependency[] {
  return graph.sourceDependencies.filter((d) => d.relationship === relationship)
}

/**
 * The origin(s) an assertion in this source traces back to.
 *
 * Returns the source itself when it originates. May return several origins:
 * a publication can reproduce one record while also carrying figures that
 * trace to another.
 */
export function originsOfSource(graph: XRayGraph, sourceId: string): OriginRef[] {
  const out: OriginRef[] = []
  const seenOrigins = new Set<string>()
  const visiting = new Set<string>()

  const add = (origin: OriginRef): void => {
    const key = originKey(origin)
    if (seenOrigins.has(key)) return
    seenOrigins.add(key)
    out.push(origin)
  }

  const walk = (id: string): void => {
    if (visiting.has(id)) {
      // Cyclic provenance: treat the entry point as terminal rather than loop.
      add({ kind: 'SOURCE', sourceId: id })
      return
    }
    visiting.add(id)
    const edges = dependenciesForSource(graph, id)
    if (edges.length === 0) {
      add({ kind: 'SOURCE', sourceId: id })
    } else {
      for (const edge of edges) {
        if (edge.dependsOnSourceId) walk(edge.dependsOnSourceId)
        else
          add({
            kind: 'UNIDENTIFIED',
            description: edge.originDescription,
            viaDependencyId: edge.id,
          })
      }
    }
    visiting.delete(id)
  }

  walk(sourceId)
  return out
}

/** True when nothing in the graph records this source as deriving from another. */
export function isOriginatingSource(graph: XRayGraph, sourceId: string): boolean {
  return dependenciesForSource(graph, sourceId).length === 0
}

/** Sources for this claim that the graph marks `ORIGINATING`. */
export function originatingSourcesForClaim(graph: XRayGraph, claimId: ClaimIdLike): Source[] {
  return sourcesForClaim(graph, claimId).filter((s) => s.originStatus === 'ORIGINATING')
}

/** Sources for this claim that the graph marks `REPEATING`. */
export function repeatingSourcesForClaim(graph: XRayGraph, claimId: ClaimIdLike): Source[] {
  return sourcesForClaim(graph, claimId).filter((s) => s.originStatus === 'REPEATING')
}

/**
 * Distinct origins behind all evidence for a claim.
 *
 * **This is the corroboration-relevant set.** Its length is the number of
 * independent observations, which is at most — and frequently far fewer than —
 * the number of sources.
 */
export function independentOriginsForClaim(graph: XRayGraph, claimId: ClaimIdLike): OriginRef[] {
  const seen = new Set<string>()
  const out: OriginRef[] = []
  for (const source of sourcesForClaim(graph, claimId)) {
    for (const origin of originsOfSource(graph, source.id)) {
      const key = originKey(origin)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(origin)
    }
  }
  return out
}

/** One origin and the records that reproduce it. */
export interface ProvenanceCluster {
  origin: OriginRef
  /** The originating record, when the origin was identified and is in the graph. */
  originSource?: Source
  /** Sources resolving to this origin, excluding the origin itself. */
  publicationSourceIds: string[]
  /** Edges linking those publications to this origin. */
  dependencyEdgeIds: string[]
  /** How many records carry it. NOT a corroboration measure. */
  publicationCount: number
  /** Always 1. Present so a caller reading the shape cannot miss the ratio. */
  independentOriginCount: 1
}

/**
 * Group a claim's sources by the origin they trace to.
 *
 * A cluster with `publicationCount: 3` and `independentOriginCount: 1` is the
 * shape CAL-003 describes.
 */
export function provenanceClustersForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): ProvenanceCluster[] {
  const byOrigin = new Map<string, { origin: OriginRef; sourceIds: Set<string> }>()
  for (const source of sourcesForClaim(graph, claimId)) {
    for (const origin of originsOfSource(graph, source.id)) {
      const key = originKey(origin)
      const bucket = byOrigin.get(key) ?? { origin, sourceIds: new Set<string>() }
      bucket.sourceIds.add(source.id)
      byOrigin.set(key, bucket)
    }
  }

  return [...byOrigin.values()].map(({ origin, sourceIds }) => {
    const originSourceId = origin.kind === 'SOURCE' ? origin.sourceId : undefined
    const publicationSourceIds = [...sourceIds].filter((id) => id !== originSourceId)
    const dependencyEdgeIds = publicationSourceIds.flatMap((id) =>
      dependenciesForSource(graph, id)
        .filter((edge) =>
          origin.kind === 'SOURCE'
            ? originsOfSource(graph, id).some(
                (o) => o.kind === 'SOURCE' && o.sourceId === origin.sourceId,
              )
            : edge.id === origin.viaDependencyId,
        )
        .map((edge) => edge.id),
    )
    return {
      origin,
      originSource: originSourceId ? sourceById(graph, originSourceId) : undefined,
      publicationSourceIds,
      dependencyEdgeIds: [...new Set(dependencyEdgeIds)],
      publicationCount: publicationSourceIds.length,
      independentOriginCount: 1,
    }
  })
}

/** Graph-level cluster for one originating record, independent of any claim. */
export function provenanceClusterForOrigin(
  graph: XRayGraph,
  originSourceId: string,
): ProvenanceCluster {
  const edges = dependentsOfSource(graph, originSourceId)
  const publicationSourceIds = [...new Set(edges.map((e) => e.sourceId))]
  return {
    origin: { kind: 'SOURCE', sourceId: originSourceId },
    originSource: sourceById(graph, originSourceId),
    publicationSourceIds,
    dependencyEdgeIds: edges.map((e) => e.id),
    publicationCount: publicationSourceIds.length,
    independentOriginCount: 1,
  }
}

/**
 * Provenance in one object.
 *
 * `sourceCount` and `independentOriginCount` sit together on purpose. Reading
 * one without the other is the mistake; reading this object makes the gap
 * between them unavoidable.
 */
export interface ProvenanceSummary {
  /** Distinct sources yielding evidence for the claim. NOT corroboration. */
  sourceCount: number
  /** Sources marked `REPEATING` — records that carry rather than observe. */
  publicationCount: number
  /** Sources marked `ORIGINATING`. */
  originatingSourceCount: number
  /** Distinct origins after resolving dependencies. **The corroboration number.** */
  independentOriginCount: number
  /** Origins described in an edge but never identified as a record. */
  unidentifiedOriginCount: number
  /** Dependency edges touching this claim's sources. */
  dependencyEdgeCount: number
  clusters: ProvenanceCluster[]
}

export function provenanceSummaryForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): ProvenanceSummary {
  const sources = sourcesForClaim(graph, claimId)
  const origins = independentOriginsForClaim(graph, claimId)
  const clusters = provenanceClustersForClaim(graph, claimId)
  const edgeIds = new Set(
    sources.flatMap((s) => dependenciesForSource(graph, s.id).map((d) => d.id)),
  )
  return {
    sourceCount: sources.length,
    publicationCount: sources.filter((s) => s.originStatus === 'REPEATING').length,
    originatingSourceCount: sources.filter((s) => s.originStatus === 'ORIGINATING').length,
    independentOriginCount: origins.length,
    unidentifiedOriginCount: origins.filter((o) => o.kind === 'UNIDENTIFIED').length,
    dependencyEdgeCount: edgeIds.size,
    clusters,
  }
}
