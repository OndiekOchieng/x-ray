import { notFound } from 'next/navigation'

import { GapDetail } from '@/components/investigations/gap-detail'
import { getGapPayload } from '@/lib/xray/investigations'

/**
 * Dynamic, exactly as before Cache Components was enabled.
 *
 * This route already rendered per request. `instant = false` declares that
 * under the new prerender rules rather than changing what it does: the #9
 * cache boundary is the immutable public version projection, not an
 * internal page.
 */
export const instant = false

/**
 * Existence is decided here, not in the body — see the note on the explorer
 * route. `notFound()` from the component yields HTTP 200 under Partial
 * Prerendering, because the shell has already been flushed.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!getGapPayload(id)) notFound()
  return {}
}

export default async function GapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = getGapPayload(id)

  if (!payload) notFound()

  return <GapDetail payload={payload} />
}
