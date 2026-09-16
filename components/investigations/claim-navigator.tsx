'use client'

import type { ClaimSummaryView } from '@/lib/xray/projections'
import { cn } from '@/lib/utils'

/**
 * Claim sidebar.
 *
 * Renders canonical ids (C001 … DC002). The v0 scaffold manufactured
 * positional labels — `C${index + 1}` — so the discovered claim displayed as
 * "C005", occupying a reserved surface-claim identifier that XR-INV-012 sets
 * aside.
 */
export function ClaimNavigator({
  claims,
  selectedId,
  onSelect,
}: {
  claims: ClaimSummaryView[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav
      className="flex flex-col gap-2 lg:sticky lg:top-32 lg:self-start"
      aria-label="Claims in this investigation"
    >
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Claims in view
      </p>

      {claims.map((claim) => {
        const isSelected = claim.claimId === selectedId
        return (
          <button
            key={claim.claimId}
            type="button"
            onClick={() => onSelect(claim.claimId)}
            aria-pressed={isSelected}
            aria-current={isSelected ? 'true' : undefined}
            className={cn(
              'rounded-xl border p-4 text-left transition-colors',
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] text-muted-foreground">
                {claim.claimId}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {claim.isDiscovered ? 'Discovered' : claim.type}
              </span>
            </div>

            <p className="text-sm font-medium leading-snug text-foreground">{claim.text}</p>

            {claim.findingStatusLabel && (
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                {claim.findingStatusLabel}
              </p>
            )}
          </button>
        )
      })}

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        <span className="font-medium text-foreground">DC</span> claims were discovered while
        tracing evidence for the others. They are kept in a separate numbering so research
        discovery never overwrites a claim taken from the source.
      </p>
    </nav>
  )
}
