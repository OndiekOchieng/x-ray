/**
 * ProvenanceView — source independence, ready for display.
 *
 * NO FIXTURE GATES. The v0 scaffold rendered its provenance panel behind
 * `selected.id === 'claim-2'`, so the panel existed only for one hardcoded
 * claim. This projection is driven entirely by dependency edges: a claim gets
 * a provenance panel when its sources actually have provenance, and the
 * September cluster appears because the edges exist, not because a claim id
 * was special-cased.
 *
 * `hasRepetition` is the predicate a component should gate on.
 *
 * The counts carry their meaning in their names. `publicationCount` is how
 * many records carry an assertion; `independentOriginCount` is how many times
 * it was independently observed. Only the second bears on corroboration
 * (XR-INV-004, CAL-003, FM-003).
 */

import type { Source, SourceDependencyRelationship } from '@/lib/xray/domain'
import type { XRayGraph, ClaimIdLike, OriginRef, ProvenanceCluster } from '@/lib/xray/selectors'
import {
  claimProvenanceSummary,
  dependenciesForSource,
  provenanceClusterForOrigin,
  provenanceSummaryForClaim,
  sourceById,
} from '@/lib/xray/selectors'
import { accessibilityLabel, originStatusLabel } from './labels'

export interface ProvenanceSourceView {
  sourceId: string
  title: string
  publisher?: string
  institution?: string
  url?: string
  publishedAt?: string
  originStatus: Source['originStatus']
  originStatusLabel: string
  accessibility: Source['accessibility']
  accessibilityLabel: string
  wasObtained: boolean
}

export interface ProvenanceEdgeView {
  dependencyId: string
  fromSourceId: string
  toSourceId?: string
  relationship: SourceDependencyRelationship
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  originDescription?: string
  /** True when the parent record was described but never identified. */
  isUnidentifiedOrigin: boolean
}

export interface ProvenanceClusterView {
  /** The originating record, when identified and present in the graph. */
  origin?: ProvenanceSourceView
  /** How the origin was described, when it was never identified as a record. */
  originDescription?: string
  originIsIdentified: boolean
  /** Records reproducing this origin. */
  publications: ProvenanceSourceView[]
  edges: ProvenanceEdgeView[]
  /** How many records carry it. NOT corroboration. */
  publicationCount: number
  /** Always 1 for a cluster. Present so the ratio is unmissable. */
  independentOriginCount: 1
  /** e.g. "3 publications · 1 originating observation". */
  summaryLabel: string
}

/**
 * Claim-level independence, resolved from evidence-level provenance.
 *
 * Kept in its own object so it cannot be confused with the document-lineage
 * numbers beside it. One number must not mean both.
 */
export interface ClaimIndependenceView {
  /** Confirmed independent originating observations. */
  independentOriginCount: number
  /** Propositions known to be derivative whose origin was never identified. */
  unidentifiedOriginCount: number
  /** Propositions whose independence could not be determined. */
  unresolvedEvidenceCount: number
  /** False when any proposition's independence is undetermined. */
  isResolved: boolean
  /**
   * Display string, or `undefined` when independence is unresolved.
   *
   * A partially-resolved count would be falsely precise, so none is offered.
   * The caller shows `unresolvedLabel` instead.
   */
  summaryLabel?: string
  /** The same sentence with its axis named (#11 slice 11c). */
  originLabel?: string
  /** Shown when independence cannot be stated exactly. */
  unresolvedLabel?: string
}

export interface ProvenanceView {
  claimId?: string
  sourceCount: number
  publicationCount: number
  originatingSourceCount: number
  /** Document-lineage origin count. NOT corroboration — see `independence`. */
  sourceLineageOriginCount: number
  dependencyEdgeCount: number
  clusters: ProvenanceClusterView[]
  /**
   * True when at least one cluster has more than one publication behind a
   * single origin — i.e. when repetition is present and worth showing.
   */
  hasRepetition: boolean
  /** Claim-level independence from evidence provenance. */
  independence: ClaimIndependenceView
  /**
   * The document-lineage axis, named (#11 slice 11c).
   *
   * 11a found this sentence sitting directly above the independence sentence
   * with no label on either, so a reader met two numbers about one claim that
   * looked like a contradiction — C001 reads "8 records traced · 3 repeat
   * another record" above "8 independent originating observations".
   *
   * Both are right and they answer different questions. Repetition here is
   * about *documents*: which publications reproduce which record. Independence
   * below is about *propositions*: whether each evidence point's own origin
   * resolved. A publication that reproduces another record can still carry a
   * proposition whose origin resolves independently, which is exactly why the
   * two counts can differ — or coincide, as they do at C001.
   *
   * Naming the axis is the whole fix. Neither count changes.
   */
  lineageLabel: string

