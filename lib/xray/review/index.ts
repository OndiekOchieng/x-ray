/**
 * Calibrated epistemic Reviewer.
 *
 *   candidate graph -> deterministic validation -> REVIEWER -> revise / pass -> graduation
 *
 * The validator asks whether a graph is legal. The Reviewer asks the question
 * that survives a yes:
 *
 *   This graph is legal. Is the judgment still epistemically suspect?
 *
 * FOUR PROPERTIES
 *
 * 1. It runs only on validator-clean graphs. Given a failing one it refuses and
 *    returns REFUSED_VALIDATOR_FAILING. Reviewing illegal state would produce
 *    findings about artifacts that should not exist.
 * 2. It derives concerns independently. Validator warnings are not an input
 *    queue (D8). Checks read the graph and reason from the calibration corpus;
 *    where the two agree, they agreed separately.
 * 3. It never mutates. A blocking finding produces a RevisionRequest naming a
 *    stage. It does not invoke that stage and does not rewrite a Finding,
 *    Evidence, Gap or Claim. Executable routing is #6; the graduation verdict
 *    is #5.
 * 4. Unevaluated is never a pass. Checks needing natural-language judgment
 *    report NOT_EVALUATED with a reason until #6 supplies the model port, and
 *    `fullCapability` stays false while any remain.
 *
 * Review output is not canonical state (D5).
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import { validateXRayGraph, type ValidationResult } from '@/lib/xray/validation'
import { CHECK_ROUTING, DETERMINISTIC_CHECKS } from './deterministic'
import { PORT_DEPENDENT_CHECKS, type ReviewerModel } from './port'
import type { ReviewCheckReport, ReviewFinding, ReviewResult, RevisionRequest } from './types'

export type {
  CalibrationCaseId,
  FailureModeId,
  ReviewCapability,
  ReviewCheckReport,
  ReviewFinding,
  ReviewHistory,
  ReviewOutcome,
  ReviewResult,
  ReviewRound,
  ReviewSeverity,
  ReviewStatus,
  ReviewSummary,
  ReviewTarget,
  ReviewTargetKind,
  RevisionRequest,
} from './types'
export type {
  ModelJudgment,
  PortDependentCheck,
  ReviewerModel,
  ReviewerModelQuery,
} from './port'
export { PORT_DEPENDENT_CHECKS } from './port'
export { DETERMINISTIC_CHECKS, CHECK_ROUTING } from './deterministic'
export {
  appendReviewRound,
  emptyReviewHistory,
  latestRound,
  latestRoundIsClear,
  roundsConcernDistinctGraphs,
} from './history'

export interface ReviewOptions {
  /**
   * A pre-computed validation result, to avoid revalidating. The Reviewer still
   * refuses if it is failing.
   */
  validation?: ValidationResult
  /**
   * Model port. Unimplemented in #4 — when absent, model-assisted checks are
   * reported NOT_EVALUATED rather than skipped silently.
   */
  model?: ReviewerModel
  /** Review timestamp as an ISO string. Injected so reviews are reproducible. */
  reviewedAt?: string
}

/**
 * A stable fingerprint of the reviewed graph state.
 *
 * Lets a later round be shown to concern different state rather than the same
 * graph re-judged. FNV-1a over canonical ids and the fields a review turns on:
 * no crypto dependency, stable across runs.
 */
export function fingerprintGraph(graph: XRayGraph): string {
  const parts: string[] = [graph.investigation.id, String(graph.investigation.currentVersion)]
  for (const c of graph.claims) parts.push(c.id, c.origin, c.layer, c.type, c.text)
  for (const e of graph.evidence) parts.push(e.id, e.sourceId, e.relationship, e.strength)
  for (const p of graph.evidenceProvenance)
    parts.push(p.id, p.evidenceId, p.origin.kind === 'SOURCE' ? p.origin.sourceId : 'UNIDENTIFIED')
  for (const f of graph.findings) parts.push(f.id, f.claimId, f.status, f.confidence)
  for (const d of graph.discrepancies) parts.push(d.id, d.classification, String(d.resolved))
  for (const g of graph.gaps) parts.push(g.id, g.status, g.resolutionPath)

  let hash = 0x811c9dc5
  const text = parts.join('')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `xrg_${hash.toString(16).padStart(8, '0')}_${parts.length}`
}

