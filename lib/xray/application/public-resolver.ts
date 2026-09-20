/**
 * The public presentation resolver (#9 slice 9c, ADR-0015).
 *
 * WHY THIS IS NOT #8's RESOLVER
 * =============================
 * `getInvestigationGraph` answers an internal question — *does this
 * investigation have a committed graph I may inspect?* A public request asks
 * something else: *has an attributable publication event made this address
 * presentable, and what is its current presentation state?*
 *
 * Those are different trust questions, so this sits beside #8's resolver and
 * #8's resolver is untouched. It gains no `PUBLISHED` branch.
 *
 * THE ORDERING IS THE WHOLE POINT
 * ===============================
 * Publication authorization resolves **first**. A committed graph is never
 * loaded and then tested for publication — reversed, the seam would already
 * have crossed the draft boundary before deciding the caller was not entitled
 * to the graph. The canonical read is injected precisely so a check can count
 * its invocations and prove they stay at zero.
 *
 * NON-LEAKAGE
 * ===========
 * Unknown slug, draft investigation, committed-but-never-published version and
 * never-published exact version all produce the same `NOT_PUBLIC` value. It
 * carries no message, no id, no version pointer and no reason code, because a
 * public caller must not be able to use this resolver as an oracle for draft
 * existence.
 *
 * OUTAGE IS NOT ABSENCE
 * =====================
 * Storage failures propagate. Only genuine absence maps to `NOT_PUBLIC` — the
 * same lesson as the 8c fixture-shadowing bug, where a catch-all turned an
 * outage into a confident answer.
 *
 * NOT HERE: routes, status codes, redirects, tombstone copy, cache
 * configuration, library or search, principal labels.
 */

import type { XRayGraphInput } from '@/lib/xray/selectors'
import {
  exactVersionState, presentationHead, readPublicationHistory, resolveSlug,
  type PublicationEvent, type WithdrawalReason,
} from '@/lib/xray/persistence/publication'
import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import { InvestigationService } from './investigation-service'

/**
 * Nothing is public at this address.
 *
 * Deliberately field-free. Every distinguishable detail would be a signal
 * about internal state that the caller has not been granted.
 */
export interface NotPublic {
  kind: 'NOT_PUBLIC'
}

/** This address was published and is currently withdrawn. */
export interface Withdrawn {
  kind: 'WITHDRAWN'
  slug: string
  /** The exact version taken down. */
  version: number
  reason: WithdrawalReason
  withdrawnAt: string
  /** Present for `ERRONEOUS`, which must say what was wrong. */
  note?: string
  /** Stable handle for this act in the lineage's history. */
  sequence: number
}

/** This address currently presents an exact committed version. */
export interface Published {
  kind: 'PUBLISHED'
  slug: string
  version: number
  /** The exact committed version, read only after authorization succeeded. */
  graph: XRayGraphInput
  /**
   * The eligibility that authorized this publication.
   *
   * Carried so 9d can surface the capability blockers of an eligible
   * `BLOCKED`. The blockers themselves are not copied or recomputed here —
   * what is disclosed must not drift from the assessment that produced it.
   */
  authorizingExecutionRunId: string
  authorizingGraduationIndex: number
}

export type PublicPresentation = NotPublic | Withdrawn | Published

const NOT_PUBLIC: NotPublic = Object.freeze({ kind: 'NOT_PUBLIC' })

/**
 * The narrow canonical read this resolver is allowed to perform.
 *
 * An exact committed version, named explicitly. Not `getInvestigationGraph`,
 * which would re-enter benchmark fallback and latest-version behaviour that
 * have no business answering a public request.
 */
export interface CommittedVersionReader {
  read(investigationId: string, version: number): Promise<XRayGraphInput>
}

export function defaultCommittedVersionReader(db: SnapshotDatabase): CommittedVersionReader {
  const service = new InvestigationService(db)
  return {
    async read(investigationId, version) {
      return (await service.getCommittedVersion(investigationId, version)).graph
    },
  }
}

const withdrawnFrom = (slug: string, event: PublicationEvent): Withdrawn => ({
  kind: 'WITHDRAWN',
  slug,
  version: event.version,
  reason: event.withdrawalReason as WithdrawalReason,
  withdrawnAt: event.occurredAt,
  ...(event.note === undefined ? {} : { note: event.note }),
  sequence: event.sequence,
  // Note what is absent: no principal, and no canonical content. Public
  // display of a principal is a 9d decision, and a withdrawn version's content
  // is the thing the withdrawal exists to stop presenting.
})

export class PublicResolver {
  private readonly db: SnapshotDatabase
  private readonly reader: CommittedVersionReader

  constructor(db: SnapshotDatabase, reader?: CommittedVersionReader) {
    this.db = db
    this.reader = reader ?? defaultCommittedVersionReader(db)
  }

  /**
   * Resolve the alias address — the lineage's current presentation head.
   *
   * Never consults `latestCommittedVersion`. The public version is the one a
   * principal selected, which is not necessarily the newest one committed.
   */
  async resolveAlias(slug: string): Promise<PublicPresentation> {
    const owner = await resolveSlug(this.db, slug)
    if (owner === undefined) return NOT_PUBLIC

    const history = await readPublicationHistory(this.db, owner.investigationId)
    const head = presentationHead(history)
    if (head === undefined) return NOT_PUBLIC

    if (head.state === 'WITHDRAWN') return withdrawnFrom(slug, head.event)

    return this.present(slug, owner.investigationId, head.version, history)
  }

  /**
   * Resolve an exact-version address.
   *
   * Its state follows that version's own history, so publishing v2 does not
   * affect the public readability of an already-published v1.
   */
  async resolveExactVersion(slug: string, version: number): Promise<PublicPresentation> {
    const owner = await resolveSlug(this.db, slug)
    if (owner === undefined) return NOT_PUBLIC

    const history = await readPublicationHistory(this.db, owner.investigationId)
    const state = exactVersionState(history, version)
    if (state === undefined) return NOT_PUBLIC

    if (state === 'WITHDRAWN') {
      const own = history.filter((event) => event.version === version)
      return withdrawnFrom(slug, own[own.length - 1])
    }

    return this.present(slug, owner.investigationId, version, history)
  }

  /**
   * Read the canonical version. Reached only after authorization succeeded.
   *
   * Everything above this line is publication history; this is the first and
   * only canonical read, which is what makes the ordering checkable.
   */
  private async present(
    slug: string, investigationId: string, version: number,
    history: readonly PublicationEvent[],
  ): Promise<Published> {
    const authorizing = lastPublishOf(history, version)
    const graph = await this.reader.read(investigationId, version)
    return {
      kind: 'PUBLISHED',
      slug,
      version,
      graph,
      authorizingExecutionRunId: authorizing.authorizingExecutionRunId as string,
      authorizingGraduationIndex: authorizing.authorizingGraduationIndex as number,
    }
  }
}

function lastPublishOf(history: readonly PublicationEvent[], version: number): PublicationEvent {
  let found: PublicationEvent | undefined
  for (const event of history) if (event.version === version && event.act === 'PUBLISH') found = event
  if (found === undefined)
    throw new Error(`No publication authorizes v${version}; presentation state and history disagree`)
  return found
}
