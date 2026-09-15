import { GapDetail } from '@/components/investigations/gap-detail'

export default async function GapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <GapDetail id={id} />
}
