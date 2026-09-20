import { connection } from 'next/server'

import { InvestigationLibrary } from '@/components/investigations/investigation-library'
import { publishedLibrary } from '@/lib/xray/publication/public-library'

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

export default async function LibraryPage() {
  await connection()
  return <InvestigationLibrary entries={await publishedLibrary()} />
}
