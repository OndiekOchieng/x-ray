'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, ClockIcon, HistoryIcon, SearchIcon } from 'lucide-react'

import { AppShell } from '@/components/layout/app-shell'
import type { LibraryCard } from '@/lib/xray/publication/library-card'

/**
 * Cached public X-Rays.
 *
 * Counts derive from each investigation's graph — the v0 scaffold kept a
 * second copy of them on a library record, which drifted.
 *
 * Version history lists real `InvestigationVersion` records. XRAY-KE-001 is
 * version 1, so there is one entry; no version 2 is fabricated.
 */
export function InvestigationLibrary({ entries }: { entries: LibraryCard[] }) {
  const [query, setQuery] = useState('')
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null)

  const results = useMemo(() => {
    const q = query.toLowerCase()
    return entries.filter((item) =>
      `${item.title} ${item.surfacePublisher ?? ''}`.toLowerCase().includes(q),
    )
  }, [entries, query])

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <header className="border-b border-border pb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            Library · cached public X-Rays
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
                Investigations, indexed.
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
                Public claims change. New documents emerge. Better evidence becomes available.
              </p>
            </div>
            <p className="max-w-xs text-right font-serif text-xl italic text-foreground/80">
              Verdicts expire. Receipts compound.
            </p>
          </div>
        </header>

        <main className="py-10">
          <div className="relative max-w-xl">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cached investigations"
              aria-label="Search cached investigations"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="mt-8 grid gap-5">
            {results.map((item) => {
              const historyOpen = openHistoryFor === item.slug
              const facts: [string, string][] = [
                ['Surface source', item.surfacePublisher ?? '—'],
                ['Research cutoff', item.researchCutoffAt ?? '—'],
                ['Claims', String(item.claimCount)],
                ['Sources traced', String(item.sourceCount)],
                ['Evidence points', String(item.receiptCount)],
                ['Open gaps', String(item.openGapCount)],
              ]

              return (
                <article
                  key={item.slug}
                  className="rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                        v{item.version} · X-Ray v{item.protocolVersion}
                      </p>
                      <h2 className="mt-3 text-2xl font-semibold">{item.title}</h2>
                    </div>
                    <Link
                      href={item.href}
                      className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
                    >
                      Explore X-Ray
                      <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <dl className="mt-7 grid gap-4 border-t border-border pt-5 text-xs text-muted-foreground sm:grid-cols-3 lg:grid-cols-6">
                    {facts.map(([label, value]) => (
                      <div key={label}>
                        <dt className="block text-foreground">{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    {item.sourceCount} records were traced, yielding {item.receiptCount}{' '}
                    evidence points. Where several publications repeat one record, X-Ray counts
                    the observation once rather than counting the publications.
                  </p>

                  {/*
                    The citation affordance is the exact version URL, not the
                    alias: a citation must name what it cited. Version lineage
                    is not a library-card field in #9, so it is not implied here.
                  */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <a
                      href={item.citationHref}
                      className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground"
                    >
                      <HistoryIcon className="size-4" aria-hidden="true" />
                      Cite version {item.version}
                    </a>
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <ClockIcon className="size-4" aria-hidden="true" />
                      Investigated {(item.investigatedAt ?? item.publishedAt).slice(0, 10)}
                    </span>
                  </div>
                </article>
              )
            })}

            {results.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No cached investigation matches this search.
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  )
}
