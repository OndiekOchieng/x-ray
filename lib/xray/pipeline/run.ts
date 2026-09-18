/**
 * Sequential pipeline execution with retry, resume and control gates.
 *
 * ORDER OF EXECUTION
 * ==================
 *   research stages (in order, one at a time)
 *     → STAGED validation after each
 *   VALIDATE gate  (FULL validation)
 *   REVIEW gate    (only if VALIDATE permitted it)
 *
 * The gates sit between artifact production and graduation, which is where
 * #6 D15 places them. They are not stages: they produce no artifact and no
 * artifact revision, and they are recorded as `GateRun`, not `StageRun`.
 *
 * WHY SEQUENTIAL (D10)
 * ====================
 * Concurrency would make canonical identity depend on completion order:
 * `TRACE` and `DISCONFIRM` both write evidence, and two concurrent allocators
 * over the same seed issue the same ids. Sequential until proven otherwise,
 * and the proof is a determinism test, not a benchmark (§17 amendment).
 *
 * WHY A FAILED ATTEMPT IS ROLLED BACK
 * ===================================
 * A retry must see exactly the state its predecessor saw, or it allocates
 * different ids for the same artifacts and every reference written against
 * the first attempt dangles. Rollback is what makes deterministic identity
 * survive retry.
 *
 * WHY STAGED VALIDATION FAILS THE STAGE (D9)
 * ==========================================
 * A stage that introduces a validator ERROR has not produced legal canonical
 * state, so it has not succeeded. Recording it as `SUCCEEDED` and discovering
 * the error at the gate would attribute the defect to whichever stage ran
 * last, which is precisely the information `RevisionRequest` needs to be
 * correct about.
 *
 * NOT IN THIS SLICE: no adapter, no provider, no persistence, no stop
 * assessment (6c), no graduation verdict (#5 owns it).
 *
 * PURITY: no fixture ids. The clock is injected.
 */

import type { Investigation, IsoDateTime, ResearchStage } from '@/lib/xray/domain'
import type { XRayGraph, XRayGraphInput } from '@/lib/xray/selectors'
import { validateXRayGraph, type ValidationResult } from '@/lib/xray/validation'
import {
  appendReviewRound,
  emptyReviewHistory,
  fingerprintGraph,
  reviewXRayGraph,
  type ReviewHistory,
  type ReviewResult,
} from '@/lib/xray/review'

import { GraphAccumulator, PipelineContractError } from './accumulator'
import { createIdentityAllocator, nextGateRunId, nextStageRunId, seedFrom } from './identity'
import { RunJournal, type GateOutcome, type GateResultRef, type GateRun } from './journal'
import { RESEARCH_STAGES, type StageContext, type StageDefinition } from './stages'

export interface RunOptions {
  investigation: Investigation
  /** Executable stages. Any absent stage is not run; order comes from `RESEARCH_STAGES`. */
  stages: readonly StageDefinition[]
  /** Artifacts already accumulated. Empty for a fresh run. */
  seed?: Partial<XRayGraphInput>
  /** Attempts per stage, inclusive of the first. Defaults to 1 — no retry. */
  maxAttempts?: number
  /**
   * Resume state from an interrupted run. Stages already `SUCCEEDED` in this
   * journal are skipped, and their artifacts must be supplied via `seed`.
   */
  resume?: { journal: RunJournal; accumulator: GraphAccumulator }
  /** In-run artifact revision to start from. Not an `InvestigationVersion`. */
  startArtifactVersion?: number
  /** Injected so a run is reproducible. Defaults to a fixed epoch, not now(). */
  clock?: () => IsoDateTime
}

export type RunStatus =
  /** Every scheduled stage succeeded and both gates ran. */
  | 'COMPLETED'
  /** A stage exhausted its attempts. Downstream stages did not run. */
  | 'STAGE_FAILED'
  /** Stages completed; a gate refused to let the run proceed. */
  | 'GATE_BLOCKED'

export interface PipelineRunResult {
  investigationId: string
  status: RunStatus
  journal: RunJournal
  accumulator: GraphAccumulator
  /** The read aggregate over final accumulated state. */
  graph: XRayGraph
  /** Final in-run artifact revision. */
  artifactVersion: number
  /** Stage that exhausted its attempts, when `status` is `STAGE_FAILED`. */
  failedStage?: ResearchStage
  /** FULL validation at the `VALIDATE` gate. Absent if stages did not finish. */
  validation?: ValidationResult
  /** Review at the `REVIEW` gate. Absent if the gate was skipped. */
  review?: ReviewResult
  /** The durable review record. The gate references this; it does not copy it. */
  reviewHistory?: ReviewHistory
}

const EPOCH = '1970-01-01T00:00:00Z'

