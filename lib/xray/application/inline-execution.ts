/** Synchronous execution commands backed by one durable execution_run_id. */
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Investigation } from '@/lib/xray/domain'
import type { XRayGraphInput } from '@/lib/xray/selectors'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import { runPipeline, type PipelineBoundary } from '@/lib/xray/pipeline/run'
import type { StageAdapters, StageDefinition } from '@/lib/xray/pipeline/stages'
import type { StopEvidence } from '@/lib/xray/pipeline/stop'
import type { RevisionRequest } from '@/lib/xray/review'
import { appendExecutionAudit, readExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import { loadCandidateCheckpoint, saveCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
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

  async resumeExecution(investigationId: string, executionRunId: string): Promise<ExecutionStatusDto> {
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
    const plan = await this.runtime.resume(investigationId, identity.submission)
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
