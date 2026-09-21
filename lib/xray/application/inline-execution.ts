/** Synchronous execution commands backed by one durable execution_run_id. */
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Investigation, InvestigationVersionTrigger } from '@/lib/xray/domain'
import type { XRayGraph, XRayGraphInput } from '@/lib/xray/selectors'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import { runPipeline, type PipelineBoundary } from '@/lib/xray/pipeline/run'
import type { StageAdapters, StageDefinition } from '@/lib/xray/pipeline/stages'
import type { StopEvidence } from '@/lib/xray/pipeline/stop'
import type { RevisionRequest } from '@/lib/xray/review'
import { appendExecutionAudit, readExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import { loadCandidateCheckpoint, saveCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { readSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import { recordExecutionCause, type ExecutionCause } from '@/lib/xray/persistence/execution-cause'
import { VersionConflict } from '@/lib/xray/persistence/version-commit'
import { InvestigationService, type ExecutionStatusDto, type SubmissionMetadata,
  InvestigationResourceNotFound } from './investigation-service'

export interface ExecutionPlan {
  stages: readonly StageDefinition[]
  adapters?: StageAdapters
  stopEvidence?: StopEvidence
  maxAttempts?: number
  /**
   * A blocking review finding routed back to the stage that can address it.
   *
   * Supplying one invalidates that stage and everything positionally after it,
   * so the resume re-runs exactly the affected span. Without it a resume only
   * continues work that had not finished.
   */
  revision?: RevisionRequest
}
export interface InitialExecutionPlan extends ExecutionPlan {
  investigation: Investigation
  seed?: Partial<XRayGraphInput>
}
/** A provider-neutral plan factory; test stubs use the same stage/adapter ports. */
export interface ExecutionRuntime {
  initial(investigationId: string, submission: SubmissionMetadata | null): Promise<InitialExecutionPlan>
  resume(investigationId: string, submission: SubmissionMetadata | null): Promise<ExecutionPlan>
  /**
   * Stages and adapters for a re-evaluation of an already-committed version.
   *
   * Optional: a runtime that only ever does first research need not implement
   * it, and `startReevaluation` says so rather than silently running nothing.
   */
  reevaluation?(context: ReevaluationContext): Promise<ExecutionPlan>
}
/**
 * What a re-evaluation run is, before it runs.
 *
 * This is the C6 primitive's input. It is deliberately not ATI-shaped: an ATI
 * response is one reason to re-evaluate a committed investigation, alongside a
 * newly received source, a correction, and a plain reassessment. ATI is its
 * first caller (#10 C6, release 10d §A).
 */
export interface ReevaluationRequest {
  investigationId: string
  /** The version this run is seeded from. Must still be latest when seeded. */
  expectedPredecessorVersion: number
  trigger: InvestigationVersionTrigger
  /** Why this run exists, recorded durably before any stage executes. */
  cause: ExecutionCause
}

/** What the runtime is told when asked to plan a re-evaluation. */
export interface ReevaluationContext extends ReevaluationRequest {
  /** The exact committed snapshot the candidate starts from. Never mutated. */
  predecessor: XRayGraph
}

export interface ReevaluationStart {
  executionRunId: string
  status: ExecutionStatusDto
}

export class ExecutionNotRetryable extends Error {
  constructor(message = 'Completed or committed execution cannot be resumed') {
    super(message)
    this.name = 'ExecutionNotRetryable'
  }
}

export class InlineExecutionService {
  private readonly read: InvestigationService
  private readonly db: SnapshotDatabase
  private readonly runtime: ExecutionRuntime
  private readonly clock: () => string
  private readonly newRunId: () => string
  constructor(db: SnapshotDatabase, runtime: ExecutionRuntime,
    clock: () => string = () => new Date().toISOString(),
    newRunId: () => string = () => `RUN-${randomUUID()}`) {
    this.db = db
    this.runtime = runtime
    this.clock = clock
    this.newRunId = newRunId
    this.read = new InvestigationService(db)
  }

  private async checkpoint(executionRunId: string, startedAt: string, boundary: PipelineBoundary): Promise<void> {
    await this.db.query('BEGIN')
    try {
      const prior = await readExecutionAudit(this.db, executionRunId)
      const validations = [...prior.validations]
      if (boundary.kind === 'VALIDATE' && boundary.validation) {
        const gate = boundary.journal.gateEntries().at(-1)
        if (!gate || gate.gate !== 'VALIDATE') throw new Error('VALIDATE boundary lacks its gate')
        validations.push({ gateRunId: gate.id, result: boundary.validation })
      }
      await saveCandidateCheckpoint(this.db, { executionRunId,
        investigationId: boundary.journal.investigationId, startedAt, updatedAt: this.clock(),
        status: boundary.status, artifactVersion: boundary.artifactVersion,
        accumulator: boundary.accumulator, ledger: boundary.ledger, journal: boundary.journal },
      { inTransaction: true })
      await appendExecutionAudit(this.db, executionRunId, { journal: boundary.journal, validations,
        reviewHistory: boundary.reviewHistory ?? prior.reviewHistory }, { inTransaction: true })
      await this.db.query('COMMIT')
    } catch (error) {
      await this.db.query('ROLLBACK')
      throw error
    }
  }

  async startExecution(investigationId: string): Promise<ExecutionStatusDto> {
    const identity = await this.read.getInvestigation(investigationId)
    const plan = await this.runtime.initial(investigationId, identity.submission)
    if (plan.investigation.id !== investigationId) throw new Error('Execution plan investigation mismatch')
    const executionRunId = this.newRunId(), startedAt = this.clock()
    const accumulator = new GraphAccumulator(plan.investigation, plan.seed ?? {})
    const journal = new RunJournal(investigationId), ledger = new CorrelationLedger()
    await saveCandidateCheckpoint(this.db, { executionRunId, investigationId, startedAt, updatedAt: startedAt,
      status: 'PENDING', artifactVersion: 0, accumulator, journal, ledger })
    await runPipeline({ investigation: plan.investigation, stages: plan.stages,
      adapters: plan.adapters, stopEvidence: plan.stopEvidence, maxAttempts: plan.maxAttempts,
      resume: { accumulator, journal, ledger }, clock: this.clock,
      onBoundary: (boundary) => this.checkpoint(executionRunId, startedAt, boundary) })
    return this.read.getExecutionStatus(investigationId, executionRunId)
  }

  /**
   * Seed and run a re-evaluation of an already-committed investigation.
   *
   * THE C6 PRIMITIVE
   * ================
   * The generic answer to "research this again, for a reason, against an exact
   * predecessor". Nothing here knows what ATI is; the cause is opaque data and
   * the trigger is whatever the caller intends. There is no ATI-specific
   * version writer, and there was never going to be one — a second path to
   * `commitNextVersion` would be a second set of rules about immutable history.
   *
   * WHAT IT GUARANTEES BEFORE ANY STAGE RUNS
   * ========================================
   * 1. the expected predecessor is *currently* the latest committed version —
   *    a run seeded from a stale version would be building on history that has
   *    already moved, and would only discover it at commit;
   * 2. the candidate starts from that exact committed snapshot, read through
   *    the same `readSnapshot` every other reader uses;
   * 3. the run's cause is durable before it can do anything.
   *
   * The predecessor expectation is recorded with the cause rather than kept in
   * memory, so the commit's no-rebase rule can be checked against what the run
   * was actually seeded from.
   *
   * WHAT IT DOES NOT DO
   * ===================
   * It does not promote, assess or commit. Those are `GraduationService`'s, on
   * #7's rules, unchanged — including `VersionConflict` if another version
   * commits first. Nothing here rebases.
   */
  async startReevaluation(request: ReevaluationRequest): Promise<ReevaluationStart> {
    if (this.runtime.reevaluation === undefined)
      throw new Error('This runtime cannot plan a re-evaluation run')

    // The predecessor must be latest now, not merely exist. Seeding from a
    // superseded version is the silent rebase the no-rebase rule forbids.
    const found = (await this.db.query(
      'SELECT latest_committed_version FROM investigations WHERE id=$1',
      [request.investigationId])).rows
    const latest = found.length === 1
      ? found[0].latest_committed_version as number | null : null
    if (latest !== request.expectedPredecessorVersion)
      throw new VersionConflict(request.expectedPredecessorVersion, latest)

    const predecessor = await readSnapshot(
      this.db, request.investigationId, request.expectedPredecessorVersion)
    const plan = await this.runtime.reevaluation({ ...request, predecessor })

    const executionRunId = this.newRunId(), startedAt = this.clock()
    const investigation = nextRunInvestigation(predecessor, request)
    // The predecessor's canonical collections, inherited whole. The workspace
    // is mutable; the snapshot it was read from is not, and nothing here
    // writes back to it.
    const accumulator = new GraphAccumulator(investigation, seedFrom(predecessor))
    const journal = new RunJournal(request.investigationId), ledger = new CorrelationLedger()

    await this.db.query('BEGIN')
    try {
      await saveCandidateCheckpoint(this.db, { executionRunId,
        investigationId: request.investigationId, startedAt, updatedAt: startedAt,
        status: 'PENDING', artifactVersion: 0, accumulator, journal, ledger },
      { inTransaction: true })
      await recordExecutionCause(this.db, { ...request.cause, executionRunId,
        expectedPredecessorVersion: request.expectedPredecessorVersion,
        intendedTrigger: request.trigger, recordedAt: startedAt }, { inTransaction: true })
      await this.db.query('COMMIT')
    } catch (error) {
      await this.db.query('ROLLBACK')
      throw error
    }

    await runPipeline({ investigation, stages: plan.stages,
      adapters: plan.adapters, stopEvidence: plan.stopEvidence, maxAttempts: plan.maxAttempts,
      // This candidate carries the predecessor's graded findings, so a
      // pre-GRADE evidence change owes GRADE a repair. See `isStagedDebt`.
      successorReevaluation: true,
      resume: { accumulator, journal, ledger }, clock: this.clock,
      onBoundary: (boundary) => this.checkpoint(executionRunId, startedAt, boundary) })

    return {
      executionRunId,
      status: await this.read.getExecutionStatus(request.investigationId, executionRunId),
    }
  }

  /**
   * Continue or reopen a run.
   *
   * An explicit `revision` takes precedence over anything the runtime plans.
   * The caller asking for a revision is a decision about this run; the runtime
   * only knows how to execute stages.
   */
  async resumeExecution(investigationId: string, executionRunId: string,
    options: { revision?: RevisionRequest } = {}): Promise<ExecutionStatusDto> {
    const identity = await this.read.getInvestigation(investigationId)
    const status = await this.read.getExecutionStatus(investigationId, executionRunId)
    // A committed run is published history and is never re-entered (#7).
    if (status.committedVersion !== null)
      throw new ExecutionNotRetryable('Committed execution cannot be resumed')
    const workspaceExists = (await this.db.query(`SELECT 1 FROM candidate_workspaces WHERE execution_run_id=$1`,
      [executionRunId])).rows.length > 0
    if (!workspaceExists) throw new InvestigationResourceNotFound('CANDIDATE_WORKSPACE', executionRunId)
    const checkpoint = await loadCandidateCheckpoint(this.db, executionRunId)
    const prior = await readExecutionAudit(this.db, executionRunId)
    if (!isDeepStrictEqual(prior.journal.entries, checkpoint.journal.entries))
      throw new Error('Workspace and journal audit diverge')
    const planned = await this.runtime.resume(investigationId, identity.submission)
    const plan: ExecutionPlan = options.revision
      ? { ...planned, revision: options.revision }
      : planned
    // A completed run has nothing left to continue; only a revision reopens it,
    // because a revision is a new instruction rather than unfinished work.
    if (status.status === 'COMPLETED' && !plan.revision)
      throw new ExecutionNotRetryable('Completed execution can only be reopened by a revision')
    await runPipeline({ investigation: checkpoint.accumulator.snapshot().investigation,
      stages: plan.stages, adapters: plan.adapters, stopEvidence: plan.stopEvidence,
      maxAttempts: plan.maxAttempts, revision: plan.revision,
      resume: { accumulator: checkpoint.accumulator,
        journal: checkpoint.journal, ledger: checkpoint.ledger },
      reviewHistory: prior.reviewHistory, startArtifactVersion: checkpoint.artifactVersion,
      clock: this.clock, onBoundary: (boundary) => this.checkpoint(executionRunId, checkpoint.startedAt, boundary) })
    return this.read.getExecutionStatus(investigationId, executionRunId)
  }
}

/**
 * The predecessor's canonical collections, as a seed.
 *
 * Copied out rather than handed over: `structuredClone` means no stage can
 * reach the snapshot object the seed was read from, and the version envelope is
 * deliberately excluded — the candidate's version metadata is computed at
 * promotion from what the run actually produced, not inherited.
 */
function seedFrom(predecessor: XRayGraph): Partial<XRayGraphInput> {
  const { index: _index, investigation: _investigation, version: _version, ...collections } =
    predecessor
  return structuredClone(collections) as Partial<XRayGraphInput>
}

/**
 * The investigation record for a new research cycle over an old version.
 *
 * Identity and context carry; run-owned state does not. A candidate that
 * inherited `RESEARCH_COMPLETE`, a `completedAt` and the predecessor's
 * `researchStop` would be a finished run before it had done anything — and
 * `commitNextVersion` checks exactly those three fields to decide whether
 * research is complete, so it would have accepted the empty candidate as a
 * finished one.
 *
 * `stageRuns` starts empty for the same reason: the predecessor's journal is
 * history of a different execution.
 */
function nextRunInvestigation(
  predecessor: XRayGraph, request: ReevaluationRequest,
): Investigation {
  const {
    completedAt: _completedAt, researchStop: _researchStop, ...carried
  } = predecessor.investigation
  return {
    ...structuredClone(carried),
    currentVersion: request.expectedPredecessorVersion + 1,
    status: 'RUNNING',
    stageRuns: [],
  }
}
