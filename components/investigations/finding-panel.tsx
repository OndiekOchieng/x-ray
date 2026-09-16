'use client'

import { useState } from 'react'

import type { FindingView, ReceiptView } from '@/lib/xray/projections'

/**
 * What the evidence establishes about one claim.
 *
 * Confidence is the ordinal band only. The v0 scaffold rendered a stored
 * decimal as "86% confidence", implying a calibration the pipeline cannot
 * produce.
 *
 * Supporting, challenging and contextual evidence are kept in three labelled
 * groups. Contextual evidence must not read as support: the record explaining
 * why two figures measure different things argues for neither of them.
 */
function EvidenceGroup({
  title,
  hint,
  receipts,
  onInspect,
  defaultOpen,
}: {
  title: string
  hint: string
  receipts: ReceiptView[]
  onInspect: (evidenceId: string) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (receipts.length === 0) return null

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({receipts.length})
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {receipts.map((receipt) => (
            <li key={receipt.evidenceId}>
              <button
                type="button"
                onClick={() => onInspect(receipt.evidenceId)}
                className="w-full rounded-lg border border-border bg-background p-3 text-left hover:border-primary/50"
              >
                <p className="text-sm leading-relaxed text-foreground">{receipt.proposition}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {receipt.institution ?? receipt.publisher ?? receipt.title} ·{' '}
                  {receipt.strengthLabel}
                  {!receipt.wasObtained && ' · record not obtained'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FindingPanel({
  finding,
  isDiscovered,
  onInspectReceipt,
}: {
  finding: FindingView
  isDiscovered: boolean
  onInspectReceipt: (evidenceId: string) => void
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {isDiscovered ? 'Discovered claim' : 'Surface claim'} · {finding.claimId}
          </p>
          <h1 className="max-w-3xl text-2xl font-semibold leading-tight text-foreground md:text-3xl">
            {finding.claimText}
          </h1>
        </div>

        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Finding</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{finding.statusLabel}</p>
          {/* Ordinal band. Never a percentage. */}
          <p className="font-mono text-[10px] text-muted-foreground">
            {finding.confidenceLabel}
          </p>
        </div>
      </div>

      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Why
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{finding.rationale}</p>
      </div>

      <div className="mt-7 flex flex-col gap-4">
        <EvidenceGroup
          title="Supports"
          hint="Records that make the claim more established."
          receipts={finding.supporting}
          onInspect={onInspectReceipt}
          defaultOpen
        />
        <EvidenceGroup
          title="Challenges"
          hint="Records that weaken the claim. None of them contradicts it outright."
          receipts={finding.challenging}
          onInspect={onInspectReceipt}
          defaultOpen
        />
        <EvidenceGroup
          title="Context"
          hint="Records that argue for neither side, but without which the finding does not make sense."
          receipts={finding.contextual}
          onInspect={onInspectReceipt}
          defaultOpen={false}
        />
      </div>

      {finding.wouldChangeFinding.length > 0 && (
        <div className="mt-7 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What would change this finding?
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {finding.wouldChangeFinding.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-foreground">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
