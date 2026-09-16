/**
 * Investigation-level selectors.
 */

import type {
  Investigation,
  InvestigationVersion,
  PipelineStage,
  ResearchStop,
  StageRun,
} from '@/lib/xray/domain'
import type { XRayGraph } from './graph'

export function investigation(graph: XRayGraph): Investigation {
  return graph.investigation
}

export function investigationVersion(graph: XRayGraph): InvestigationVersion | undefined {
  return graph.version
}

export function currentVersionNumber(graph: XRayGraph): number {
  return graph.investigation.currentVersion
}

export function researchCutoff(graph: XRayGraph): string | undefined {
  return graph.investigation.researchCutoffAt
}

export function protocolVersion(graph: XRayGraph): string {
  return graph.investigation.protocolVersion
}

export function stageRuns(graph: XRayGraph): readonly StageRun[] {
  return graph.investigation.stageRuns
}

export function stageRun(graph: XRayGraph, stage: PipelineStage): StageRun | undefined {
  return graph.investigation.stageRuns.find((s) => s.stage === stage)
}

export function executedStages(graph: XRayGraph): StageRun[] {
  return graph.investigation.stageRuns.filter((s) => s.status === 'SUCCEEDED')
}

/** Stages not yet run. In XRAY-KE-001: VALIDATE, SYNTHESIZE, RESOLVE. */
export function pendingStages(graph: XRayGraph): StageRun[] {
  return graph.investigation.stageRuns.filter((s) => s.status === 'PENDING')
}

export function failedStages(graph: XRayGraph): StageRun[] {
  return graph.investigation.stageRuns.filter((s) => s.status === 'FAILED')
}

/** Why research stopped, and what was left undone. */
export function researchStop(graph: XRayGraph): ResearchStop | undefined {
  return graph.investigation.researchStop
}

/** True once stages 1–9 have produced canonical state. */
export function isResearchComplete(graph: XRayGraph): boolean {
  const s = graph.investigation.status
  return s === 'RESEARCH_COMPLETE' || s === 'SYNTHESIZED' || s === 'PUBLISHED'
}
