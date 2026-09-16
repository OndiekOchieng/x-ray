/**
 * ATI draft composition — a downstream synthesis projection.
 *
 * WHERE THIS SITS
 * ===============
 * This is synthesis: generated prose derived from canonical state, sitting
 * strictly below the boundary in XR-INV-011. It reads a `GapView` and writes
 * nothing back. It was previously composed in `lib/types/gaps.ts`, beside type
 * definitions and fixture data, which put prose generation upstream of the
 * record it described.
 *
 * WHAT IT MAY NOT DO (ADR-0008, XR-INV-009)
 * =========================================
 *  - Draft for an ineligible gap. `atiDraftFor` returns `null` unless
 *    `gap.atiEligible` is true, which the domain binds to
 *    `resolutionPath === 'PUBLIC_RECORD_REQUEST'`.
 *  - Invent the name of a record. Every requested record comes from
 *    `gap.recordsSought`, which is canonical `Gap.resolvingEvidence`.
 *  - Invent an information officer, office, email or postal address.
 *  - Present inferred custody as confirmed. Where
 *    `likelyHolder.basis === 'INFERRED'` the draft says so in its own body,
 *    so the recipient can redirect it rather than assume X-Ray established
 *    custody.
 *  - Read as filed. The draft is labelled DRAFT and states that X-Ray has not
 *    submitted it; X-Ray does not file requests.
 */

import type { GapView } from './gap-view'

export interface AtiDraft {
  gapId: string
  /** Always `'DRAFT'` from this module. Only a human action advances it. */
  status: 'DRAFT'
  jurisdictionNote: string
  subject: string
  body: string
  /** Suggested download filename. */
  filename: string
  /** True when custody was inferred rather than confirmed. */
  holderIsInferred: boolean
  /** Shown beside the draft so the reader knows X-Ray has not filed it. */
  submissionDisclaimer: string
}

const DISCLAIMER =
  'This draft was prepared from a structured X-Ray investigation. It has NOT been submitted by X-Ray. Review it, edit it, and file it yourself if you choose to.'

const bullet = (items: readonly string[]): string =>
  items.map((item) => `• ${item}`).join('\n')

/**
 * Compose a draft request for an ATI-eligible gap.
 *
 * Returns `null` for any gap that is not eligible — a gap awaiting a record
 * that does not yet exist cannot be requested, however material it is
 * (CAL-005).
 */
export function atiDraftFor(gap: GapView): AtiDraft | null {
  if (!gap.atiEligible) return null

  const holder = gap.likelyHolder
  const holderIsInferred = holder?.basis === 'INFERRED'

  const addressee = holder
    ? holderIsInferred
      ? `Dear Information Access Officer,\n\nThis request is addressed to ${holder.institution}${
          holder.office ? ` (${holder.office})` : ''
        }. X-Ray has not confirmed that this body holds the records described below — it is the likely custodian inferred from the evidence trail. If the records sit elsewhere, please redirect this request or tell me where to send it.`
      : `Dear Information Access Officer,\n\nThis request is addressed to ${holder.institution}${
          holder.office ? ` (${holder.office})` : ''
        }, recorded as the custodian of the records described below.`
    : 'Dear Information Access Officer,\n\nX-Ray has not established which body holds the records described below. If they sit outside your office, please redirect this request or tell me where to send it.'

  const subjectMatter = gap.identifiers[0] ?? gap.claims[0]?.text ?? 'a public project'

  const sections: string[] = [
    addressee,
    `Records requested\n${bullet(gap.recordsSought)}`,
  ]

  if (gap.identifiers.length > 0) {
    sections.push(`These records concern\n${bullet(gap.identifiers)}`)
  }

  sections.push(`What is missing\n${gap.missingEvidence}`)
  sections.push(`Why this record matters\n${gap.whyItMatters}`)

  if (gap.searchAlreadyAttempted.length > 0) {
    sections.push(
      `Searches already made\nI have already looked without success in the following places, so a pointer to a published copy would also answer this request:\n${bullet(
        gap.searchAlreadyAttempted,
      )}`,
    )
  }

  sections.push(
    'Format\nPlease provide the records in an accessible electronic format where one exists.',
  )
  sections.push('Yours faithfully,\n[Your name]\n[Your contact details]')

  return {
    gapId: gap.gapId,
    status: 'DRAFT',
    jurisdictionNote: 'Draft request · Kenya access-to-information framework',
    subject: `Request for access to records concerning ${subjectMatter}`,
    body: sections.join('\n\n'),
    filename: `${gap.gapId.toLowerCase()}-ati-draft.txt`,
    holderIsInferred,
    submissionDisclaimer: DISCLAIMER,
  }
}
