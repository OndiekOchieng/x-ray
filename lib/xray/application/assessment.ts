/**
 * The assessment orchestration boundary (#20 slice 20d).
 *
 * WHY THIS FUNCTION EXISTS
 * ========================
 * Something has to read the reviewer seam, and it must not be
 * `GraduationService`. A service that reached for a process-global would make
 * its dependencies invisible: a caller could not tell what an assessment was
 * about to ask, and a check could not drive it without arranging a global.
 *
 * So the direction is explicit and one-way. This function — application-layer
 * orchestration — obtains the reviewer and **passes it in**.
 * `GraduationService` receives a `ReviewerModel` and knows nothing about where
 * it came from, `assessGraduation` receives judgments as data, and
 * `reviewXRayGraph` stays pure.
 *
 * An earlier version of 20d installed the reviewer into the seam and stopped
 * there. The capability was composed, registered, and read by nobody: a fully
 * configured deployment still left every model-assisted check `NOT_EVALUATED`.
 * This is the hop that was missing.
 *
 * WHY AN EXPLICIT MODEL WINS
 * ==========================
 * `options.model` takes precedence over the seam. Every existing check harness
 * injects a reviewer directly, and a global that overrode an explicit argument
 * would make those harnesses depend on process state they never set.
 */

import type { ReviewerModel } from '@/lib/xray/review'
import type { AcceptanceBehavior } from '@/lib/xray/acceptance'
import type { GraduationAuditRecord } from '@/lib/xray/persistence/graduation-audit'
import type { AssessOptions, GraduationService } from './graduation-service'
import { GraduationNotEligible } from './graduation-service'
import { CandidateNotEligible } from '@/lib/xray/persistence/version-commit'
import { getReviewerModel } from './runtime'

/**
 * Assess a finished candidate with whatever reviewer the host registered.
 *
 * No reviewer is not an error. The assessment runs its deterministic checks,
 * reports every model-assisted check `NOT_EVALUATED` with a reason, and
 * graduates to `BLOCKED` — which is the honest answer for a deployment with no
 * review capability, and the opposite of a silent pass.
 */
export async function assessCandidate(
  graduation: GraduationService,
  investigationId: string,
  executionRunId: string,
  options: AssessOptions = {},
): Promise<GraduationAuditRecord> {
  const model: ReviewerModel | undefined = options.model ?? await getReviewerModel()
  return graduation.assess(investigationId, executionRunId, {
    ...options,
    ...(model === undefined ? {} : { model }),
  })
}

/** What graduating a finished run produced. */
export type GraduationOutcome =
  | { readonly result: 'COMMITTED'; readonly version: number }
  | {
    readonly result: 'NOT_ELIGIBLE'
    readonly verdict: string
    /** Why, in the assessment's own words. Safe to show. */
    readonly reasons: readonly string[]
    readonly blockers: readonly string[]
  }

/**
 * Take a finished run's candidate to an immutable version.
 *
 * The step that had no production path. `promote` builds the version envelope,
 * `assessCandidate` records an assessment with whatever reviewer the host
 * configured, and `commit` writes it — the same three calls #10's ATI bridge
 * makes, with the predecessor generalised so `null` means "this is the first".
 *
 * It refuses rather than forcing. An assessment that is not eligible is
 * returned as `NOT_ELIGIBLE` with its reasons, because a version that
 * committed anyway would be a version nothing authorised — and `PROVENANCE`
 * reporting a capability gap is exactly the case where that temptation
 * appears.
 */
export async function graduateRun(
  graduation: GraduationService,
  investigationId: string,
  executionRunId: string,
  options: {
    readonly expectedPredecessor: number | null
    readonly createdAt: string
    readonly behaviors?: readonly AcceptanceBehavior[]
    readonly requiredReviewChecks?: readonly string[]
  },
): Promise<GraduationOutcome> {
  await graduation.promote(investigationId, executionRunId, {
    expectedPredecessor: options.expectedPredecessor,
    trigger: options.expectedPredecessor === null ? 'INITIAL_RESEARCH' : 'RE_EVALUATION',
    createdAt: options.createdAt,
  })

  const audit = await assessCandidate(graduation, investigationId, executionRunId, {
    ...(options.behaviors === undefined ? {} : { behaviors: options.behaviors }),
    ...(options.requiredReviewChecks === undefined
      ? {} : { requiredReviewChecks: options.requiredReviewChecks }),
  })

  try {
    const { version } = await graduation.commit(investigationId, executionRunId, {
      expectedPredecessor: options.expectedPredecessor,
      reEvaluationAudit: [],
    })
    return { result: 'COMMITTED', version }
  } catch (error) {
    /*
     * Only a **deliberate eligibility refusal** becomes `NOT_ELIGIBLE`.
     *
     * An earlier version of this caught `error instanceof Error`, which is
     * every error there is. A `VersionConflict` — someone else committed
     * first — would have been reported as "not eligible yet", and so would a
     * driver fault or an invariant bug. A concurrency conflict reported as
     * ineligibility is a conflict nobody investigates, and a persistence fault
     * reported that way is a fault nobody fixes.
     *
     * `CandidateNotEligible` is thrown by `assertCommittable`, the authority
     * that makes that decision. `GraduationNotEligible` is this layer's
     * equivalent. Everything else propagates to the existing HTTP error
     * semantics, unchanged.
     */
    if (error instanceof CandidateNotEligible || error instanceof GraduationNotEligible) {
      return {
        result: 'NOT_ELIGIBLE',
        verdict: audit.result.verdict,
        reasons: [
          ...audit.result.reasons.map((reason) => `${reason.ref}: ${reason.message}`),
          `commit refused: ${error.message}`,
        ],
        blockers: audit.result.blockers.map((blocker) =>
          `${blocker.ref}: ${blocker.reason} — ${blocker.resolvedBy}`),
      }
    }
    throw error
  }
}
