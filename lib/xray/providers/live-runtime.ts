/**
 * Composing the live `ExecutionRuntime` (#20 slice 20d).
 *
 * WHAT THIS IS
 * ============
 * The one place the three implemented ports become a runtime the application
 * already knows how to drive. `ExecutionRuntime` is #8's seam; `liveStages`
 * are provider-neutral stages over #6's ports; `composeProviders` is 20a's
 * resolution. This joins them and adds nothing.
 *
 * NO SILENT FALLBACK — THE WHOLE POINT
 * ====================================
 * A runtime is composed only when **every** slot the run needs resolved
 * `AVAILABLE`. Anything else returns a runtime whose stages report exactly
 * which slots are missing and why — so the run ends `CAPABILITY_BLOCKED` with
 * actionable gaps, rather than half-researching with whatever happened to be
 * configured.
 *
 * That matters more than it sounds. A deployment with a research model and no
 * retrieval could technically decompose a record and then find nothing, which
 * would look exactly like an exhaustive search that came up empty. Refusing to
 * compose is what keeps those two apart.
 *
 * REVIEW IS SEPARATE
 * ==================
 * The reviewer is not a `StageAdapters` member: `reviewXRayGraph` takes a
 * `ReviewerModel` directly, and the gate that calls it is not a research
 * stage. So this module exposes the resolved reviewer for the caller that runs
 * the REVIEW gate, and does not smuggle it into the pipeline.
 */

import type { ResearchAdapter } from '@/lib/xray/pipeline/retrieval-port'
import type { ResearchModel } from '@/lib/xray/pipeline/model-port'
import type { ReviewerModel } from '@/lib/xray/review'
import type { StageAdapters, StageDefinition } from '@/lib/xray/pipeline/stages'
import { RESEARCH_STAGES } from '@/lib/xray/pipeline/stages'
import { unavailable } from '@/lib/xray/capability'
import type {
  ExecutionPlan, ExecutionRuntime, InitialExecutionPlan,
} from '@/lib/xray/application/inline-execution'
import { submittedInvestigation } from '@/lib/xray/application/runtime'
import { composeProviders, describeResolution, type ComposedProviders } from './registry'
import type { Environment } from './config'
import { liveStages, newRunMaterial, type RunMaterial } from './live-stages'

/** What a composition attempt produced. */
export type RuntimeComposition =
  | {
    readonly status: 'COMPOSED'
    readonly runtime: ExecutionRuntime
    /** For the caller that runs the REVIEW gate. Not a pipeline adapter. */
    readonly reviewer: ReviewerModel
    readonly summary: string
  }
  | {
    readonly status: 'INCOMPLETE'
    /** Slot names that did not resolve, with the reason for each. */
    readonly missing: readonly { readonly slot: string; readonly reason: string }[]
    readonly summary: string
  }

export interface LiveRuntimeOptions {
  readonly environment?: Environment
  readonly researchCutoffAt?: string
  readonly retrieveLimit?: number
  readonly now?: () => string
}

/**
 * Resolve the environment and compose, or say precisely what is missing.
 *
 * Never throws for a configuration problem. A missing key is a capability
 * fact, and `capability.ts` argues the case: absence is a value so the caller
 * has to handle it.
 */
export async function composeLiveRuntime(
  options: LiveRuntimeOptions = {},
): Promise<RuntimeComposition> {
  const composed = composeProviders(options.environment)
  return buildFrom(composed, options)
}

async function buildFrom(
  composed: ComposedProviders, options: LiveRuntimeOptions,
): Promise<RuntimeComposition> {
  const slots = [
    { slot: 'RESEARCH_MODEL', resolution: composed.research },
    { slot: 'REVIEWER_MODEL', resolution: composed.reviewer },
    { slot: 'RETRIEVAL', resolution: composed.retrieval },
  ] as const

  const missing = slots
    .filter(({ resolution }) => resolution.status !== 'AVAILABLE')
    .map(({ slot, resolution }) => ({ slot, reason: describeResolution(resolution) }))

  if (missing.length > 0) {
    return {
      status: 'INCOMPLETE',
      missing,
      summary: `Live research is not configured: ${
        missing.map(({ slot }) => slot).join(', ')} unavailable.`,
    }
  }

  // Narrowed by the filter above; each `create` is called exactly once, here,
  // so one process holds one adapter per slot rather than one per run.
  const model = await (composed.research as { create(): Promise<ResearchModel> }).create()
  const reviewer = await (composed.reviewer as { create(): Promise<ReviewerModel> }).create()
  const research = await (composed.retrieval as { create(): Promise<ResearchAdapter> }).create()

  return {
    status: 'COMPOSED',
    runtime: liveRuntime({ model, research }, options),
    reviewer,
    summary: `Live research configured: model ${model.name}, retrieval ${
      research.name}, reviewer ${reviewer.name}.`,
  }
}

/**
 * The runtime itself.
 *
 * `initial` needs the submitted URL, which only the submission carries — so
 * the stages are built per plan rather than once, and each plan gets its own
 * `RunMaterial`. A resume builds a fresh plan for the same reason: the run's
 * canonical state is durable, but material held in memory is not, and
 * pretending otherwise would let a resumed run read a document from a process
 * that no longer exists.
 */
