'use client'

import Link from 'next/link'

import type { ClaimView, FindingView, GapView } from '@/lib/xray/projections'
import { evidenceShareCardView } from '@/lib/xray/projections'

/**
 * The evidence gaps blocking a claim.
 *
 * Links use the gap's own id. The v0 scaffold linked every gap preview to
 * `/gap/GAP-001`, so a second gap was unreachable from the explorer however
 * material it was.
 */
export function GapPreview({ gaps }: { gaps: GapView[] }) {
  if (gaps.length === 0) return null

  return (
    <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5 md:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
        {gaps.length === 1 ? 'Evidence gap' : `${gaps.length} evidence gaps`}
      </p>

      <div className="mt-5 flex flex-col gap-6">
        {gaps.map((gap) => (
          <div key={gap.gapId}>
            <h2 className="text-lg font-semibold text-foreground">{gap.missingEvidence}</h2>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Why it matters
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {gap.whyItMatters}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  What would settle it
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {gap.recordsSought[0]}
                </p>
              </div>
            </div>

            <Link
              href={`/gap/${gap.gapId}`}
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            >
              See how to resolve {gap.gapId} →
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * A shareable summary of one finding.
 *
 * Wording comes from the finding itself. A finding is a dated statement about
 * what the evidence supported at a research cutoff, so the date travels with
 * the card.
 */
export function EvidenceShareCard({
  claim,
  investigatedAt,
  protocolVersion,
}: {
  claim: ClaimView
  investigatedAt: string
  protocolVersion: string
}) {
  if (!claim.finding) return null
  const card = evidenceShareCardView(claim.finding as FindingView, {
    investigatedAt,
    protocolVersion,
  })

  return (
    <section className="rounded-2xl border border-border bg-background p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
        X-RAY · EVIDENCE CARD
      </p>

      <p className="mt-5 text-lg font-semibold leading-snug text-foreground">
        {card.claimText}
      </p>

      <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {card.statusLabel} · {card.confidenceLabel}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.establishes}</p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 font-mono text-[10px] text-muted-foreground">
        <span>
          Investigated {card.investigatedAt} · protocol {card.protocolVersion}
        </span>
        <span>
          {card.evidencePointCount} evidence{' '}
          {card.evidencePointCount === 1 ? 'point' : 'points'}
        </span>
      </div>
    </section>
  )
}