export async function runPipeline(options: RunOptions): Promise<PipelineRunResult> {
  const { investigation } = options
  const investigationId = investigation.id
  const clock = options.clock ?? ((): IsoDateTime => EPOCH)
  const maxAttempts = Math.max(1, options.maxAttempts ?? 1)

  const journal = options.resume?.journal ?? new RunJournal(investigationId)
  const accumulator =
    options.resume?.accumulator ?? new GraphAccumulator(investigation, options.seed ?? {})

  const byStage = new Map(options.stages.map((s) => [s.stage, s]))
  const alreadyDone = new Set(journal.succeededStages())

  let artifactVersion = options.startArtifactVersion ?? 0
  let failedStage: ResearchStage | undefined

  // -------------------------------------------------------------------------
  // Research stages
  // -------------------------------------------------------------------------

  for (const stage of RESEARCH_STAGES) {
    const definition = byStage.get(stage)
    if (definition === undefined) continue
    if (alreadyDone.has(stage)) continue

    let succeeded = false

    for (let attempt = 1; attempt <= maxAttempts && !succeeded; attempt += 1) {
      const restorePoint = accumulator.checkpoint()
      const runId = nextStageRunId(runIdPool(investigation, journal))
      const startedAt = clock()

      try {
        const ctx: StageContext = {
          investigationId,
          graph: accumulator.rebuild(),
          ids: allocator(accumulator),
          inputArtifactVersion: artifactVersion,
          attempt,
        }

        accumulator.merge(stage, await definition.run(ctx))

        // D9 — the stage owns the legality of what it produced.
        const staged = validateXRayGraph(accumulator.rebuild(), { mode: 'STAGED' })
        if (!staged.valid) {
          throw new PipelineContractError(
            `stage ${stage} introduced ${staged.summary.errorCount} validation error(s): ` +
              staged.violations
                .filter((v) => v.severity === 'ERROR')
                .map((v) => v.code)
                .join(', '),
          )
        }

        journal.appendStage({
          id: runId,
          investigationId,
          stage,
          status: 'SUCCEEDED',
          inputArtifactVersion: artifactVersion,
          outputArtifactVersion: artifactVersion + 1,
          startedAt,
          completedAt: clock(),
        })

        artifactVersion += 1
        succeeded = true
      } catch (err) {
        // Nothing this attempt produced survives, so the retry allocates the
        // same identities the failed attempt did.
        accumulator.restore(restorePoint)

        journal.appendStage({
          id: runId,
          investigationId,
          stage,
          status: 'FAILED',
          // No output revision: a failed stage produced no artifact state.
          inputArtifactVersion: artifactVersion,
          startedAt,
          completedAt: clock(),
          error: (err as Error).message,
        })
      }
    }

    if (!succeeded) {
      failedStage = stage
      break
    }
  }

  if (failedStage !== undefined) {
    return {
      investigationId,
      status: 'STAGE_FAILED',
      journal,
      accumulator,
      graph: accumulator.rebuild(),
      artifactVersion,
      failedStage,
    }
  }

  // -------------------------------------------------------------------------
  // Control gates
  // -------------------------------------------------------------------------

  const graph = accumulator.rebuild()

  const validation = validateXRayGraph(graph, { mode: 'FULL' })
  const validateOutcome: GateOutcome = !validation.valid
    ? 'BLOCKED'
    : validation.summary.warningCount > 0
      ? 'CONCERNS'
      : 'CLEAR'

  appendGate(journal, investigation, {
    gate: 'VALIDATE',
    investigationId,
    inspectedArtifactVersion: artifactVersion,
    outcome: validateOutcome,
    result: {
      kind: 'VALIDATION',
      valid: validation.valid,
      errorCount: validation.summary.errorCount,
      warningCount: validation.summary.warningCount,
    },
    clock,
  })

  // #4 D1 — the Reviewer runs only on validator-clean graphs.
  if (validateOutcome === 'BLOCKED') {
    appendGate(journal, investigation, {
      gate: 'REVIEW',
      investigationId,
      inspectedArtifactVersion: artifactVersion,
      outcome: 'SKIPPED',
      clock,
      error: 'VALIDATE gate blocked the run; the Reviewer does not run on a failing graph.',
    })

    return {
      investigationId,
      status: 'GATE_BLOCKED',
      journal,
      accumulator,
      graph,
      artifactVersion,
      validation,
    }
  }

  const review = reviewXRayGraph(graph, { validation, reviewedAt: clock() })
  const reviewHistory = appendReviewRound(emptyReviewHistory(investigationId), review)

  appendGate(journal, investigation, {
    gate: 'REVIEW',
    investigationId,
    inspectedArtifactVersion: artifactVersion,
    outcome: review.summary.blockingFindings > 0 ? 'CONCERNS' : 'CLEAR',
    result: {
      kind: 'REVIEW_HISTORY',
      investigationId,
      roundIndex: reviewHistory.rounds.length - 1,
      graphFingerprint: fingerprintGraph(graph),
    },
    clock,
  })

  return {
    investigationId,
    status: 'COMPLETED',
    journal,
    accumulator,
    graph,
    artifactVersion,
    validation,
    review,
    reviewHistory,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A fresh allocator over current state.
 *
 * Rebuilt for every attempt rather than carried across them. An allocator
 * that survived a rolled-back attempt would have advanced its counters past
 * artifacts that no longer exist, and the retry would skip identifiers.
 */
function allocator(accumulator: GraphAccumulator) {
  return createIdentityAllocator(seedFrom(accumulator.snapshot()))
}

/**
 * Run record ids are seeded from the historical `StageRun`s on the
 * investigation as well as this run's journal, so a resumed run does not
 * reissue an id the interrupted one already used.
 */
function runIdPool(investigation: Investigation, journal: RunJournal): string[] {
  return [...investigation.stageRuns.map((r) => r.id), ...journal.runIds()]
}

function appendGate(
  journal: RunJournal,
  investigation: Investigation,
  spec: Omit<GateRun, 'id' | 'status' | 'startedAt' | 'completedAt'> & {
    clock: () => IsoDateTime
    error?: string
  },
): void {
  const { clock, ...rest } = spec
  const at = clock()
  journal.appendGate({
    id: nextGateRunId(runIdPool(investigation, journal)),
    status: rest.outcome === 'SKIPPED' ? 'PENDING' : 'SUCCEEDED',
    startedAt: at,
    completedAt: at,
    ...rest,
  })
}
