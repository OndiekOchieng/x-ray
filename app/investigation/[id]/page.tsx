import { notFound } from 'next/navigation'

import { AppShell } from '@/components/layout/app-shell'
import { InvestigationHeader } from '@/components/investigations/investigation-header'
import { InvestigationPipeline } from '@/components/investigations/investigation-pipeline'
import { ResearchActivity } from '@/components/investigations/research-activity'
import { ResearchStopPanel } from '@/components/investigations/research-stop-panel'
import { ClaimsDisplay } from '@/components/investigations/claims-display'
import { CompletionState } from '@/components/investigations/completion-state'
import { ExecutionStatePanel } from '@/components/investigations/execution-state-panel'
import { getExecutionStateView, getProgressPayload } from '@/lib/xray/investigations'

/**
 * Dynamic, exactly as before Cache Components was enabled.
 *
 * This route already rendered per request. `instant = false` declares that
 * under the new prerender rules rather than changing what it does: the #9
 * cache boundary is the immutable public version projection, not an
 * internal page.
 */
export const instant = false

export default async function InvestigationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ run?: string }>
}) {
  const { id } = await params
  const { run } = await searchParams

  // A fresh submission arrives here with its run named, and a fresh
  // investigation has no committed graph at all — so the run is read first.
  // Requiring a graph would not-found exactly the case this surface exists to
  // show: a submission whose research could not be done.
  const execution = run ? await getExecutionStateView(id, run) : null
  const payload = await getProgressPayload(id)

  // Nothing known about this id under either question.
  if (!payload && !execution) notFound()

  // A real submission whose research produced no graph. Report the run, and
  // nothing about the source.
  if (!payload && execution) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Submitted investigation
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground md:text-3xl">
            {execution.investigationId}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This source was submitted and an investigation was created for it. No research
            state exists yet, so there is nothing about the source to show.
          </p>
          <div className="mt-8">
            <ExecutionStatePanel state={execution} />
          </div>
        </div>
      </AppShell>
    )
  }

  const { investigation, claims } = payload!
  const isRunning = execution ? execution.inProgress : investigation.status === 'RUNNING'

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <InvestigationHeader investigation={investigation} />

        {execution && (
          <div className="py-6">
            <ExecutionStatePanel state={execution} />
          </div>
        )}

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

        {/*
          Completion state belongs to a completed investigation, not to a run
          that could not run. A capability-blocked run committed nothing, so
          presenting a completion summary beside it would be the exact
          conflation this slice exists to prevent.
        */}
        {!isRunning && execution === null && <CompletionState investigation={investigation} />}
      </div>
    </AppShell>
  )
}
