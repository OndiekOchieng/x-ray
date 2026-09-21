import Link from 'next/link'

import { AppShell } from '@/components/layout/app-shell'

/**
 * Not found, with a way out (#11 slice 11d §G).
 *
 * 11a found unknown ids returning HTTP 200; 11b fixed the status. What was
 * still missing is the other half: a reader who mistypes an address gets a
 * real 404 and needs somewhere to go from it.
 *
 * The wording keeps the distinction 11b established. This page means the
 * address is not one X-Ray knows — it is *not* a statement that storage is
 * unavailable, and it never suggests the investigation existed and was
 * removed.
 */
export default function NotFound() {
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-6 py-20">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Not found
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          X-Ray has nothing at this address
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          No investigation, gap or published version matches this address. That is a statement
          about the address and not about any investigation: nothing here has been removed, and
          storage is reachable.
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Start a new X-Ray
          </Link>
          <Link
            href="/library"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Browse published X-Rays
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
