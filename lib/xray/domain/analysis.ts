/**
 * Analysis domain: reconciliation, disconfirmation, grading.
 *
 * Source: X-Ray System Architecture v0.1 §11 (Discrepancy), §12
 * (Disconfirmation), §13 (Finding) — docs/architecture/domain-model.md.
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 * In particular this module carries no presentation fields — there is no
 * `leftLabel`/`rightLabel`. A discrepancy names the claims and evidence in
 * conflict; how two values are laid out beside each other is a projection
 * concern, downstream of the graph (XR-INV-011).
 */

import type {
  Confidence,
  ClaimId,
  DiscrepancyId,
  DisconfirmationId,
  EvidenceId,
  FindingId,
  GapId,
  IsoDateTime,
} from './primitives'

// ---------------------------------------------------------------------------
// Discrepancy
// ---------------------------------------------------------------------------

/**
 * Why two pieces of evidence disagree.
 *
 * The engine MUST attempt classification before permitting
 * `GENUINE_CONTRADICTION`. Most apparent contradictions in public records are
 * one of the preceding members: the same project measured at a different date,
 * scope, phase, unit or definition, or a value that was later revised.
 *
 * `UNRESOLVED` is a legitimate terminal state — it records that the conflict
 * is real and that no reconciling record was located. It does not mean the
 * sources contradict each other.
 */
export type DiscrepancyClassification =
  | 'DIFFERENT_DATE'
  | 'DIFFERENT_SCOPE'
  | 'DIFFERENT_DEFINITION'
  | 'DIFFERENT_PHASE'
  | 'DIFFERENT_UNIT'
  | 'REVISED_VALUE'
  | 'GENUINE_CONTRADICTION'
  | 'PROBABLE_SOURCE_ERROR'
  | 'UNRESOLVED'

/** A recorded conflict between evidence bearing on one or more claims. */
export interface Discrepancy {
  id: DiscrepancyId

  claimIds: ClaimId[]

  /** The evidence actually in conflict. A discrepancy names its sources. */
  evidenceIds: EvidenceId[]

  description: string

  classification: DiscrepancyClassification

  /** How the conflict was reconciled, when it was. */
  reconciliation?: string

  resolved: boolean
}

// ---------------------------------------------------------------------------
// Disconfirmation
// ---------------------------------------------------------------------------

/** What happened when the emerging conclusion was actively attacked. */
export type DisconfirmationResult =
  | 'SURVIVED'
  | 'SURVIVED_WEAKENED'
  | 'CHANGED'
  | 'FAILED'
  | 'UNRESOLVED'

/**
 * A record of the attempt to prove a preliminary finding wrong.
 *
 * Disconfirmation is a pipeline stage, not a prose instruction. A load-bearing
 * claim cannot graduate without a disconfirmation record.
 *
 * `claimId` is singular and required: disconfirmation is addressed to one
 * claim. It is not an investigation-wide singleton — each load-bearing claim
 * gets its own record, and an investigation holds many.
 */
export interface Disconfirmation {
  id: DisconfirmationId

  claimId: ClaimId

  preliminaryHypothesis: string
  counterHypothesis: string

  /** What was actually searched in the attempt to break the hypothesis. */
  searchStrategy: string[]

  strongestSupportingEvidenceIds: EvidenceId[]
  strongestOpposingEvidenceIds: EvidenceId[]

  result: DisconfirmationResult

  /** What this attempt did to the finding. */
  effectOnFinding: string
}

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

/**
 * What the evidence establishes about a claim.
 *
 * `INSUFFICIENT_EVIDENCE` and `UNRESOLVED` are outcomes, not failures.
 * `CONTRADICTED` is constrained by XR-INV-005.
 */
export type FindingStatus =
  | 'ESTABLISHED'
  | 'SUPPORTED'
  | 'PARTIALLY_SUPPORTED'
  | 'CONTESTED'
  | 'CONTRADICTED'
  | 'UNRESOLVED'
  | 'INSUFFICIENT_EVIDENCE'

/**
 * A graded conclusion about one claim.
 *
 * XR-INV-007 — every material finding MUST record supporting evidence,
 * challenging evidence, unresolved gaps, rationale, and the evidence that
 * would change it.
 *
 * Evidence reaches the finding through three lists, mapped from the canonical
 * `Evidence.relationship`:
 *
 * ```text
 *   SUPPORTS       → supportingEvidenceIds
 *   CHALLENGES     → challengingEvidenceIds
 *   CONTRADICTS    → challengingEvidenceIds
 *   CONTEXTUALIZES → contextualEvidenceIds
 * ```
 *
 * The mapping is total: every Evidence record bearing on the claim lands in
 * exactly one list. The relationship itself stays on the Evidence. A conclusion that cannot describe how it could be
 * overturned is invalid. All five are non-optional fields here, so a finding
 * that cannot describe its own reversal cannot be constructed.
 *
 * Evidence is referenced by id, never restated as prose. That is what makes
 * affected-claim re-evaluation computable when a new receipt arrives
 * (docs/architecture/investigation-versioning.md).
 */
export interface Finding {
  id: FindingId

  claimId: ClaimId

  status: FindingStatus

  /**
   * Ordinal confidence band.
   *
   * MUST remain `HIGH | MEDIUM | LOW`. Numeric pseudo-probability — a decimal
   * rendered as "86% confidence" — MUST NOT be introduced. A decimal implies a
   * calibration the pipeline cannot produce.
   */
  confidence: Confidence

  rationale: string

  /**
   * Evidence whose relationship to the claim is `SUPPORTS`.
   */
  supportingEvidenceIds: EvidenceId[]

  /**
   * Evidence whose relationship to the claim is `CHALLENGES` or `CONTRADICTS`.
   *
   * The two share a list deliberately. The distinction between weakening a
   * claim and refuting it is carried by `Evidence.relationship`, which remains
   * canonical; duplicating it here would create a second place for it to drift.
   * There is no `contradictingEvidenceIds`.
   */
  challengingEvidenceIds: EvidenceId[]

  /**
   * Evidence whose relationship to the claim is `CONTEXTUALIZES`.
   *
   * Such evidence neither supports nor opposes the claim, yet can be decisive
   * for the finding's reasoning — the record that explains why two figures
   * measure different things, or that establishes the definition a
   * reconciliation rests on.
   *
   * Without this list, finding-level explainability would require scanning
   * every Evidence record for a matching `claimId`, and evidence that was
   * load-bearing for the rationale would be invisible in the finding itself.
   */
  contextualEvidenceIds: EvidenceId[]

  discrepancyIds: DiscrepancyId[]
  gapIds: GapId[]

  /** Evidence that, if located, would change this finding. XR-INV-007. */
  wouldChangeFinding: string[]

  gradedAt: IsoDateTime
}
