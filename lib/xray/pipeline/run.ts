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
 * No provider, persistence, or graduation verdict is authored here.
 *
 * PURITY: no fixture ids. The clock is injected.
 */

import type { Investigation, IsoDateTime, ResearchStage } from '@/lib/xray/domain'
import type { RevisionRequest } from '@/lib/xray/review'
import type { XRayGraph, XRayGraphInput } from '@/lib/xray/selectors'
import { validateXRayGraph, type ValidationResult, type ViolationCode } from '@/lib/xray/validation'
import {
  appendReviewRound,
  emptyReviewHistory,
  fingerprintGraph,
  collectModelJudgments,
  reviewXRayGraph,
  type ModelJudgmentSet,
  type ReviewerModel,
  type ReviewHistory,
  type ReviewResult,
} from '@/lib/xray/review'

import { AdapterFailure, type CapabilityUnavailable } from '@/lib/xray/capability'

import { GraphAccumulator, PipelineContractError } from './accumulator'
import { CorrelationLedger } from './correlation'
import {
  createIdentityAllocator,
  nextCapabilityRunId,
  nextGateRunId,
  nextStageRunId,
  seedFrom,
} from './identity'
import { RunJournal, type GateOutcome, type GateRun } from './journal'
import { assessResearchStop, type StopEvidence } from './stop'
import {
  RESEARCH_STAGES,
  isCapabilityOutcome,
  type StageAdapters,
  type StageContext,
  type StageDefinition,
} from './stages'

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
  resume?: { journal: RunJournal; accumulator: GraphAccumulator; ledger?: CorrelationLedger }
  /** In-run artifact revision to start from. Not an `InvestigationVersion`. */
  startArtifactVersion?: number
  /** Injected so a run is reproducible. Defaults to a fixed epoch, not now(). */
  clock?: () => IsoDateTime

  /**
   * Adapters available to stages. Both optional.
   *
   * A run with neither is legal and completes: every stage that needs one
   * reports the gap, the run records it, and graduation later reports
   * `BLOCKED` rather than accusing the graph of a defect (#6 D19).
   */
  adapters?: StageAdapters
  /** Affirmative research-stop observation. No observation means no inferred saturation. */
  stopEvidence?: StopEvidence
  /**
   * This run re-researches an already-committed version.
   *
   * Declared, never inferred. It permits exactly one piece of staged debt —
   * see `isStagedDebt` — and nothing else about the run changes.
   *
   * A successor candidate is seeded with the predecessor's *graded* findings.
   * The moment a pre-`GRADE` stage adds evidence bearing on one of those
   * claims, the inherited finding stops mirroring `Evidence.relationship`, and
   * no stage before `GRADE` can repair it because none of them owns `findings`.
   * Without this flag, adding evidence to an already-graded investigation is
   * unrepresentable: `TRACE` fails on the mismatch it just created, and if
   * `TRACE` were exempted alone `PROVENANCE` would fail on the same inherited
   * mismatch one stage later.
   *
   * A first research run must not set this. It has no graded findings to owe
   * anything against, so the flag would grant it licence it cannot need.
   */
  successorReevaluation?: boolean

  /** Route a blocking reviewer request through its target and later stages. */
  revision?: RevisionRequest
  /** Prior rounds are retained across revisions. */
  reviewHistory?: ReviewHistory

  /**
   * The reviewer the REVIEW gate asks. Absent means model-assisted checks stay
   * NOT_EVALUATED, which is #4's promise rather than a defect.
   *
   * Deliberately **not** in `StageAdapters`. A research stage must never
   * receive a reviewer: `ctx.adapters` carries `{ model?, research? }` and
   * nothing else, so a stage cannot ask for a judgment about the graph it is
   * building. The reviewer arrives here, is used by the gate, and is never put
   * anywhere a stage can reach.
   *
   * First light showed why this field has to exist: `RunOptions` carried
   * neither a reviewer nor judgments, so the gate called the synchronous
   * `reviewXRayGraph` and every model-assisted check was NOT_EVALUATED in
   * every run — live reviewer or not.
   */
  reviewer?: ReviewerModel
  /** Awaited after each durable stage attempt/gate and before returning. */
  onBoundary?: (boundary: PipelineBoundary) => Promise<void>
}

