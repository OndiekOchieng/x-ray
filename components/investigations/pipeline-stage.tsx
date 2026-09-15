'use client'

import { CheckCircle2Icon, Circle, LoaderIcon } from 'lucide-react'
import type { PipelineStage } from '@/lib/types'

export function PipelineStageComponent({
  stage,
}: {
  stage: PipelineStage
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-8 h-8 flex-shrink-0">
        {stage.status === 'completed' && (
          <CheckCircle2Icon className="w-8 h-8 text-green-500" />
        )}
        {stage.status === 'active' && (
          <LoaderIcon className="w-8 h-8 text-blue-500 animate-spin" />
        )}
        {stage.status === 'pending' && (
          <Circle className="w-8 h-8 text-muted-foreground/30" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4
          className={`text-sm font-medium ${
            stage.status === 'pending'
              ? 'text-muted-foreground'
              : 'text-foreground'
          }`}
        >
          {stage.name}
        </h4>
        <p
          className={`text-xs ${
            stage.status === 'pending'
              ? 'text-muted-foreground/60'
              : 'text-muted-foreground'
          }`}
        >
          {stage.description}
        </p>
      </div>
    </div>
  )
}
