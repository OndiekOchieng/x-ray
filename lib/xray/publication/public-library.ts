/**
 * The public library and metadata search (#9 slice 9e).
 *
 * THE ORDERING IS THE RULE
 * ========================
 * Publication membership resolves **before any graph read**. The library never
 * enumerates committed investigations and filters afterwards — a draft, a
 * withdrawn head and an unpublished version cause zero canonical reads, because
 * nothing downstream ever receives them.
 *
 * That is the same invariant ADR-0015 established for a single address, applied
 * to discovery.
 *
 * NOTHING IS STORED
 * =================
 * There is no library table, no stored card and no stored count. Every value on
 * a card is derived from the immutable exact-version projection at query time,
 * so it cannot drift from the graph it describes — the failure the v0 scaffold
 * shipped, where a stored `receiptsCount: 11` outlived a five-element array.
 *
 * MEMBERSHIP IS NEVER CACHED
 * ==========================
 * The immutable projection behind a card may be reused from 9d's cache, because
 * it cannot become wrong. Membership can: a withdrawal removes a lineage from
 * discovery immediately, so it is resolved fresh on every query.
 *
 * NOT HERE: full-text search over evidence, ranking, editorial state, or any
 * index over all committed graphs.
 */

import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  presentationHead, type PublicationEvent, type PresentationHead,
} from '@/lib/xray/persistence/publication'
import { getDatabase } from '@/lib/xray/application/runtime'
import { publicProjections } from './public-page'
import type { PublicVersionView } from './public-view'
import type { LibraryCard, LibraryQuery } from './library-card'

export type { LibraryCard, LibraryQuery }

interface DiscoverableLineage {
  investigationId: string
  slug: string
  head: PresentationHead
}

/**
 * Lineages whose current presentation head is PUBLISHED.
 *
 * One query over publication state, grouped and replayed in memory with the
 * same head rule 9b established: `PUBLISH` selects the head, `WITHDRAW` only
 * changes the state of its exact target. So a historical non-head withdrawal
 * leaves a currently published lineage discoverable.
 *
 * No canonical table is touched here at all.
 */
async function discoverable(db: SnapshotDatabase): Promise<DiscoverableLineage[]> {
  const rows = (await db.query(
    `SELECT s.slug, e.investigation_id, e.sequence, e.version_number, e.act,
            e.principal_id, e.occurred_at, e.withdrawal_reason, e.note,
            e.authorizing_execution_run_id, e.authorizing_graduation_index
       FROM investigation_slugs s
       JOIN publication_events e ON e.investigation_id = s.investigation_id
      ORDER BY e.investigation_id, e.sequence`)).rows

  const bySlug = new Map<string, { slug: string; events: PublicationEvent[] }>()
  for (const row of rows) {
    const investigationId = row.investigation_id as string
    const entry = bySlug.get(investigationId)
      ?? { slug: row.slug as string, events: [] }
    entry.events.push({
      investigationId,
      sequence: row.sequence as number,
      version: row.version_number as number,
      act: row.act as PublicationEvent['act'],
      principalId: row.principal_id as string,
      occurredAt: row.occurred_at as string,
    })
    bySlug.set(investigationId, entry)
  }

  const out: DiscoverableLineage[] = []
  for (const [investigationId, { slug, events }] of bySlug) {
    const head = presentationHead(events)
    // Withdrawn heads leave ordinary discovery. Their exact URL still resolves
    // to a tombstone; the library is for what is currently presented.
    if (head === undefined || head.state !== 'PUBLISHED') continue
    out.push({ investigationId, slug, head })
  }
  return out
}

