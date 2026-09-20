/**
 * Graduation runner.
 *
 * Composes the three layers already built and turns them into one verdict:
 *
 *   validation (is it legal?)  ->  acceptance behaviors (does it do the right
 *   things?)  ->  review (is the judgment sound?)  ->  verdict
 *
 * The runner is generic: it knows nothing about any particular benchmark. The
 * behaviors it runs are supplied by the caller, and benchmark ids live in the
 * suite rather than here.
 *
 * It never mutates the graph, and it runs every layer even after one fails, so
 * a caller sees the whole picture rather than the first problem.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import type { CapabilityUnavailable } from '@/lib/xray/capability'
import { openGaps } from '@/lib/xray/selectors'
import { validateXRayGraph, type ValidationResult } from '@/lib/xray/validation'
import {
  fingerprintGraph,
  reviewXRayGraph,
  PORT_DEPENDENT_CHECKS,
  type ReviewerModel,
  type ReviewResult,
} from '@/lib/xray/review'
import {
  worstVerdict,
  type AcceptanceBehaviorReport,
  type AcceptanceStatus,
  type CapabilityBlocker,
  type GraduationReason,
  type GraduationVerdict,
} from './verdict'

/** One named acceptance behavior, asserted semantically over the graph. */
export interface AcceptanceBehavior {
  id: string
  title: string
  run(graph: XRayGraph): { status: AcceptanceStatus; detail: string; targets?: readonly string[] }
}

export interface UnresolvedGapReport {
  gapId: string
  claimIds: readonly string[]
  missingEvidence: string
  resolutionPath: string
  atiEligible: boolean
}

export interface GraduationResult {
  verdict: GraduationVerdict
  investigationId: string
  graphFingerprint: string
  assessedAt: string

  validation: {
    valid: boolean
    errorCount: number
    warningCount: number
  }

  behaviors: readonly AcceptanceBehaviorReport[]

  review: {
    status: ReviewResult['status']
    blockingFindings: number
    advisoryFindings: number
    checksEvaluated: number
    checksNotEvaluated: number
    fullCapability: boolean
  }

  /** Why research stopped, and what it left undone. */
  researchStop?: {
    reason: string
    unresolvedHighPriorityLeads: readonly string[]
  }

  /** Material gaps still open at graduation. Not a defect — recorded state. */
  unresolvedMaterialGaps: readonly UnresolvedGapReport[]

  /** Everything preventing PASS that is a claim about the graph. */
  reasons: readonly GraduationReason[]

  /** Everything preventing PASS that is a claim about our own capability. */
  blockers: readonly CapabilityBlocker[]

  /** Full sub-results, for callers that want the detail. */
  detail: {
    validation: ValidationResult
    review: ReviewResult
  }
}

export interface GraduationOptions {
  behaviors: readonly AcceptanceBehavior[]
  /**
   * Review check ids whose evaluation is required for PASS.
   *
   * Defaults to every check the Reviewer runs: full assurance means every check
   * actually ran. Narrow it deliberately, never by accident.
   */
  requiredReviewChecks?: readonly string[]
  model?: ReviewerModel
  assessedAt?: string
  /** Run-level capability gaps remain separate from ResearchStop (D23). */
  capabilityGaps?: readonly CapabilityUnavailable[]
  /** A stale revision cascade cannot graduate its referential scaffold. */
  staleStages?: readonly string[]
}

