import type { DisconfirmationView } from '@/lib/xray/projections'

/**
 * How X-Ray tried to break its own finding.
 *
 * Rendered whenever the claim has a disconfirmation record, rather than for
 * one hardcoded claim.
 */
export function DisconfirmationPanel({ data }: { data: DisconfirmationView }) {
  return (
    <details className="rounded-2xl border border-border bg-card">
      <summary className="cursor-pointer p-5 text-sm font-semibold text-foreground md:p-7">
        How we tried to break this finding
      </summary>

      <div className="grid gap-5 border-t border-border p-5 md:grid-cols-2 md:p-7">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Preliminary hypothesis
          </p>
          <p className="mt-2 text-sm text-foreground">{data.preliminaryHypothesis}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Counter-hypothesis
          </p>
          <p className="mt-2 text-sm text-foreground">{data.counterHypothesis}</p>
        </div>

        {data.searchStrategy.length > 0 && (
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              What was searched
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {data.searchStrategy.map((item) => (
                <li key={item} className="text-sm text-muted-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="md:col-span-2 border-t border-border pt-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Result · {data.resultLabel}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {data.effectOnFinding}
          </p>
        </div>
      </div>
    </details>
  )
}
