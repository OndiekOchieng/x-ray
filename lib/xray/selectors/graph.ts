/**
 * XRayGraph — the read-only query aggregate.
 *
 * WHAT THIS IS NOT
 * ================
 * `XRayGraph` is **not canonical state** and introduces no new facts. It is a
 * query-layer structure that holds references to canonical arrays and the
 * lookup indexes built from them. Every fact in it already exists in the
 * domain objects it points at; nothing is copied, transformed or derived into
 * storage.
 *
 * The distinction matters because the architecture has exactly one canonical
 * record (the evidence graph) and everything else is a projection of it
 * (ADR-0001). A convenience structure that quietly accumulated its own fields
 * would become a second source of truth. This one cannot: it is assembled on
 * demand from canonical arrays and thrown away.
 *
 * Specifically it MUST NOT carry derived counts. Counts are computed by
 * `selectors/counts.ts` at the moment they are asked for, so they cannot drift
 * from the arrays they describe — the failure the v0 scaffold shipped, where a
 * stored `receiptsCount: 11` outlived a five-element array.
 *
 * ABSENCE CONVENTION
 * ==================
 * One convention, applied everywhere:
 *
 *   `*ById(graph, id)` returns `T | undefined`.
 *
 * Absence is a legitimate answer to a lookup. No selector fabricates a
 * fallback object, returns an empty placeholder, or substitutes a default —
 * the v0 scaffold's `getGap(id) ?? gapRecords[0]` silently served the wrong
 * gap for any unknown id, which is exactly the failure this rules out.
 *
 * `requireEntity` is an explicit assertion helper, not a second lookup
 * convention. Projections use it when resolving an id the graph itself
 * asserts exists — a dangling `supportingEvidenceIds` entry is a referential
 * integrity failure, and it must fail loudly rather than render a blank card.
 *
 * PURITY
 * ======
 * No React, no DOM, no routing, no network, no fixture ids. Selectors operate
 * on whatever graph they are handed.
 */

import type {
  ATIRequest,
  Claim,
  ClaimId,
  Disconfirmation,
  Discrepancy,
  Evidence,
  Finding,
  Gap,
  Investigation,
  InvestigationVersion,
  Source,
  SourceDependency,
} from '@/lib/xray/domain'

/** Canonical arrays required to answer reads. */
export interface XRayGraphInput {
  investigation: Investigation
  version?: InvestigationVersion
  claims: readonly Claim[]
  sources: readonly Source[]
  sourceDependencies: readonly SourceDependency[]
  evidence: readonly Evidence[]
  discrepancies: readonly Discrepancy[]
  disconfirmations: readonly Disconfirmation[]
  findings: readonly Finding[]
  gaps: readonly Gap[]
  atiRequests?: readonly ATIRequest[]
}

/** Lookup indexes. Built from the arrays; never a separate source of truth. */
interface GraphIndex {
  readonly claim: ReadonlyMap<string, Claim>
  readonly source: ReadonlyMap<string, Source>
  readonly evidence: ReadonlyMap<string, Evidence>
  readonly discrepancy: ReadonlyMap<string, Discrepancy>
  readonly finding: ReadonlyMap<string, Finding>
  readonly gap: ReadonlyMap<string, Gap>
  readonly dependency: ReadonlyMap<string, SourceDependency>
  /** claimId → findings. Plural so a second finding is visible, not hidden. */
  readonly findingsByClaim: ReadonlyMap<string, Finding[]>
  /** claimId → disconfirmations. Plural for the same reason. */
  readonly disconfirmationsByClaim: ReadonlyMap<string, Disconfirmation[]>
  /** claimId → evidence bearing on it, in graph order. */
  readonly evidenceByClaim: ReadonlyMap<string, Evidence[]>
  /** sourceId → outgoing dependency edges (this source depends on ...). */
  readonly dependenciesBySource: ReadonlyMap<string, SourceDependency[]>
  /** sourceId → incoming edges (... depends on this source). */
  readonly dependentsBySource: ReadonlyMap<string, SourceDependency[]>
}

export interface XRayGraph extends XRayGraphInput {
  readonly atiRequests: readonly ATIRequest[]
  readonly index: GraphIndex
}

/** Thrown when an id the graph asserts exists cannot be resolved. */
export class GraphIntegrityError extends Error {
  constructor(kind: string, id: string) {
    super(`Referential integrity: no ${kind} with id "${id}"`)
    this.name = 'GraphIntegrityError'
  }
}

/**
 * Assert that a looked-up entity exists.
 *
 * Use where the graph itself claims the reference is valid — resolving
 * `Finding.supportingEvidenceIds`, `Gap.claimIds`, `Evidence.sourceId`. A
 * miss is a corrupt graph, and silence would surface as an empty panel with
 * no explanation.
 */
export function requireEntity<T>(value: T | undefined, kind: string, id: string): T {
  if (value === undefined) throw new GraphIntegrityError(kind, id)
  return value
}

const push = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

/** Build the query aggregate. Cheap; call per read cycle rather than caching. */
export function createXRayGraph(input: XRayGraphInput): XRayGraph {
  const findingsByClaim = new Map<string, Finding[]>()
  for (const f of input.findings) push(findingsByClaim, f.claimId, f)

  const disconfirmationsByClaim = new Map<string, Disconfirmation[]>()
  for (const d of input.disconfirmations) push(disconfirmationsByClaim, d.claimId, d)

  const evidenceByClaim = new Map<string, Evidence[]>()
  for (const e of input.evidence) for (const c of e.claimIds) push(evidenceByClaim, c, e)

  const dependenciesBySource = new Map<string, SourceDependency[]>()
  const dependentsBySource = new Map<string, SourceDependency[]>()
  for (const d of input.sourceDependencies) {
    push(dependenciesBySource, d.sourceId, d)
    if (d.dependsOnSourceId) push(dependentsBySource, d.dependsOnSourceId, d)
  }

  return {
    ...input,
    atiRequests: input.atiRequests ?? [],
    index: {
      claim: new Map(input.claims.map((c) => [c.id, c])),
      source: new Map(input.sources.map((s) => [s.id, s])),
      evidence: new Map(input.evidence.map((e) => [e.id, e])),
      discrepancy: new Map(input.discrepancies.map((d) => [d.id, d])),
      finding: new Map(input.findings.map((f) => [f.id, f])),
      gap: new Map(input.gaps.map((g) => [g.id, g])),
      dependency: new Map(input.sourceDependencies.map((d) => [d.id, d])),
      findingsByClaim,
      disconfirmationsByClaim,
      evidenceByClaim,
      dependenciesBySource,
      dependentsBySource,
    },
  }
}

/** Claim ids are a narrowed string union; reads accept plain ids. */
export type ClaimIdLike = ClaimId | string
