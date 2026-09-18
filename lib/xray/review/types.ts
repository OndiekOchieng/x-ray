/**
 * Reviewer output types.
 *
 * NOT CANONICAL STATE (D5). A review is an assessment *of* a graph, not part of
 * one. These types live outside `lib/xray/domain/` deliberately: putting them
 * in the domain would imply the evidence graph contains its own verdict on
 * itself. They are keyed to canonical ids and to a graph fingerprint, and #7
 * may persist them as a separate audit record.
 */

import type { ResearchStage } from '@/lib/xray/domain'

/** Failure modes from `docs/calibration/failure-modes/`. */
export type FailureModeId = 'FM-001' | 'FM-002' | 'FM-003' | 'FM-004' | 'FM-005' | 'FM-006'

/** Calibration cases from `docs/calibration/cases/`. */
export type CalibrationCaseId =
  | 'CAL-001'
  | 'CAL-002'
  | 'CAL-003'
  | 'CAL-004'
  | 'CAL-005'
  | 'CAL-006'

export type ReviewTargetKind =
  | 'Claim'
  | 'Source'
  | 'Evidence'
  | 'EvidenceProvenance'
  | 'Discrepancy'
  | 'Disconfirmation'
  | 'Finding'
  | 'Gap'

export interface ReviewTarget {
  kind: ReviewTargetKind
  id: string
}

/**
 * `BLOCKING` — the judgment is suspect enough that the graph should go back to
 *   a stage before graduation. Produces a `RevisionRequest`.
 * `ADVISORY` — worth a human's eye; does not by itself hold up graduation.
 *
 * Neither is an illegality. Everything the Reviewer sees has already passed
 * deterministic validation.
 */
export type ReviewSeverity = 'BLOCKING' | 'ADVISORY'

/**
 * Whether a check can run at all in this build.
 *
 * `DETERMINISTIC` — computable from the canonical graph.
 * `MODEL_ASSISTED` — needs judgment over natural language (claim atomicity,
 *   cross-layer inference, rhetorical softening). Requires the model port.
 */
export type ReviewCapability = 'DETERMINISTIC' | 'MODEL_ASSISTED'

/**
 * Whether a check actually ran.
 *
 * `NOT_EVALUATED` is never collapsed into a pass (D4). A check that could not
 * run is reported as unevaluated with a reason, so "no findings" can never be
 * mistaken for "nothing to find".
 */
export type ReviewOutcome = 'EVALUATED' | 'NOT_EVALUATED'

/** A concern the Reviewer raises about legal state. */
export interface ReviewFinding {
  id: string
  checkId: string
  failureMode: FailureModeId
  /** Calibration cases this finding is reasoning from. */
  calibrationCases: readonly CalibrationCaseId[]
  severity: ReviewSeverity
  targets: readonly ReviewTarget[]
  /** Why this legal state is nonetheless suspect. */
  rationale: string
  /** What the research stage should do about it. */
  requiredAction: string
}

/**
 * A structured request to send the graph back to a stage.
 *
 * #4 produces these; it does not invoke anything. Executable routing is #6 and
 * the graduation verdict is #5 (D7).
 */
export interface RevisionRequest {
  id: string
  findingId: string
  /**
   * The research stage that can actually address the concern.
   *
   * Always an artifact-producing stage. A finding never routes to `REVIEW`:
   * the Reviewer is the inspector, not the repair step (#6 D15). It never
   * routes to `VALIDATE` either — a gate cannot revise what it inspects.
   */
  stage: ResearchStage
  action: string
  targets: readonly ReviewTarget[]
}

/** Per-check record, including checks that did not run. */
export interface ReviewCheckReport {
  checkId: string
  title: string
  failureMode: FailureModeId
  calibrationCases: readonly CalibrationCaseId[]
  capability: ReviewCapability
  outcome: ReviewOutcome
  /** Present when `outcome` is `NOT_EVALUATED`. */
  notEvaluatedReason?: string
  findingCount: number
}

export type ReviewStatus =
  /** Ran to completion. */
  | 'REVIEWED'
  /** Refused: the graph had not passed deterministic validation. */
  | 'REFUSED_VALIDATOR_FAILING'

export interface ReviewSummary {
  checksEvaluated: number
  checksNotEvaluated: number
  blockingFindings: number
  advisoryFindings: number
  /** True when every check that exists was able to run. */
  fullCapability: boolean
}

export interface ReviewResult {
  status: ReviewStatus
  /**
   * Identifies the exact graph state reviewed, so a later round can be shown
   * to concern a different graph rather than the same one re-judged.
   */
  graphFingerprint: string
  investigationId: string
  reviewedAt: string
  checks: readonly ReviewCheckReport[]
  findings: readonly ReviewFinding[]
  revisionRequests: readonly RevisionRequest[]
  summary: ReviewSummary
  /** Set when `status` is `REFUSED_VALIDATOR_FAILING`. */
  refusalReason?: string
}

/** One review pass, retained in history. */
export interface ReviewRound {
  round: number
  result: ReviewResult
}

/** Append-only review history. Re-review never erases a prior round. */
export interface ReviewHistory {
  investigationId: string
  rounds: readonly ReviewRound[]
}
