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
import type { GraduationAuditRecord } from '@/lib/xray/persistence/graduation-audit'
import type { AssessOptions, GraduationService } from './graduation-service'
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
