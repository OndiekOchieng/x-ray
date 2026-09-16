'use client'

import { useState } from 'react'

import type { DiscrepancyView } from '@/lib/xray/projections'

/**
 * A recorded conflict between records.
 *
 * The comparison columns are built from the canonical evidence in conflict —
 * the v0 scaffold stored `leftLabel` / `rightLabel` display strings, which
 * flattened the real values into copy.
 *
 * Classification comes from the graph. Nothing here can turn a
 * DIFFERENT_DEFINITION discrepancy into a contradiction: the wording is chosen
 * from `isGenuineContradiction`, which reports what was recorded after the
 * scope, date, phase and definition alternatives were tested.
 */
export function DiscrepancyCard({ discrepancy }: { discrepancy: DiscrepancyView }) {
  const [showEvidence, setShowEvidence] = useState(false)

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{discrepancy.classificationLabel}</h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {discrepancy.resolved ? 'Reconciled' : 'Unresolved'}
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground">{discrepancy.description}</p>

      {!discrepancy.isGenuineContradiction && (
        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
          These figures are not necessarily in conflict. They were tested for differences of
          scope, definition, date and phase before any contradiction was considered.
        </p>
      )}

      {discrepancy.reconciliation && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {discrepancy.reconciliation}
        </p>
      )}

      {discrepancy.evidence.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            aria-expanded={showEvidence}
            className="mt-4 font-mono text-[10px] uppercase tracking-wider text-primary hover:underline"
          >
            {showEvidence ? 'Hide' : 'Show'} the {discrepancy.evidence.length} records in
            question
          </button>

          {showEvidence && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {discrepancy.evidence.map((receipt) => (
                <li
                  key={receipt.evidenceId}
                  className="rounded-lg bg-muted/40 p-3 text-xs text-foreground"
                >
                  <p className="leading-relaxed">{receipt.proposition}</p>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                    {receipt.institution ?? receipt.publisher ?? receipt.title}
                    {receipt.measurement?.value !== undefined &&
                      ` · ${receipt.measurement.value}${
                        receipt.measurement.unit ? ` ${receipt.measurement.unit}` : ''
                      }`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </article>
  )
}
