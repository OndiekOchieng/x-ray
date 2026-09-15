'use client'

import type { EvidenceReceipt, ExplorerClaim } from '@/lib/types'

export function EvidenceGraph({ claim, receipts, onSelect }: { claim: ExplorerClaim; receipts: EvidenceReceipt[]; onSelect: (id: string) => void }) {
  const items = receipts.filter((receipt) => claim.receiptIds.includes(receipt.id))
  return <section className="rounded-2xl border border-border bg-card p-5 md:p-7"><div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Evidence graph</p><h2 className="mt-2 text-lg font-semibold text-foreground">What this finding is standing on</h2></div><span className="font-mono text-xs text-muted-foreground">{items.length} receipts</span></div><div className="mt-6 flex flex-col items-center gap-3"><div className="max-w-sm rounded-xl border border-primary/40 bg-primary/5 px-5 py-3 text-center text-sm font-semibold text-foreground">{claim.text}</div><div className="h-5 w-px bg-border" /><div className="grid w-full gap-3 md:grid-cols-3">{items.map((receipt) => <button key={receipt.id} onClick={() => onSelect(receipt.id)} className="rounded-xl border border-border bg-background p-4 text-left hover:border-primary/50"><p className="text-xs font-semibold text-foreground">{receipt.title}</p><p className="mt-2 text-[11px] text-muted-foreground">{receipt.institution}</p><p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-primary">Inspect receipt →</p></button>)}</div></div></section>
}
