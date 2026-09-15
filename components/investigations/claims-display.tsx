'use client'

import { useEffect, useState } from 'react'
import { ClaimPreview } from './claim-preview'
import type { Claim } from '@/lib/types'

export function ClaimsDisplay({
  claims,
  investigationStarted,
}: {
  claims: Claim[]
  investigationStarted: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (!investigationStarted) return

    // Progressive reveal of claims
    const claimIntervals = claims.map((claim, index) => {
      return setTimeout(
        () => {
          setVisibleCount((prev) => Math.min(prev + 1, claims.length))
        },
        claim.discoveredAt + 500
      )
    })

    return () => claimIntervals.forEach(clearTimeout)
  }, [investigationStarted, claims])

  if (visibleCount === 0) return null

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
        Discovered Claims ({visibleCount} of {claims.length})
      </h2>
      <div className="space-y-3">
        {claims.slice(0, visibleCount).map((claim, idx) => (
          <div
            key={claim.id}
            className="animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <ClaimPreview claim={claim} />
          </div>
        ))}
      </div>
    </div>
  )
}
