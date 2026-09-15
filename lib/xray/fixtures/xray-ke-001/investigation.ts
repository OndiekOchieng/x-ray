/**
 * XRAY-KE-001 — canonical Investigation and Version 1 snapshot.
 *
 * Artifacts are linked by id. No counts are stored: claim, receipt and gap
 * totals are computed from the graph by selectors, never persisted alongside
 * it. The integrity check asserts that no count field exists here.
 */

import type { Investigation, InvestigationVersion, StageRun } from '@/lib/xray/domain'
import { claims } from './claims'
import { sources, SURFACE_SOURCE_ID } from './sources'
import { evidence } from './evidence'
import { discrepancies } from './discrepancies'
import { disconfirmations } from './disconfirmation'
import { findings } from './findings'
import { gaps } from './gaps'

export const INVESTIGATION_ID = 'XRAY-KE-001'

/**
 * Stages the frozen runs actually executed.
 *
 * LIMITATION — what the benchmark does NOT support, and is therefore absent:
 *
 *  - No per-stage timestamps. Both runs record a single research date
 *    (2026-09-13), not stage timings. `startedAt` / `completedAt` are omitted
 *    rather than fabricated.
 *  - No `model`. XRAY-KE-001 was executed twice, by two different researchers
 *    (Claude and GPT-5.6 Sol). This canonical graph is reconstructed from both,
 *    so no single model can be truthfully attributed to a stage. Omitted.
 *  - No `error`: no stage failed in either run.
 *
 * Artifact versions are structural, not evidential: this is Version 1, so
 * every executed stage read the empty graph (0) and contributed to version 1.
 *
 * Both runs stopped after stage 9 and explicitly performed no synthesis and no
 * action. VALIDATE, SYNTHESIZE and RESOLVE are therefore PENDING, not
 * SUCCEEDED — and PERSIST has no run because nothing was persisted by a
 * benchmark executed as a document.
 */
const stage = (n: number, s: StageRun['stage'], status: StageRun['status']): StageRun => ({
  id: `SR-${String(n).padStart(3, '0')}`,
  investigationId: INVESTIGATION_ID,
  stage: s,
  status,
  inputArtifactVersion: 0,
  ...(status === 'SUCCEEDED' ? { outputArtifactVersion: 1 } : {}),
})

export const stageRuns: StageRun[] = [
  stage(1, 'INGEST', 'SUCCEEDED'),
  stage(2, 'DECOMPOSE', 'SUCCEEDED'),
  stage(3, 'CLASSIFY', 'SUCCEEDED'),
  stage(4, 'PLAN', 'SUCCEEDED'),
  stage(5, 'TRACE', 'SUCCEEDED'),
  stage(6, 'PROVENANCE', 'SUCCEEDED'),
  stage(7, 'DISCONFIRM', 'SUCCEEDED'),
  stage(8, 'RECONCILE', 'SUCCEEDED'),
  stage(9, 'GRADE', 'SUCCEEDED'),
  stage(10, 'GAPS', 'SUCCEEDED'),
  // Not executed by either benchmark run.
  stage(11, 'VALIDATE', 'PENDING'),
  stage(12, 'SYNTHESIZE', 'PENDING'),
  stage(13, 'RESOLVE', 'PENDING'),
]

export const investigation: Investigation = {
  id: INVESTIGATION_ID,
  // Both runs: "X-Ray Research Protocol v0.1.0".
  protocolVersion: '0.1.0',
  // Stages 1–9 complete; no synthesis performed by either run.
  status: 'RESEARCH_COMPLETE',
  surfaceSourceId: SURFACE_SOURCE_ID,
  focus: 'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road',
  createdAt: '2026-09-13T00:00:00Z',
  researchCutoffAt: '2026-09-13',
  completedAt: '2026-09-13T00:00:00Z',
  currentVersion: 1,
  stageRuns,
  /**
   * Both runs passed their stop-condition check and stopped deliberately, with
   * remaining leads named rather than pursued. That is protocol saturation —
   * budget-aware, not exhaustive.
   */
  researchStop: {
    reason: 'SATURATION',
    unresolvedHighPriorityLeads: [
      'Lot 3 supervision award and any variation orders; KeNHA award notices not all sampled',
      'Auditor-General reports on KeNHA covering this contract',
      'National Assembly Roads Committee report or Hansard for the 6 June 2026 inspection',
      "PS Omollo's original February and September 2026 statements",
      'Post-14 September 2026 record of the presidential visit',
      'Treasury programme-based budget lines for the project, FY2024/25–FY2026/27',
      'Amounts actually paid or certified per lot, and pending bills settled from RMLF securitisation',
    ],
  },
  claimIds: claims.map((c) => c.id),
  sourceIds: sources.map((s) => s.id),
  evidenceIds: evidence.map((e) => e.id),
  discrepancyIds: discrepancies.map((d) => d.id),
  disconfirmationIds: disconfirmations.map((d) => d.id),
  findingIds: findings.map((f) => f.id),
  gapIds: gaps.map((g) => g.id),
}

/**
 * XRAY-KE-001 is Version 1. Nothing preceded it, so nothing was inherited and
 * nothing was re-evaluated. No Version 2 is constructed — there is no new
 * receipt to build one from.
 */
export const investigationVersion: InvestigationVersion = {
  investigationId: INVESTIGATION_ID,
  version: 1,
  createdAt: '2026-09-13T00:00:00Z',
  trigger: 'INITIAL_RESEARCH',
  addedSourceIds: sources.map((s) => s.id),
  addedEvidenceIds: evidence.map((e) => e.id),
  reEvaluatedClaimIds: [],
  findingIds: findings.map((f) => f.id),
  gapIds: gaps.map((g) => g.id),
  researchStop: investigation.researchStop,
}