/** Review a candidate graph. Refuses unless the graph is validator-clean. */
export function reviewXRayGraph(graph: XRayGraph, options: ReviewOptions = {}): ReviewResult {
  const reviewedAt = options.reviewedAt ?? '1970-01-01T00:00:00Z'
  const graphFingerprint = fingerprintGraph(graph)
  const investigationId = graph.investigation.id

  const validation = options.validation ?? validateXRayGraph(graph)

  if (!validation.valid) {
    return {
      status: 'REFUSED_VALIDATOR_FAILING',
      graphFingerprint,
      investigationId,
      reviewedAt,
      checks: [],
      findings: [],
      revisionRequests: [],
      summary: {
        checksEvaluated: 0,
        checksNotEvaluated: DETERMINISTIC_CHECKS.length + PORT_DEPENDENT_CHECKS.length,
        blockingFindings: 0,
        advisoryFindings: 0,
        fullCapability: false,
      },
      refusalReason: `Graph fails deterministic validation with ${validation.summary.errorCount} error(s). Review runs only on legal state; fix the violations first.`,
    }
  }

  const checks: ReviewCheckReport[] = []
  const findings: ReviewFinding[] = []
  const revisionRequests: RevisionRequest[] = []

  let findingSeq = 0
  let revisionSeq = 0

  for (const check of DETERMINISTIC_CHECKS) {
    const raw = check.run(graph)
    for (const item of raw) {
      findingSeq += 1
      const finding: ReviewFinding = {
        id: `RF-${String(findingSeq).padStart(3, '0')}`,
        checkId: check.checkId,
        failureMode: check.failureMode,
        calibrationCases: check.calibrationCases,
        ...item,
      }
      findings.push(finding)

      if (finding.severity === 'BLOCKING') {
        const routing = CHECK_ROUTING[check.checkId]
        if (routing) {
          revisionSeq += 1
          revisionRequests.push({
            id: `RR-${String(revisionSeq).padStart(3, '0')}`,
            findingId: finding.id,
            stage: routing.stage,
            action: routing.action,
            targets: finding.targets,
          })
        }
      }
    }

    checks.push({
      checkId: check.checkId,
      title: check.title,
      failureMode: check.failureMode,
      calibrationCases: check.calibrationCases,
      capability: 'DETERMINISTIC',
      outcome: 'EVALUATED',
      findingCount: raw.length,
    })
  }

  // Model-assisted checks. NOT_EVALUATED is never collapsed into a pass (D4).
  for (const portCheck of PORT_DEPENDENT_CHECKS) {
    checks.push({
      checkId: portCheck.checkId,
      title: portCheck.title,
      failureMode: portCheck.failureMode,
      calibrationCases: portCheck.calibrationCases,
      capability: 'MODEL_ASSISTED',
      outcome: 'NOT_EVALUATED',
      notEvaluatedReason: options.model
        ? `Model "${options.model.name}" was supplied, but no provider execution is wired in this build. ${portCheck.reason}`
        : `No model port implementation is wired; deferred to #6 under ADR-0004. ${portCheck.reason}`,
      findingCount: 0,
    })
  }

  const evaluated = checks.filter((c) => c.outcome === 'EVALUATED').length
  const notEvaluated = checks.length - evaluated

  return {
    status: 'REVIEWED',
    graphFingerprint,
    investigationId,
    reviewedAt,
    checks,
    findings,
    revisionRequests,
    summary: {
      checksEvaluated: evaluated,
      checksNotEvaluated: notEvaluated,
      blockingFindings: findings.filter((f) => f.severity === 'BLOCKING').length,
      advisoryFindings: findings.filter((f) => f.severity === 'ADVISORY').length,
      fullCapability: notEvaluated === 0,
    },
  }
}

/** Human-readable report. Presentation only. */
export function formatReviewReport(result: ReviewResult): string {
  if (result.status === 'REFUSED_VALIDATOR_FAILING')
    return `Review refused. ${result.refusalReason}`

  const lines: string[] = []
  for (const f of result.findings) {
    lines.push(`[${f.severity}] ${f.checkId}  (${f.failureMode}, ${f.calibrationCases.join('/')})`)
    lines.push(`  targets: ${f.targets.map((x) => `${x.kind}:${x.id}`).join(' ')}`)
    lines.push(`  ${f.rationale}`)
    lines.push(`  action: ${f.requiredAction}`)
  }
  if (result.findings.length === 0) lines.push('No review findings.')

  lines.push('')
  lines.push(
    `${result.summary.checksEvaluated} check(s) evaluated, ${result.summary.checksNotEvaluated} not evaluated.`,
  )
  lines.push(
    `${result.summary.blockingFindings} blocking, ${result.summary.advisoryFindings} advisory. Capability: ${
      result.summary.fullCapability ? 'full' : 'partial'
    }.`,
  )
  return lines.join('\n')
}
