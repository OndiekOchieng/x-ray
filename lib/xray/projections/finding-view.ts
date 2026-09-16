/**
 * FindingView — a graded conclusion with every id resolved for display.
 *
 * A component consuming this never learns how evidence ids are resolved, and
 * never needs the graph.
 *
 * Preserved exactly: `status`, `confidence`, `rationale`, `wouldChangeFinding`.
 * `confidence` stays the ordinal band `HIGH | MEDIUM | LOW` and is rendered as
 * text. No numeric or percentage confidence is derivable from this view.
 */

import type { Confidence, Finding, FindingStatus } from '@/lib/xray/domain'
import type { XRayGraph, ClaimIdLike } from '@/lib/xray/selectors'
import {
  challengingEvidenceForFinding,
  contextualEvidenceForFinding,
  contradictingEvidenceForClaim,
  discrepancyById,
  findingForClaim,
  gapById,
  requireEntity,
  supportingEvidenceForFinding,
} from '@/lib/xray/selectors'
import { confidenceLabel, findingStatusLabel } from './labels'
import { receiptView, type ReceiptView } from './receipt-view'
import { discrepancyView, type DiscrepancyView } from './discrepancy-view'
import { gapView, type GapView } from './gap-view'

export interface FindingView {
  findingId: string
  claimId: string
  claimText: string

  status: FindingStatus
  statusLabel: string
  confidence: Confidence
  confidenceLabel: string

  rationale: string
  wouldChangeFinding: string[]
  gradedAt: string

  /** Receipts whose relationship to the claim is `SUPPORTS`. */
  supporting: ReceiptView[]
  /** `CHALLENGES` and `CONTRADICTS`, as the canonical finding groups them. */
  challenging: ReceiptView[]
  /** `CONTEXTUALIZES` — often decisive for the rationale without taking a side. */
  contextual: ReceiptView[]

  /**
   * Receipts within `challenging` whose canonical relationship is
   * `CONTRADICTS`, kept separately addressable.
   *
   * The finding merges the two directions into one list; the distinction is
   * the one XR-INV-005 constrains, so a view that lost it would make the
   * constrained case invisible. Empty for every claim in XRAY-KE-001 — that is
   * the finding, not an omission (CAL-001).
   */
  contradicting: ReceiptView[]

  discrepancies: DiscrepancyView[]
  gaps: GapView[]

  /** True when the evidence did not settle the claim in either direction. */
  isUnresolved: boolean
}

export function findingView(graph: XRayGraph, finding: Finding): FindingView {
  const claim = requireEntity(graph.index.claim.get(finding.claimId), 'Claim', finding.claimId)
  const contradictingIds = new Set(
    contradictingEvidenceForClaim(graph, finding.claimId).map((e) => e.id),
  )
  const challenging = challengingEvidenceForFinding(graph, finding).map((e) => receiptView(graph, e))

  return {
    findingId: finding.id,
    claimId: finding.claimId,
    claimText: claim.text,

    status: finding.status,
    statusLabel: findingStatusLabel[finding.status],
    confidence: finding.confidence,
    confidenceLabel: confidenceLabel[finding.confidence],

    rationale: finding.rationale,
    wouldChangeFinding: [...finding.wouldChangeFinding],
    gradedAt: finding.gradedAt,

    supporting: supportingEvidenceForFinding(graph, finding).map((e) => receiptView(graph, e)),
    challenging,
    contextual: contextualEvidenceForFinding(graph, finding).map((e) => receiptView(graph, e)),
    contradicting: challenging.filter((r) => contradictingIds.has(r.evidenceId)),

    discrepancies: finding.discrepancyIds.map((id) =>
      discrepancyView(graph, requireEntity(discrepancyById(graph, id), 'Discrepancy', id)),
    ),
    gaps: finding.gapIds.map((id) => gapView(graph, requireEntity(gapById(graph, id), 'Gap', id))),

    isUnresolved:
      finding.status === 'UNRESOLVED' ||
      finding.status === 'INSUFFICIENT_EVIDENCE' ||
      finding.status === 'CONTESTED',
  }
}

/** The finding for a claim, projected. `undefined` if the claim is ungraded. */
export function findingViewForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): FindingView | undefined {
  const finding = findingForClaim(graph, claimId)
  return finding ? findingView(graph, finding) : undefined
}
