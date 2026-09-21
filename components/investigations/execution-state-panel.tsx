/**
 * One execution run, reported truthfully (#11 slice 11b).
 *
 * Every sentence comes from `ExecutionStateView`. The panel adds structure and
 * no prose, for the same reason the ATI surface does not author its own: what
 * may be said about a run that could not run is a policy question, not a
 * styling one.
 *
 * Status is a word before it is a colour, and the stages that did not run are
 * listed by name rather than implied by a missing tick.
 */

import type { ExecutionStateView } from '@/lib/xray/projections/execution-state'

export function ExecutionStatePanel({ state }: { state: ExecutionStateView }) {
  return (
    <section
      className="rounded-2xl border border-border bg-card p-6"
      aria-labelledby="execution-state-heading"
      role="status"
    >
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        This run
      </p>
      <h2 id="execution-state-heading" className="mt-2 text-xl font-semibold text-foreground">
        {state.statusLabel}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{state.explanation}</p>

      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        Run {state.executionRunId}
        {state.committedVersion === null
          ? ' · no version committed'
          : ` · committed version ${state.committedVersion}`}
      </p>

      {state.stagesNotRun.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Scheduled and did not run
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {state.stagesNotRun.map((stage) => (
              <li
                key={stage}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] text-foreground"
              >
                {stage}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.stages.length > 0 && (
        <ol className="mt-4 space-y-1">
          {state.stages.map((stage) => (
            <li key={stage.stage} className="font-mono text-[10px] text-muted-foreground">
              {stage.stage} — {stage.label}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
