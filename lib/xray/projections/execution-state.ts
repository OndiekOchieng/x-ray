/**
 * What an execution run actually did (#11 slice 11b).
 *
 * WHY THIS EXISTS
 * ===============
 * 11a found that capability-blocked and failed runs are truthful in the
 * architecture and **unrendered**: no run had ever reached a screen. A run that
 * could not do its work is the most honest thing this system produces, and it
 * was the least visible thing in it.
 *
 * THE PROPERTY IT HAS TO CARRY
 * ============================
 * Missing capability is not research success, and it is not evidence failure.
 * A run that ended `CAPABILITY_BLOCKED` establishes nothing about the source —
 * not that it is unverifiable, not that its claims are doubtful, not that the
 * research found nothing. It establishes that work was scheduled and could not
 * be done, and it commits no version.
 *
 * So the copy below never assesses the source. It says which stages did not
 * run and that nothing was concluded from them.
 */

import type { ExecutionStatusDto } from '@/lib/xray/application/investigation-service'

export type ExecutionOutcome =
  | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'CAPABILITY_BLOCKED' | 'STAGE_FAILED' | 'GATE_BLOCKED'

export interface ExecutionStageView {
  stage: string
  status: string
  /** `ran` · `did not run` · `failed`. A word, never only a colour. */
  label: string
}

export interface ExecutionStateView {
  investigationId: string
  executionRunId: string
  /** Exactly what the pipeline recorded. Never rewritten here. */
  outcome: ExecutionOutcome
  /**
   * True when no stage ran at all, whatever the recorded outcome.
   *
   * The pipeline decides its terminal status in a fixed order, and a gate
   * verdict is reached before the capability check. So a run whose every stage
   * was capability-blocked produces an empty graph, the VALIDATE gate
   * legitimately refuses it, and the durable status is `GATE_BLOCKED` — which
   * reads as a judgment about the result when the truth is that no result was
   * produced. This flag lets the surface say the true thing without rewriting
   * what #6 recorded. See the 11b report.
   */
  blockedBeforeResearch: boolean
  /** Short status, as a word. */
  statusLabel: string
  /** What happened, in one authored paragraph. Never an assessment of the source. */
  explanation: string
  /** Stages that were scheduled and did not run. Empty unless blocked. */
  stagesNotRun: readonly string[]
  /** Present only when a version was actually committed. */
  committedVersion: number | null
  stages: readonly ExecutionStageView[]
  /** True while more may yet happen. */
  inProgress: boolean
}

const STATUS_LABEL: Record<ExecutionOutcome, string> = {
  PENDING: 'Scheduled',
  RUNNING: 'Running',
  COMPLETED: 'Research complete',
  CAPABILITY_BLOCKED: 'Research capability unavailable',
  STAGE_FAILED: 'A stage failed',
  GATE_BLOCKED: 'A control gate refused the result',
}

const EXPLANATION: Record<ExecutionOutcome, string> = {
  PENDING:
    'This run has been created and has not started work yet.',
  RUNNING:
    'Research is running. Stages complete one at a time, and nothing is concluded until the control gates have run.',
  COMPLETED:
    'Every scheduled stage ran and both control gates were applied.',
  CAPABILITY_BLOCKED:
    'This deployment has no research provider configured, so the stages below were scheduled and could not run. Nothing was concluded from the work that did not happen: no evidence was gathered, no claim was graded, and no version was committed. This says nothing about the submitted source — only that X-Ray could not investigate it here.',
  STAGE_FAILED:
    'A stage stopped with an error and the stages after it did not run. No version was committed. This is a fault in the run, not a finding about the source.',
  GATE_BLOCKED:
    'The stages produced a result that a control gate refused, so nothing was committed. The gate’s objection is about the graph, not about the source.',
}

const STAGE_LABEL: Record<string, string> = {
  SUCCEEDED: 'ran',
  PENDING: 'did not run',
  FAILED: 'failed',
}

/**
 * Project one run's durable status.
 *
 * `PENDING` stage runs are how the pipeline records a stage that was scheduled
 * and never executed for want of a capability — not a stage that is about to
 * run. So on a blocked run they are precisely the stages that did not happen.
 */
export function executionStateView(status: ExecutionStatusDto): ExecutionStateView {
  const outcome = status.status as ExecutionOutcome
  const stages = status.stageRuns.map((run) => ({
    stage: run.stage,
    status: run.status,
    label: STAGE_LABEL[run.status] ?? run.status.toLowerCase(),
  }))
  const neverRan = stages.length > 0 && stages.every((stage) => stage.status === 'PENDING')
  const blockedBeforeResearch =
    neverRan && (outcome === 'CAPABILITY_BLOCKED' || outcome === 'GATE_BLOCKED')
  const blocked = outcome === 'CAPABILITY_BLOCKED' || blockedBeforeResearch
  return {
    investigationId: status.investigationId,
    executionRunId: status.executionRunId,
    outcome,
    blockedBeforeResearch,
    statusLabel: blockedBeforeResearch
      ? STATUS_LABEL.CAPABILITY_BLOCKED : (STATUS_LABEL[outcome] ?? outcome),
    explanation: blockedBeforeResearch
      ? EXPLANATION.CAPABILITY_BLOCKED : (EXPLANATION[outcome] ?? STATUS_LABEL[outcome] ?? outcome),
    stagesNotRun: blocked
      ? stages.filter((stage) => stage.status === 'PENDING').map((stage) => stage.stage)
      : [],
    committedVersion: status.committedVersion,
    stages,
    inProgress: outcome === 'PENDING' || outcome === 'RUNNING',
  }
}
