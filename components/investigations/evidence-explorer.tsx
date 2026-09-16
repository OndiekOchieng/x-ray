'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'

import { AppShell } from '@/components/layout/app-shell'
import type { ExplorerPayload } from '@/lib/xray/investigations'
import { ClaimNavigator } from './claim-navigator'
import { FindingPanel } from './finding-panel'
import { EvidenceGraph } from './evidence-graph'
import { ReceiptDrawer } from './receipt-drawer'
import { ProvenanceClusterView } from './provenance-cluster'
import { DiscrepancyCard } from './discrepancy-card'
import { DisconfirmationPanel } from './disconfirmation-panel'
import { EvidenceShareCard, GapPreview } from './evidence-actions'

/**
 * The completed X-Ray.
 *
 * Every panel renders when the claim's projection actually contains the thing
 * it displays. There are no fixture gates: the v0 scaffold showed provenance
 * and disconfirmation only when `selected.id === 'claim-2'`.
 */
export function EvidenceExplorer({ payload }: { payload: ExplorerPayload }) {
  const { investigation, claims, navigator } = payload
  const [selectedId, setSelectedId] = useState(claims[0]?.claimId ?? '')
  const [receiptId, setReceiptId] = useState<string>()

  const selected = useMemo(
    () => claims.find((c) => c.claimId === selectedId) ?? claims[0],
    [claims, selectedId],
  )

  const receipt = useMemo(() => {
    if (!receiptId || !selected) return undefined
    return [...selected.supporting, ...selected.opposing, ...selected.contextual].find(
      (r) => r.evidenceId === receiptId,
    )
  }, [receiptId, selected])

  if (!selected) return null

  const investigatedAt = (investigation.completedAt ?? investigation.createdAt).slice(0, 10)

  const facts: [string, string][] = [
    ['Source', investigation.surface.publisher ?? '—'],
    ['Investigated', investigatedAt],
    ['Protocol', `X-Ray v${investigation.protocolVersion}`],
    ['Claims', String(investigation.counts.claims)],
    ['Evidence points', String(investigation.counts.evidence)],
    ['Open gaps', String(investigation.counts.openGaps)],
  ]

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          href={`/investigation/${investigation.investigationId}`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Back to investigation
        </Link>

        <header className="border-b border-border pb-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
                Completed X-Ray · {investigation.investigationId}
              </p>
              <h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
                {investigation.surface.title}
              </h1>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                Evidence explorer for a public claim. The original source and the recovered
                records are kept visibly distinct.
              </p>
            </div>

            {investigation.surface.url && (
              <a
                href={investigation.surface.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
              >
                View original source
                <ExternalLinkIcon className="size-4" aria-hidden="true" />
              </a>
            )}
          </div>

          <dl className="mt-8 grid gap-4 text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-6">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="block font-medium text-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="grid gap-8 py-10 lg:grid-cols-[260px_1fr]">
          <ClaimNavigator
            claims={navigator}
            selectedId={selected.claimId}
            onSelect={setSelectedId}
          />

          <main className="flex min-w-0 flex-col gap-6">
            {selected.finding && (
              <FindingPanel
                finding={selected.finding}
                isDiscovered={selected.isDiscovered}
                onInspectReceipt={setReceiptId}
              />
            )}

            <EvidenceGraph claim={selected} onSelect={setReceiptId} />

            {/* Rendered because this claim's records trace to a shared origin. */}
            <ProvenanceClusterView provenance={selected.provenance} />

            {selected.discrepancies.length > 0 && (
              <section className="flex flex-col gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Reconciliation layer
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-foreground">
                    Discrepancies around this claim
                  </h2>
                </div>
                {selected.discrepancies.map((discrepancy) => (
                  <DiscrepancyCard
                    key={discrepancy.discrepancyId}
                    discrepancy={discrepancy}
                  />
                ))}
              </section>
            )}

            {selected.disconfirmations.map((disconfirmation) => (
              <DisconfirmationPanel
                key={disconfirmation.disconfirmationId}
                data={disconfirmation}
              />
            ))}

            <GapPreview gaps={selected.gaps} />

            <EvidenceShareCard
              claim={selected}
              investigatedAt={investigatedAt}
              protocolVersion={investigation.protocolVersion}
            />
          </main>
        </div>
      </div>

      <ReceiptDrawer receipt={receipt} onClose={() => setReceiptId(undefined)} />
    </AppShell>
  )
}