export interface PipelineBoundary {
  /**
   * `CONTROL` marks a journal mutation that changes what the run will do next
   * without executing a stage: an invalidation, a resume, or a recorded stop.
   * They are raised immediately after the append, so a process loss cannot
   * land between mutating the journal and making that mutation durable.
   */
  kind: 'CONTROL' | 'STAGE_ATTEMPT' | 'VALIDATE' | 'REVIEW' | 'TERMINAL'
  /** `RUNNING` while the command is executing; a `RunStatus` once terminal. */
  status: RunStatus | 'RUNNING'
  /** Present when `kind` is `CONTROL`. Identifies the exact transition made. */
  control?: {
    transition: 'INVALIDATION' | 'RESUMED' | 'STOPPED'
    /** Journal entry id the transition appended. */
    entryId: string
  }
  journal: RunJournal
  accumulator: GraphAccumulator
  ledger: CorrelationLedger
  artifactVersion: number
  validation?: ValidationResult
  reviewHistory?: ReviewHistory
}

export type RunStatus =
  /** Every scheduled stage succeeded and both gates ran. */
  | 'COMPLETED'
  /**
   * One or more stages could not run for want of a capability.
   *
   * Not a failure. No stage broke and nothing is known to be wrong with the
   * graph; work was simply not done. The gates still run, so the state that
   * *was* produced is still checked, and 6c converts the recorded gaps into
   * graduation blockers (D19).
   */
  | 'CAPABILITY_BLOCKED'
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
  /** Capability gaps observed. Empty unless a stage reported one. */
  capabilityGaps: readonly CapabilityUnavailable[]
  /** Key-to-id bindings, so a resumed run correlates against the same state. */
  ledger: CorrelationLedger
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
  const adapters: StageAdapters = options.adapters ?? {}
  const ledger = options.resume?.ledger ?? new CorrelationLedger()

  let artifactVersion = options.startArtifactVersion ?? 0
  let failedStage: ResearchStage | undefined
  const capabilityGaps: CapabilityUnavailable[] = []
  const boundary = async (kind: PipelineBoundary['kind'], status: PipelineBoundary['status'],
    validation?: ValidationResult, reviewHistory?: ReviewHistory,
    control?: PipelineBoundary['control']) => {
    await options.onBoundary?.({ kind, status, journal, accumulator, ledger, artifactVersion,
      ...(validation === undefined ? {} : { validation }),
      ...(reviewHistory === undefined ? {} : { reviewHistory }),
      ...(control === undefined ? {} : { control }) })
  }

  /**
   * Record a control transition and make it durable before anything acts on it.
   *
   * The stop is cleared before the journal is appended, so the state observed
   * at the boundary is already coherent: no durable checkpoint ever shows a run
   * that has been invalidated while still claiming to have stopped.
   */
  const control = async (transition: 'INVALIDATION' | 'RESUMED' | 'STOPPED', entryId: string) => {
    await boundary('CONTROL', 'RUNNING', undefined, undefined, { transition, entryId })
  }

  // -------------------------------------------------------------------------
  // Control transitions, before any stage is scheduled
  // -------------------------------------------------------------------------

  if (options.revision) {
    const target = RESEARCH_STAGES.indexOf(options.revision.stage)
    const staleStages = RESEARCH_STAGES.slice(target).filter((stage) => byStage.has(stage))
    accumulator.setResearchStop(undefined)
    const invalidationId = `IR-${journal.length + 1}`
    journal.appendInvalidation({
      id: invalidationId,
      investigationId,
      requestId: options.revision.id,
      target: options.revision.stage,
      staleStages,
      observedAt: clock(),
    })
    await control('INVALIDATION', invalidationId)
    const resumedId = `TR-${journal.length + 1}`
    journal.appendStop({ id: resumedId, investigationId, action: 'RESUMED', observedAt: clock() })
    await control('RESUMED', resumedId)
  }
  if (options.resume && !options.revision && journal.stopEntries().at(-1)?.action === 'STOPPED') {
    accumulator.setResearchStop(undefined)
    const resumedId = `TR-${journal.length + 1}`
    journal.appendStop({ id: resumedId, investigationId, action: 'RESUMED', observedAt: clock() })
    await control('RESUMED', resumedId)
  }

  // Computed after invalidation: a stage marked stale must not count as done.
  const alreadyDone = new Set(journal.succeededStages())

  /**
   * Whether a staged violation is debt this exact boundary is allowed to carry.
   *
   * D9's rule is that a stage owns the legality of what it produced, and it
   * stays that way: these are the only two cases where a stage may leave an
   * error standing, both of them because the stage that will repair it has not
   * had its turn yet, and both bounded so the debt cannot outlive that turn.
   *
   * Nothing here weakens a validator. `validateXRayGraph` reports both
   * violations in both modes, unchanged; this is a rule about *when a
   * transition is acceptable*, and the `VALIDATE` gate's FULL pass sees the
   * final state with no exemption at all.
   */
  const isStagedDebt = (stage: ResearchStage, code: ViolationCode): boolean => {
    /*
     * 6a · GRADE cannot attach a gap GAPS has not identified yet.
     *
     * `Finding.gapIds` is a back-reference and GAPS is stage 9, so between
     * GRADE and GAPS an unresolved finding necessarily names no gap.
     */
    if (stage === 'GRADE' && journal.staleStages().includes('GAPS') &&
        code === 'XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP') return true

    /*
     * 10d · a pre-GRADE evidence change during a successor re-evaluation.
     *
     * Bounded on every side, and each bound is load-bearing:
     *
     *   successor re-evaluation only — a first run has no graded findings to
     *     owe against, so it can never claim this;
     *   before GRADE only — GRADE itself gets no exemption, which is what
     *     makes it fail if it does not repair the finding;
     *   GRADE scheduled and still to run — if GRADE is omitted from the plan,
     *     or already done and not being redone, nothing will repair the debt
     *     and it is not debt, it is a defect;
     *   this one code only — every other violation still fails the stage that
     *     introduced it.
     *
     * So the debt exists from the first pre-GRADE evidence change until GRADE
     * takes its turn, and not one boundary longer.
     */
    if (code === 'XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH' &&
        options.successorReevaluation === true &&
        RESEARCH_STAGES.indexOf(stage) < RESEARCH_STAGES.indexOf('GRADE') &&
        byStage.has('GRADE') && !alreadyDone.has('GRADE')) return true

    return false
  }

  // -------------------------------------------------------------------------
  // Research stages
  // -------------------------------------------------------------------------

  for (const stage of RESEARCH_STAGES) {
    const definition = byStage.get(stage)
    if (definition === undefined) continue
    if (alreadyDone.has(stage)) continue

    let succeeded = false
    let unavailable = false

    for (let attempt = 1; attempt <= maxAttempts && !succeeded && !unavailable; attempt += 1) {
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
          adapters,
          correlation: { investigationId, stage, inputArtifactVersion: artifactVersion },
          ledger,
        }

        const outcome = await definition.run(ctx)

        // A capability gap is not an attempt that went wrong, so it is not
        // retried: asking an unconfigured adapter a second time gets the same
        // answer and a longer journal (D19).
        if (isCapabilityOutcome(outcome)) {
          accumulator.restore(restorePoint)
          capabilityGaps.push(outcome)

          journal.appendCapability({
            id: nextCapabilityRunId(runIdPool(investigation, journal)),
            investigationId,
            stage,
            observedArtifactVersion: artifactVersion,
            unavailable: outcome,
            observedAt: clock(),
          })

          // PENDING, not FAILED: scheduled, never executed, nothing broken.
          journal.appendStage({
            id: runId,
            investigationId,
            stage,
            status: 'PENDING',
            inputArtifactVersion: artifactVersion,
            startedAt,
            completedAt: clock(),
          })

          unavailable = true
          continue
        }

        const revising = journal.staleStages().includes(stage)
        accumulator.merge(stage, outcome)

        // D9 — the stage owns the legality of what it produced.
        const staged = validateXRayGraph(accumulator.rebuild(), { mode: 'STAGED' })
        const transitionErrors = staged.violations.filter((v) =>
          v.severity === 'ERROR' && !isStagedDebt(stage, v.code))
        if (transitionErrors.length > 0) {
          throw new PipelineContractError(
            `stage ${stage} introduced ${transitionErrors.length} validation error(s): ` +
              transitionErrors
                .map((v) => v.code)
                .join(', '),
          )
        }

        // Validate against the retained referential scaffold, then remove
        // omitted prior outputs. Stale downstream references can temporarily
        // dangle until their owning stages rerun; FULL never sees that state.
        if (revising) accumulator.replace(stage, outcome)

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

        // A permanent adapter failure is not retried. Re-sending a request the
        // provider has already refused produces the same refusal.
        if (err instanceof AdapterFailure && err.disposition === 'PERMANENT') {
          attempt = maxAttempts
        }

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
      } finally {
        // Outside the stage error handler: persistence failure must never be
        // misreported as a failed research attempt.
        await boundary('STAGE_ATTEMPT', 'RUNNING')
      }
    }

    // A stage that could not run blocks nothing downstream: later stages may
    // still have everything they need, and those that do not will report their
    // own gap. Stopping here would hide capability gaps behind the first one.
    if (unavailable) continue

    if (!succeeded) {
      failedStage = stage
      break
    }
  }

  if (failedStage !== undefined) {
    await boundary('TERMINAL', 'STAGE_FAILED')
    return {
      investigationId,
      status: 'STAGE_FAILED',
      journal,
      accumulator,
      graph: accumulator.rebuild(),
      artifactVersion,
      failedStage,
      capabilityGaps: journal.activeCapabilityEntries().map((entry) => entry.unavailable),
      ledger,
    }
  }

  // -------------------------------------------------------------------------
  // Control gates
  // -------------------------------------------------------------------------

  /*
   * TWO WAYS A RUN ENDS BEFORE THE GATES
   * ====================================
   * Both are the same statement: there is no research candidate for a control
   * gate to judge. `GATE_BLOCKED` means a produced candidate was refused, and
   * refusing something nothing produced would attribute to the graph what
   * belongs to the work that did not happen.
   *
   * 1 · Stale stages. A revision invalidated work that has not been redone.
   *
   * 2 · Capability absence with nothing produced (#6 amendment, 2026-09-21).
   *     Every scheduled research stage reported a capability gap and none
   *     succeeded, so D19's rule applies in full: unconfigured capability is a
   *     run-level blocker, not a graph defect. 11b surfaced the contradiction —
   *     the default unconfigured runtime produced an empty graph, FULL
   *     validation legitimately refused it, and the run durably recorded
   *     `GATE_BLOCKED` for work that was never attempted.
   *
   * DELIBERATELY NARROW. This is not "capability outranks validation". The
   * moment **any** research stage succeeds there is a candidate, and the run
   * goes on to FULL validation — which may legitimately refuse an invalid
   * partial candidate as `GATE_BLOCKED`.
   *
   * Read from execution history, never from graph emptiness: a stage that
   * deliberately contributed nothing is not the same fact as a stage that
   * never ran, and only the journal can tell them apart.
   *
   * Neither branch manufactures a `ResearchStop`, and neither appends a
   * `VALIDATE` or `REVIEW` gate record — a failed-stage run already
   * establishes that the gates do not inspect state no research stage
   * vouched for.
   */
  const producedNothing = journal.succeededStages().length === 0
  const blockedOnCapability = journal.activeCapabilityEntries().length > 0 && producedNothing

  if (journal.staleStages().length > 0 || blockedOnCapability) {
    await boundary('TERMINAL', 'CAPABILITY_BLOCKED')
    return {
      investigationId, status: 'CAPABILITY_BLOCKED', journal, accumulator,
      graph: accumulator.rebuild(), artifactVersion, capabilityGaps: journal.activeCapabilityEntries().map((entry) => entry.unavailable), ledger,
    }
  }

  const assessment = assessResearchStop(accumulator.rebuild(), options.stopEvidence)
  if (assessment.stop && journal.activeCapabilityEntries().length === 0) {
    accumulator.setResearchStop(assessment.stop)
    const stoppedId = `TR-${journal.length + 1}`
    journal.appendStop({
      id: stoppedId, investigationId, action: 'STOPPED', stop: assessment.stop, observedAt: clock(),
    })
    await control('STOPPED', stoppedId)
  }
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
  await boundary('VALIDATE', 'RUNNING', validation)

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
    await boundary('REVIEW', 'RUNNING', validation)
    await boundary('TERMINAL', 'GATE_BLOCKED', validation)

    return {
      investigationId,
      status: 'GATE_BLOCKED',
      journal,
      accumulator,
      graph,
      artifactVersion,
      validation,
      capabilityGaps: journal.activeCapabilityEntries().map((entry) => entry.unavailable),
      ledger,
    }
  }

  /*
   * Ask the reviewer, then review as a pure function of the graph and the
   * answers. `collectModelJudgments` is the only thing that talks to a model;
   * `reviewXRayGraph` stays pure, so a recorded review can be reproduced from
   * its judgments rather than by asking again.
   *
   * An outage is not caught. `collectModelJudgments` documents why: swallowing
   * it would report an outage as a capability gap an operator cannot act on.
   * What must not happen is a *fabricated* review, so the gate is journalled
   * SKIPPED with the reason and the run ends GATE_BLOCKED — no round is
   * appended, and graduation therefore has nothing eligible to commit.
   */
  let judgments: ModelJudgmentSet | undefined
  if (options.reviewer !== undefined) {
    try {
      judgments = await collectModelJudgments(graph, options.reviewer)
    } catch (error) {
      appendGate(journal, investigation, {
        gate: 'REVIEW',
        investigationId,
        inspectedArtifactVersion: artifactVersion,
        outcome: 'SKIPPED',
        clock,
        error: `The reviewer could not be reached: ${
          error instanceof Error ? error.message : String(error)}`,
      })
      await boundary('REVIEW', 'RUNNING', validation)
      await boundary('TERMINAL', 'GATE_BLOCKED', validation)
      return {
        investigationId,
        status: 'GATE_BLOCKED',
        journal,
        accumulator,
        graph,
        artifactVersion,
        validation,
        capabilityGaps: journal.activeCapabilityEntries().map((entry) => entry.unavailable),
        ledger,
      }
    }
  }

  const review = reviewXRayGraph(graph, {
    validation,
    ...(options.reviewer === undefined ? {} : { model: options.reviewer }),
    ...(judgments === undefined ? {} : { judgments }),
    reviewedAt: clock(),
  })
  const reviewHistory = appendReviewRound(options.reviewHistory ?? emptyReviewHistory(investigationId), review)

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
  await boundary('REVIEW', 'RUNNING', validation, reviewHistory)

  await boundary('TERMINAL', journal.activeCapabilityEntries().length > 0 ? 'CAPABILITY_BLOCKED' : 'COMPLETED',
    validation, reviewHistory)

  return {
    investigationId,
    // A run that could not do some of its work did not complete, even though
    // nothing failed. Saying COMPLETED here would be the exact conflation
    // BLOCKED exists to prevent.
    status: journal.activeCapabilityEntries().length > 0 ? 'CAPABILITY_BLOCKED' : 'COMPLETED',
    journal,
    accumulator,
    graph,
    artifactVersion,
    validation,
    review,
    reviewHistory,
    capabilityGaps: journal.activeCapabilityEntries().map((entry) => entry.unavailable),
    ledger,
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