  /** e.g. "7 records traced · 5 of them repeat another record". */
  summaryLabel: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function sourceViewOf(graph: XRayGraph, sourceId: string): ProvenanceSourceView | undefined {
  const s = sourceById(graph, sourceId)
  if (!s) return undefined
  return {
    sourceId: s.id,
    title: s.title,
    publisher: s.publisher,
    institution: s.institution,
    url: s.url,
    publishedAt: s.publishedAt,
    originStatus: s.originStatus,
    originStatusLabel: originStatusLabel[s.originStatus],
    accessibility: s.accessibility,
    accessibilityLabel: accessibilityLabel[s.accessibility],
    wasObtained: s.accessibility === 'RETRIEVED' || s.accessibility === 'PARTIAL',
  }
}

function edgeViewsFor(graph: XRayGraph, sourceId: string, origin: OriginRef): ProvenanceEdgeView[] {
  return dependenciesForSource(graph, sourceId)
    .filter((edge) =>
      origin.kind === 'SOURCE'
        ? edge.dependsOnSourceId !== undefined
        : edge.id === origin.viaDependencyId,
    )
    .map((edge) => ({
      dependencyId: edge.id,
      fromSourceId: edge.sourceId,
      toSourceId: edge.dependsOnSourceId,
      relationship: edge.relationship,
      confidence: edge.confidence,
      originDescription: edge.originDescription,
      isUnidentifiedOrigin: edge.dependsOnSourceId === undefined,
    }))
}

function clusterViewOf(graph: XRayGraph, cluster: ProvenanceCluster): ProvenanceClusterView {
  const publications = cluster.publicationSourceIds
    .map((id) => sourceViewOf(graph, id))
    .filter((s): s is ProvenanceSourceView => s !== undefined)
  const edges = cluster.publicationSourceIds.flatMap((id) =>
    edgeViewsFor(graph, id, cluster.origin),
  )
  const origin = cluster.origin
  return {
    origin: origin.kind === 'SOURCE' ? sourceViewOf(graph, origin.sourceId) : undefined,
    originDescription: origin.kind === 'UNIDENTIFIED' ? origin.description : undefined,
    originIsIdentified: origin.kind === 'SOURCE',
    publications,
    edges,
    publicationCount: cluster.publicationCount,
    independentOriginCount: 1,
    summaryLabel: `${plural(cluster.publicationCount, 'publication', 'publications')} · 1 originating observation`,
  }
}

/** Provenance for everything bearing on one claim. */
export function provenanceViewForClaim(graph: XRayGraph, claimId: ClaimIdLike): ProvenanceView {
  const summary = provenanceSummaryForClaim(graph, claimId)
  const independence = claimProvenanceSummary(graph, claimId)
  const clusters = summary.clusters.map((c) => clusterViewOf(graph, c))

  return {
    claimId: String(claimId),
    sourceCount: summary.sourceCount,
    publicationCount: summary.publicationCount,
    originatingSourceCount: summary.originatingSourceCount,
    sourceLineageOriginCount: summary.sourceLineageOriginCount,
    dependencyEdgeCount: summary.dependencyEdgeCount,
    clusters,
    hasRepetition: clusters.some((c) => c.publicationCount > 1),

    independence: {
      independentOriginCount: independence.independentOriginCount,
      unidentifiedOriginCount: independence.unidentifiedOriginCount,
      unresolvedEvidenceCount: independence.unresolvedEvidenceCount,
      isResolved: independence.isIndependenceResolved,
      // A count is offered ONLY when every proposition's origin is settled.
      // Anything else would be falsely precise.
      summaryLabel: independence.isIndependenceResolved
        ? plural(
            independence.independentOriginCount,
            'independent originating observation',
            'independent originating observations',
          )
        : undefined,
      // The same sentence with its axis named. See `lineageLabel`.
      originLabel: independence.isIndependenceResolved
        ? `Evidence origin — ${plural(
            independence.independentOriginCount,
            'independent originating observation',
            'independent originating observations',
          )} for this claim`
        : undefined,
      unresolvedLabel: independence.isIndependenceResolved
        ? undefined
        : independence.unidentifiedOriginCount > 0 &&
            independence.unresolvedEvidenceCount === 0
          ? `origin independence unresolved — ${plural(
              independence.unidentifiedOriginCount,
              'originating record was',
              'originating records were',
            )} never identified`
          : `origin independence unresolved for ${plural(
              independence.unresolvedEvidenceCount,
              'evidence point',
              'evidence points',
            )}`,
    },

    summaryLabel: `${plural(summary.sourceCount, 'record', 'records')} traced · ${
      summary.publicationCount
    } of them repeat another record`,
    lineageLabel: `Document lineage — ${
      plural(summary.sourceCount, 'record', 'records')
    } traced · ${summary.publicationCount} of them repeat another record`,
  }
}

/** One cluster, addressed by its originating record. Claim-independent. */
export function provenanceClusterViewForOrigin(
  graph: XRayGraph,
  originSourceId: string,
): ProvenanceClusterView {
  return clusterViewOf(graph, provenanceClusterForOrigin(graph, originSourceId))
}

/**
 * Clusters worth displaying for a claim: those where repetition actually
 * occurs. This is the replacement for a hardcoded claim-id gate.
 */
export function repetitionClustersForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): ProvenanceClusterView[] {
  return provenanceViewForClaim(graph, claimId).clusters.filter((c) => c.publicationCount > 1)
}
