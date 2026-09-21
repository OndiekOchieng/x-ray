import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'

import type { LibraryCard } from '@/lib/xray/publication/library-card'

/**
 * A cached X-Ray, summarised.
 *
 * Counts come from the graph. The v0 scaffold hardcoded 5 / 11 / 2 into the
 * markup, so the card kept reporting eleven receipts against a five-record
 * fixture.
 */
export function CachedXRayCard({ entry }: { entry: LibraryCard }) {
  const stats = [
    { value: entry.claimCount, label: 'claims' },
    { value: entry.receiptCount, label: 'evidence points' },
    { value: entry.openGapCount, label: 'open gaps' },
  ]

  return (
    <Link href={entry.href} className="group block">
      <div className="rounded-lg border border-border p-6 transition-colors hover:bg-muted/50">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <h3 className="mb-1 text-lg font-semibold text-foreground">{entry.title}</h3>
            <p className="text-sm text-muted-foreground">{entry.surfacePublisher}</p>
          </div>
          <span className="ml-4 rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {`v${entry.version}`}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-border py-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Investigated {(entry.investigatedAt ?? entry.publishedAt).slice(0, 10)}
          </p>
          <div className="flex items-center gap-2 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
            Explore X-Ray
            <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </div>
    </Link>
  )
}
