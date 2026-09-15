/**
 * Gap and action domain.
 *
 * Source: X-Ray System Architecture v0.1 §14 (Gap), §15 (ATIRequest),
 * plus the accepted Architecture v0.1 clarifications of 2026-09-15
 * — docs/architecture/domain-model.md#gap, #atirequest.
 *
 * A missing document is structured product state, not research failure
 * (ADR-0007).
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 * Draft template generation, clipboard, download and route helpers are
 * projection concerns and MUST NOT appear here (XR-INV-011).
 */

import type {
  ATIRequestId,
  ClaimId,
  GapId,
  IsoDateTime,
  SourceId,
} from './primitives'

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * How a gap could be closed.
 *
 * XR-INV-009 — a Gap MUST NOT automatically generate an ATI request. It first
 * receives a resolution path; only `PUBLIC_RECORD_REQUEST` makes the gap
 * eligible for ATI generation.
 */
export type ResolutionPath =
  | 'PUBLIC_RECORD_REQUEST'
  | 'WAIT_FOR_RECORD'
  | 'FIELD_VERIFICATION'
  | 'SOURCE_CLARIFICATION'
  | 'DATASET_QUERY'
  | 'EXPERT_INTERPRETATION'
  | 'OTHER'

/** Lifecycle of a gap, from identified through to closed or unclosable. */
export type GapStatus =
  | 'OPEN'
  | 'REQUESTED'
  | 'RECEIVED'
  | 'RESOLVED'
  | 'UNRESOLVABLE'

/**
 * Whether custody of the missing record was established or reasoned about.
 *
 * `CONFIRMED` — an information officer, office, or custody record was located.
 * `INFERRED`  — X-Ray reasoned about likely custody and did not confirm it.
 *
 * Architecture v0.1 clarification (2026-09-15). The field name "likelyHolder"
 * carries the uncertainty, but nothing downstream could read it; a request
 * addressed to an inferred holder must be presentable as inferred. This
 * applies XR-INV-006 to the action layer.
 */
export type CustodyBasis = 'CONFIRMED' | 'INFERRED'

/** The institution believed to hold the missing record. */
export interface LikelyHolder {
  institution: string
  office?: string

  /** Never omit. An unstated basis reads as confirmed. */
  basis: CustodyBasis
}

// ---------------------------------------------------------------------------
// Gap
// ---------------------------------------------------------------------------

/** Fields of a gap independent of its ATI eligibility. */
export interface GapBase {
  id: GapId

  /** The claims this gap blocks. Plural: one missing record can block several. */
  claimIds: ClaimId[]

  /** What record is missing. Never a statement that it does not exist. */
  missingEvidence: string

  whyItMatters: string

  /** What would settle the question if it were located. */
  resolvingEvidence: string[]

  likelyHolder?: LikelyHolder

  /**
   * Where X-Ray already looked.
   *
   * XR-INV-006 — this records the extent of the search, which is what
   * distinguishes "not located" from any claim about existence.
   */
  searchAlreadyAttempted: string[]

  status: GapStatus

  /** What this gap does to the finding it blocks. */
  effectOnFinding: string

  /**
   * Project or entity identifiers needed to make a record request specific —
   * a road or project name, an investigation id, a tender or contract
   * reference, the figure under dispute.
   *
   * Architecture v0.1 clarification (2026-09-15). A request that cannot name
   * the project it concerns is unanswerable. These are drawn from evidence
   * already in the graph; recording them here does NOT license inventing the
   * name of a record (ADR-0008).
   */
  identifiers?: string[]
}

/**
 * Binds ATI eligibility to resolution path.
 *
 * XR-INV-009, stated in §14 as an equality:
 *
 *   atiEligible = resolutionPath === PUBLIC_RECORD_REQUEST
 *
 * Expressed as a discriminated union, a gap on any other resolution path
 * cannot be marked `atiEligible: true` without a type error, and a
 * public-record gap cannot be marked ineligible. The two fields cannot drift
 * apart.
 */
export type GapEligibility =
  | { resolutionPath: 'PUBLIC_RECORD_REQUEST'; atiEligible: true }
  | {
      resolutionPath: Exclude<ResolutionPath, 'PUBLIC_RECORD_REQUEST'>
      atiEligible: false
    }

/** A missing record that prevents a claim from being resolved. */
export type Gap = GapBase & GapEligibility

/** A gap eligible for an access-to-information request. */
export type AtiEligibleGap = GapBase & {
  resolutionPath: 'PUBLIC_RECORD_REQUEST'
  atiEligible: true
}

// ---------------------------------------------------------------------------
// ATI request
// ---------------------------------------------------------------------------

/**
 * Lifecycle of an access-to-information request.
 *
 * Architecture v0.1 clarification (2026-09-15):
 *
 *   DRAFT ──edit──► DRAFT ──human action──► EXPORTED
 *                                               │
 *                                      human files it externally
 *                                               ▼
 *                                           SUBMITTED
 *
 * `DRAFT` and `EXPORTED` are human-reviewable and human-editable. No
 * transition past `EXPORTED` occurs without a human action, because X-Ray does
 * not file requests — automated submission is out of v0 scope.
 *
 * `EXPORTED` is NOT submission. Any surface showing a request must keep the
 * two visibly distinct; a draft must never be presentable as a filed request.
 */
export type ATIRequestStatus =
  | 'DRAFT'
  | 'EXPORTED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'RESPONDED'
  | 'CLOSED'

/**
 * A drafted access-to-information request derived from an eligible gap.
 *
 * ATI generation occurs after evidence grading. The language model MAY draft
 * the request; it MUST NOT invent the name of a record the Gap Ledger has not
 * established or reasonably described.
 */
export interface ATIRequest {
  id: ATIRequestId

  /** The gap this request exists to close. Must be ATI-eligible. */
  gapId: GapId

  jurisdiction: 'KE'

  holdingInstitution: string

  /** Records actually requested, grounded in the gap's resolving evidence. */
  requestedRecords: string[]

  publicInterestContext: string

  /** Public X-Ray this request arose from, for the recipient's context. */
  investigationUrl?: string

  status: ATIRequestStatus

  draftedAt: IsoDateTime

  /** Set only when a human has filed the request externally. */
  submittedAt?: IsoDateTime

  respondedAt?: IsoDateTime

  /** Sources produced by the response. These re-enter the graph as evidence. */
  receivedSourceIds: SourceId[]
}
