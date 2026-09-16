'use client'

import { useEffect, useState } from 'react'

import { ClaimPreview } from './claim-preview'
import type { ClaimSummaryView } from '@/lib/xray/projections'

/**
 * Claims decomposed from the source.
 *
 * For a completed investigation every claim is visible immediately. The
 * progressive reveal runs only while an investigation is genuinely RUNNING —
 * previously it ran always, so a finished X-Ray showed an empty claims panel
 * for the first two seconds of every visit.
 */
export function ClaimsDisplay({
  claims,
  isRunning,
}: {
  claims: ClaimSummaryView[]
  isRunning: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(isRunning ? 0 : claims.length)

  useEffect(() => {
    if (!isRunning) {
      setVisibleCount(claims.length)
      return
    }
    setVisibleCount(0)
    const timers = claims.map((_, i) =>
      setTimeout(() => setVisibleCount((prev) => Math.max(prev, i + 1)), (i + 1) * 600),
    )
    return () => timers.forEach(clearTimeout)
  }, [claims, isRunning])

  if (claims.length === 0) return null

  const surfaceCount = claims.filter((c) => !c.isDiscovered).length
  const discoveredCount = claims.length - surfaceCount

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-2 uppercase tracking-wide">
        Claims {isRunning ? `(${visibleCount} of ${claims.length})` : `(${claims.length})`}
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {surfaceCount} decomposed from the source
        {discoveredCount > 0 && ` · ${discoveredCount} discovered while tracing evidence`}
      </p>

      <div className="space-y-3">
        {claims.slice(0, visibleCount).map((claim) => (
          <ClaimPreview key={claim.claimId} claim={claim} />
        ))}
      </div>
    </section>
  )
}
