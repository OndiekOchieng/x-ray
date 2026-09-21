import { CheckCircle2Icon, CircleIcon, LoaderIcon, XCircleIcon } from 'lucide-react'

import type { StageRunView } from '@/lib/xray/projections'

/** Human wording for each canonical pipeline stage. */
const STAGE_COPY: Record<string, { name: string; description: string }> = {
  INGEST: { name: 'Ingesting source', description: 'Parsing the article and extracting text' },
  DECOMPOSE: { name: 'Decomposing claims', description: 'Separating independently testable assertions' },
  CLASSIFY: { name: 'Classifying claims', description: 'Recording type, layer and ambiguity' },
  PLAN: { name: 'Planning evidence search', description: 'Naming the records that would settle each claim' },
  TRACE: { name: 'Tracing receipts', description: 'Locating records and extracting propositions' },
  PROVENANCE: { name: 'Mapping evidence origin', description: 'Testing which records are independent' },
  DISCONFIRM: { name: 'Searching counterevidence', description: 'Trying to break the emerging findings' },
  RECONCILE: { name: 'Reconciling discrepancies', description: 'Testing scope and definition before contradiction' },
  GRADE: { name: 'Grading evidence', description: 'Recording what the evidence establishes' },
  GAPS: { name: 'Identifying gaps', description: 'Naming what is missing and what would settle it' },
  VALIDATE: { name: 'Validating the graph', description: 'Checking invariants before publication' },
  SYNTHESIZE: { name: 'Synthesizing', description: 'Producing the citizen-facing X-Ray' },
  RESOLVE: { name: 'Resolution actions', description: 'Turning eligible gaps into record requests' },
}

const STATUS_TEXT: Record<StageRunView['status'], string> = {
  SUCCEEDED: 'Complete',
  RUNNING: 'In progress',
  PENDING: 'Not run',
  FAILED: 'Failed',
}

export function PipelineStageComponent({ stage }: { stage: StageRunView }) {
  const copy = STAGE_COPY[stage.stage] ?? { name: stage.stage, description: '' }
  const dim = stage.isPending

  return (
    <li className="flex items-center gap-3">
      <div className="relative w-8 h-8 flex-shrink-0">
        {stage.isComplete && (
          <CheckCircle2Icon className="w-8 h-8 text-green-500" aria-hidden="true" />
        )}
        {stage.status === 'RUNNING' && (
          <LoaderIcon className="w-8 h-8 text-blue-500 animate-spin" aria-hidden="true" />
        )}
        {stage.isPending && (
          <CircleIcon className="w-8 h-8 text-muted-foreground/30" aria-hidden="true" />
        )}
        {stage.isFailed && (
          <XCircleIcon className="w-8 h-8 text-destructive" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3
            className={`text-sm font-medium ${dim ? 'text-muted-foreground' : 'text-foreground'}`}
          >
            {copy.name}
          </h3>
          {/* Status in words, not colour alone. */}
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            {STATUS_TEXT[stage.status]}
          </span>
        </div>
        <p className={`text-xs ${dim ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>
          {copy.description}
        </p>
        {stage.error && <p className="mt-1 text-xs text-destructive">{stage.error}</p>}
      </div>
    </li>
  )
}
