/**
 * Publication event store and slug namespace (#9 slice 9b).
 *
 * WHAT THIS IS
 * ============
 * Durable publication history and lineage identity. It records that a
 * principal made an exact committed version public, or took it down, and
 * derives the current presentation head by replaying that history.
 *
 * WHAT IT IS NOT
 * ==============
 * Not a resolver, not a route, not a cache, not a tombstone renderer, not a
 * library. Those are 9c–9e. Nothing here decides what a public reader sees;
 * it decides what is true about publication.
 *
 * TWO THINGS KEPT APART IN STORAGE
 * ================================
 * A slug is lineage identity — one per investigation, minted once, never
 * renamed, reassigned or freed. Events are history — append-only, ordered, and
 * never rewritten. Merging them would make a permanent public address depend on
 * the state of the last thing that happened to it.
 *
 * ATTRIBUTION STAYS OUT OF THE GRAPH
 * ==================================
 * A `principalId` is an administrative identity, not an epistemic `Actor`
 * (ADR-0013). Nothing in this module writes to any canonical table, and no
 * canonical artifact can reach a principal.
 *
 * PURITY: no HTTP, no cache, no provider, no graph reconstruction.
 */

import { createHash } from 'node:crypto'
import type { GraduationResult } from '@/lib/xray/acceptance'
import { decodeValue, type Encoded } from './value-codec'
import type { SnapshotDatabase } from './snapshot'
import { isEligibleAssessment } from './version-commit'

export type PublicationAct = 'PUBLISH' | 'WITHDRAW'

export type WithdrawalReason = 'ERRONEOUS' | 'COMPELLED' | 'PRIVACY_HARM' | 'OUT_OF_SCOPE'

export const WITHDRAWAL_REASONS: readonly WithdrawalReason[] = [
  'ERRONEOUS',
  'COMPELLED',
  'PRIVACY_HARM',
  'OUT_OF_SCOPE',
]

export interface PublicationEvent {
  investigationId: string
  /** Strictly increasing per lineage. The replay order, independent of clocks. */
  sequence: number
  version: number
  act: PublicationAct
  principalId: string
  occurredAt: string
  withdrawalReason?: WithdrawalReason
  note?: string
  /** The recorded eligibility that authorized a publication. */
  authorizingExecutionRunId?: string
  authorizingGraduationIndex?: number
}

/** Current state of one exact version, or of the lineage's presentation head. */
export type PresentationState = 'PUBLISHED' | 'WITHDRAWN'

export interface PresentationHead {
  version: number
  state: PresentationState
  /** The act that put the lineage in this state. */
  event: PublicationEvent
}

export type RefusalReason =
  | 'NO_PRINCIPAL'
  | 'VERSION_NOT_COMMITTED'
  | 'NO_ELIGIBILITY_RECORD'
  | 'NOT_ELIGIBLE'
  | 'DUPLICATE_PUBLISH'
  | 'NOT_PUBLISHED'
  | 'INVALID_REASON'
  | 'MISSING_ERROR_NOTE'
  | 'SLUG_CONFLICT'

export class PublicationRefused extends Error {
  readonly reason: RefusalReason
  constructor(reason: RefusalReason, message: string) {
    super(message)
    this.name = 'PublicationRefused'
    this.reason = reason
  }
}

// ---------------------------------------------------------------------------
// Slug minting
// ---------------------------------------------------------------------------

/** Cap on the readable part. The suffix is appended after this. */
const MAX_BASE_LENGTH = 64
const SUFFIX_LENGTH = 10

/**
 * The readable part of a slug, derived from the published surface title.
 *
 * Unicode-aware on purpose: letters outside ASCII are retained rather than
 * transliterated away. A Kenyan road, a Kiswahili title or an accented name
 * keeps its own characters, because the address should look like the thing it
 * addresses.
 */
export function slugBase(title: string): string {
  const normalized = title.normalize('NFKC').toLocaleLowerCase('en')
  const collapsed = normalized.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const bounded = collapsed.slice(0, MAX_BASE_LENGTH).replace(/-+$/g, '')
  return bounded === '' ? 'xray' : bounded
}

/**
 * A stable short id for one investigation lineage.
 *
 * Derived from the investigation id alone — never from publication order, a
 * retry counter or a collision attempt. That is what makes the public address
 * deterministic for the lineage: which principal happened to publish first
 * cannot change it.
 */
export function slugSuffix(investigationId: string): string {
  return createHash('sha256').update(investigationId).digest('hex').slice(0, SUFFIX_LENGTH)
}

