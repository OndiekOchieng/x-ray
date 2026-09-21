/**
 * Validation output.
 *
 * A violation is a structured record, not a thrown string. The validator
 * reports everything it finds in one pass so a caller can decide what to do —
 * the architecture's ACCEPT / REJECT / REPAIR decision belongs to the caller,
 * not to a stack unwind.
 *
 * Every violation carries a machine-readable `code`, the `targets` it concerns,
 * a `severity`, and a human-readable `message`.
 */

import type { InvariantId } from './invariants'

/** The three validation classes. */
export type ValidationClass = 'STRUCTURAL' | 'REFERENTIAL' | 'EPISTEMIC'

/**
 * How complete the candidate graph is expected to be.
 *
 * `FULL` — graduation. Every artifact the investigation will ever hold is
 *          present, so completeness rules apply.
 * `STAGED` — mid-pipeline. Later artifacts do not exist yet, so rules that
 *          only make sense over a finished graph are skipped.
 *
 * This is the only phase distinction the validator carries. Richer stage
 * semantics belong to the pipeline slice, not here.
 */
export type ValidationMode = 'FULL' | 'STAGED'

/**
 * `ERROR` — the graph is illegal. It must not graduate.
 * `WARNING` — a deterministic condition the architecture wants surfaced while
 *   the graph stays legal.
 *
 * WARNING is deliberately hard to earn, and the validator currently emits
 * none. A non-deterministic concern is NOT downgraded into a warning to create
 * a queue for the Reviewer: the Reviewer derives its own concerns from the
 * graph and the calibration corpus. Manufacturing warnings here would put a
 * judgment the validator cannot make into a field that looks like it did.
 */
export type ViolationSeverity = 'ERROR' | 'WARNING'

/** What a violation is about. */
export type TargetKind =
  | 'Investigation'
  | 'InvestigationVersion'
  | 'StageRun'
  | 'Claim'
  | 'Source'
  | 'SourcePosition'
  | 'SourceDependency'
  | 'Evidence'
  | 'EvidenceProvenance'
  | 'Discrepancy'
  | 'Disconfirmation'
  | 'Finding'
  | 'Gap'
  /**
   * Named by the ATI command boundary, not by graph validation — requests are
   * not graph artifacts (#10 C1/C2/C7). The kind stays in the shared
   * vocabulary so a rejected action and a graph violation read the same way.
   */
  | 'ATIRequest'

export interface ViolationTarget {
  kind: TargetKind
  id: string
}

/**
 * Stable machine-readable codes.
 *
 * Shape: `CLASS/RULE`, with the invariant carried separately in `invariant`
 * so a caller can filter by either. Codes are append-only — a consumer may
 * key behaviour off them.
 */
