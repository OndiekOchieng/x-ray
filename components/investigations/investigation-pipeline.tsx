'use client'

import { PipelineStageComponent } from './pipeline-stage'
import type { PipelineStage } from '@/lib/types'

export function InvestigationPipeline({
  stages,
}: {
  stages: PipelineStage[]
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
        Investigation Progress
      </h2>
      <div className="space-y-3">
        {stages.map((stage, idx) => (
          <div key={stage.id}>
            <PipelineStageComponent stage={stage} />
            {idx < stages.length - 1 && (
              <div className="pl-4 mt-3 ml-3 h-3 border-l border-muted-foreground/20" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
