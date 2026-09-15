/**
 * Investigation domain: lifecycle, versions, stage execution.
 *
 * Source: X-Ray System Architecture v0.1 §5.1 (Investigation), §17 (StageRun),
 * §19 (ResearchStop), §22 (versioning) — docs/architecture/domain-model.md
 * and docs/architecture/investigation-versioning.md.
 *
 * PURITY: types only. No React, no DOM, no fixtures, no copy, no I/O.
 * Timestamps are ISO strings, never `Date`.
 */

import type {
  ClaimId,
  DisconfirmationId,
  DiscrepancyId,
  EvidenceId,
  FindingId,
  GapId,
  InvestigationId,
  IsoDate,
  IsoDateTime,
  SourceId,
  StageRunId,
} from './primitives'

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * The thirteen pipeline stages.
 *
 * Stages `INGEST` … `VALIDATE` (and `PERSIST`, which produces no artifact of
 * its own) generate canonical research state. `SYNTHESIZE` and `RESOLVE` are
 * downstream consumers and MUST NOT mutate what precedes them (XR-INV-011).
 *
 * This is the architectural pipeline, not the ten progress rows the v0 UI
 * happens to display. The UI list omits VALIDATE, SYNTHESIZE and RESOLVE; a
 * progress view is a projection of these runs, not the definition of them.
 */
export type PipelineStage =
  | 'INGEST'
  | 'DECOMPOSE'
  | 'CLASSIFY'
  | 'PLAN'
  | 'TRACE'
  | 'PROVENANCE'
  | 'DISCONFIRM'
  | 'RECONCILE'
  | 'GRADE'
  | 'GAPS'
  | 'VALIDATE'
  | 'SYNTHESIZE'
  | 'RESOLVE'

export type StageRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'

/**
 * One persisted execution of one pipeline stage.
 *
 * Every stage execution is persisted so that failures are retryable at stage
 * granularity: a TRACE failure does not require DECOMPOSE to rerun. The
 * artifact versions record which graph state the stage read and which it
 * produced, which is what makes a retry deterministic and the run auditable.
 */
export interface StageRun {
  id: StageRunId

  investigationId: InvestigationId

  stage: PipelineStage

  status: StageRunStatus

  /** Graph version this run read. */
  inputArtifactVersion: number

  /** Graph version this run produced. Absent until it succeeds. */
  outputArtifactVersion?: number

  /** Provider/model identifier used, for audit and reproducibility. */
  model?: string

  startedAt?: IsoDateTime
  completedAt?: IsoDateTime

  /** Failure detail. Present when `status` is `FAILED`. */
  error?: string
}

// ---------------------------------------------------------------------------
// Saturation
// ---------------------------------------------------------------------------

/**
 * Why research stopped.
 *
 * Research MUST NOT stop merely because the model says it is finished. The
 * engine records why it stopped, and `unresolvedHighPriorityLeads` keeps what
 * was left undone visible rather than pretending research was exhaustive.
 */
export interface ResearchStop {
  reason:
    | 'SATURATION'
    | 'TIME_BUDGET'
    | 'SOURCE_EXHAUSTION'
    | 'COST_BUDGET'
    | 'MANUAL_STOP'
    | 'ERROR'

  unresolvedHighPriorityLeads: string[]
}

// ---------------------------------------------------------------------------
// Investigation
// ---------------------------------------------------------------------------

/**
 * Investigation lifecycle.
 *
 * `RESEARCH_COMPLETE` precedes `SYNTHESIZED`, which precedes `PUBLISHED` —
 * the ordering that keeps synthesis downstream of canonical state. `FAILED` is
 * a real terminal state and must be representable.
 */
export type InvestigationStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'RESEARCH_COMPLETE'
  | 'SYNTHESIZED'
  | 'PUBLISHED'
  | 'FAILED'

/**
 * One investigation of one surface source.
 *
 * Artifacts are referenced by id rather than embedded, so the graph has a
 * single source of truth per object. Derived quantities — claim counts,
 * receipt counts, open-gap counts — are deliberately absent: they are computed
 * from the graph by selectors, never stored alongside it.
 *
 * XR-INV-001 — `surfaceSourceId` identifies the source that established that
 * the claims were *made*. It is a Source like any other and may be cited, but
 * it does not thereby establish the propositions it asserts.
 */
export interface Investigation {
  id: InvestigationId

  /** Research protocol version this investigation was executed under. */
  protocolVersion: string

  status: InvestigationStatus

  /** The source whose claims are under investigation. XR-INV-001. */
  surfaceSourceId: SourceId

  /** Optional narrowing, e.g. one project named in a wider article. */
  focus?: string

  createdAt: IsoDateTime

  /**
   * The cutoff beyond which evidence was not considered.
   *
   * Load-bearing: it is what separates "scheduled" from "occurred" for events
   * that post-date the research, and it prevents future evidence leaking into
   * a historical investigation.
   */
  researchCutoffAt?: IsoDate

  completedAt?: IsoDateTime

  /** The latest version. Completed versions are immutable (XR-INV-010). */
  currentVersion: number

  /** Stage executions, in the order they were run. */
  stageRuns: StageRun[]

  /** Why research stopped, once it has. */
  researchStop?: ResearchStop

  claimIds: ClaimId[]
  sourceIds: SourceId[]
  evidenceIds: EvidenceId[]
  discrepancyIds: DiscrepancyId[]
  disconfirmationIds: DisconfirmationId[]
  findingIds: FindingId[]
  gapIds: GapId[]
}

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/** What caused a new investigation version to be created. */
export type InvestigationVersionTrigger =
  | 'INITIAL_RESEARCH'
  | 'NEW_SOURCE_RECEIVED'
  | 'ATI_RESPONSE_RECEIVED'
  | 'RE_EVALUATION'
  | 'CORRECTION'

/**
 * An immutable snapshot of an investigation at one version.
 *
 * XR-INV-010 — new evidence MUST NOT destroy previous investigation state.
 * A new receipt produces the next version, which inherits the receipts already
 * gathered, adds the new one, re-evaluates only the claims the new evidence
 * bears on, and leaves every other finding carried forward unchanged.
 *
 * What was known, missing and concluded at each version stays retrievable.
 * A superseded finding is not deleted; it is superseded.
 *
 * NOTE: `InvestigationVersion` is required by this slice but is not defined as
 * a type in System Architecture v0.1 — §22 specifies the behaviour and the
 * version graph, not the record. This shape is derived from §22 and
 * docs/architecture/investigation-versioning.md. See the slice report.
 */
export interface InvestigationVersion {
  investigationId: InvestigationId

  /** 1-based. `Investigation.currentVersion` points at the latest. */
  version: number

  createdAt: IsoDateTime

  trigger: InvestigationVersionTrigger

  /** The version this one supersedes. Absent for version 1. */
  supersedesVersion?: number

  /** Sources new at this version, as distinct from those inherited. */
  addedSourceIds: SourceId[]

  /** Evidence new at this version. */
  addedEvidenceIds: EvidenceId[]

  /** Claims re-evaluated because the new evidence bore on them. */
  reEvaluatedClaimIds: ClaimId[]

  /** Findings as they stand at this version, superseded ones included. */
  findingIds: FindingId[]

  /** Gaps as they stand at this version, whether open, resolved or not. */
  gapIds: GapId[]

  /** Why this version's research stopped. */
  researchStop?: ResearchStop
}
