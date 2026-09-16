/**
 * DiscrepancyView — a recorded conflict, resolved for display.
 *
 * The canonical `Discrepancy` carries no presentation fields. The v0 scaffold
 * stored `leftLabel` / `rightLabel` strings, which flattened the actual
 * conflicting values into copy; this view instead exposes the evidence in
 * conflict so a component can lay it out from the real records.
 *
 * `isGenuineContradiction` reports the recorded classification. It makes no
 * judgment about whether that classification is earned — that is validation's
 * ruling, not a projection's.
 */

import type { Discrepancy, DiscrepancyClassification } from '@/lib/xray/domain'
import type { XRayGraph, ClaimIdLike } from '@/lib/xray/selectors'
import { discrepanciesForClaim, requireEntity } from '@/lib/xray/selectors'
import { discrepancyClassificationLabel } from './labels'
import { receiptView, type ReceiptView } from './receipt-view'

export interface DiscrepancyView {
  discrepancyId: string
  description: string
  classification: DiscrepancyClassification
  classificationLabel: string
  reconciliation?: string
  resolved: boolean
  /** True only when the graph records `GENUINE_CONTRADICTION`. */
  isGenuineContradiction: boolean
  claimIds: string[]
  /** The records actually in conflict. */
  evidence: ReceiptView[]
}

export function discrepancyView(graph: XRayGraph, discrepancy: Discrepancy): DiscrepancyView {
  return {
    discrepancyId: discrepancy.id,
    description: discrepancy.description,
    classification: discrepancy.classification,
    classificationLabel: discrepancyClassificationLabel[discrepancy.classification],
    reconciliation: discrepancy.reconciliation,
    resolved: discrepancy.resolved,
    isGenuineContradiction: discrepancy.classification === 'GENUINE_CONTRADICTION',
    claimIds: [...discrepancy.claimIds],
    evidence: discrepancy.evidenceIds.map((id) =>
      receiptView(graph, requireEntity(graph.index.evidence.get(id), 'Evidence', id)),
    ),
  }
}

export function discrepancyViewsForClaim(
  graph: XRayGraph,
  claimId: ClaimIdLike,
): DiscrepancyView[] {
  return discrepanciesForClaim(graph, claimId).map((d) => discrepancyView(graph, d))
}
