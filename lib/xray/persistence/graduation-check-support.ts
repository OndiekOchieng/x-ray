import type { PGlite } from '@electric-sql/pglite'
import type { GraduationResult } from '@/lib/xray/acceptance/runner'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import type { XRayGraph } from '@/lib/xray/selectors'
import { saveCandidateCheckpoint, type WorkspaceRunStatus } from './workspace'
import { appendGraduationAudit } from './graduation-audit'

export async function prepareAssessedRun(db: PGlite, id: string, graph: XRayGraph,
  result: GraduationResult, status: WorkspaceRunStatus = 'COMPLETED') {
  await checkpointCandidate(db, id, graph, result.assessedAt, status)
  return appendGraduationAudit(db, id, graph, result)
}

export async function checkpointCandidate(db: PGlite, id: string, graph: XRayGraph,
  at: GraduationResult['assessedAt'], status: WorkspaceRunStatus = 'COMPLETED') {
  await saveCandidateCheckpoint(db, {
    executionRunId: id, investigationId: graph.investigation.id,
    startedAt: at, updatedAt: at, status, artifactVersion: 0,
    accumulator: new GraphAccumulator(graph.investigation, graph),
    ledger: new CorrelationLedger(), journal: new RunJournal(graph.investigation.id),
  })
}
