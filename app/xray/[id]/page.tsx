import { notFound } from 'next/navigation'

import { EvidenceExplorer } from '@/components/investigations/evidence-explorer'
import { getExplorerPayload } from '@/lib/xray/investigations'

export default async function EvidenceExplorerRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const payload = getExplorerPayload(id)

  // Previously this route declared `dynamicParams = false` with a single
  // hardcoded param, so it could serve exactly one investigation for all time.
  // The loader seam now decides what exists, and unknown ids are not-found.
  if (!payload) notFound()

  return <EvidenceExplorer payload={payload} />
}
