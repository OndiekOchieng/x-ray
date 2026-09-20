import { notFound } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { InvestigationHeader } from '@/components/investigations/investigation-header'
import { InvestigationPipeline } from '@/components/investigations/investigation-pipeline'
import { ResearchActivity } from '@/components/investigations/research-activity'
import { ResearchStopPanel } from '@/components/investigations/research-stop-panel'
import { ClaimsDisplay } from '@/components/investigations/claims-display'
import { CompletionState } from '@/components/investigations/completion-state'
import { getProgressPayload } from '@/lib/xray/investigations'

export default async function InvestigationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const payload = await getProgressPayload(id)

  // An unknown id is not-found. It never falls back to another investigation.
  if (!payload) notFound()

  const { investigation, claims } = payload
  const isRunning = investigation.status === 'RUNNING'

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <InvestigationHeader investigation={investigation} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] py-8">
          <div className="flex flex-col gap-10">
            <InvestigationPipeline stages={investigation.stages} isRunning={isRunning} />
            <ClaimsDisplay claims={claims} isRunning={isRunning} />
          </div>

          <aside className="lg:border-l lg:border-border lg:pl-8">
            {/*
              XRAY-KE-001 is a completed historical investigation. The live
              activity feed runs only for an investigation that is genuinely
              RUNNING; a completed one shows why research stopped instead.
            */}
            {isRunning ? (
              <ResearchActivity stages={investigation.stages} />
            ) : (
              <ResearchStopPanel
                researchStop={investigation.researchStop}
                researchCutoffAt={investigation.researchCutoffAt}
              />
            )}
          </aside>
        </div>

        {!isRunning && <CompletionState investigation={investigation} />}
      </div>
    </AppShell>
  )
}
