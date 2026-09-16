import { ExternalLinkIcon } from 'lucide-react'

import type { InvestigationView } from '@/lib/xray/projections'

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  CREATED: { dot: 'bg-gray-500', label: 'Created' },
  RUNNING: { dot: 'bg-blue-500', label: 'Researching' },
  RESEARCH_COMPLETE: { dot: 'bg-green-500', label: 'Research complete' },
  SYNTHESIZED: { dot: 'bg-green-500', label: 'Synthesized' },
  PUBLISHED: { dot: 'bg-green-500', label: 'Published' },
  FAILED: { dot: 'bg-destructive', label: 'Failed' },
}

export function InvestigationHeader({ investigation }: { investigation: InvestigationView }) {
  const status = STATUS_STYLES[investigation.status] ?? {
    dot: 'bg-gray-500',
    label: investigation.status,
  }

  let domain = investigation.surface.url ?? ''
  try {
    if (investigation.surface.url) domain = new URL(investigation.surface.url).hostname
  } catch {
    // A malformed source URL is displayed as-is rather than crashing the page.
  }

  return (
    <div className="border-b border-border pb-6">
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="flex-1">
          <p className="text-xs font-mono text-muted-foreground mb-2 uppercase tracking-wide">
            Source
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
            {investigation.surface.title}
          </h1>
          <p className="text-sm text-muted-foreground mb-3">
            {investigation.surface.publisher}
          </p>
          {investigation.surface.url && (
            <a
              href={investigation.surface.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              <span className="truncate">{domain}</span>
              <ExternalLinkIcon className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
            </a>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
              Investigation ID
            </p>
            <p className="text-lg font-mono font-semibold text-foreground">
              {investigation.investigationId}
            </p>
          </div>
          <div>
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
              Status
            </p>
            {/* Status is carried by text, not by the dot alone. */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${status.dot}`} aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">{status.label}</span>
            </div>
          </div>
          {investigation.researchCutoffAt && (
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
                Research cutoff
              </p>
              <p className="text-sm font-mono text-foreground">
                {investigation.researchCutoffAt}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-muted/30 border border-border rounded-lg p-4">
        {/*
          XR-INV-001: the surface source establishes that the claims were made.
          It is never evidence that they are true.
        */}
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">This source</span> establishes what
          was reported. X-Ray traces the evidence underneath it — the article itself never
          counts as a receipt for its own claims.
        </p>
      </div>
    </div>
  )
}
