import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'

import type { InvestigationView } from '@/lib/xray/projections'

/**
 * Completion summary.
 *
 * Every number is derived from the graph at render time. The v0 scaffold
 * hardcoded "11 receipts" beside a five-record fixture and "3 source
 * dependencies" beside none.
 *
 * The four headline stats are deliberately citizen-comprehensible. Independent
 * origin count is NOT a hero stat here — it needs the explanation the
 * provenance panel gives it, and a bare number would invite exactly the
 * misreading it exists to prevent.
 */
export function CompletionState({ investigation }: { investigation: InvestigationView }) {
  const { counts } = investigation

  const stats = [
    { value: counts.claims, label: 'claims investigated' },
    { value: counts.sources, label: 'sources traced' },
    { value: counts.evidence, label: 'evidence points' },
    { value: counts.openGaps, label: 'unresolved gaps' },
  ]

  return (
    <section className="border border-border rounded-lg p-8 bg-muted/30 text-center">
      <h2 className="text-2xl font-bold text-foreground mb-6">X-Ray complete</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <Link
        href={`/investigations/${investigation.investigationId}`}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
      >
        Explore the evidence
        <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
