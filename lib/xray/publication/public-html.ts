/**
 * Self-contained HTML for the public surface.
 *
 * WHY THESE ARE DOCUMENTS, NOT PAGES
 * ==================================
 * A withdrawn address must answer **410 Gone** (ADR-0014): published URLs get
 * cited, and an address that stops resolving turns a citation into ambiguity a
 * reader fills in themselves. A Next.js `page.tsx` has no supported way to set
 * an arbitrary status — `notFound()` gives 404 and nothing gives 410 — so the
 * public surface is served by route handlers, which control status exactly.
 *
 * The documents are therefore self-contained: one inline stylesheet, no build
 * asset wiring. That is also the right shape for a cached public artifact.
 *
 * THIS IS A SYNTHESIS SURFACE
 * ===========================
 * Everything here is downstream of canonical evidence and can write nothing
 * (XR-INV-011). The withdrawal copy in particular is bound by responsible
 * sharing: a withdrawal must not become an accusation by implication.
 */

import type { WithdrawalReason } from '@/lib/xray/persistence/publication'
import type { AssuranceDisclosure, PublicVersionView } from './public-view'
import type { PublicLineage } from './version-lineage'

/** Escape every interpolated value. Canonical text is arbitrary prose. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const STYLES = `
  :root { color-scheme: light dark; --fg: #111; --muted: #555; --line: #d8d8d8; --bg: #fff; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #f2f2f2; --muted: #a8a8a8; --line: #333; --bg: #0e0e0e; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem; }
  .eyebrow { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase;
    color: var(--muted); margin: 0; }
  h1 { font-size: 2rem; line-height: 1.2; margin: .5rem 0 0; }
  h2 { font-size: 1.05rem; margin: 0; }
  p { color: var(--muted); }
  .lead { color: var(--fg); font-size: 1.05rem; }
  .panel { border: 1px solid var(--line); border-radius: .5rem; padding: 1.25rem; margin-top: 2rem; }
  .facts { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    border-top: 1px solid var(--line); margin-top: 2.5rem; padding-top: 1.5rem; font-size: .875rem; }
  .facts dt { color: var(--muted); } .facts dd { margin: .25rem 0 0; font-weight: 600; }
  ul { padding-left: 1.2rem; } li { margin: .35rem 0; }
  .claims { list-style: none; padding: 0; }
  .claims li { border: 1px solid var(--line); border-radius: .5rem; padding: 1rem; margin: .75rem 0; }
  .claims p { color: var(--fg); margin: 0; }
  .meta { font-size: .8rem; color: var(--muted); margin-top: .5rem; }
  footer { border-top: 1px solid var(--line); margin-top: 3rem; padding-top: 1.5rem;
    font-size: .875rem; color: var(--muted); }
  code, .addr { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
`

export function document_(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>${STYLES}</style></head>` +
    `<body>${body}</body></html>`
}

// ---------------------------------------------------------------------------
// Tombstone
// ---------------------------------------------------------------------------

/**
 * The four reasons say materially different things, and the copy keeps them
 * apart. Collapsing them would let X-Ray disown work it still stands behind,
 * or concede an error it has not found.
 */
const REASON_COPY: Record<WithdrawalReason, { heading: string; body: string }> = {
  ERRONEOUS: {
    heading: 'Retracted by X-Ray',
    body: 'X-Ray retracted this published X-Ray because it contained a material error. ' +
      'What was wrong is recorded below.',
  },
  COMPELLED: {
    heading: 'Removed under compulsion',
    body: 'This X-Ray was removed under legal or platform compulsion. X-Ray has not ' +
      'found an error in the evidence and is not conceding one. No further inference ' +
      'should be drawn from this notice.',
  },
  PRIVACY_HARM: {
    heading: 'Removed to prevent harm',
    body: 'This X-Ray was removed to prevent harm to a person. That is a decision ' +
      'about presentation, not a statement about whether the evidence was correct.',
  },
  OUT_OF_SCOPE: {
    heading: 'Outside X-Ray’s publication scope',
    body: 'This X-Ray was withdrawn because publishing it fell outside the rules X-Ray ' +
      'sets for itself. That is a judgment about what X-Ray publishes, not a finding ' +
      'about the records involved.',
  },
}

