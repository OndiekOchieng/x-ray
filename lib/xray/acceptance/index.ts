/**
 * Graduation gate.
 *
 *   validation -> acceptance behaviors -> review -> verdict
 *
 * Answers whether a candidate graph is safe to graduate, and reports exactly
 * why not when it is not. Generic over any benchmark: the behaviors are
 * supplied by the caller.
 */

export type {
  AcceptanceBehaviorReport,
  AcceptanceStatus,
  CapabilityBlocker,
  GraduationReason,
  GraduationReasonKind,
  GraduationVerdict,
} from './verdict'
export { VERDICT_PRECEDENCE, worstVerdict } from './verdict'
export type {
  AcceptanceBehavior,
  GraduationOptions,
  GraduationResult,
  UnresolvedGapReport,
} from './runner'
export { assessGraduation } from './runner'

import type { GraduationResult } from './runner'

/**
 * Human-readable graduation report.
 *
 * Reasons and blockers are printed under separate headings on purpose. One is
 * a claim about the graph; the other is a claim about our own reach. Merging
 * them would be the exact confusion the verdict set exists to prevent.
 */
export function formatGraduationReport(result: GraduationResult): string {
  const lines: string[] = []

  lines.push(`GRADUATION: ${result.verdict}`)
  lines.push(`  investigation  ${result.investigationId}`)
  lines.push(`  graph          ${result.graphFingerprint}`)
  lines.push(
    `  validation     ${result.validation.valid ? 'legal' : `ILLEGAL (${result.validation.errorCount} error(s))`}`,
  )
  lines.push(
    `  review         ${result.review.blockingFindings} blocking, ${result.review.advisoryFindings} advisory, ` +
      `${result.review.checksEvaluated} evaluated / ${result.review.checksNotEvaluated} not evaluated`,
  )

  lines.push('')
  lines.push('Acceptance behaviors')
  for (const b of result.behaviors) {
    const mark = b.status === 'SATISFIED' ? ' ok ' : b.status === 'VIOLATED' ? 'FAIL' : ' -- '
    lines.push(`  ${mark}  ${b.id}  ${b.title}`)
    if (b.status !== 'SATISFIED') lines.push(`          ${b.detail}`)
  }

  if (result.reasons.length > 0) {
    lines.push('')
    lines.push('Why not PASS — findings about the graph')
    for (const r of result.reasons) {
      lines.push(`  [${r.verdict}] ${r.ref}`)
      lines.push(`     ${r.message}`)
      if (r.targets?.length) lines.push(`     targets: ${r.targets.join(' ')}`)
    }
  }

  if (result.blockers.length > 0) {
    lines.push('')
    lines.push('Why not PASS — assurance we could not obtain')
    lines.push('  These are not defects in the graph. Nothing here accuses the evidence.')
    for (const b of result.blockers) {
      lines.push(`  [BLOCKED] ${b.ref}`)
      lines.push(`     ${b.title}`)
      lines.push(`     resolved by: ${b.resolvedBy}`)
    }
  }

  if (result.unresolvedMaterialGaps.length > 0) {
    lines.push('')
    lines.push('Open gaps at graduation — recorded state, not defects')
    for (const g of result.unresolvedMaterialGaps) {
      lines.push(
        `  ${g.gapId}  ${g.resolutionPath}${g.atiEligible ? ' (ATI-eligible)' : ''}  blocks ${g.claimIds.join(', ')}`,
      )
    }
  }

  if (result.researchStop) {
    lines.push('')
    lines.push(`Research stopped: ${result.researchStop.reason}`)
    for (const lead of result.researchStop.unresolvedHighPriorityLeads) {
      lines.push(`  not followed: ${lead}`)
    }
  }

  lines.push('')
  switch (result.verdict) {
    case 'PASS':
      lines.push('Safe to graduate.')
      break
    case 'BLOCKED':
      lines.push(
        'Not safe to graduate, and not accused of anything. Required assurance could not be obtained — supply the missing capability.',
      )
      break
    case 'REVISE':
      lines.push('Legal, but the judgment is suspect. Revise at the stages named above.')
      break
    case 'FAIL':
      lines.push('Illegal or in breach of a required acceptance behavior. Fix the graph.')
      break
  }

  return lines.join('\n')
}
