/**
 * Model-assistance port.
 *
 * TYPED, PROVIDER-AGNOSTIC, AND DELIBERATELY UNIMPLEMENTED IN #4.
 *
 * Some calibration signals are readings of natural language — whether a claim
 * is genuinely atomic, whether a rationale performs a silent unit conversion,
 * whether a finding's stated overturn conditions are adequate. None is
 * computable from graph structure.
 *
 * Rather than fake them with keyword matching (brittle, and confidently wrong
 * in exactly the cases that matter), #4 defines the seam and reports those
 * checks as NOT_EVALUATED. Provider wiring is #6 under ADR-0004: protocol
 * stays provider-independent, and provider logic lives behind the adapter.
 *
 * When an implementation arrives, no Reviewer check changes — only the
 * capability report does.
 */

import type { Claim, Evidence, Finding } from '@/lib/xray/domain'
import type { CalibrationCaseId, FailureModeId, ReviewSeverity, ReviewTarget } from './types'

/** What the port returns for one judgment. */
export interface ModelJudgment {
  /** True when the model considers the state suspect. */
  flagged: boolean
  severity: ReviewSeverity
  rationale: string
  requiredAction: string
  targets: readonly ReviewTarget[]
}

export interface AtomicityQuery {
  kind: 'CLAIM_ATOMICITY'
  claim: Claim
}

export interface LayerInferenceQuery {
  kind: 'CROSS_LAYER_INFERENCE'
  claim: Claim
  finding: Finding
  evidence: readonly Evidence[]
}

export interface SemanticCompatibilityQuery {
  kind: 'SEMANTIC_MEASUREMENT_COMPATIBILITY'
  claim: Claim
  evidence: Evidence
}

export interface ReversibilityQuery {
  kind: 'REVERSIBILITY_ADEQUACY'
  claim: Claim
  finding: Finding
}

export interface RhetoricQuery {
  kind: 'RHETORICAL_OVERCLAIM'
  claim: Claim
  finding: Finding
}

export type ReviewerModelQuery =
  | AtomicityQuery
  | LayerInferenceQuery
  | SemanticCompatibilityQuery
  | ReversibilityQuery
  | RhetoricQuery

/**
 * The port. An implementation belongs to #6.
 *
 * Note what this interface does NOT expose: no free-form prompt, no raw
 * completion. Every query is a typed judgment about named canonical artifacts,
 * so a provider cannot be asked to "review the graph" in general. That keeps
 * the calibration corpus — not an ad-hoc instruction — as the thing defining
 * what review means.
 */
export interface ReviewerModel {
  readonly name: string
  judge(query: ReviewerModelQuery): Promise<ModelJudgment>
}

/** Metadata for a check that needs the port. */
export interface PortDependentCheck {
  checkId: string
  title: string
  failureMode: FailureModeId
  calibrationCases: readonly CalibrationCaseId[]
  queryKind: ReviewerModelQuery['kind']
  /** Why graph structure cannot settle it. */
  reason: string
}

/**
 * Checks that exist but cannot run without a model implementation.
 *
 * Each is reported as NOT_EVALUATED with this reason attached, never as a pass.
 */
export const PORT_DEPENDENT_CHECKS: readonly PortDependentCheck[] = [
  {
    checkId: 'XR-INV-002/CLAIM_ATOMICITY',
    title: 'Claim is genuinely atomic and independently testable',
    failureMode: 'FM-002',
    calibrationCases: ['CAL-002'],
    queryKind: 'CLAIM_ATOMICITY',
    reason:
      'Atomicity is a reading of claim text. A compound assertion and an atomic one are structurally identical in the graph.',
  },
  {
    checkId: 'XR-INV-003/CROSS_LAYER_INFERENCE',
    title: 'Evidence at one epistemic layer did not silently establish another',
    failureMode: 'FM-002',
    calibrationCases: ['CAL-002'],
    queryKind: 'CROSS_LAYER_INFERENCE',
    reason:
      'Claim carries a layer; Evidence does not, so the comparison the invariant describes has no data. Evidence.layer was deliberately not introduced in #4 — a separate domain decision.',
  },
  {
    checkId: 'XR-INV-005/SEMANTIC_COMPATIBILITY',
    title: 'Contradiction over undetermined measurement compatibility is sound',
    failureMode: 'FM-001',
    calibrationCases: ['CAL-001'],
    queryKind: 'SEMANTIC_MEASUREMENT_COMPATIBILITY',
    reason:
      'Where one side is measured and the other is not, compatibility cannot be settled structurally. Unmeasured testimony can legitimately contradict a measured claim; deciding whether it does here is a semantic judgment.',
  },
  {
    checkId: 'XR-INV-007/REVERSIBILITY_ADEQUACY',
    title: 'Stated overturn conditions would actually overturn the finding',
    failureMode: 'FM-006',
    calibrationCases: ['CAL-006'],
    queryKind: 'REVERSIBILITY_ADEQUACY',
    reason:
      'The validator checks that wouldChangeFinding is non-empty. Whether the conditions named are adequate — or merely plausible-sounding — is a reading of their content.',
  },
  {
    checkId: 'FM-001/SILENT_CONVERSION_IN_RATIONALE',
    title: 'Rationale performs no unstated conversion between measures',
    failureMode: 'FM-001',
    calibrationCases: ['CAL-001'],
    queryKind: 'RHETORICAL_OVERCLAIM',
    reason:
      'A rationale reading "only 28% complete, so most of it cannot be surfaced" is a silent conversion. Detecting it requires reading prose, not structure.',
  },
  {
    checkId: 'FM-005/TENSE_MODALITY_DRIFT',
    title: 'Claim text preserves the modality of its source passage',
    failureMode: 'FM-005',
    calibrationCases: ['CAL-005'],
    queryKind: 'RHETORICAL_OVERCLAIM',
    reason:
      '"Expected to inspect" becoming "inspected" is a tense change between two strings. The graph sees two strings.',
  },
] as const