export type ViolationCode =
  // Structural
  | 'STRUCTURAL/MISSING_REQUIRED_FIELD'
  | 'STRUCTURAL/EMPTY_REQUIRED_STRING'
  | 'STRUCTURAL/ILLEGAL_ENUM_VALUE'
  | 'STRUCTURAL/DUPLICATE_ID'
  | 'STRUCTURAL/DERIVED_FIELD_STORED'
  | 'STRUCTURAL/NON_ISO_TIMESTAMP'
  | 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS'
  | 'STRUCTURAL/UNKNOWN_KNOWLEDGE_BASIS'
  | 'STRUCTURAL/SOURCE_POSITION_BASIS_UNEXPLAINED'
  // Referential
  | 'REFERENTIAL/DANGLING_REFERENCE'
  | 'REFERENTIAL/ORPHANED_ARTIFACT'
  | 'REFERENTIAL/INVESTIGATION_INDEX_MISMATCH'
  // XR-INV-001
  | 'XR-INV-001/SURFACE_SOURCE_CORROBORATES_OWN_CLAIM'
  | 'XR-INV-001/SURFACE_SOURCE_AS_EVIDENCE_ORIGIN'
  // XR-INV-003
  | 'XR-INV-003/CLAIM_LAYER_MISSING'
  // XR-INV-004
  | 'XR-INV-004/EVIDENCE_HAS_MULTIPLE_ORIGINS'
  | 'XR-INV-004/CONFIRMED_ORIGINS_EXCEED_EVIDENCE'
  | 'XR-INV-004/CONFIRMED_ORIGINS_EXCEED_SOURCES'
  | 'XR-INV-004/UNRESOLVED_ORIGIN_COUNTED_AS_INDEPENDENT'
  | 'XR-INV-004/MULTI_ORIGIN_SOURCE_LACKS_PROPOSITION_PROVENANCE'
  | 'XR-INV-004/PROVENANCE_ORIGIN_IS_SELF'
  | 'XR-INV-004/REPEATING_SOURCE_EVIDENCE_TREATED_AS_ORIGINATING'
  // XR-INV-005
  | 'XR-INV-005/CONTRADICTS_ON_INCOMPATIBLE_MEASUREMENT'
  | 'XR-INV-005/CONTRADICTED_WITHOUT_COMPATIBLE_EVIDENCE'
  | 'XR-INV-005/GENUINE_CONTRADICTION_ON_INCOMPATIBLE_MEASUREMENT'
  // Research cutoff (acceptance fixture §31, scheduled vs occurred)
  | 'EPISTEMIC/POST_CUTOFF_EVIDENCE'
  // XR-INV-006
  | 'XR-INV-006/NONEXISTENCE_ASSERTED'
  | 'XR-INV-006/GAP_WITHOUT_SEARCH_RECORD'
  | 'XR-INV-006/EVIDENCE_FROM_UNOBTAINED_SOURCE'
  | 'XR-INV-006/QUOTED_PASSAGE_FROM_UNOBTAINED_SOURCE'
  // XR-INV-007
  | 'XR-INV-007/FINDING_NOT_REVERSIBLE'
  | 'XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH'
  | 'XR-INV-007/FINDING_RATIONALE_EMPTY'
  // XR-INV-008
  | 'XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP'
  | 'XR-INV-008/GAP_NOT_REACHABLE_FROM_FINDING'
  // XR-INV-009. The first is emitted by epistemic validation over gaps. The
  // other two are emitted by the ATI command boundary, which is where the
  // request half of the invariant moved when requests left the graph — the
  // codes are deliberately unchanged, so the invariant reads as relocated
  // rather than lapsed (#10 slice 10b).
  | 'XR-INV-009/ATI_ELIGIBILITY_MISMATCH'
  | 'XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP'
  | 'XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP'
  // XR-INV-010
  | 'XR-INV-010/VERSION_NUMBERING_INVALID'
  | 'XR-INV-010/VERSION_SUPERSEDES_INVALID'
  | 'XR-INV-010/CURRENT_VERSION_MISMATCH'
  // XR-INV-011
  | 'XR-INV-011/SYNTHESIS_FIELD_IN_CANONICAL_STATE'
  // XR-INV-012
  | 'XR-INV-012/CLAIM_ID_NAMESPACE_MISMATCH'
  | 'XR-INV-012/CLAIM_ID_OUTSIDE_NAMESPACE'

export interface Violation {
  code: ViolationCode
  /** The invariant this enforces, where one applies. */
  invariant?: InvariantId
  class: ValidationClass
  severity: ViolationSeverity
  targets: ViolationTarget[]
  /** Plain-language explanation, safe to show a human reviewer. */
  message: string
  /** Machine-readable specifics for tooling. Never used for control flow here. */
  detail?: Readonly<Record<string, string | number | boolean | readonly string[]>>
}

export interface ValidationSummary {
  errorCount: number
  warningCount: number
  byClass: Record<ValidationClass, number>
  byInvariant: Partial<Record<InvariantId, number>>
}

export interface ValidationResult {
  /** True when no `ERROR` was found. Warnings do not make a graph illegal. */
  valid: boolean
  violations: readonly Violation[]
  summary: ValidationSummary
}

export const errors = (result: ValidationResult): Violation[] =>
  result.violations.filter((v) => v.severity === 'ERROR')

export const warnings = (result: ValidationResult): Violation[] =>
  result.violations.filter((v) => v.severity === 'WARNING')

export const violationsForCode = (
  result: ValidationResult,
  code: ViolationCode,
): Violation[] => result.violations.filter((v) => v.code === code)

export const violationsForInvariant = (
  result: ValidationResult,
  invariant: InvariantId,
): Violation[] => result.violations.filter((v) => v.invariant === invariant)

export function summarize(violations: readonly Violation[]): ValidationSummary {
  const byClass: Record<ValidationClass, number> = {
    STRUCTURAL: 0,
    REFERENTIAL: 0,
    EPISTEMIC: 0,
  }
  const byInvariant: Partial<Record<InvariantId, number>> = {}
  let errorCount = 0
  let warningCount = 0

  for (const v of violations) {
    byClass[v.class] += 1
    if (v.invariant) byInvariant[v.invariant] = (byInvariant[v.invariant] ?? 0) + 1
    if (v.severity === 'ERROR') errorCount += 1
    else warningCount += 1
  }

  return { errorCount, warningCount, byClass, byInvariant }
}
