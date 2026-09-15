import { AppShell } from '@/components/layout/app-shell'
import { SourceInput } from '@/components/investigations/source-input'
import { CachedXRayCard } from '@/components/investigations/cached-xray-card'

export default function Page() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        {/* Hero Section */}
        <div className="mb-12 md:mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight">
            See what a civic claim is standing on.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Paste a public article or source. X-Ray traces the claims, receipts,
            provenance, contradictions and missing evidence underneath it.
          </p>

          {/* Process visualization */}
          <div className="flex flex-wrap items-center gap-2 mb-12 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Process:</span>
            <span>Claim</span>
            <span className="text-muted-foreground/50">→</span>
            <span>Receipts</span>
            <span className="text-muted-foreground/50">→</span>
            <span>Provenance</span>
            <span className="text-muted-foreground/50">→</span>
            <span>Gaps</span>
            <span className="text-muted-foreground/50">→</span>
            <span>Action</span>
          </div>
        </div>

        {/* Input Section */}
        <div className="mb-16">
          <SourceInput />
        </div>

        {/* Featured Investigation */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">
            Featured Investigation
          </h2>
          <CachedXRayCard />
        </div>
      </div>
    </AppShell>
  )
}
