import type { Claim } from '@/lib/types'

const categoryColors: Record<string, { bg: string; text: string }> = {
  QUANTITATIVE: { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300' },
  FINANCIAL: { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300' },
  DELIVERY: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300' },
  TIMELINE: { bg: 'bg-purple-500/10', text: 'text-purple-700 dark:text-purple-300' },
}

export function ClaimPreview({ claim }: { claim: Claim }) {
  const colors = categoryColors[claim.category] || categoryColors.QUANTITATIVE

  return (
    <div className="border border-border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm text-foreground leading-relaxed">{claim.text}</p>
        <span
          className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap flex-shrink-0 ${colors.bg} ${colors.text}`}
        >
          {claim.category}
        </span>
      </div>

      {claim.sources.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Sources:</span> {claim.sources.join(', ')}
        </div>
      )}
    </div>
  )
}