export function assessGraduation(
  graph: XRayGraph,
  options: GraduationOptions,
): GraduationResult {
  const assessedAt = options.assessedAt ?? '1970-01-01T00:00:00Z'
  const validation = validateXRayGraph(graph)
  const review = reviewXRayGraph(graph, {
    validation,
    model: options.model,
    reviewedAt: assessedAt,
  })

  const reasons: GraduationReason[] = []
  const blockers: CapabilityBlocker[] = []
  const verdicts: GraduationVerdict[] = []

  for (const gap of options.capabilityGaps ?? []) {
    blockers.push({ ref: gap.operation, title: gap.operation, reason: gap.detail, resolvedBy: gap.resolvedBy })
    verdicts.push('BLOCKED')
  }
  for (const stage of options.staleStages ?? []) {
    blockers.push({ ref: `STALE/${stage}`, title: `${stage} needs rerun`, reason: 'Revision cascade is incomplete.', resolvedBy: `rerun ${stage}` })
    verdicts.push('BLOCKED')
  }

  // --- legality ------------------------------------------------------------
  for (const v of validation.violations) {
    if (v.severity !== 'ERROR') continue
    reasons.push({
      kind: 'VALIDATION_ERROR',
      verdict: 'FAIL',
      ref: v.code,
      message: v.message,
      targets: v.targets.map((t) => `${t.kind}:${t.id}`),
    })
  }
  if (!validation.valid) verdicts.push('FAIL')

  // --- acceptance behaviors ------------------------------------------------
  const behaviors: AcceptanceBehaviorReport[] = options.behaviors.map((behavior) => {
    const outcome = behavior.run(graph)
    return { id: behavior.id, title: behavior.title, ...outcome }
  })

  for (const report of behaviors) {
    if (report.status === 'VIOLATED') {
      reasons.push({
        kind: 'ACCEPTANCE_BEHAVIOR_VIOLATED',
        verdict: 'FAIL',
        ref: report.id,
        message: `${report.title}: ${report.detail}`,
        targets: report.targets,
      })
      verdicts.push('FAIL')
    } else if (report.status === 'NOT_EVALUATED') {
      blockers.push({
        ref: report.id,
        title: report.title,
        reason: report.detail,
        resolvedBy: 'the capability this behavior depends on',
      })
      verdicts.push('BLOCKED')
    }
  }

  // --- review --------------------------------------------------------------
  if (review.status === 'REFUSED_VALIDATOR_FAILING') {
    // Already FAILing on legality; the refusal is a consequence, not a
    // separate accusation.
    if (validation.valid) {
      reasons.push({
        kind: 'VALIDATION_ERROR',
        verdict: 'FAIL',
        ref: 'REVIEW/REFUSED',
        message: review.refusalReason ?? 'Review refused.',
      })
      verdicts.push('FAIL')
    }

    /**
     * Disclose the standing capability gaps anyway.
     *
     * Review refused, so there is no per-check record to read — but these
     * checks are unavailable as a property of this build, not of this graph.
     * They will still be unavailable once the errors are fixed. Staying silent
     * would let a fix look complete while assurance is still missing.
     *
     * These add no verdict: FAIL already stands, and BLOCKED would not change
     * it.
     */
    for (const portCheck of PORT_DEPENDENT_CHECKS) {
      blockers.push({
        ref: portCheck.checkId,
        title: portCheck.title,
        reason: `Not reached — review was refused for an illegal graph. Independently of that, ${portCheck.reason}`,
        resolvedBy: 'a ReviewerModel implementation (#6 pipeline adapters)',
      })
    }
  } else {
    for (const finding of review.findings) {
      if (finding.severity !== 'BLOCKING') continue
      reasons.push({
        kind: 'REVIEW_BLOCKING_FINDING',
        verdict: 'REVISE',
        ref: finding.checkId,
        message: finding.rationale,
        targets: finding.targets.map((t) => `${t.kind}:${t.id}`),
      })
      verdicts.push('REVISE')
    }

    /**
     * Capability, not culpability.
     *
     * A required check that could not run prevents PASS and nothing more. It
     * never becomes a REVISE or a FAIL, because the graph has not been shown to
     * have any defect — the reviewing apparatus is what is incomplete.
     */
    const required =
      options.requiredReviewChecks ?? review.checks.map((c) => c.checkId)
    for (const check of review.checks) {
      if (check.outcome !== 'NOT_EVALUATED') continue
      if (!required.includes(check.checkId)) continue
      blockers.push({
        ref: check.checkId,
        title: check.title,
        reason: check.notEvaluatedReason ?? 'Check did not run.',
        resolvedBy:
          check.capability === 'MODEL_ASSISTED'
            ? 'a ReviewerModel implementation (#6 pipeline adapters)'
            : 'the capability this check depends on',
      })
      verdicts.push('BLOCKED')
    }
  }

  // --- recorded state ------------------------------------------------------
  const unresolvedMaterialGaps: UnresolvedGapReport[] = openGaps(graph).map((gap) => ({
    gapId: gap.id,
    claimIds: [...gap.claimIds],
    missingEvidence: gap.missingEvidence,
    resolutionPath: gap.resolutionPath,
    atiEligible: gap.atiEligible,
  }))

  const stop = graph.investigation.researchStop
  if (stop?.reason !== 'SATURATION') {
    blockers.push({
      ref: 'RESEARCH_STOP',
      title: 'Research stop prerequisite',
      reason: stop ? `Research stopped: ${stop.reason}.` : 'No current research stop has been established.',
      resolvedBy: 'complete research and establish affirmative saturation evidence',
    })
    verdicts.push('BLOCKED')
  }

  return {
    verdict: worstVerdict(verdicts),
    investigationId: graph.investigation.id,
    graphFingerprint: fingerprintGraph(graph),
    assessedAt,

    validation: {
      valid: validation.valid,
      errorCount: validation.summary.errorCount,
      warningCount: validation.summary.warningCount,
    },

    behaviors,

    review: {
      status: review.status,
      blockingFindings: review.summary.blockingFindings,
      advisoryFindings: review.summary.advisoryFindings,
      checksEvaluated: review.summary.checksEvaluated,
      checksNotEvaluated: review.summary.checksNotEvaluated,
      fullCapability: review.summary.fullCapability,
    },

    researchStop: stop
      ? { reason: stop.reason, unresolvedHighPriorityLeads: [...stop.unresolvedHighPriorityLeads] }
      : undefined,

    unresolvedMaterialGaps,
    reasons,
    blockers,
    detail: { validation, review },
  }
}
