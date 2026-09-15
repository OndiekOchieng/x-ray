'use client'

import { useState } from 'react'
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/app-shell'
import { mamboleoInvestigation } from '@/lib/data/fixture'
import { ClaimNavigator } from './claim-navigator'
import { FindingPanel } from './finding-panel'
import { EvidenceGraph } from './evidence-graph'
import { ReceiptDrawer } from './receipt-drawer'
import { ProvenanceClusterView } from './provenance-cluster'
import { DiscrepancyCard } from './discrepancy-card'
import { DisconfirmationPanel } from './disconfirmation-panel'
import { EvidenceShareCard, GapPreview } from './evidence-actions'

export function EvidenceExplorer() {
  const investigation = mamboleoInvestigation
  const claims = investigation.explorerClaims ?? []
  const [selectedId, setSelectedId] = useState(claims[0]?.id ?? '')
  const [receiptId, setReceiptId] = useState<string>()
  const selected = claims.find((claim) => claim.id === selectedId) ?? claims[0]
  const receipt = investigation.receipts?.find((item) => item.id === receiptId)
  const date = investigation.updatedAt.toISOString().slice(0, 10)
  if (!selected) return null
  return <AppShell><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8"><Link href={`/investigation/${investigation.id}`} className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon className="size-4" />Back to investigation</Link><header className="border-b border-border pb-8"><div className="flex flex-wrap items-start justify-between gap-6"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">Completed X-Ray · {investigation.id}</p><h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-foreground md:text-5xl">{investigation.articleTitle}</h1><p className="mt-4 max-w-2xl text-muted-foreground">Evidence explorer for a public claim. Original source and recovered receipts are kept visibly distinct.</p></div><a href={investigation.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">View original source <ExternalLinkIcon className="size-4" /></a></div><div className="mt-8 grid gap-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5"><span><b className="block font-medium text-foreground">Source</b>{investigation.sourcePublisher}</span><span><b className="block font-medium text-foreground">Investigated</b>{date}</span><span><b className="block font-medium text-foreground">Protocol</b>X-Ray v0.1</span><span><b className="block font-medium text-foreground">Claims / receipts</b>{investigation.claimsCount} / {investigation.receiptsCount}</span><span><b className="block font-medium text-foreground">Open gaps</b>{investigation.gapsCount}</span></div></header><div className="grid gap-8 py-10 lg:grid-cols-[260px_1fr]"><ClaimNavigator claims={claims} selectedId={selected.id} onSelect={setSelectedId} /><main className="flex min-w-0 flex-col gap-6"><FindingPanel claim={selected} /><EvidenceGraph claim={selected} receipts={investigation.receipts ?? []} onSelect={setReceiptId} />{selected.discrepancyIds.length > 0 && <section className="flex flex-col gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Reconciliation layer</p><h2 className="mt-2 text-lg font-semibold text-foreground">Discrepancies around this claim</h2></div>{investigation.discrepancies?.filter((item) => selected.discrepancyIds.includes(item.id)).map((item) => <DiscrepancyCard key={item.id} discrepancy={item} />)}</section>}{investigation.provenanceClusters?.[0] && selected.id === 'claim-2' && <ProvenanceClusterView cluster={investigation.provenanceClusters[0]} />}{selected.id === 'claim-2' && investigation.disconfirmation && <DisconfirmationPanel data={investigation.disconfirmation} />}<GapPreview claim={selected} /><EvidenceShareCard claim={selected} investigationDate={date} /></main></div></div><ReceiptDrawer receipt={receipt} onClose={() => setReceiptId(undefined)} /></AppShell>
}
