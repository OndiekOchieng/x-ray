import { PipelineStageComponent } from './pipeline-stage'
import type { StageRunView } from '@/lib/xray/projections'

/**
 * The canonical thirteen-stage pipeline, projected from StageRun records.
 *
 * Stages the investigation did not run render as "Not run" rather than being
 * hidden — for XRAY-KE-001 that is VALIDATE, SYNTHESIZE and RESOLVE, which
 * neither benchmark run performed.
 */
export function InvestigationPipeline({
  stages,
  isRunning,
}: {
  stages: StageRunView[]
  isRunning: boolean
}) {
  const completed = stages.filter((s) => s.isComplete).length

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Investigation progress
        </h2>
        <p className="text-xs font-mono text-muted-foreground">
          {completed} of {stages.length} stages complete
        </p>
      </div>

      <ol className="space-y-3" aria-live={isRunning ? 'polite' : 'off'}>
        {stages.map((stage, idx) => (
          <li key={stage.stageRunId} className="list-none">
            <ol className="list-none">
              <PipelineStageComponent stage={stage} />
            </ol>
            {idx < stages.length - 1 && (
              <div
                className="pl-4 mt-3 ml-3 h-3 border-l border-muted-foreground/20"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
