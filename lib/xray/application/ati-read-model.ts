/**
 * The derived ATI request read model (#10 slice 10b, C1/K).
 *
 * WHAT THIS IS
 * ============
 * A projection of `RequestLifecycle` — append-only action history — into the
 * `ATIRequest` shape surfaces already understand. Every field here is computed
 * from history at the moment it is asked for.
 *
 * WHY IT IS A PROJECTION AND NOT STATE
 * ====================================
 * `ATIRequest` used to be a normalized collection on `XRayGraph`, which made
 * request status look like version-scoped research state. It is not: a request
 * is an action taken *about* a version, its status changes without any new
 * version, and an immutable snapshot cannot hold a fact that keeps moving
 * (ADR-0017, #10 C1/C2/C7). So the type survives as a read model and the
 * collection does not survive at all.
 *
 * WHAT THIS PROJECTION MUST NOT LOSE
 * ==================================
 *  - `EXPORTED` is not `SUBMITTED`. `submittedAt` is set from a SUBMIT event
 *    and from nothing else; an export leaves it absent however many exports
 *    there were.
 *  - Custody basis. `ATIRequest` has no custody field, so a bare projection
 *    into it would silently drop whether the addressee was confirmed or
 *    inferred. `ATIRequestView` carries it, along with where it came from.
 *  - Nothing is defaulted. A fact the history does not record is absent, not
 *    filled in.
 */

import type { ATIRequest, CustodyBasis } from '@/lib/xray/domain'
import type {
  HolderContextOrigin, RequestLifecycle,
} from '@/lib/xray/persistence/ati-lifecycle'

/**
 * `ATIRequest` plus what action history knows and the graph shape could not
 * hold. The base fields keep their existing meaning exactly.
 */
export interface ATIRequestView extends ATIRequest {
  /** The exact immutable version whose gap this request acts on. */
  originVersion: number

  /** Which revision the content below comes from. The latest one. */
  revision: number

  holdingOffice?: string

  /** Never inferred from silence — every revision records it (#10 C5). */
  custodyBasis: CustodyBasis
  holderContextOrigin: HolderContextOrigin
  custodyBasisRationale?: string

  /** First export, if any. Distinct from `submittedAt` on purpose. */
  exportedAt?: string
  acknowledgedAt?: string
  closedAt?: string

  /** Every revision's number, oldest first. What a reader can still inspect. */
  revisions: readonly number[]
}

/**
 * Project the current view of one request.
 *
 * The content shown is the latest revision's, which is what "the request as it
 * now stands" means. It is NOT necessarily what was exported or filed — that
 * question is answered by the EXPORT event's exact revision, which the
 * lifecycle keeps.
 */
export function projectATIRequest(lifecycle: RequestLifecycle): ATIRequestView {
  const current = lifecycle.revisions[lifecycle.revisions.length - 1]
  if (current === undefined) {
    throw new Error(`ATI request ${lifecycle.requestId} has no revision to project`)
  }

  const firstAct = (act: 'EXPORT' | 'ACKNOWLEDGE' | 'CLOSE') =>
    lifecycle.events.find((event) => event.act === act)?.occurredAt

  const exportedAt = firstAct('EXPORT')
  const acknowledgedAt = firstAct('ACKNOWLEDGE')
  const closedAt = firstAct('CLOSE')

  return {
    id: lifecycle.requestId,
    gapId: lifecycle.gapId,
    jurisdiction: lifecycle.jurisdiction,
    originVersion: lifecycle.originVersion,
    revision: current.revision,
    holdingInstitution: current.holdingInstitution,
    ...(current.holdingOffice === undefined ? {} : { holdingOffice: current.holdingOffice }),
    custodyBasis: current.custodyBasis,
    holderContextOrigin: current.holderContextOrigin,
    ...(current.custodyBasisRationale === undefined
      ? {} : { custodyBasisRationale: current.custodyBasisRationale }),
    requestedRecords: [...current.requestedRecords],
    publicInterestContext: current.publicInterestContext,
    ...(current.investigationUrl === undefined
      ? {} : { investigationUrl: current.investigationUrl }),
    status: lifecycle.status,
    draftedAt: lifecycle.draftedAt,
    // Deliberately conditional: an export never produces a submission time.
    ...(lifecycle.submittedAt === undefined ? {} : { submittedAt: lifecycle.submittedAt }),
    ...(lifecycle.respondedAt === undefined ? {} : { respondedAt: lifecycle.respondedAt }),
    ...(exportedAt === undefined ? {} : { exportedAt }),
    ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
    ...(closedAt === undefined ? {} : { closedAt }),
    receivedSourceIds: [...lifecycle.receivedSourceIds],
    revisions: lifecycle.revisions.map((revision) => revision.revision),
  }
}