function card(lineage: DiscoverableLineage, view: PublicVersionView): LibraryCard {
  return {
    slug: lineage.slug,
    version: lineage.head.version,
    title: view.surface.title,
    ...(view.surface.publisher ? { surfacePublisher: view.surface.publisher } : {}),
    protocolVersion: view.protocolVersion,
    ...(view.researchCutoffAt ? { researchCutoffAt: view.researchCutoffAt } : {}),
    ...(view.completedAt ? { investigatedAt: view.completedAt } : {}),
    publishedAt: lineage.head.event.occurredAt,
    claimCount: view.counts.claims,
    receiptCount: view.counts.evidence,
    sourceCount: view.counts.sources,
    independentOriginCount: view.independentOrigins,
    openGapCount: view.counts.openGaps,
    href: `/xray/${lineage.slug}`,
    citationHref: `/xray/${lineage.slug}/v${lineage.head.version}`,
  }
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('en')

/**
 * Filter over card metadata.
 *
 * Deliberately narrow. Indexing claim or finding prose would let a search
 * surface reveal text the page resolver correctly withholds, which is what
 * makes the non-leakage boundary enforceable end to end.
 */
export function matchesQuery(entry: LibraryCard, query: LibraryQuery): boolean {
  const q = query.q === undefined ? '' : normalize(query.q)
  if (q !== '' && !normalize(`${entry.title} ${entry.surfacePublisher ?? ''}`).includes(q))
    return false
  if (query.publisher !== undefined &&
      !normalize(entry.surfacePublisher ?? '').includes(normalize(query.publisher)))
    return false
  if (query.protocolVersion !== undefined &&
      normalize(entry.protocolVersion) !== normalize(query.protocolVersion)) return false
  if (query.slug !== undefined && normalize(entry.slug) !== normalize(query.slug)) return false
  if (query.minOpenGaps !== undefined && entry.openGapCount < query.minOpenGaps) return false
  if (query.maxOpenGaps !== undefined && entry.openGapCount > query.maxOpenGaps) return false
  return true
}

/**
 * The currently discoverable public library.
 *
 * Membership first, projection second. A storage failure propagates rather than
 * quietly becoming an empty library — an outage is not an absence of published
 * work, and presenting it as one would be a silent lie about the corpus.
 */
export async function publishedLibrary(query: LibraryQuery = {}): Promise<LibraryCard[]> {
  const db = await getDatabase()
  const lineages = await discoverable(db)
  const { versionProjection } = await publicProjections()

  const cards = await Promise.all(lineages.map(async (lineage) =>
    card(lineage, await versionProjection(lineage.investigationId, lineage.head.version))))

  return cards
    .filter((entry) => matchesQuery(entry, query))
    // Most recently presented first; slug breaks ties deterministically. Never
    // by committed version or internal id.
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug))
}

/**
 * The featured X-Ray, if any.
 *
 * The first entry in the deterministic published order, and nothing more. There
 * is no editorial state and no feature event in #9 — and critically, a
 * benchmark that ships in the repository cannot become featured merely by
 * existing, because it is not published.
 */
export async function featuredPublication(): Promise<LibraryCard | null> {
  return (await publishedLibrary())[0] ?? null
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/**
 * The library, or a statement that storage could not be reached (#11 11b).
 *
 * WHY THIS EXISTS SEPARATELY
 * ==========================
 * `publishedLibrary` propagates a storage failure on purpose: an outage is not
 * an absence of published work. But a *page* has to render something, and 11a
 * found what happens when it does not — `/` and `/library` flushed a 200 shell
 * and then threw, which is worse than a 503, because an empty page is
 * indistinguishable from a working page with nothing in it.
 *
 * So the pages ask this instead, and it keeps the two apart:
 *
 *   UNAVAILABLE  storage could not be reached — say so
 *   AVAILABLE    this is the library, and it may legitimately be empty
 *
 * Only a **typed host failure** is converted. Anything else still propagates:
 * a projection bug or a corrupt row must not be reported to a reader as
 * "temporarily unavailable" when the truth is that something is wrong.
 */
export type LibraryAvailability =
  | { status: 'UNAVAILABLE' }
  | { status: 'AVAILABLE'; entries: readonly LibraryCard[] }

export async function publishedLibraryAvailability(
  query: LibraryQuery = {},
): Promise<LibraryAvailability> {
  try {
    return { status: 'AVAILABLE', entries: await publishedLibrary(query) }
  } catch (error) {
    if (isHostUnavailable(error)) return { status: 'UNAVAILABLE' }
    throw error
  }
}

export type FeaturedAvailability =
  | { status: 'UNAVAILABLE' }
  | { status: 'AVAILABLE'; featured: LibraryCard | null }

export async function featuredPublicationAvailability(): Promise<FeaturedAvailability> {
  const library = await publishedLibraryAvailability()
  return library.status === 'UNAVAILABLE'
    ? { status: 'UNAVAILABLE' }
    : { status: 'AVAILABLE', featured: library.entries[0] ?? null }
}

/**
 * Whether this failure is the host being unreachable rather than a defect.
 *
 * Narrow by name, deliberately. `HostNotConfigured` and
 * `DemoHostMisconfigured` are the two states a deployment can be in without
 * anything being broken.
 *
 * HONEST LIMITATION: a configured PostgreSQL that is *down* raises a driver
 * error, which is not in this list and will surface as a server error rather
 * than a degraded page. Mapping driver-level outages needs a typed failure at
 * the host boundary, and 11b did not add one.
 */
function isHostUnavailable(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  return name === 'HostNotConfigured' || name === 'DemoHostMisconfigured'
}