/** The full slug a lineage will receive, computable before publication. */
export function deterministicSlug(investigationId: string, title: string): string {
  return `${slugBase(title)}-${slugSuffix(investigationId)}`
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const toEvent = (row: Record<string, unknown>): PublicationEvent => ({
  investigationId: row.investigation_id as string,
  sequence: row.sequence as number,
  version: row.version_number as number,
  act: row.act as PublicationAct,
  principalId: row.principal_id as string,
  occurredAt: row.occurred_at as string,
  ...(row.withdrawal_reason === null
    ? {}
    : { withdrawalReason: row.withdrawal_reason as WithdrawalReason }),
  ...(row.note === null ? {} : { note: row.note as string }),
  ...(row.authorizing_execution_run_id === null
    ? {}
    : { authorizingExecutionRunId: row.authorizing_execution_run_id as string }),
  ...(row.authorizing_graduation_index === null
    ? {}
    : { authorizingGraduationIndex: row.authorizing_graduation_index as number }),
})

const EVENT_COLUMNS = `investigation_id, sequence, version_number, act, principal_id, occurred_at,
  withdrawal_reason, note, authorizing_execution_run_id, authorizing_graduation_index`

/** Every publication act for one lineage, in replay order. */
export async function readPublicationHistory(
  db: SnapshotDatabase,
  investigationId: string,
): Promise<readonly PublicationEvent[]> {
  const rows = (await db.query(
    `SELECT ${EVENT_COLUMNS} FROM publication_events WHERE investigation_id=$1 ORDER BY sequence`,
    [investigationId],
  )).rows
  return rows.map(toEvent)
}

/** The permanent public slug, once one has been minted. */
export async function readSlug(
  db: SnapshotDatabase,
  investigationId: string,
): Promise<string | undefined> {
  const rows = (await db.query('SELECT slug FROM investigation_slugs WHERE investigation_id=$1',
    [investigationId])).rows
  return rows.length === 1 ? (rows[0].slug as string) : undefined
}

/** Which lineage owns a slug. */
export async function resolveSlug(
  db: SnapshotDatabase,
  slug: string,
): Promise<{ investigationId: string; allocatedAt: string } | undefined> {
  const rows = (await db.query(
    'SELECT investigation_id, allocated_at FROM investigation_slugs WHERE slug=$1', [slug])).rows
  return rows.length === 1
    ? { investigationId: rows[0].investigation_id as string, allocatedAt: rows[0].allocated_at as string }
    : undefined
}

/**
 * The lineage's current presentation head, replayed from event order.
 *
 * **`PUBLISH` selects the head. `WITHDRAW` only changes the presentation state
 * of its exact target.**
 *
 * So the head is the version named by the most recent `PUBLISH`, and its state
 * is that version's own current state — which a later withdrawal of *that*
 * version turns to `WITHDRAWN`.
 *
 * Withdrawing some other version therefore leaves the head where it is. Taking
 * down an old version is not a decision about what the lineage currently
 * presents, and treating every act as head-selecting would let a takedown of
 * superseded history silently take the alias down with it.
 *
 * It is never `MAX(version)` either: that cannot express a deliberate rollback
 * to an earlier version, which is a legitimate publication decision.
 *
 * `undefined` means nothing has ever been published.
 */
export function presentationHead(
  history: readonly PublicationEvent[],
): PresentationHead | undefined {
  let selected: PublicationEvent | undefined
  for (const event of history) if (event.act === 'PUBLISH') selected = event
  if (selected === undefined) return undefined

  // The act that determines the head's current state: the last thing that
  // happened to that exact version, which may be a withdrawal of it.
  let determining = selected
  for (const event of history) if (event.version === selected.version) determining = event

  return {
    version: selected.version,
    state: determining.act === 'PUBLISH' ? 'PUBLISHED' : 'WITHDRAWN',
    event: determining,
  }
}

export async function resolvePresentationHead(
  db: SnapshotDatabase,
  investigationId: string,
): Promise<PresentationHead | undefined> {
  return presentationHead(await readPublicationHistory(db, investigationId))
}

/**
 * The state of one exact version, independent of every other version.
 *
 * Publishing v2 does not touch v1's state, and withdrawing v2 does not withdraw
 * v1 — each version's own history decides.
 */
export function exactVersionState(
  history: readonly PublicationEvent[],
  version: number,
): PresentationState | undefined {
  const own = history.filter((event) => event.version === version)
  const last = own[own.length - 1]
  return last === undefined ? undefined : last.act === 'PUBLISH' ? 'PUBLISHED' : 'WITHDRAWN'
}

export async function resolveExactVersionState(
  db: SnapshotDatabase,
  investigationId: string,
  version: number,
): Promise<PresentationState | undefined> {
  return exactVersionState(await readPublicationHistory(db, investigationId), version)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface PublishCommand {
  investigationId: string
  version: number
  principalId: string
  occurredAt: string
}

export interface WithdrawCommand extends PublishCommand {
  reason: WithdrawalReason
  note?: string
}

/** Recorded eligibility that may authorize exposing a committed version. */
export interface EligibilityRecord {
  executionRunId: string
  graduationIndex: number
  verdict: GraduationResult['verdict']
  result: GraduationResult
}

/**
 * The eligibility recorded for a committed version, if any.
 *
 * Read, never recomputed. Graduation was assessed when the version was
 * committed; re-deriving it here would let a later change of tooling silently
 * alter whether an already-published version had been allowed out.
 *
 * A committed version with no linked execution run and graduation has **no**
 * eligibility record and cannot be published — a seeded first version is
 * committed without ever having been assessed, and it does not become
 * publishable merely by existing.
 */
export async function readEligibility(
  db: SnapshotDatabase,
  investigationId: string,
  version: number,
): Promise<EligibilityRecord | undefined> {
  const rows = (await db.query(
    `SELECT r.id AS execution_run_id, r.committed_graduation_index, g.verdict, g.result
       FROM execution_runs r
       JOIN run_graduations g
         ON g.execution_run_id = r.id AND g.assessment_index = r.committed_graduation_index
      WHERE r.investigation_id = $1 AND r.committed_version = $2`,
    [investigationId, version],
  )).rows
  if (rows.length !== 1) return undefined
  return {
    executionRunId: rows[0].execution_run_id as string,
    graduationIndex: rows[0].committed_graduation_index as number,
    verdict: rows[0].verdict as GraduationResult['verdict'],
    result: decodeValue(rows[0].result as Encoded) as GraduationResult,
  }
}

const principal = (raw: string): string => {
  if (typeof raw !== 'string' || raw.trim() === '')
    throw new PublicationRefused('NO_PRINCIPAL',
      'A publication act requires an attributable principal supplied by the host')
  return raw
}

async function committedVersionExists(
  db: SnapshotDatabase, investigationId: string, version: number,
): Promise<boolean> {
  return (await db.query(
    'SELECT 1 FROM investigation_versions WHERE investigation_id=$1 AND version_number=$2',
    [investigationId, version])).rows.length === 1
}

/** Serialize publication commands for one lineage on the database, not in process. */
async function lockLineage(db: SnapshotDatabase, investigationId: string): Promise<boolean> {
  return (await db.query('SELECT id FROM investigations WHERE id=$1 FOR UPDATE',
    [investigationId])).rows.length === 1
}

async function nextSequence(db: SnapshotDatabase, investigationId: string): Promise<number> {
  const rows = (await db.query(
    'SELECT COALESCE(MAX(sequence), 0) AS last FROM publication_events WHERE investigation_id=$1',
    [investigationId])).rows
  return (rows[0].last as number) + 1
}

async function surfaceTitle(
  db: SnapshotDatabase, investigationId: string, version: number,
): Promise<string> {
  const rows = (await db.query(
    `SELECT s.title FROM investigation_versions v
       JOIN sources s ON s.investigation_id = v.investigation_id
        AND s.version_number = v.version_number AND s.id = v.surface_source_id
      WHERE v.investigation_id = $1 AND v.version_number = $2`,
    [investigationId, version])).rows
  return rows.length === 1 ? (rows[0].title as string) : ''
}

/**
 * Publish an exact committed version.
 *
 * At first publication the slug is allocated and the event appended in **one
 * transaction**. Two coupled durable effects that could half-happen would
 * leave a lineage with a permanent public address and no publication, or a
 * publication with no address.
 */
export async function publishVersion(
  db: SnapshotDatabase, command: PublishCommand,
): Promise<{ slug: string; event: PublicationEvent }> {
  const principalId = principal(command.principalId)
  const { investigationId, version, occurredAt } = command

  await db.query('BEGIN')
  try {
    if (!await lockLineage(db, investigationId))
      throw new PublicationRefused('VERSION_NOT_COMMITTED', `Investigation ${investigationId} does not exist`)

    if (!await committedVersionExists(db, investigationId, version))
      throw new PublicationRefused('VERSION_NOT_COMMITTED',
        `${investigationId} v${version} is not a committed version`)

    const eligibility = await readEligibility(db, investigationId, version)
    if (eligibility === undefined)
      throw new PublicationRefused('NO_ELIGIBILITY_RECORD',
        `${investigationId} v${version} has no linked graduation record authorizing publication`)
    if (!isEligibleAssessment(eligibility.result))
      throw new PublicationRefused('NOT_ELIGIBLE',
        `${investigationId} v${version} graduated ${eligibility.verdict} and may not be published`)

    const history = await readPublicationHistory(db, investigationId)
    const head = presentationHead(history)
    // Re-publishing the version already presented records nothing and means
    // nothing. Publishing an earlier version is different: that is a rollback.
    if (head !== undefined && head.state === 'PUBLISHED' && head.version === version)
      throw new PublicationRefused('DUPLICATE_PUBLISH',
        `${investigationId} v${version} is already the presented version`)

    let slug = await readSlug(db, investigationId)
    if (slug === undefined) {
      slug = deterministicSlug(investigationId, await surfaceTitle(db, investigationId, version))
      const owner = await resolveSlug(db, slug)
      if (owner !== undefined && owner.investigationId !== investigationId)
        throw new PublicationRefused('SLUG_CONFLICT',
          `Slug ${slug} already belongs to ${owner.investigationId}`)
      await db.query(
        'INSERT INTO investigation_slugs(investigation_id, slug, allocated_at) VALUES ($1,$2,$3)',
        [investigationId, slug, occurredAt])
    }

    const sequence = await nextSequence(db, investigationId)
    await db.query(
      `INSERT INTO publication_events(investigation_id, sequence, version_number, act,
         principal_id, occurred_at, authorizing_execution_run_id, authorizing_graduation_index)
       VALUES ($1,$2,$3,'PUBLISH',$4,$5,$6,$7)`,
      [investigationId, sequence, version, principalId, occurredAt,
        eligibility.executionRunId, eligibility.graduationIndex])

    await db.query('COMMIT')
    return {
      slug,
      event: {
        investigationId, sequence, version, act: 'PUBLISH', principalId, occurredAt,
        authorizingExecutionRunId: eligibility.executionRunId,
        authorizingGraduationIndex: eligibility.graduationIndex,
      },
    }
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

/**
 * Withdraw a version that is currently presented.
 *
 * Canonical state is untouched. This records that a principal stopped
 * presenting something, and nothing else.
 */
export async function withdrawVersion(
  db: SnapshotDatabase, command: WithdrawCommand,
): Promise<PublicationEvent> {
  const principalId = principal(command.principalId)
  const { investigationId, version, occurredAt, reason, note } = command

  if (!WITHDRAWAL_REASONS.includes(reason))
    throw new PublicationRefused('INVALID_REASON', `${String(reason)} is not a withdrawal reason`)
  // A retraction for error must say what was wrong. COMPELLED and PRIVACY_HARM
  // require no such confession, and demanding one would put words in X-Ray's
  // mouth about evidence it still stands behind.
  if (reason === 'ERRONEOUS' && (note === undefined || note.trim() === ''))
    throw new PublicationRefused('MISSING_ERROR_NOTE',
      'An ERRONEOUS withdrawal must record what was wrong')

  await db.query('BEGIN')
  try {
    if (!await lockLineage(db, investigationId))
      throw new PublicationRefused('NOT_PUBLISHED', `Investigation ${investigationId} does not exist`)

    const history = await readPublicationHistory(db, investigationId)
    const state = exactVersionState(history, version)
    if (state === undefined)
      throw new PublicationRefused('NOT_PUBLISHED',
        `${investigationId} v${version} has never been published`)
    if (state === 'WITHDRAWN')
      throw new PublicationRefused('NOT_PUBLISHED',
        `${investigationId} v${version} is already withdrawn`)

    const sequence = await nextSequence(db, investigationId)
    await db.query(
      `INSERT INTO publication_events(investigation_id, sequence, version_number, act,
         principal_id, occurred_at, withdrawal_reason, note)
       VALUES ($1,$2,$3,'WITHDRAW',$4,$5,$6,$7)`,
      [investigationId, sequence, version, principalId, occurredAt, reason, note ?? null])

    await db.query('COMMIT')
    return {
      investigationId, sequence, version, act: 'WITHDRAW', principalId, occurredAt,
      withdrawalReason: reason, ...(note === undefined ? {} : { note }),
    }
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}
