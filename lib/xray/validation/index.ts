/**
 * Deterministic X-Ray validation.
 *
 *   MODEL OUTPUT → SCHEMA → INVARIANT → GRAPH → ACCEPT / REJECT / REPAIR
 *
 * `validateXRayGraph` answers exactly one question:
 *
 *   **Is this graph allowed?**
 *
 * It does not ask whether a legal graph is a good one. That is the Reviewer's
 * question (#4), and nothing here attempts it — the hardest cases in the
 * calibration corpus are, by design, cases the validator permits and the
 * Reviewer interrogates.
 *
 * THREE PROPERTIES THIS BOUNDARY GUARANTEES
 *
 * 1. **It never mutates the candidate graph.** Every check reads. A validator
 *    that repaired as it went would make rejection unfalsifiable.
 * 2. **Uncertainty survives validation.** `UNIDENTIFIED` and `UNRESOLVED`
 *    provenance are legal states, not errors. The rules refuse to let them be
 *    *counted as confirmed independence*, which is a different thing from
 *    refusing to let them exist. A graph that honestly reports what it could
 *    not establish is a valid graph.
 * 3. **`valid` turns on errors alone.** WARNING is reserved for a deterministic
 *    condition the architecture wants surfaced while the graph stays legal, and
 *    is deliberately hard to earn — currently nothing qualifies. A concern the
 *    validator cannot decide is not downgraded into a warning to build a queue
 *    for the Reviewer; #4 derives its own concerns from the graph and the
 *    calibration corpus.
 *
 * No benchmark ids appear in this directory. The rules are generic over any
 * graph; XRAY-KE-001 ids live only in the checks that exercise them.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import { validateStructure } from './structural'
import { validateReferences } from './referential'
import { validateEpistemics } from './epistemic'
import {
  summarize,
  type ValidationClass,
  type ValidationMode,
  type ValidationResult,
  type Violation,
} from './violations'

export type {
  ValidationClass,
  ValidationMode,
  ValidationResult,
  ValidationSummary,
  Violation,
  ViolationCode,
  ViolationSeverity,
  ViolationTarget,
  TargetKind,
} from './violations'
export { errors, warnings, violationsForCode, violationsForInvariant } from './violations'
export type { InvariantId, EnforcementLevel, InvariantCoverage } from './invariants'
export { INVARIANT_COVERAGE, coverageFor } from './invariants'
export type { MeasurementCompatibility, CompatibilityAssessment } from './measurement'
export { assessMeasurementCompatibility } from './measurement'

export interface ValidateOptions {
  /**
   * How complete the graph is expected to be. Defaults to `FULL`.
   *
   * `FULL` is graduation validation: completeness rules apply, so an orphaned
   * gap or an incomplete investigation index is illegal.
   *
   * `STAGED` is mid-pipeline validation: those two completeness rules are
   * skipped because the artifacts they require may not exist yet. Everything
   * else — structure, references, every invariant — still applies.
   */
  mode?: ValidationMode

  /**
   * Restrict which classes run. Orthogonal to `mode`.
   *
   * Omit to run all three.
   */
  only?: readonly ValidationClass[]
}

/**
 * Validate a candidate evidence graph.
 *
 * Runs in order — structure, then references, then invariants — because a
 * dangling id produces confusing epistemic output, and an illegal enum makes
 * measurement comparison meaningless. All classes still run regardless of
 * earlier failures, so one pass reports everything rather than making a caller
 * fix errors one at a time.
 */
export function validateXRayGraph(
  graph: XRayGraph,
  options: ValidateOptions = {},
): ValidationResult {
  const run = options.only
  const enabled = (cls: ValidationClass): boolean => run === undefined || run.includes(cls)

  const mode = options.mode ?? 'FULL'

  const violations: Violation[] = [
    ...(enabled('STRUCTURAL') ? validateStructure(graph) : []),
    ...(enabled('REFERENTIAL') ? validateReferences(graph, mode) : []),
    ...(enabled('EPISTEMIC') ? validateEpistemics(graph, mode) : []),
  ]

  const summary = summarize(violations)

  return {
    valid: summary.errorCount === 0,
    violations,
    summary,
  }
}

/**
 * Human-readable report, for CLI output and issue comments.
 *
 * Presentation only — callers that need structure use `ValidationResult`.
 */
export function formatValidationReport(result: ValidationResult): string {
  if (result.violations.length === 0) return 'Graph is valid. No violations.'

  const lines: string[] = []
  for (const v of result.violations) {
    const ids = v.targets.map((t) => `${t.kind}:${t.id}`).join(' ')
    lines.push(`[${v.severity}] ${v.code}`)
    lines.push(`  targets: ${ids}`)
    lines.push(`  ${v.message}`)
  }
  lines.push('')
  lines.push(
    `${result.summary.errorCount} error(s), ${result.summary.warningCount} warning(s) — graph is ${
      result.valid ? 'LEGAL' : 'ILLEGAL'
    }.`,
  )
  return lines.join('\n')
}
