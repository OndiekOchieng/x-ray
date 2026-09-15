import { ExternalLinkIcon } from 'lucide-react'
import type { Investigation } from '@/lib/types'

export function InvestigationHeader({
  investigation,
}: {
  investigation: Investigation
}) {
  const domain = new URL(investigation.sourceUrl).hostname

  return (
    <div className="border-b border-border pb-6">
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="flex-1">
          <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">
            Source
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            {investigation.articleTitle}
          </h1>
          <p className="text-sm text-muted-foreground mb-3">
            {investigation.sourcePublisher}
          </p>
          <a
            href={investigation.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <span className="truncate">{domain}</span>
            <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" />
          </a>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
              Investigation ID
            </p>
            <p className="text-lg font-mono font-semibold text-foreground">
              {investigation.id}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
              Status
            </p>
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${investigation.status === 'completed' ? 'bg-green-500' : investigation.status === 'active' ? 'bg-blue-500' : 'bg-gray-500'}`}
              />
              <span className="text-sm font-medium text-foreground capitalize">
                {investigation.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted/30 border border-border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">This source</span>{' '}
          establishes what was reported. X-Ray is now tracing the evidence
          underneath it.
        </p>
      </div>
    </div>
  )
}
