import { notFound } from 'next/navigation'

import { GapDetail } from '@/components/investigations/gap-detail'
import { getGapPayload } from '@/lib/xray/investigations'

export default async function GapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = getGapPayload(id)

  if (!payload) notFound()

  return <GapDetail payload={payload} />
}
