import { connection } from 'next/server'

import { InvestigationLibrary } from '@/components/investigations/investigation-library'
import { publishedLibraryAvailability } from '@/lib/xray/publication/public-library'

/**
 * Membership is never cached. A withdrawal removes a lineage from discovery on
 * the next request, so the library is resolved per request while the immutable
 * projection behind each card is reused from the 9d cache.
 *
 * `connection()` marks everything after it as request-time. Without it the
 * build would try to prerender the library, which means asking storage a
 * question at build time — and a deployment with no database configured would
 * fail the build rather than report itself unavailable at runtime.
 */
export const instant = false

/**
 * 11a found this page flushing a 200 shell and then throwing when no database
 * was configured. Storage being unreachable is now rendered as itself, and is
 * never shown as "no published investigations" — an outage is not an empty
 * corpus, and saying so would be a lie about the work.
 */
export default async function LibraryPage() {
  await connection()
  const library = await publishedLibraryAvailability()

  if (library.status === 'UNAVAILABLE') {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-foreground">Published X-Rays</h1>
        <p
          role="status"
          className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        >
          The library is temporarily unavailable. X-Ray could not reach its storage, so the
          published list cannot be shown — this is not a statement that nothing is published.
        </p>
      </main>
    )
  }

  return <InvestigationLibrary entries={library.entries} />
}