export interface TombstoneInput {
  slug: string
  version: number
  reason: WithdrawalReason
  withdrawnAt: string
  note?: string
}

export function tombstoneDocument(input: TombstoneInput): string {
  const copy = REASON_COPY[input.reason]
  const address = `/xray/${input.slug}/v${input.version}`
  const note = input.note
    ? `<section class="panel"><h2>What was wrong</h2><p>${escapeHtml(input.note)}</p></section>`
    : ''
  return document_(`Withdrawn · ${copy.heading}`, `<main>
<p class="eyebrow">Withdrawn</p>
<h1>${escapeHtml(copy.heading)}</h1>
<p class="lead">${escapeHtml(copy.body)}</p>
${note}
<dl class="facts">
<div><dt>Version</dt><dd>v${input.version}</dd></div>
<div><dt>Withdrawn</dt><dd>${escapeHtml(input.withdrawnAt)}</dd></div>
<div><dt>Address</dt><dd class="addr">${escapeHtml(address)}</dd></div>
</dl>
<footer><p>A withdrawn X-Ray keeps its address so that citations to it resolve to this
notice rather than to nothing. Its research record is unchanged; only what is
presented here has.</p></footer>
</main>`)
}

// ---------------------------------------------------------------------------
// Published version
// ---------------------------------------------------------------------------

export function publishedDocument(
  slug: string, view: PublicVersionView, assurance: AssuranceDisclosure,
): string {
  const citation = `/xray/${slug}/v${view.version}`

  // Incomplete assurance is disclosed, never presented as a pass.
  const disclosure = assurance.verdict === 'BLOCKED' && assurance.unavailableChecks.length > 0
    ? `<section class="panel" data-testid="assurance-disclosure">
<h2>Checks that could not be run</h2>
<p>The evidence below passed every check X-Ray could perform. These checks exist but
were not available when this version was assessed, so this X-Ray carries less assurance
than a fully checked one. Nothing here is a finding against the evidence.</p>
<ul>${assurance.unavailableChecks.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
</section>`
    : ''

  const claims = view.claims.map((claim) => `<li><p>${escapeHtml(claim.text)}</p>
<p class="meta">${escapeHtml(claim.findingStatusLabel ?? 'Not graded')}` +
    `${claim.confidenceLabel ? ` · ${escapeHtml(claim.confidenceLabel)}` : ''}` +
    `${claim.gapCount > 0 ? ` · ${claim.gapCount} open gap(s)` : ''}</p></li>`).join('')

  const cutoff = view.researchCutoffAt
    ? ` with evidence considered up to <strong>${escapeHtml(view.researchCutoffAt)}</strong>`
    : ''
  const completed = view.completedAt ? ` · completed ${escapeHtml(view.completedAt)}` : ''

  return document_(`${view.surface.title} · v${view.version}`, `<main>
<p class="eyebrow">Published X-Ray · v${view.version}</p>
<h1>${escapeHtml(view.surface.title)}</h1>
${view.surface.publisher ? `<p>${escapeHtml(view.surface.publisher)}</p>` : ''}
${view.focus ? `<p class="lead">${escapeHtml(view.focus)}</p>` : ''}
${disclosure}
<dl class="facts">
<div><dt>Claims</dt><dd>${view.counts.claims}</dd></div>
<div><dt>Sources</dt><dd>${view.counts.sources}</dd></div>
<div><dt>Evidence</dt><dd>${view.counts.evidence}</dd></div>
<div><dt>Open gaps</dt><dd>${view.counts.openGaps}</dd></div>
</dl>
<section><h2>Claims examined</h2><ul class="claims">${claims}</ul></section>
<footer>
<p>This is version <strong>${view.version}</strong>, researched under protocol
<strong>${escapeHtml(view.protocolVersion)}</strong>${cutoff}${completed}.</p>
<p>Cite this exact version:
<a class="addr" data-testid="canonical-link" href="${escapeHtml(citation)}">${escapeHtml(citation)}</a></p>
<p><a data-testid="history-link" href="${escapeHtml(`/xray/${slug}/history`)}">Version history</a>
— what changed, and when.</p>
<p>A later version does not change this one. Verdicts expire; receipts compound.</p>
</footer>
</main>`)
}

