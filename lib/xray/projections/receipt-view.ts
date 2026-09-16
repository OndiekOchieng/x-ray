/**
 * ReceiptView — a Source and one Evidence record fused for display.
 *
 * WHY THIS EXISTS AND WHY IT IS A PROJECTION
 * ==========================================
 * "Receipt" is a useful user-facing idea: here is the record, and here is what
 * it says about this claim. The v0 scaffold made it a canonical type
 * (`EvidenceReceipt`), which fused Source and Evidence permanently — so one
 * record bearing on two claims in two directions became unrepresentable, and a
 * single free-text `relationship` string had to serve both.
 *
 * ReceiptView restores the convenience without the fusion. It is built on
 * demand and never stored.
 *
 * **One Source may produce several ReceiptViews.** In XRAY-KE-001, SRC-018
 * yields six: three lot progress figures against C003, the lot values against
 * C002, the lot lengths against C001, and the same progress figures against
 * DC001 with the opposite relationship. Six receipts, one record.
 */

import type { Evidence, Measurement, Source, TimeScope } from '@/lib/xray/domain'
import type { XRayGraph } from '@/lib/xray/selectors'
import { evidenceForClaim, requireEntity, sourceById, type ClaimIdLike } from '@/lib/xray/selectors'
import {
  accessibilityLabel,
  evidenceClassLabel,
  originStatusLabel,
  relationshipLabel,
  strengthLabel,
} from './labels'

export interface ReceiptView {
  evidenceId: string
  sourceId: string

  // Record identity
  title: string
  institution?: string
  publisher?: string
  author?: string
  url?: string
  publishedAt?: string
  retrievedAt: string
  sourceType: string

  // How the record stands
  evidenceClass: string
  evidenceClassLabel: string
  originStatus: string
  originStatusLabel: string
  accessibility: string
  accessibilityLabel: string
  /** False when the record was never obtained; the proposition is then second-hand. */
  wasObtained: boolean

  // What it says about this claim
  proposition: string
  relationship: Evidence['relationship']
  relationshipLabel: string
  strength: Evidence['strength']
  strengthLabel: string
  measurement?: Measurement
  timeScope?: TimeScope
  quotedPassage?: string
  locationInSource?: string
}

function build(source: Source, evidence: Evidence): ReceiptView {
  return {
    evidenceId: evidence.id,
    sourceId: source.id,

    title: source.title,
    institution: source.institution,
    publisher: source.publisher,
    author: source.author,
    url: source.url,
    publishedAt: source.publishedAt,
    retrievedAt: source.retrievedAt,
    sourceType: source.sourceType,

    evidenceClass: source.evidenceClass,
    evidenceClassLabel: evidenceClassLabel[source.evidenceClass],
    originStatus: source.originStatus,
    originStatusLabel: originStatusLabel[source.originStatus],
    accessibility: source.accessibility,
    accessibilityLabel: accessibilityLabel[source.accessibility],
    wasObtained: source.accessibility === 'RETRIEVED' || source.accessibility === 'PARTIAL',

    proposition: evidence.proposition,
    relationship: evidence.relationship,
    relationshipLabel: relationshipLabel[evidence.relationship],
    strength: evidence.strength,
    strengthLabel: strengthLabel[evidence.strength],
    measurement: evidence.measurement,
    timeScope: evidence.timeScope,
    quotedPassage: evidence.quotedPassage,
    locationInSource: evidence.locationInSource,
  }
}

/** Build a receipt for one evidence record. Throws if its source is missing. */
export function receiptView(graph: XRayGraph, evidence: Evidence): ReceiptView {
  const source = requireEntity(sourceById(graph, evidence.sourceId), 'Source', evidence.sourceId)
  return build(source, evidence)
}

/** Build a receipt by evidence id, or `undefined` if no such evidence exists. */
export function receiptViewById(graph: XRayGraph, evidenceId: string): ReceiptView | undefined {
  const evidence = graph.index.evidence.get(evidenceId)
  return evidence ? receiptView(graph, evidence) : undefined
}

/** Every receipt bearing on a claim, in graph order. */
export function receiptViewsForClaim(graph: XRayGraph, claimId: ClaimIdLike): ReceiptView[] {
  return evidenceForClaim(graph, claimId).map((e) => receiptView(graph, e))
}

/** Receipts drawn from one record — usually several. */
export function receiptViewsForSource(graph: XRayGraph, sourceId: string): ReceiptView[] {
  return graph.evidence.filter((e) => e.sourceId === sourceId).map((e) => receiptView(graph, e))
}
