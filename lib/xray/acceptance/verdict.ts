/**
 * Graduation verdicts.
 *
 * A run does not become publishable because every stage returned output. The
 * gate asks four separable questions, and the verdict says which one failed.
 *
 *   FAIL     the graph is illegal, or a required acceptance behavior is violated
 *   REVISE   the graph is legal, but review raised blocking findings
 *   BLOCKED  nothing is known to be wrong; required assurance could not be obtained
 *   PASS     legal, reviewed clear, and all required assurance actually obtained
 *
 * BLOCKED exists because incomplete assurance is not graph failure. A check that
 * could not run is not a check that found something. Collapsing the two would be
 * wrong in opposite directions: PASS would treat unobtained assurance as
 * obtained, FAIL would accuse a possibly-sound graph of a defect it has not been
 * shown to have.
 *
 * What resolves each verdict differs, which is the point:
 *
 *   FAIL / REVISE  fix or revise the GRAPH
 *   BLOCKED        supply the missing CAPABILITY
 *
 * Precedence: FAIL > REVISE > BLOCKED > PASS. A known defect outranks unknown
 * assurance because revising is actionable now; an illegal graph outranks
 * everything because it cannot be assessed for soundness at all.
 */

export type GraduationVerdict = 'PASS' | 'BLOCKED' | 'REVISE' | 'FAIL'

export const VERDICT_PRECEDENCE: readonly GraduationVerdict[] = [
  'FAIL',
  'REVISE',
  'BLOCKED',
  'PASS',
]

/** The most severe of several verdicts. */
export function worstVerdict(verdicts: readonly GraduationVerdict[]): GraduationVerdict {
  for (const candidate of VERDICT_PRECEDENCE) {
    if (verdicts.includes(candidate)) return candidate
  }
  return 'PASS'
}

/** Why the verdict is not PASS. */
export type GraduationReasonKind =
  | 'VALIDATION_ERROR'
  | 'ACCEPTANCE_BEHAVIOR_VIOLATED'
  | 'REVIEW_BLOCKING_FINDING'
  | 'ASSURANCE_UNAVAILABLE'

export interface GraduationReason {
  kind: GraduationReasonKind
  /** The verdict this reason forces on its own. */
  verdict: GraduationVerdict
  /** Stable identifier of the failing rule, behavior or check. */
  ref: string
  message: string
  targets?: readonly string[]
}

/**
 * A capability the gate needed and did not have.
 *
 * Kept separate from `GraduationReason` because a blocker is not an accusation
 * against the graph. It names what is missing and who supplies it.
 */
export interface CapabilityBlocker {
  /** The check that could not run. */
  ref: string
  title: string
  reason: string
  /** Where the capability comes from. */
  resolvedBy: string
}

export type AcceptanceStatus = 'SATISFIED' | 'VIOLATED' | 'NOT_EVALUATED'

export interface AcceptanceBehaviorReport {
  id: string
  title: string
  status: AcceptanceStatus
  /** What was actually observed, satisfied or not. */
  detail: string
  targets?: readonly string[]
}
