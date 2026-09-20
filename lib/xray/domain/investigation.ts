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
  SourcePositionId,
  StageRunId,
} from './primitives'

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Steps that transform investigation state and may own canonical artifacts.
 *
 * These are the only steps that mint evidence-graph artifacts, and therefore
 * the only ones that may claim an artifact revision transition. The pipeline
 * writes exactly these; everything else inspects.
 *
 * `IDENTIFY GAPS` in Protocol v0.1 is named `GAPS` here. That is a naming
 * refinement of the same step, not a new one, and `PROVENANCE` is the
 * architecture's deliberate split of proposition-level origin work out of
 * v0.1's `TRACE`. See docs/architecture/research-pipeline.md §16.
 */
export type ResearchStage =
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

/**
 * Steps that inspect current state and decide whether execution may continue.
 *
 * A control gate mints no canonical artifact. It reads the graph, produces a
 * verdict, and either permits the run to proceed or stops it. Both gates
 * already have durable result types of their own — `ValidationResult` and
 * `ReviewHistory` — so neither needs, or may claim, an artifact revision.
 *
 * `VALIDATE` and `REVIEW` postdate Protocol v0.1; they are architecture
 * refinements that make the v0.1 method executable (#6 D12, D15).
 */
export type ControlGate = 'VALIDATE' | 'REVIEW'

/**
 * LEGACY vocabulary. The stage names historical `StageRun` records may carry.
 *
 * DO NOT USE FOR NEW CONTRACTS. New pipeline code uses `ResearchStage` for
 * artifact-producing work and `ControlGate` for inspection; those two are
 * disjoint, and this union is not.
 *
 * It exists because XRAY-KE-001 was reconstructed before the distinction was
 * drawn, and records `VALIDATE`, `SYNTHESIZE` and `RESOLVE` as `PENDING`
 * stage runs. Those observations are historical evidence of what the frozen
 * benchmark did and did not execute. Rewriting them to fit a later type model
 * would edit the evidence to flatter the code (#6 D15, migration rule).
 *
 * The member list is therefore frozen at what already existed. `REVIEW` and
 * `PERSIST` are deliberately absent: `REVIEW` is a gate recorded by
 * `ReviewHistory`, and persistence is owned by #7.
 *
 * `SYNTHESIZE` and `RESOLVE` are downstream lifecycle steps that MUST NOT
 * mutate what precedes them (XR-INV-011). They are not part of the
 * pre-persistence research pipeline #6 executes.
 */
export type PipelineStage = ResearchStage | 'VALIDATE' | 'SYNTHESIZE' | 'RESOLVE'

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

  /**
   * Which step this run records.
   *
   * New runs produced by the pipeline are always a `ResearchStage`; the wider
   * `PipelineStage` is retained only so historical records remain readable.
   * See `ResearchStageRun` in `lib/xray/pipeline/journal.ts`.
   */
  stage: PipelineStage

  status: StageRunStatus

  /**
   * In-run artifact revision this run read.
   *
   * NOT an `InvestigationVersion`. A stage retried three times has not
   * produced three versions of the investigation. See research-pipeline §17.
   */
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
  /** Absent on historical snapshots; new graphs may index contextual SourcePositions. */
  sourcePositionIds?: SourcePositionId[]
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
