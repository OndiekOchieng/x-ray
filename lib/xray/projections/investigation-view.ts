/**
 * InvestigationView — investigation-level display model.
 *
 * COUNTS ARE DERIVED HERE, NOT STORED. Every number is computed from the
 * canonical arrays at projection time, so none can disagree with the graph.
 *
 * `receiptCount` appears in this layer and nowhere below it. "Receipt" is a
 * presentation idea — a Source paired with one Evidence record — so it counts
 * `ReceiptView`s, which is the evidence count. The selector layer has no
 * `receiptCount` for exactly this reason.
 *
 * `independentOriginCount` is reported alongside `sourceCount`, never in place
 * of it, and no field is named to suggest that either measures corroboration
 * on its own (FM-003).
 */

import type { InvestigationStatus, PipelineStage, StageRunStatus } from '@/lib/xray/domain'
import type { XRayGraph } from '@/lib/xray/selectors'
import {
  graphCounts,
  independentEvidenceOriginsForClaim,
  originKey,
  surfaceSource,
  gapResolutionSummary,
  allGaps,
} from '@/lib/xray/selectors'

export interface StageRunView {
  stageRunId: string
  stage: PipelineStage
  status: StageRunStatus
  isComplete: boolean
  isPending: boolean
  isFailed: boolean
  model?: string
  error?: string
}

export interface InvestigationCountsView {
  claims: number
  surfaceClaims: number
  discoveredClaims: number
  sources: number
  /** Evidence records, presented as "receipts". Identical to `evidence`. */
  receipts: number
  evidence: number
  /** Distinct originating observations across the whole graph. */
  independentOrigins: number
  dependencies: number
  discrepancies: number
  findings: number
  gaps: number
  openGaps: number
  atiEligibleGaps: number
}

export interface InvestigationView {
  investigationId: string
  status: InvestigationStatus
  protocolVersion: string
  focus?: string
  createdAt: string
  researchCutoffAt?: string
  completedAt?: string
  version: number

  surface: {
    sourceId: string
    title: string
    publisher?: string
    url?: string
    publishedAt?: string
  }

  counts: InvestigationCountsView
  stages: StageRunView[]
  researchStop?: { reason: string; unresolvedHighPriorityLeads: string[] }
}

export function investigationView(graph: XRayGraph): InvestigationView {
  const inv = graph.investigation
  const counts = graphCounts(graph)
  const surface = surfaceSource(graph)

  // Distinct CONFIRMED independent origins across every claim, from
  // evidence-level provenance. Unresolved propositions contribute nothing.
  const origins = new Set<string>()
  for (const claim of graph.claims)
    for (const o of independentEvidenceOriginsForClaim(graph, claim.id)) origins.add(originKey(o))

  const gapSummary = gapResolutionSummary(allGaps(graph))

  return {
    investigationId: inv.id,
    status: inv.status,
    protocolVersion: inv.protocolVersion,
    focus: inv.focus,
    createdAt: inv.createdAt,
    researchCutoffAt: inv.researchCutoffAt,
    completedAt: inv.completedAt,
    version: inv.currentVersion,

    surface: {
      sourceId: inv.surfaceSourceId,
      title: surface?.title ?? '',
      publisher: surface?.publisher,
      url: surface?.url,
      publishedAt: surface?.publishedAt,
    },

    counts: {
      claims: counts.claims,
      surfaceClaims: counts.surfaceClaims,
      discoveredClaims: counts.discoveredClaims,
      sources: counts.sources,
      receipts: counts.evidence,
      evidence: counts.evidence,
      independentOrigins: origins.size,
      dependencies: counts.dependencies,
      discrepancies: counts.discrepancies,
      findings: counts.findings,
      gaps: counts.gaps,
      openGaps: counts.openGaps,
      atiEligibleGaps: gapSummary.atiEligibleGaps,
    },

    stages: inv.stageRuns.map((s) => ({
      stageRunId: s.id,
      stage: s.stage,
      status: s.status,
      isComplete: s.status === 'SUCCEEDED',
      isPending: s.status === 'PENDING',
      isFailed: s.status === 'FAILED',
      model: s.model,
      error: s.error,
    })),

    researchStop: inv.researchStop
      ? {
          reason: inv.researchStop.reason,
          unresolvedHighPriorityLeads: [...inv.researchStop.unresolvedHighPriorityLeads],
        }
      : undefined,
  }
}
