/**
 * The ATI action surface (#10 slice 10e).
 *
 * WHY THIS COMPONENT AUTHORS NO PROSE
 * ===================================
 * Every user-visible sentence comes from `ATIRequestSurface`. Nothing here
 * writes its own: the responsible-share wording constraints are product
 * policy, and policy in JSX cannot be tested. The only strings below are
 * structural section headings.
 *
 * WHAT THE MARKUP HAS TO CARRY
 * ============================
 * Status is never conveyed by colour alone — every state that has a colour
 * also has a word, and inferred custody is labelled as inferred rather than
 * merely tinted. Actions are real buttons with accessible names, and an
 * unavailable action states why in text rather than being silently inert.
 */

import type {
  ATIIntakeSurface, ATIProcessingSurface, ATIRequestSurface, ATIResponseSurface,
} from '@/lib/xray/projections/ati-surface'

const CARD = 'rounded-2xl border border-border bg-card p-6'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-widest text-muted-foreground'

export interface AtiRequestPanelProps {
  surface: ATIRequestSurface
  /** The outcome of research over one of this request's records, if any. */
  processing?: ATIProcessingSurface
}

export function AtiRequestPanel({ surface, processing }: AtiRequestPanelProps) {
  const { origin, holder, filing, timeline, responses, actions } = surface

  return (
    <section className={CARD} aria-labelledby={`ati-${surface.requestId}`}>
      <header>
        <p className={EYEBROW}>Information request</p>
        <h2 id={`ati-${surface.requestId}`} className="mt-2 text-2xl font-semibold">
          {surface.requestId}
        </h2>

        {/* The permanent anchor. Never the latest version. */}
        <p className="mt-2 font-mono text-xs text-muted-foreground">{origin.label}</p>
        {origin.laterResearchNote && (
          <p className="mt-1 text-xs text-muted-foreground">{origin.laterResearchNote}</p>
        )}
      </header>

      {/* Filing state. The word carries the state; the border only decorates. */}
      <div className="mt-5 rounded-xl border border-border bg-background p-5">
        <p className="text-sm font-semibold text-foreground">{filing.statusLabel}</p>
        {filing.exportedRevisionLabel && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {filing.exportedRevisionLabel}
          </p>
        )}
        {filing.filedNote && (
          <p className="mt-1 text-xs text-muted-foreground">{filing.filedNote}</p>
        )}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{filing.notFiledNotice}</p>
      </div>

      {/* Custody, with its basis in words. */}
      <div className="mt-5">
        <p className={EYEBROW}>{holder.label}</p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {holder.institution}
          {holder.office ? ` — ${holder.office}` : ''}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{holder.note}</p>
        {holder.rationale && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{holder.rationale}</p>
        )}
      </div>

      <div className="mt-5">
        <p className={EYEBROW}>Records requested</p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {surface.requestedRecords.map((record) => (
            <li key={record}>{record}</li>
          ))}
        </ul>
      </div>

      {/* History, not just status. */}
      <div className="mt-6">
        <p className={EYEBROW}>What has happened</p>
        <ol className="mt-2 space-y-2">
          {timeline.map((entry) => (
            <li key={entry.key} className="text-sm">
              <span className="text-foreground">{entry.label}</span>
              <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                {entry.occurredAt}
              </span>
              {entry.detail && (
                <span className="ml-2 text-xs text-muted-foreground">{entry.detail}</span>
              )}
            </li>
          ))}
        </ol>
      </div>

      {responses.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className={EYEBROW}>Responses</p>
          {responses.map((response) => (
            <ResponseBlock key={response.sequence} response={response} />
          ))}
        </div>
      )}

      {processing && <ProcessingBlock processing={processing} />}

      {/* Actions. An unavailable one says why, in words. */}
      <div className="mt-6">
        <p className={EYEBROW}>Actions</p>
        <ul className="mt-2 space-y-2">
          {actions.map((action) => (
            <li key={action.id}>
              <button
                type="button"
                disabled={!action.available}
                aria-disabled={!action.available}
                aria-describedby={
                  action.unavailableReason ? `ati-why-${action.id}` : undefined
                }
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {action.label}
              </button>
              {action.unavailableReason && (
                <span
                  id={`ati-why-${action.id}`}
                  className="ml-2 text-xs text-muted-foreground"
                >
                  {action.unavailableReason}
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {filing.confirmationStatement}
        </p>
      </div>

      {/* What the action record does not say about the evidence. */}
      <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        {surface.gapStatusNote}
      </p>
    </section>
  )
}

function ResponseBlock({ response }: { response: ATIResponseSurface }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-[10px] text-muted-foreground">
          {response.receivedAt}
        </span>
        <span className="text-xs text-foreground">{response.completenessLabel}</span>
      </div>
      {response.summary && (
        <p className="mt-2 text-sm text-muted-foreground">{response.summary}</p>
      )}
      {response.afterClosureNote && (
        <p className="mt-2 text-xs text-muted-foreground">{response.afterClosureNote}</p>
      )}
      <ul className="mt-3 space-y-3">
        {response.intakes.map((intake) => (
          <IntakeRow key={intake.intakeId} intake={intake} />
        ))}
      </ul>
    </div>
  )
}

function IntakeRow({ intake }: { intake: ATIIntakeSurface }) {
  return (
    <li className="border-l border-border pl-3">
      <p className={EYEBROW}>{intake.receiptLabel}</p>
      <p className="mt-1 text-sm text-foreground">{intake.describedAs}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {intake.researchLabel}
        {intake.mediaType ? ` · ${intake.mediaType}` : ''}
      </p>
      {intake.digestLabel && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{intake.digestLabel}</p>
      )}
      {intake.acceptedSourceIds.length === 0 && (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{intake.materialNote}</p>
      )}
    </li>
  )
}

function ProcessingBlock({ processing }: { processing: ATIProcessingSurface }) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-background p-4">
      <p className={EYEBROW}>Research outcome</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{processing.headline}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{processing.detail}</p>
      {processing.committedVersion !== undefined && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Version {processing.committedVersion}
          {processing.addedSourceIds && processing.addedSourceIds.length > 0
            ? ` · ${processing.addedSourceIds.join(', ')}`
            : ''}
        </p>
      )}
    </div>
  )
}
