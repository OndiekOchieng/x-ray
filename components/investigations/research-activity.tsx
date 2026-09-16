'use client'

import { useEffect, useState } from 'react'

import type { StageRunView } from '@/lib/xray/projections'

/**
 * Live research activity.
 *
 * Rendered ONLY for an investigation whose status is genuinely RUNNING. The v0
 * scaffold replayed a completed historical investigation through setTimeout,
 * so a finished X-Ray appeared to be researching itself for thirteen seconds
 * on every page load.
 *
 * Every line here is derived from a StageRun. No sentence is invented: the
 * canonical graph carries no research-event narration, so none is displayed.
 */
export function ResearchActivity({ stages }: { stages: StageRunView[] }) {
  const done = stages.filter((s) => s.isComplete || s.status === 'RUNNING')
  const [visible, setVisible] = useState<StageRunView[]>([])

  useEffect(() => {
    setVisible([])
    const timers = done.map((stage, i) =>
      setTimeout(() => setVisible((prev) => [...prev, stage]), i * 400),
    )
    return () => timers.forEach(clearTimeout)
  }, [stages])

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
        Research activity
      </h2>
      <ol
        className="space-y-2 max-h-96 overflow-y-auto"
        aria-live="polite"
        aria-relevant="additions"
      >
        {visible.length === 0 && (
          <li className="text-xs text-muted-foreground italic">Starting research…</li>
        )}
        {visible.map((stage) => (
          <li
            key={stage.stageRunId}
            className="text-xs text-muted-foreground border-l border-muted-foreground/20 pl-3 py-1"
          >
            <span className="font-mono uppercase tracking-wider">{stage.stage}</span>
            <span className="ml-2">
              {stage.isComplete ? 'complete' : 'in progress'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
