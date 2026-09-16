/**
 * GapView — a missing record, resolved for display.
 *
 * Suitable for both the gap-preview and gap-detail surfaces.
 *
 * ATI DRAFT GENERATION IS NOT HERE. Composing request prose is a synthesis
 * step with its own rules — the model may draft, a human must review, and the
 * draft must never read as submitted (ADR-0008). This view exposes the
 * structured inputs a draft needs (`recordsSought`, `identifiers`,
 * `likelyHolder`, `whyItMatters`) without composing them. Draft generation is
 * deliberately **left to the UI-migration slice**, where the existing pure
 * builder in the old scaffold can be moved behind projections without
 * broadening this one.
 *
 * `atiEligible` is read from canonical `Gap`, never recomputed. A material gap
 * may be ineligible — CAL-005.
 */

import type { CustodyBasis, Gap, GapStatus, ResolutionPath } from '@/lib/xray/domain'
import type { XRayGraph, ClaimIdLike } from '@/lib/xray/selectors'
import { claimById, gapsForClaim } from '@/lib/xray/selectors'
import { custodyBasisLabel, gapStatusLabel, resolutionPathLabel } from './labels'

export interface GapHolderView {
  institution: string
  office?: string
  basis: CustodyBasis
  basisLabel: string
  /** True when custody was reasoned about rather than confirmed. */
  isInferred: boolean
}

export interface GapView {
  gapId: string
  /** What is missing. Never a statement that it does not exist. */
  missingEvidence: string
  whyItMatters: string
  /** "What would settle it." */
  resolvingEvidence: string[]
  /** How far the search actually went — what makes the absence legible. */
  searchAlreadyAttempted: string[]
  effectOnFinding: string

  claims: { claimId: string; text: string }[]

  status: GapStatus
  statusLabel: string
  resolutionPath: ResolutionPath
  resolutionPathLabel: string
  atiEligible: boolean

  likelyHolder?: GapHolderView
  /** Project/entity identifiers that make a record request specific. */
  identifiers: string[]
  /** Alias of `resolvingEvidence`, named for the ATI-drafting step. */
  recordsSought: string[]
}

export function gapView(graph: XRayGraph, gap: Gap): GapView {
  return {
    gapId: gap.id,
    missingEvidence: gap.missingEvidence,
    whyItMatters: gap.whyItMatters,
    resolvingEvidence: [...gap.resolvingEvidence],
    searchAlreadyAttempted: [...gap.searchAlreadyAttempted],
    effectOnFinding: gap.effectOnFinding,

    claims: gap.claimIds.map((id) => ({
      claimId: id,
      text: claimById(graph, id)?.text ?? '',
    })),

    status: gap.status,
    statusLabel: gapStatusLabel[gap.status],
    resolutionPath: gap.resolutionPath,
    resolutionPathLabel: resolutionPathLabel[gap.resolutionPath],
    atiEligible: gap.atiEligible,

    likelyHolder: gap.likelyHolder
      ? {
          institution: gap.likelyHolder.institution,
          office: gap.likelyHolder.office,
          basis: gap.likelyHolder.basis,
          basisLabel: custodyBasisLabel[gap.likelyHolder.basis],
          isInferred: gap.likelyHolder.basis === 'INFERRED',
        }
      : undefined,
    identifiers: gap.identifiers ? [...gap.identifiers] : [],
    recordsSought: [...gap.resolvingEvidence],
  }
}

export function gapViewsForClaim(graph: XRayGraph, claimId: ClaimIdLike): GapView[] {
  return gapsForClaim(graph, claimId).map((g) => gapView(graph, g))
}
