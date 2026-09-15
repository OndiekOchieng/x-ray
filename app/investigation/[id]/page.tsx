'use client'

import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { InvestigationHeader } from '@/components/investigations/investigation-header'
import { InvestigationPipeline } from '@/components/investigations/investigation-pipeline'
import { ResearchActivity } from '@/components/investigations/research-activity'
import { ClaimsDisplay } from '@/components/investigations/claims-display'
import { CompletionState } from '@/components/investigations/completion-state'
import { mamboleoInvestigation } from '@/lib/data/fixture'

export default function InvestigationPage() {
  const [started] = useState(true)
  const investigation = useMemo(() => mamboleoInvestigation, [])

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <InvestigationHeader investigation={investigation} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] py-8">
          <div className="flex flex-col gap-10">
            <InvestigationPipeline stages={investigation.stages} />
            <ClaimsDisplay claims={investigation.claims} investigationStarted={started} />
          </div>

          <aside className="lg:border-l lg:border-border lg:pl-8">
            <ResearchActivity events={investigation.events} investigationStarted={started} />
          </aside>
        </div>

        <CompletionState investigation={investigation} />
      </div>
    </AppShell>
  )
}

