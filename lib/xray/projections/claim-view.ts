/**
 * ClaimView — a claim with its finding, evidence, discrepancies and gaps.
 *
 * `text` is the canonical claim text, unaltered. A projection never rewords a
 * claim: C004 is scoped to *scheduled or expected* inspection, and presenting
 * it as an occurrence would change the proposition being graded (CAL-005).
 */

import type { Claim, ClaimLayer, ClaimOrigin, ClaimType, Measurement, TimeScope } from '@/lib/xray/domain'
import type { XRayGraph, ClaimIdLike } from '@/lib/xray/selectors'
import {
  claimById,
  contextualEvidenceForClaim,
  contradictingEvidenceForClaim,
  disconfirmationsForClaim,
  opposingEvidenceForClaim,
  supportingEvidenceForClaim,
} from '@/lib/xray/selectors'
import { disconfirmationResultLabel } from './labels'
import { receiptView, type ReceiptView } from './receipt-view'
import { findingViewForClaim, type FindingView } from './finding-view'
import { discrepancyViewsForClaim, type DiscrepancyView } from './discrepancy-view'
import { gapViewsForClaim, type GapView } from './gap-view'
import { provenanceViewForClaim, type ProvenanceView } from './provenance-view'

export interface DisconfirmationView {
  disconfirmationId: string
  preliminaryHypothesis: string
  counterHypothesis: string
  searchStrategy: string[]
  result: string
  resultLabel: string
  effectOnFinding: string
}

export interface ClaimView {
  claimId: string
  /** Canonical claim text. Never reworded by presentation. */
  text: string
  origin: ClaimOrigin
  isDiscovered: boolean
  layer: ClaimLayer
  type: ClaimType
  priority: string
  entities: string[]
  ambiguities: string[]
  measurement?: Measurement
  timeScope?: TimeScope
  sourcePassage?: string

  finding?: FindingView
  supporting: ReceiptView[]
  /** `CHALLENGES` ∪ `CONTRADICTS`. */
  opposing: ReceiptView[]
  contextual: ReceiptView[]
  /** The constrained subset of `opposing`. Empty everywhere in XRAY-KE-001. */
  contradicting: ReceiptView[]

  discrepancies: DiscrepancyView[]
  gaps: GapView[]
  provenance: ProvenanceView
  disconfirmations: DisconfirmationView[]
}

export function claimView(graph: XRayGraph, claim: Claim): ClaimView {
  const r = (list: { id: string }[]) =>
    list.map((e) => receiptView(graph, graph.index.evidence.get(e.id)!))

  return {
    claimId: claim.id,
    text: claim.text,
    origin: claim.origin,
    isDiscovered: claim.origin === 'DISCOVERED',
    layer: claim.layer,
    type: claim.type,
    priority: claim.priority,
    entities: [...claim.entities],
    ambiguities: [...claim.ambiguities],
    measurement: claim.measurement,
    timeScope: claim.timeScope,
    sourcePassage: claim.sourcePassage,

    finding: findingViewForClaim(graph, claim.id),
    supporting: r(supportingEvidenceForClaim(graph, claim.id)),
    opposing: r(opposingEvidenceForClaim(graph, claim.id)),
    contextual: r(contextualEvidenceForClaim(graph, claim.id)),
    contradicting: r(contradictingEvidenceForClaim(graph, claim.id)),

    discrepancies: discrepancyViewsForClaim(graph, claim.id),
    gaps: gapViewsForClaim(graph, claim.id),
    provenance: provenanceViewForClaim(graph, claim.id),
    disconfirmations: disconfirmationsForClaim(graph, claim.id).map((d) => ({
      disconfirmationId: d.id,
      preliminaryHypothesis: d.preliminaryHypothesis,
      counterHypothesis: d.counterHypothesis,
      searchStrategy: [...d.searchStrategy],
      result: d.result,
      resultLabel: disconfirmationResultLabel[d.result],
      effectOnFinding: d.effectOnFinding,
    })),
  }
}

export function claimViewById(graph: XRayGraph, claimId: ClaimIdLike): ClaimView | undefined {
  const claim = claimById(graph, claimId)
  return claim ? claimView(graph, claim) : undefined
}

export function claimViews(graph: XRayGraph): ClaimView[] {
  return graph.claims.map((c) => claimView(graph, c))
}

/** A compact row for navigators and lists. */
export interface ClaimSummaryView {
  claimId: string
  text: string
  origin: ClaimOrigin
  isDiscovered: boolean
  type: ClaimType
  findingStatus?: string
  findingStatusLabel?: string
  confidenceLabel?: string
  gapCount: number
}

export function claimSummaryViews(graph: XRayGraph): ClaimSummaryView[] {
  return graph.claims.map((claim) => {
    const finding = findingViewForClaim(graph, claim.id)
    return {
      claimId: claim.id,
      text: claim.text,
      origin: claim.origin,
      isDiscovered: claim.origin === 'DISCOVERED',
      type: claim.type,
      findingStatus: finding?.status,
      findingStatusLabel: finding?.statusLabel,
      confidenceLabel: finding?.confidenceLabel,
      gapCount: gapViewsForClaim(graph, claim.id).length,
    }
  })
}
