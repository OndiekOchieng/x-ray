/**
 * Share-card projections.
 *
 * RESPONSIBLE SHARING
 * ===================
 * Share surfaces are the highest-reach, lowest-context output X-Ray has. An
 * unresolved gap MUST NOT be worded as evidence of wrongdoing — the
 * architecture's responsible-sharing constraint, recorded under XR-INV-011.
 *
 * So the wording is about the record, not about anyone's conduct:
 *
 *   good  "X-Ray could not locate the record reconciling the KSh 16.7B figure."
 *   bad   "Government cannot explain KSh 16.7B."
 *
 * The first describes a search. The second is an allegation, and nothing in
 * the graph supports it (FM-004, CAL-004).
 *
 * Every card carries the investigation date, because a finding is a dated
 * statement about what the evidence supported at a research cutoff.
 */

import type { FindingView } from './finding-view'
import type { GapView } from './gap-view'

export interface EvidenceShareCardView {
  claimId: string
  claimText: string
  statusLabel: string
  confidenceLabel: string
  /** What X-Ray can establish, from the finding's own rationale. */
  establishes: string
  investigatedAt: string
  protocolVersion: string
  /** Receipt availability, stated as a count of evidence points. */
  evidencePointCount: number
}

export function evidenceShareCardView(
  finding: FindingView,
  context: { investigatedAt: string; protocolVersion: string },
): EvidenceShareCardView {
  return {
    claimId: finding.claimId,
    claimText: finding.claimText,
    statusLabel: finding.statusLabel,
    confidenceLabel: finding.confidenceLabel,
    establishes: finding.rationale,
    investigatedAt: context.investigatedAt,
    protocolVersion: context.protocolVersion,
    evidencePointCount:
      finding.supporting.length + finding.challenging.length + finding.contextual.length,
  }
}

export interface GapShareView {
  gapId: string
  headline: string
  whatIsMissing: string
  whatWouldSettleIt?: string
  /** Always present. A missing record is not evidence of wrongdoing. */
  responsibilityNote: string
  investigatedAt: string
  shareText: string
}

const RESPONSIBILITY_NOTE =
  'A missing record is not evidence of wrongdoing. It describes what X-Ray could not locate and what would settle the question.'

export function gapShareView(
  gap: GapView,
  context: { investigatedAt: string },
): GapShareView {
  const headline = 'X-Ray could not locate a record'
  const lines = [
    headline,
    '',
    gap.missingEvidence,
    '',
    `What would settle it: ${gap.recordsSought[0] ?? 'an authoritative record from the custodian.'}`,
    '',
    RESPONSIBILITY_NOTE,
    `Investigated ${context.investigatedAt}.`,
  ]
  return {
    gapId: gap.gapId,
    headline,
    whatIsMissing: gap.missingEvidence,
    whatWouldSettleIt: gap.recordsSought[0],
    responsibilityNote: RESPONSIBILITY_NOTE,
    investigatedAt: context.investigatedAt,
    shareText: lines.join('\n'),
  }
}
