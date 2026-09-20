import { notFound } from 'next/navigation'

import { EvidenceExplorer } from '@/components/investigations/evidence-explorer'
import { getExplorerPayload } from '@/lib/xray/investigations'

/**
 * Dynamic, exactly as before Cache Components was enabled.
 *
 * This route already rendered per request. `instant = false` declares that
 * under the new prerender rules rather than changing what it does: the #9
 * cache boundary is the immutable public version projection, not an
 * internal page.
 */
export const instant = false

export default async function EvidenceExplorerRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const payload = await getExplorerPayload(id)

  // Previously this route declared `dynamicParams = false` with a single
  // hardcoded param, so it could serve exactly one investigation for all time.
  // The loader seam now decides what exists, and unknown ids are not-found.
  if (!payload) notFound()

  return <EvidenceExplorer payload={payload} />
}
