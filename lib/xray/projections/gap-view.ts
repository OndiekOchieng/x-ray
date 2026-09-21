/**
 * GapView — a missing record, resolved for display.
 *
 * Suitable for both the gap-preview and gap-detail surfaces.
 *
 * ATI DRAFT GENERATION IS NOT HERE. Composing request prose is a synthesis
 * step with its own rules — the model may draft, a human must review, and the
 * draft must never read as submitted (ADR-0008). This view exposes the
 * structured inputs a draft needs (`recordsSought`, `identifiers`,
 * `likelyHolder`, `whyItMatters`) without composing them. Draft generation is
 * deliberately **left to the UI-migration slice**, where the existing pure
 * builder in the old scaffold can be moved behind projections without
 * broadening this one.
 *
 * `atiEligible` is read from canonical `Gap`, never recomputed. A material gap
 * may be ineligible — CAL-005. Ineligibility means a request is not the right
 * instrument yet, not that no relevant record could ever exist.
 */

import type { CustodyBasis, Gap, GapStatus, ResolutionPath } from '@/lib/xray/domain'
import type { XRayGraph, ClaimIdLike } from '@/lib/xray/selectors'
import { claimById, gapsForClaim } from '@/lib/xray/selectors'
import { custodyBasisLabel, gapStatusLabel, resolutionPathLabel } from './labels'

export interface GapHolderView {
  institution: string
  office?: string
  basis: CustodyBasis
  basisLabel: string
  /** True when custody was reasoned about rather than confirmed. */
  isInferred: boolean
}

export interface GapView {
  gapId: string
  /** What is missing. Never a statement that it does not exist. */
  missingEvidence: string
  whyItMatters: string
  /** "What would settle it." */
  resolvingEvidence: string[]
  /** How far the search actually went — what makes the absence legible. */
  searchAlreadyAttempted: string[]
  effectOnFinding: string

  claims: { claimId: string; text: string }[]

  status: GapStatus
  statusLabel: string
  resolutionPath: ResolutionPath
  resolutionPathLabel: string
  atiEligible: boolean

  likelyHolder?: GapHolderView
  /** Project/entity identifiers that make a record request specific. */
  identifiers: string[]
  /** Alias of `resolvingEvidence`, named for the ATI-drafting step. */
  recordsSought: string[]

  /**
   * What a reader can do next, by resolution path (#11 slice 11c).
   *
   * Every material gap has to answer three questions on the screen: what is
   * missing, what would settle it, and what happens now. The third one is not
   * the same answer for every gap, and flattening it would either offer a
   * records request for a record that does not exist yet, or hide the action
   * where it is the right one.
   */
  nextStep: string

  /**
   * Whether a records request is the right next action.
   *
   * True exactly when the path is `PUBLIC_RECORD_REQUEST`, which the domain
   * already binds to `atiEligible` (XR-INV-009). Presentation reads it; it
   * never recomputes it.
   */
  offersRecordsRequest: boolean

  /**
   * How far the search went, as a sentence.
   *
   * XR-INV-006's presentation half. "Not located" is only informative if a
   * reader can see the extent of the search, and it is never a claim that the
   * record does not exist.
   */
  searchNote: string
}

/**
 * What to do next, per resolution path.
 *
 * Authored here rather than in a component so the wording is testable: a gap
 * awaiting a record that may not exist yet must never be offered as a records
 * request, however material it is (the CAL case behind XR-INV-006).
 */
const nextStepByPath: Record<ResolutionPath, string> = {
  PUBLIC_RECORD_REQUEST:
    'A public body should hold this record, so it can be requested. X-Ray can draft the request; a person files it.',
  WAIT_FOR_RECORD:
    'This needs a record of something that has not been documented yet, so there is nothing to request. X-Ray is waiting for the record rather than asking for one that may not exist.',
  FIELD_VERIFICATION:
    'This needs someone to check a physical situation on the ground. No document request would settle it.',
  SOURCE_CLARIFICATION:
    'This needs the publisher of an existing record to clarify what it meant. The record exists; its reading does not.',
  DATASET_QUERY:
    'This needs a query against a dataset that is already published, rather than a new record from anyone.',
  EXPERT_INTERPRETATION:
    'This needs a qualified reading of records already held. More records would not settle it.',
  OTHER:
    'The route to settling this does not fit the usual paths, and is recorded on the gap itself.',
}

export function gapView(graph: XRayGraph, gap: Gap): GapView {
  return {
    gapId: gap.id,
    missingEvidence: gap.missingEvidence,
    whyItMatters: gap.whyItMatters,
    resolvingEvidence: [...gap.resolvingEvidence],
    searchAlreadyAttempted: [...gap.searchAlreadyAttempted],
    effectOnFinding: gap.effectOnFinding,

    claims: gap.claimIds.map((id) => ({
      claimId: id,
      text: claimById(graph, id)?.text ?? '',
    })),

    status: gap.status,
    statusLabel: gapStatusLabel[gap.status],
    resolutionPath: gap.resolutionPath,
    resolutionPathLabel: resolutionPathLabel[gap.resolutionPath],
    atiEligible: gap.atiEligible,

    likelyHolder: gap.likelyHolder
      ? {
          institution: gap.likelyHolder.institution,
          office: gap.likelyHolder.office,
          basis: gap.likelyHolder.basis,
          basisLabel: custodyBasisLabel[gap.likelyHolder.basis],
          isInferred: gap.likelyHolder.basis === 'INFERRED',
        }
      : undefined,
    identifiers: gap.identifiers ? [...gap.identifiers] : [],
    recordsSought: [...gap.resolvingEvidence],

    nextStep: nextStepByPath[gap.resolutionPath],
    offersRecordsRequest: gap.resolutionPath === 'PUBLIC_RECORD_REQUEST',
    searchNote: gap.searchAlreadyAttempted.length === 0
      ? 'No search is recorded for this gap, so how much its absence tells you cannot be judged yet.'
      : `X-Ray looked in ${
          gap.searchAlreadyAttempted.length
        } place${gap.searchAlreadyAttempted.length === 1 ? '' : 's'} without locating it. Not finding a record is not evidence that it does not exist.`,
  }
}

export function gapViewsForClaim(graph: XRayGraph, claimId: ClaimIdLike): GapView[] {
  return gapsForClaim(graph, claimId).map((g) => gapView(graph, g))
}