// ---------------------------------------------------------------------------
// Version lineage
// ---------------------------------------------------------------------------

const TRIGGER_COPY: Record<string, string> = {
  INITIAL_RESEARCH: 'Initial research',
  NEW_SOURCE_RECEIVED: 'A new record was located',
  ATI_RESPONSE_RECEIVED: 'A public-record request was answered',
  RE_EVALUATION: 'Re-evaluated',
  CORRECTION: 'Correction',
}

const REASON_LABEL: Record<string, string> = {
  NEW_EVIDENCE: 'new evidence',
  CORRECTION: 'correction',
  REVIEW_REVISION: 'review revision',
  EXTERNAL_RECORD_RESPONSE: 'external record response',
  OTHER: 'other',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The history surface.
 *
 * Mutable by design and labelled as such: it changes as publication events
 * accumulate, which is exactly why it is not folded into the immutable
 * version document.
 */
export function lineageDocument(lineage: PublicLineage): string {
  const rows = lineage.entries.map((entry) => {
    const change = entry.change
    const counts = [
      change.addedSources > 0 ? plural(change.addedSources, 'new source') : null,
      change.addedEvidence > 0 ? plural(change.addedEvidence, 'new evidence record') : null,
      change.reEvaluatedClaims > 0 ? plural(change.reEvaluatedClaims, 're-evaluated claim') : null,
    ].filter(Boolean).join(' · ')
    const reasons = Object.entries(change.reEvaluationReasons)
      .map(([reason, n]) => `${escapeHtml(REASON_LABEL[reason] ?? reason.toLowerCase())} ${n}`)
      .join(', ')
    const current = entry.version === lineage.currentVersion
      ? ' <strong>· currently presented</strong>' : ''
    const withdrawn = entry.state === 'WITHDRAWN'
      ? ' <strong>· withdrawn</strong>' : ''
    return `<li>
<p><a class="addr" href="${escapeHtml(entry.citationHref)}">v${entry.version}</a>${current}${withdrawn}</p>
<p class="meta">${escapeHtml(TRIGGER_COPY[change.trigger] ?? change.trigger)}` +
      `${change.supersedesVersion ? ` · supersedes v${change.supersedesVersion}` : ''}` +
      `${counts ? ` · ${counts}` : ' · no new records'}` +
      `${reasons ? ` · re-evaluated for ${reasons}` : ''}` +
      ` · first published ${escapeHtml(entry.firstPublishedAt)}</p>
</li>`
  }).join('')

  return document_(`Version history · ${lineage.slug}`, `<main>
<p class="eyebrow">Version history</p>
<h1>What changed, and when</h1>
<p class="lead">This page reflects publication history and changes as new versions are
published or withdrawn. The version documents it links to do not: each one is fixed at
the moment it was published.</p>
<p>Currently presented: <a class="addr"
href="${escapeHtml(`/xray/${lineage.slug}/v${lineage.currentVersion}`)}">v${lineage.currentVersion}</a>` +
    `${lineage.currentState === 'WITHDRAWN' ? ' (withdrawn)' : ''}.</p>
<section><h2>Published versions</h2><ul class="claims">${rows}</ul></section>
<footer><p>Only versions that have been published appear here. A new receipt produces
the next version rather than rewriting an earlier one — verdicts expire, receipts
compound.</p>
<p><a href="${escapeHtml(`/xray/${lineage.slug}`)}">Back to the current X-Ray</a></p></footer>
</main>`)
}
