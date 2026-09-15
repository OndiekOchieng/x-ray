import { EvidenceExplorer } from '@/components/investigations/evidence-explorer'

export default function EvidenceExplorerRoute() {
  return <EvidenceExplorer />
}

export function generateStaticParams() {
  return [{ id: 'XRAY-KE-001' }]
}

export const dynamicParams = false
