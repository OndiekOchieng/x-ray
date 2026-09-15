import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'
import type { Investigation } from '@/lib/types'

export function CompletionState({
  investigation,
}: {
  investigation: Investigation
}) {
  return (
    <div className="border border-border rounded-lg p-8 bg-muted/30 text-center">
      <h2 className="text-2xl font-bold text-foreground mb-6">X-Ray complete</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div>
          <div className="text-2xl font-bold text-foreground">
            {investigation.claimsCount}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            claims investigated
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">
            {investigation.receiptsCount}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            receipts traced
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">3</div>
          <div className="text-xs text-muted-foreground mt-1">
            source dependencies
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">
            {investigation.gapsCount}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            unresolved gaps
          </div>
        </div>
      </div>

      <Link href={`/xray/${investigation.id}`}>
        <button className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
          Explore the evidence
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </Link>
    </div>
  )
}
