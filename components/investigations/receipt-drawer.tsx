'use client'

import { useCallback, useEffect, useRef } from 'react'

import type { ReceiptView } from '@/lib/xray/projections'

/**
 * One receipt — a record, and the single proposition drawn from it.
 *
 * A receipt is a Source paired with one Evidence record, so the same document
 * appears here more than once when it bears on more than one claim, with a
 * different proposition and relationship each time.
 *
 * Where a record was never obtained, that is stated plainly and no quoted
 * passage is shown: you cannot quote a document you never read.
 */
export function ReceiptDrawer({
  receipt,
  onClose,
}: {
  receipt?: ReceiptView
  onClose: () => void
}) {
  const panelRef = useRef<HTMLElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      // Minimal focus trap using only what is already in the project.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  useEffect(() => {
    if (!receipt) return
    restoreFocusTo.current = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleKeyDown)
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreFocusTo.current?.focus?.()
    }
  }, [receipt, handleKeyDown])

  if (!receipt) return null

  const rows: [string, string | undefined][] = [
    ['Institution', receipt.institution ?? receipt.publisher],
    ['Author', receipt.author],
    ['Published', receipt.publishedAt],
    ['Retrieved', receipt.retrievedAt],
    ['Source type', receipt.sourceType.replace(/_/g, ' ').toLowerCase()],
    ['Evidence class', receipt.evidenceClassLabel],
    ['Origin', receipt.originStatusLabel],
    ['Availability', receipt.accessibilityLabel],
    ['Strength', receipt.strengthLabel],
    ['Bears on claim', receipt.relationshipLabel],
  ]

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onClick={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Evidence receipt: ${receipt.title}`}
        tabIndex={-1}
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background p-6 shadow-2xl outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              Evidence receipt
            </p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">{receipt.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>

        {!receipt.wasObtained && (
          <p className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-foreground">
            <span className="font-semibold">X-Ray did not obtain this record.</span>{' '}
            {receipt.accessibilityLabel}. What follows is reported through other sources, not
            read from the original — and it does not mean the record does not exist.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              What this record says
            </p>
            <p className="mt-2 leading-relaxed text-foreground">{receipt.proposition}</p>
          </div>

          {receipt.measurement && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                What it measures
              </p>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {receipt.measurement.metric && (
                  <>
                    <dt className="text-muted-foreground">Metric</dt>
                    <dd className="font-mono text-foreground">{receipt.measurement.metric}</dd>
                  </>
                )}
                {receipt.measurement.value !== undefined && (
                  <>
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="font-mono text-foreground">
                      {receipt.measurement.value} {receipt.measurement.unit}
                    </dd>
                  </>
                )}
                {receipt.measurement.denominator && (
                  <>
                    <dt className="text-muted-foreground">Out of</dt>
                    <dd className="font-mono text-foreground">
                      {receipt.measurement.denominator}
                    </dd>
                  </>
                )}
                {receipt.measurement.scope && (
                  <>
                    <dt className="text-muted-foreground">Scope</dt>
                    <dd className="text-foreground">{receipt.measurement.scope}</dd>
                  </>
                )}
              </dl>
              {receipt.measurement.definition && (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {receipt.measurement.definition}
                </p>
              )}
            </div>
          )}

          {receipt.timeScope && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                When it is true of
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {receipt.timeScope.asOf && (
                  <span className="font-mono text-foreground">
                    As at {receipt.timeScope.asOf}.{' '}
                  </span>
                )}
                {receipt.timeScope.description}
              </p>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y border-border py-5">
            {rows.map(
              ([label, value]) =>
                value && (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-foreground">{value}</dd>
                  </div>
                ),
            )}
          </dl>

          {/* Only shown when the record was actually obtained. */}
          {receipt.wasObtained && receipt.quotedPassage && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                In the record&rsquo;s own words
              </p>
              <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground">
                {receipt.quotedPassage}
              </blockquote>
              {receipt.locationInSource && (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {receipt.locationInSource}
                </p>
              )}
            </div>
          )}

          {receipt.url && (
            <a
              href={receipt.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-primary hover:underline"
            >
              View original source ↗
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}
