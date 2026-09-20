/**
 * Public version lineage (#9 slice 9f).
 *
 * WHY THIS IS A SEPARATE SURFACE
 * ==============================
 * The citation-grade exact-version document must not change because a later
 * version was published. If lineage were folded into it, `/xray/{slug}/v2`
 * would quietly gain a row the day v3 appears — and "creating version N+1
 * cannot change the rendered content of version N" would stop being true.
 *
 * So lineage lives at its own address, and its mutability is explicit: the
 * history surface is expected to change as publication events accumulate.
 *
 * PUBLICATION FIRST, AS EVERYWHERE ELSE
 * =====================================
 * Only versions that have at least one `PUBLISH` event appear. A committed v3
 * that was never published is invisible, and its absence is not inferable —
 * the surface never enumerates committed versions and filters afterwards, so
 * an unpublished version causes no canonical read at all.
 *
 * WHAT CHANGED COMES FROM IMMUTABLE VERSION DATA
 * ==============================================
 * Trigger and the three change counts are read from the version envelope's own
 * normalized rows, which are insert-only. Nothing is diffed from prose, and no
 * public change-summary table exists.
 *
 * Internal canonical ids are deliberately not exposed: the public question is
 * *what changed*, not which database keys moved.
 */

import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  exactVersionState, presentationHead, readPublicationHistory, resolveSlug,
  type PresentationState, type PublicationEvent,
} from '@/lib/xray/persistence/publication'
import { getDatabase } from '@/lib/xray/application/runtime'

/** Immutable facts about what one committed version changed. */
export interface VersionChangeSummary {
  trigger: string
  supersedesVersion?: number
  createdAt: string
  addedSources: number
  addedEvidence: number
  reEvaluatedClaims: number
  /** Recorded re-evaluation reasons, by category. Counts only, never ids. */
  reEvaluationReasons: Readonly<Record<string, number>>
}

/** One publicly known version in a lineage's history. */
export interface LineageEntry {
  version: number
  citationHref: string
  /** Current presentation state of that exact version. */
  state: PresentationState
  /** When that version was first made public. */
  firstPublishedAt: string
  /** The most recent publication act affecting it. */
  lastActAt: string
  change: VersionChangeSummary
}

export interface PublicLineage {
  slug: string
  /** The version the alias currently presents, and its state. */
  currentVersion: number
  currentState: PresentationState
  /** Publicly known versions, newest publication act first. */
  entries: readonly LineageEntry[]
}

/**
 * The immutable change summary for one exact committed version.
 *
 * Safe to cache by `(investigationId, version)`: the version tables are
 * insert-only, so this can never become wrong. Membership and ordering are not
 * part of it, and must not be.
 */
export async function loadVersionChangeSummary(
  investigationId: string, version: number,
): Promise<VersionChangeSummary | undefined> {
  const db = await getDatabase()
  const rows = (await db.query(
    `SELECT v.trigger, v.supersedes_version, v.created_at,
            (SELECT count(*) FROM version_added_sources a
              WHERE a.investigation_id=v.investigation_id AND a.version_number=v.version_number) AS added_sources,
            (SELECT count(*) FROM version_added_evidence e
              WHERE e.investigation_id=v.investigation_id AND e.version_number=v.version_number) AS added_evidence,
            (SELECT count(*) FROM version_reevaluated_claims c
              WHERE c.investigation_id=v.investigation_id AND c.version_number=v.version_number) AS reevaluated
       FROM investigation_versions v
      WHERE v.investigation_id=$1 AND v.version_number=$2`,
    [investigationId, version])).rows
  if (rows.length !== 1) return undefined
  const row = rows[0]

  // Reason categories with counts. No claim ids: the public question is what
  // changed, not which records moved.
  const reasons = (await db.query(
    `SELECT reason, count(*)::int AS n FROM claim_reevaluation_audit
      WHERE investigation_id=$1 AND version_number=$2 GROUP BY reason ORDER BY reason`,
    [investigationId, version])).rows

  return {
    trigger: row.trigger as string,
    ...(row.supersedes_version === null ? {} : { supersedesVersion: row.supersedes_version as number }),
    createdAt: row.created_at as string,
    addedSources: Number(row.added_sources),
    addedEvidence: Number(row.added_evidence),
    reEvaluatedClaims: Number(row.reevaluated),
    reEvaluationReasons: Object.fromEntries(
      reasons.map((r) => [r.reason as string, r.n as number])),
  }
}

/** Every version this lineage has ever made public, in publication order. */
function publiclyKnownVersions(history: readonly PublicationEvent[]): Map<number, {
  firstPublishedAt: string; lastActAt: string; state: PresentationState
}> {
  const known = new Map<number, { firstPublishedAt: string; lastActAt: string; state: PresentationState }>()
  for (const event of history) {
    // Only a PUBLISH makes a version publicly known. A version that was never
    // published is not in history at all, so its existence cannot be inferred.
    if (event.act === 'PUBLISH' && !known.has(event.version))
      known.set(event.version, {
        firstPublishedAt: event.occurredAt, lastActAt: event.occurredAt, state: 'PUBLISHED',
      })
    const entry = known.get(event.version)
    if (entry) entry.lastActAt = event.occurredAt
  }
  // Republishing the same version does not create a second row; its state is
  // that version's own current one.
  for (const [version, entry] of known)
    entry.state = exactVersionState(history, version) ?? 'PUBLISHED'
  return known
}

export type ChangeSummaryReader = (
  investigationId: string, version: number,
) => Promise<VersionChangeSummary | undefined>

/**
 * Public lineage for a slug, or `undefined` when nothing is public.
 *
 * `undefined` covers an unknown slug and a lineage with no publication history
 * alike — the caller turns both into the same not-found, so the surface cannot
 * be used as an oracle for draft existence.
 */
export async function publicLineage(
  slug: string,
  readChange: ChangeSummaryReader = loadVersionChangeSummary,
  database?: SnapshotDatabase,
): Promise<PublicLineage | undefined> {
  const db = database ?? await getDatabase()

  const owner = await resolveSlug(db, slug)
  if (owner === undefined) return undefined

  const history = await readPublicationHistory(db, owner.investigationId)
  const head = presentationHead(history)
  if (head === undefined) return undefined

  const known = publiclyKnownVersions(history)

  const entries: LineageEntry[] = []
  for (const [version, state] of known) {
    // Reached only for versions publication history already made public.
    const change = await readChange(owner.investigationId, version)
    if (change === undefined) continue
    entries.push({
      version,
      citationHref: `/xray/${slug}/v${version}`,
      state: state.state,
      firstPublishedAt: state.firstPublishedAt,
      lastActAt: state.lastActAt,
      change,
    })
  }

  return {
    slug,
    // The head from event replay, never MAX(version): a deliberate rollback
    // means the current version can be an earlier one.
    currentVersion: head.version,
    currentState: head.state,
    entries: entries.sort((a, b) =>
      b.lastActAt.localeCompare(a.lastActAt) || b.version - a.version),
  }
}