export function liveRuntime(
  adapters: StageAdapters, options: LiveRuntimeOptions = {},
): ExecutionRuntime {
  const now = options.now ?? (() => new Date().toISOString())

  const stagesFor = (sourceUrl: string, material: RunMaterial): readonly StageDefinition[] =>
    liveStages({
      sourceUrl,
      material,
      // The same clock the runtime uses. A stage recording when X-Ray obtained
      // a record must read it from somewhere injected, not from a global.
      now,
      ...(options.researchCutoffAt === undefined
        ? {} : { researchCutoffAt: options.researchCutoffAt }),
      ...(options.retrieveLimit === undefined
        ? {} : { retrieveLimit: options.retrieveLimit }),
    })

  return {
    async initial(investigationId, submission): Promise<InitialExecutionPlan> {
      const createdAt = submission?.createdAt ?? now()
      if (submission === null) {
        // No URL, no research. Reported per stage so the run is blocked with a
        // reason rather than failing.
        return {
          investigation: submittedInvestigation(investigationId, createdAt),
          stages: blockedStages(
            'No submitted URL is recorded for this investigation, so there is'
            + ' nothing to research.',
            'Submit a URL for this investigation before starting research.'),
          maxAttempts: 1,
        }
      }
      return {
        investigation: submittedInvestigation(investigationId, createdAt),
        stages: stagesFor(submission.sourceUrl, newRunMaterial()),
        adapters,
        maxAttempts: 2,
      }
    },

    async resume(investigationId, submission): Promise<ExecutionPlan> {
      void investigationId
      if (submission === null) {
        return {
          stages: blockedStages(
            'No submitted URL is recorded for this investigation, so a resume has'
            + ' nothing to research.',
            'Submit a URL for this investigation before resuming research.'),
          maxAttempts: 1,
        }
      }
      /*
       * A fresh `RunMaterial`. The stages that already completed are not
       * re-run — the pipeline resumes from durable state — so the material a
       * resumed stage needs is the material it gathers now.
       */
      return {
        stages: stagesFor(submission.sourceUrl, newRunMaterial()),
        adapters,
        maxAttempts: 2,
      }
    },

    /*
     * `reevaluation` is deliberately absent.
     *
     * The C6 primitive asks the runtime to plan a re-evaluation of an
     * already-committed version, seeded from its predecessor. A live plan for
     * that needs material bound to the *reason* for re-evaluating — an ATI
     * response, a newly received record — not a fresh web search of the
     * original URL, and #10's bridge already supplies exactly that binding.
     *
     * Leaving it undefined makes `startReevaluation` say a re-evaluation
     * cannot be planned, which is true, instead of silently re-researching
     * from scratch and calling the result a successor version.
     */
  }
}

/** Every research stage, reporting one capability gap. */
function blockedStages(detail: string, resolvedBy: string): StageDefinition[] {
  return RESEARCH_STAGES.map((stage) => ({
    stage,
    run: () => unavailable(`live-runtime:${stage}`, 'NOT_CONFIGURED', detail, resolvedBy),
  }))
}

/**
 * Every slot the composition requires.
 *
 * Exported so the requirement and the registration can be checked against each
 * other. A slot that is required but never installed anywhere is a dead
 * composition token: it makes a deployment look configured, forces an operator
 * to supply a key, and changes nothing about what actually runs. The gate
 * asserts these two sets are equal.
 */
export const REQUIRED_SLOTS = ['RESEARCH_MODEL', 'REVIEWER_MODEL', 'RETRIEVAL'] as const

/** The host seams a complete composition installs. One per required slot. */
export interface HostSeams {
  readonly setExecutionRuntime:
  (provider: (() => Promise<ExecutionRuntime>) | null) => void
  readonly setReviewerModel:
  (provider: (() => Promise<ReviewerModel>) | null) => void
}

/** Which capabilities a registration actually installed. */
export type RegisteredCapability = 'EXECUTION_RUNTIME' | 'REVIEWER_MODEL'

export interface LiveRegistration {
  readonly composition: RuntimeComposition
  readonly registered: readonly RegisteredCapability[]
}

/**
 * Compose and register, for a host startup hook.
 *
 * Registration is conditional on a complete composition: a partial one
 * registers nothing, leaving `getExecutionRuntime()` to return the
 * unconfigured runtime and `getReviewerModel()` to return `undefined` — which
 * is the behaviour every #6–#11 gate is written against.
 *
 * Both seams are installed, and that is the point of the amendment. The
 * research model and the retrieval adapter reach the pipeline through the
 * runtime's `StageAdapters`; the reviewer reaches the REVIEW gate and
 * graduation through its own seam, because `StageAdapters` deliberately has no
 * reviewer member. Composing a reviewer and installing nothing left the
 * capability dead: configured, reported, and never asked.
 */
export async function registerLiveProviders(
  seams: HostSeams,
  options: LiveRuntimeOptions = {},
): Promise<LiveRegistration> {
  const composition = await composeLiveRuntime(options)
  if (composition.status !== 'COMPOSED') return { composition, registered: [] }

  // One composition per process, handed out by reference. Composing per
  // request would build a new adapter for every run.
  seams.setExecutionRuntime(async () => composition.runtime)
  seams.setReviewerModel(async () => composition.reviewer)
  return { composition, registered: ['EXECUTION_RUNTIME', 'REVIEWER_MODEL'] }
}
