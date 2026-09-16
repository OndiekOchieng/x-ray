'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, CheckIcon, ClipboardIcon, DownloadIcon, FileTextIcon, Share2Icon } from 'lucide-react'

import { AppShell } from '@/components/layout/app-shell'
import type { GapPayload } from '@/lib/xray/investigations'
import { atiDraftFor, gapShareView } from '@/lib/xray/projections'
import { copyText, downloadText } from '@/lib/browser'

const LINEAGE = ['Claim', 'Finding', 'Gap', 'What would settle it', 'Likely holder']

/**
 * A missing record, and what could be done about it.
 *
 * The resolution path is canonical research state, not a user preference. The
 * v0 scaffold rendered it as a set of buttons that mutated component state, so
 * a reader could make a gap ATI-eligible by clicking — here it is displayed as
 * the determination it is.
 */
export function GapDetail({ payload }: { payload: GapPayload }) {
  const { gap, investigationId, investigationTitle } = payload
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [editing, setEditing] = useState(false)

  const draft = useMemo(() => atiDraftFor(gap), [gap])
  const [draftBody, setDraftBody] = useState(draft?.body ?? '')

  const share = useMemo(
    () => gapShareView(gap, { investigatedAt: gap.gapId }),
    [gap],
  )

  async function handleCopy(text: string) {
    await copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={`/xray/${investigationId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Back to evidence explorer
        </Link>

        <header className="border-b border-border pb-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Gap → action · {gap.gapId}
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">
                {gap.missingEvidence}
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                A missing document is structured product state, not research failure.
              </p>
            </div>

            <span className="rounded-full border border-border bg-muted px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground">
              {gap.statusLabel}
            </span>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {LINEAGE.map((item, index) => (
              <span
                key={item}
                className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {index > 0 && <span className="text-primary">→</span>}
                {item}
              </span>
            ))}
          </div>
        </header>

        <main className="grid gap-8 py-10 lg:grid-cols-[1fr_300px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-2xl border border-border bg-card p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Why it matters
              </p>
              <p className="mt-3 leading-7 text-muted-foreground">{gap.whyItMatters}</p>

              <div className="mt-6 border-t border-border pt-5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Effect on the finding
                </p>
                <p className="mt-3 leading-7 text-muted-foreground">{gap.effectOnFinding}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  What would settle it?
                </p>
                <FileTextIcon className="size-6 text-primary" aria-hidden="true" />
              </div>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {gap.recordsSought.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Where X-Ray already looked
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {gap.searchAlreadyAttempted.map((item) => (
                  <li key={item} className="text-sm leading-6 text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Not finding a record is not evidence that it does not exist. This is what the
                search covered, so you can judge how much the absence tells you.
              </p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Resolution path
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{gap.resolutionPathLabel}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                {gap.atiEligible
                  ? 'This gap concerns a record a public body should hold, so it can become an access-to-information request.'
                  : 'This gap requires post-event evidence, so an information request is not appropriate yet. X-Ray is waiting for a record of what happened rather than asking for one that may not yet have been created.'}
              </p>
            </section>

            {draft ? (
              <section className="rounded-2xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                      Draft request
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">Built from the evidence trail</h2>
                    <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                      {draft.submissionDisclaimer}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(draftBody)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      <ClipboardIcon className="size-4" aria-hidden="true" />
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadText(draft.filename, draftBody)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      <DownloadIcon className="size-4" aria-hidden="true" />
                      Download
                    </button>
                  </div>
                </div>

                {draft.holderIsInferred && (
                  <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-foreground">
                    X-Ray inferred the likely custodian from the evidence trail; it has not
                    confirmed that this body holds the record. The draft says so, so the
                    recipient can redirect it.
                  </p>
                )}

                <div className="mt-5 rounded-xl border border-border bg-background p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="rounded-full bg-primary/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-primary">
                      {draft.status} · {draft.jurisdictionNote}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing((v) => !v)}
                      aria-expanded={editing}
                      className="text-xs text-muted-foreground underline underline-offset-4"
                    >
                      {editing ? 'Preview' : 'Edit draft'}
                    </button>
                  </div>

                  <p className="mb-3 text-sm font-semibold text-foreground">{draft.subject}</p>

                  {editing ? (
                    <textarea
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                      aria-label="Editable draft request"
                      className="min-h-80 w-full resize-y rounded-lg border border-border bg-card p-4 font-mono text-xs leading-6 text-foreground outline-none focus:border-primary"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-muted-foreground">
                      {draftBody}
                    </pre>
                  )}
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-border bg-card p-6">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Next step
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{gap.resolutionPathLabel}</h2>
                <p className="mt-3 leading-7 text-muted-foreground">
                  No information request is drafted for this gap. It needs post-event evidence,
                  so X-Ray is waiting rather than requesting; the records that would settle it
                  are listed above.
                </p>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-muted/30 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Responsible share
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{share.headline}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {share.responsibilityNote}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await handleCopy(share.shareText)
                    setShared(true)
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
                >
                  <Share2Icon className="size-4" aria-hidden="true" />
                  {shared ? 'Share text copied' : 'Share gap'}
                </button>
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            {gap.likelyHolder && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Likely record holder
                </p>
                <h2 className="mt-3 text-lg font-semibold leading-6">
                  {gap.likelyHolder.institution}
                </h2>
                {gap.likelyHolder.office && (
                  <p className="mt-1 text-sm text-muted-foreground">{gap.likelyHolder.office}</p>
                )}
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {gap.likelyHolder.basisLabel}.
                  {gap.likelyHolder.isInferred &&
                    ' This is a research conclusion about likely custody, not a confirmed contact.'}
                </p>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Blocks {gap.claims.length === 1 ? 'this claim' : 'these claims'}
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {gap.claims.map((claim) => (
                  <li key={claim.claimId} className="text-sm leading-5 text-foreground">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {claim.claimId}
                    </span>
                    <br />
                    {claim.text}
                  </li>
                ))}
              </ul>

              {gap.identifiers.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Identifiers
                  </p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {gap.identifiers.map((item) => (
                      <li key={item} className="text-xs text-foreground">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <p className="text-xs leading-5 text-muted-foreground">
              From{' '}
              <Link href={`/xray/${investigationId}`} className="text-primary hover:underline">
                {investigationTitle}
              </Link>
            </p>

            <Link
              href="/library"
              className="inline-flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-muted"
            >
              View cached X-Rays
            </Link>
          </aside>
        </main>
      </div>
    </AppShell>
  )
}
