export interface Investigation {
  id: string
  sourceUrl: string
  sourcePublisher: string
  articleTitle: string
  status: 'pending' | 'active' | 'completed'
  createdAt: Date
  updatedAt: Date
  claimsCount: number
  receiptsCount: number
  gapsCount: number
}

export interface PipelineStage {
  id: string
  name: string
  description: string
  status: 'pending' | 'active' | 'completed'
  order: number
}

export type ClaimCategory = 'QUANTITATIVE' | 'FINANCIAL' | 'DELIVERY' | 'TIMELINE'

export interface Claim {
  id: string
  text: string
  category: ClaimCategory
  sources: string[]
  discoveredAt: number
}

export interface ResearchEvent {
  id: string
  timestamp: number
  message: string
  type: 'claim' | 'evidence' | 'connection' | 'gap' | 'status'
}

export type FindingStatus =
  | 'ESTABLISHED'
  | 'SUPPORTED'
  | 'PARTIALLY SUPPORTED'
  | 'CONTESTED'
  | 'CONTRADICTED'
  | 'UNRESOLVED'
  | 'INSUFFICIENT EVIDENCE'

export interface EvidenceReceipt {
  id: string
  title: string
  institution: string
  publishedAt: string
  sourceType: string
  classification: 'PRIMARY' | 'SECONDARY'
  provenance: 'ORIGINATING' | 'REPEATING'
  proposition: string
  relationship: string
  strength: 'HIGH' | 'MEDIUM' | 'LOW'
  url: string
}

export interface Finding {
  status: FindingStatus
  confidence: number
  establish: string
  rationale: string
  supports: string[]
  challenges: string[]
  missing: string
  wouldChange: string
}

export interface ExplorerClaim extends Claim {
  origin: 'SURFACE' | 'DISCOVERED'
  finding: Finding
  receiptIds: string[]
  discrepancyIds: string[]
  gap?: EvidenceGap
}

export interface ProvenanceCluster {
  id: string
  source: string
  publications: string[]
  note: string
}

export interface Discrepancy {
  id: string
  title: string
  classification: string
  summary: string
  leftLabel: string
  rightLabel: string
  resolution: 'RECONCILED' | 'UNRESOLVED'
}

export interface Disconfirmation {
  hypothesis: string
  counterHypothesis: string
  opposingEvidence: string
  result: string
  wouldChange: string
}

export interface EvidenceGap {
  title: string
  whyItMatters: string
  whatWouldSettleIt: string
}

export interface XRayInvestigation extends Investigation {
  stages: PipelineStage[]
  events: ResearchEvent[]
  claims: Claim[]
  explorerClaims?: ExplorerClaim[]
  receipts?: EvidenceReceipt[]
  provenanceClusters?: ProvenanceCluster[]
  discrepancies?: Discrepancy[]
  disconfirmation?: Disconfirmation
}
