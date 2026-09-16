'use client'

import type { ClaimView, ReceiptView } from '@/lib/xray/projections'

/**
 * What a finding is standing on.
 *
 * Receipts are grouped by their relationship to the claim, so a reader can see
 * at a glance that C003 has no supporting record at all — which is the finding,
 * not a rendering gap.
 */
const GROUPS: { key: 'supporting' | 'opposing' | 'contextual'; label: string }[] = [
  { key: 'supporting', label: 'Supports' },
  { key: 'opposing', label: 'Challenges' },
  { key: 'contextual', label: 'Context' },
]

export function EvidenceGraph({
  claim,
  onSelect,
}: {
  claim: ClaimView
  onSelect: (evidenceId: string) => void
}) {
  const total = claim.supporting.length + claim.opposing.length + claim.contextual.length

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Evidence
          </p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">
            What this finding is standing on
          </h2>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {total} evidence {total === 1 ? 'point' : 'points'}
        </span>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="max-w-sm rounded-xl border border-primary/40 bg-primary/5 px-5 py-3 text-center text-sm font-semibold text-foreground">
          {claim.text}
        </div>
        <div className="h-5 w-px bg-border" aria-hidden="true" />

        <div className="flex w-full flex-col gap-5">
          {GROUPS.map(({ key, label }) => {
            const receipts = claim[key] as ReceiptView[]
            if (receipts.length === 0) return null
            return (
              <div key={key}>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {label} · {receipts.length}
                </p>
                <div className="grid w-full gap-3 md:grid-cols-3">
                  {receipts.map((receipt) => (
                    <button
                      key={receipt.evidenceId}
                      type="button"
                      onClick={() => onSelect(receipt.evidenceId)}
                      className="rounded-xl border border-border bg-background p-4 text-left hover:border-primary/50"
                    >
                      <p className="text-xs font-semibold text-foreground">{receipt.title}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {receipt.institution ?? receipt.publisher}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {receipt.strengthLabel}
                        {!receipt.wasObtained && ' · not obtained'}
                      </p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-primary">
                        Inspect receipt →
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {claim.supporting.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No located record supports this claim.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
