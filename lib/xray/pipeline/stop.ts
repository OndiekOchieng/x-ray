/** Run-level stop assessment. A single pass cannot prove saturation (D25). */
import type { ResearchStop } from '@/lib/xray/domain'
import type { XRayGraph } from '@/lib/xray/selectors'

export interface StopEvidence {
  /** Affirmative observation from research execution, never inferred from a clean graph. */
  saturationObserved?: boolean
  /** Explicit, independently observed interruption. */
  reason?: Exclude<ResearchStop['reason'], 'SATURATION' | 'TIME_BUDGET' | 'COST_BUDGET'>
  unresolvedHighPriorityLeads?: readonly string[]
}

export interface StopAssessment {
  stop?: ResearchStop
  structuralConditionsMet: boolean
  materialClaimIds: readonly string[]
  loadBearingClaimIds: readonly string[]
  materialGapIds: readonly string[]
}

export function assessResearchStop(graph: XRayGraph, evidence: StopEvidence = {}): StopAssessment {
  const materialClaimIds = graph.claims.filter((claim) => claim.priority === 'HIGH').map((claim) => claim.id)
  const material = new Set(materialClaimIds)
  const loadBearingClaimIds = graph.findings
    .map((finding) => finding.claimId)
    .filter((id) => material.has(id))
  const materialGapIds = graph.gaps
    .filter((gap) => gap.claimIds.some((id) => material.has(id)))
    .map((gap) => gap.id)
  const findings = graph.findings.filter((finding) => material.has(finding.claimId))
  const graded = materialClaimIds.every((id) => findings.some((finding) => finding.claimId === id))
  const disconfirmed = loadBearingClaimIds.every((id) =>
    graph.disconfirmations.some((attempt) => attempt.claimId === id))
  const gapsRecorded = findings.every((finding) =>
    finding.status === 'SUPPORTED' || finding.status === 'CONTRADICTED' ||
    graph.gaps.some((gap) => gap.claimIds.includes(finding.claimId)))
  const discrepanciesClassified = graph.discrepancies
    .filter((discrepancy) => discrepancy.claimIds.some((id) => material.has(id)))
    .every((discrepancy) => Boolean(discrepancy.classification))
  const structuralConditionsMet = graded && disconfirmed && gapsRecorded && discrepanciesClassified
  const reason = evidence.reason ??
    (evidence.saturationObserved && structuralConditionsMet ? 'SATURATION' : undefined)
  return {
    structuralConditionsMet,
    materialClaimIds,
    loadBearingClaimIds,
    materialGapIds,
    stop: reason
      ? { reason, unresolvedHighPriorityLeads: [...(evidence.unresolvedHighPriorityLeads ?? [])] }
      : undefined,
  }
}
