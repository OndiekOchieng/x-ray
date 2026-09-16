import type { InvestigationView } from '@/lib/xray/projections'

const STOP_REASON_COPY: Record<string, string> = {
  SATURATION: 'Research reached its stopping conditions',
  TIME_BUDGET: 'Research stopped at its time budget',
  SOURCE_EXHAUSTION: 'Available sources were exhausted',
  COST_BUDGET: 'Research stopped at its cost budget',
  MANUAL_STOP: 'Research was stopped manually',
  ERROR: 'Research stopped after an error',
}

/**
 * Why a completed investigation stopped, and what it left undone.
 *
 * This replaces the live activity feed for investigations that are not
 * running. It is canonical state — `ResearchStop.reason` and
 * `unresolvedHighPriorityLeads` — rather than narration, and it is the honest
 * thing to show about a finished historical X-Ray: research is budget-aware,
 * not exhaustive, and the leads it did not follow stay visible.
 */
export function ResearchStopPanel({
  researchStop,
  researchCutoffAt,
}: {
  researchStop: InvestigationView['researchStop']
  researchCutoffAt?: string
}) {
  if (!researchStop) return null

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
        Where research stopped
      </h2>

      <p className="text-sm text-foreground">
        {STOP_REASON_COPY[researchStop.reason] ?? researchStop.reason}
        {researchCutoffAt && (
          <span className="text-muted-foreground"> at the {researchCutoffAt} cutoff.</span>
        )}
      </p>

      {researchStop.unresolvedHighPriorityLeads.length > 0 && (
        <>
          <p className="mt-6 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Leads not followed
          </p>
          <ul className="mt-3 space-y-2">
            {researchStop.unresolvedHighPriorityLeads.map((lead) => (
              <li
                key={lead}
                className="text-xs leading-5 text-muted-foreground border-l border-muted-foreground/20 pl-3"
              >
                {lead}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        Research is budget-aware rather than exhaustive. What was not reached stays on the
        record instead of being presented as settled.
      </p>
    </section>
  )
}
