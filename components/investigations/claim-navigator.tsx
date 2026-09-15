'use client'

import type { ExplorerClaim } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ClaimNavigator({ claims, selectedId, onSelect }: { claims: ExplorerClaim[]; selectedId: string; onSelect: (id: string) => void }) {
  return <aside className="flex flex-col gap-2 lg:sticky lg:top-32 lg:self-start" aria-label="Investigation claims">
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Claims in view</p>
    {claims.map((claim, index) => <button key={claim.id} onClick={() => onSelect(claim.id)} className={cn('text-left rounded-xl border p-4 transition-colors', selectedId === claim.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40')}>
      <div className="flex items-center justify-between gap-3 mb-2"><span className="font-mono text-[10px] text-muted-foreground">C{String(index + 1).padStart(3, '0')}</span><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{claim.origin === 'DISCOVERED' ? 'Discovered' : claim.category}</span></div>
      <p className="text-sm font-medium leading-snug text-foreground">{claim.text}</p>
      <p className="mt-3 text-[11px] font-mono text-muted-foreground">{claim.finding.status}</p>
    </button>)}
  </aside>
}
