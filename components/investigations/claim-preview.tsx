import type { ClaimSummaryView } from '@/lib/xray/projections'

/** Colour per canonical ClaimType. Unknown types get a neutral chip, never another type's. */
const TYPE_STYLES: Record<string, string> = {
  QUANTITATIVE: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  FINANCIAL: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  GEOGRAPHIC: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
  DELIVERY: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  TIMELINE: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  ATTRIBUTION: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
  LEGAL: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  OTHER: 'bg-muted text-muted-foreground',
}

const NEUTRAL = 'bg-muted text-muted-foreground'

export function ClaimPreview({ claim }: { claim: ClaimSummaryView }) {
  return (
    <article className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {/* Canonical id, never a positional label. */}
            <span className="font-mono text-[10px] text-muted-foreground">{claim.claimId}</span>
            {claim.isDiscovered && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
                Discovered
              </span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{claim.text}</p>
        </div>
        <span
          className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap flex-shrink-0 ${
            TYPE_STYLES[claim.type] ?? NEUTRAL
          }`}
        >
          {claim.type}
        </span>
      </div>

      {claim.findingStatusLabel && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{claim.findingStatusLabel}</span>
          {claim.confidenceLabel && <span> · {claim.confidenceLabel}</span>}
        </p>
      )}
    </article>
  )
}
