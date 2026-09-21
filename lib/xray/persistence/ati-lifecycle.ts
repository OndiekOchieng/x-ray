/**
 * ATI action lifecycle persistence (#10 slice 10a).
 *
 * WHAT THIS IS
 * ============
 * Append-only storage for what people did to a public-record request, and the
 * one bridge from a received record to canonical research.
 *
 * `ati_requests` keeps stable identity and exact origin. Everything that
 * happens is a row in a history table, and current state is **derived** from
 * that history rather than stored as an authoritative mutable fact
 * (ADR-0017). A `status` column cannot say what was exported, which export a
 * person filed, or whether there were two partial responses.
 *
 * WHAT THIS IS NOT
 * ================
 * Not the command layer. These are persistence primitives: they write rows and
 * rely on the database for the structural invariants. XR-INV-009 request
 * validation against the origin snapshot — that requested records stay within
 * what the origin gap names — is 10b's, at the action command boundary.
 *
 * Eligibility is already structural: `ati_requests` carries a composite
 * foreign key to `(investigation, version, gap, ati_eligible)` with
 * `origin_ati_eligible` constrained `true`, so an ineligible gap cannot be
 * reached through it at all.
 *
 * NOTHING HERE TOUCHES RESEARCH STATE
 * ===================================
 * No write in this module reaches a canonical table. The single exception is a
 * read: an acceptance is checked against canonical state before it is allowed.
 */

import type { CustodyBasis } from '@/lib/xray/domain'
import type { SnapshotDatabase } from './snapshot'

export type ATIAct = 'EXPORT' | 'SUBMIT' | 'ACKNOWLEDGE' | 'CLOSE'

/** What the institution said about completeness. Silence is `UNSTATED`. */
export type ResponseCompleteness = 'PARTIAL' | 'FINAL' | 'UNSTATED'

/** Whether holder context was carried from the origin gap or supplied. */
export type HolderContextOrigin = 'ORIGIN_GAP' | 'HUMAN_SUPPLIED'

export class ATILifecycleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ATILifecycleError'
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RequestOrigin {
  requestId: string
  investigationId: string
  /** The exact version whose gap this request acts on. */
  originVersion: number
  gapId: string
  ordinal: number
  jurisdiction: 'KE'
}

/** The content a revision freezes. Holder context is copied, not referenced. */
export interface RevisionContent {
  createdAt: string
  holdingInstitution: string
  holdingOffice?: string
  custodyBasis: CustodyBasis
  /**
   * Where the holder context came from.
   *
   * A human-supplied `CONFIRMED` needs a stated rationale — the database
   * refuses one without it, because an inferred holder must never be silently
   * upgraded to a confirmed one.
   */
  holderContextOrigin: HolderContextOrigin
  custodyBasisRationale?: string
  requestedRecords: readonly string[]
  publicInterestContext: string
  investigationUrl?: string
  rendered?: string
}

/**
 * Create the request identity and its first revision.
 *
 * Deliberately permits several requests against one gap: a missing record may
 * be sought from two institutions with plausible custody, and forcing one
 * request per gap would make the second unrepresentable (#10 C3).
 */
export async function createRequest(
  db: SnapshotDatabase, origin: RequestOrigin, content: RevisionContent,
): Promise<{ requestId: string; revision: number }> {
  await db.query('BEGIN')
  try {
    // The mutable legacy columns are superseded by the history tables and are
    // deliberately left null: new runtime must not use them as the record.
    await db.query(
      `INSERT INTO ati_requests(id, investigation_id, origin_version, gap_id, ordinal,
         jurisdiction) VALUES ($1,$2,$3,$4,$5,$6)`,
      [origin.requestId, origin.investigationId, origin.originVersion, origin.gapId,
        origin.ordinal, origin.jurisdiction])
    await insertRevision(db, origin.requestId, 1, content)
    await db.query('COMMIT')
    return { requestId: origin.requestId, revision: 1 }
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

async function insertRevision(
  db: SnapshotDatabase, requestId: string, revision: number, content: RevisionContent,
): Promise<void> {
  await db.query(
    `INSERT INTO ati_request_revisions(request_id, revision, created_at,
       holding_institution, holding_office, custody_basis, holder_context_origin,
       custody_basis_rationale, requested_records, public_interest_context,
       investigation_url, rendered_body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [requestId, revision, content.createdAt, content.holdingInstitution,
      content.holdingOffice ?? null, content.custodyBasis, content.holderContextOrigin,
      content.custodyBasisRationale ?? null, JSON.stringify([...content.requestedRecords]),
      content.publicInterestContext, content.investigationUrl ?? null,
      content.rendered ?? null])
}

/**
 * Add a revision.
 *
 * An edit never rewrites a revision that was already exported or filed — that
 * is what makes "what was sent" answerable later.
 */
export async function reviseRequest(
  db: SnapshotDatabase, requestId: string, content: RevisionContent,
): Promise<number> {
  const next = (await nextOrdinal(db, 'ati_request_revisions', 'revision', requestId))
  await insertRevision(db, requestId, next, content)
  return next
}

async function nextOrdinal(
  db: SnapshotDatabase, table: string, column: string, requestId: string,
): Promise<number> {
  const rows = (await db.query(
    `SELECT COALESCE(MAX(${column}), 0) AS last FROM ${table} WHERE request_id=$1`,
    [requestId])).rows
  return Number(rows[0].last) + 1
}

const nextSequence = (db: SnapshotDatabase, table: string, requestId: string) =>
  nextOrdinal(db, table, 'sequence', requestId)

/** Freeze one exact revision for a human to file. An export is not a filing. */
export async function recordExport(
  db: SnapshotDatabase, requestId: string, revision: number, occurredAt: string,
): Promise<number> {
  const sequence = await nextSequence(db, 'ati_request_events', requestId)
  await db.query(
    `INSERT INTO ati_request_events(request_id, sequence, act, occurred_at, revision)
     VALUES ($1,$2,'EXPORT',$3,$4)`, [requestId, sequence, occurredAt, revision])
  return sequence
}

/** Facts a human supplied about filing. Absent stays absent. */
export interface SubmissionFacts {
  method?: string
  externalReference?: string
  destination?: string
  note?: string
}

/**
 * Record that a human filed one exact export.
 *
 * X-Ray does not file requests (ADR-0008), so submission is never inferred
 * from an export. The database refuses a submission that does not reference an
 * act which was actually an export.
 */
export async function confirmSubmission(
  db: SnapshotDatabase, requestId: string, exportSequence: number, occurredAt: string,
  facts: SubmissionFacts = {},
): Promise<number> {
  const sequence = await nextSequence(db, 'ati_request_events', requestId)
  await db.query(
    `INSERT INTO ati_request_events(request_id, sequence, act, occurred_at,
       submitted_export_sequence, submission_method, external_reference, destination, note)
     VALUES ($1,$2,'SUBMIT',$3,$4,$5,$6,$7,$8)`,
    [requestId, sequence, occurredAt, exportSequence, facts.method ?? null,
      facts.externalReference ?? null, facts.destination ?? null, facts.note ?? null])
  return sequence
}

export async function recordAcknowledgement(
  db: SnapshotDatabase, requestId: string, occurredAt: string, note?: string,
): Promise<number> {
  const sequence = await nextSequence(db, 'ati_request_events', requestId)
  await db.query(
    `INSERT INTO ati_request_events(request_id, sequence, act, occurred_at, note)
     VALUES ($1,$2,'ACKNOWLEDGE',$3,$4)`, [requestId, sequence, occurredAt, note ?? null])
  return sequence
}

/**
 * Close the action thread.
 *
 * Administrative only. It says nothing about whether the institution answered,
 * whether what arrived was reliable, or whether the gap is resolved (ADR-0017).
 */
export async function closeRequest(
  db: SnapshotDatabase, requestId: string, occurredAt: string, note?: string,
): Promise<number> {
  const sequence = await nextSequence(db, 'ati_request_events', requestId)
  await db.query(
    `INSERT INTO ati_request_events(request_id, sequence, act, occurred_at, note)
     VALUES ($1,$2,'CLOSE',$3,$4)`, [requestId, sequence, occurredAt, note ?? null])
  return sequence
}

/** A record that arrived. Not a Source — there is nowhere here to put one. */
export interface IntakeRecord {
  intakeId: string
  receivedAt: string
  /** What arrived, as described on arrival. Not a claim about what it shows. */
  describedAs: string
  mediaType?: string
  contentHash?: string
}

/**
 * Record a response and whatever arrived with it.
 *
 * Zero records is a legitimate response: an acknowledgement letter carries no
 * evidence, and a duplicate document yields nothing new (ADR-0018).
 */
export async function recordResponse(
  db: SnapshotDatabase, requestId: string, response: {
    receivedAt: string
    completeness: ResponseCompleteness
    summary?: string
    intakes?: readonly IntakeRecord[]
  },
): Promise<number> {
  await db.query('BEGIN')
  try {
    const sequence = await nextSequence(db, 'ati_responses', requestId)
    await db.query(
      `INSERT INTO ati_responses(request_id, sequence, received_at, completeness, summary)
       VALUES ($1,$2,$3,$4,$5)`,
      [requestId, sequence, response.receivedAt, response.completeness,
        response.summary ?? null])
    for (const intake of response.intakes ?? []) {
      await db.query(
        `INSERT INTO ati_response_intakes(intake_id, request_id, response_sequence,
           received_at, described_as, media_type, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [intake.intakeId, requestId, sequence, intake.receivedAt, intake.describedAs,
          intake.mediaType ?? null, intake.contentHash ?? null])
    }
    await db.query('COMMIT')
    return sequence
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

/**
 * Link an intake to a canonical Source a committed version introduced.
 *
 * The only bridge from action state to research, and the database checks four
 * things before allowing one:
 *
 *   1. the intake belongs to this investigation;
 *   2. the named version is already committed;
 *   3. the exact version-scoped `Source` row exists;
 *   4. **that version added it**, rather than inheriting it.
 *
 * The fourth is what keeps the link causal. Every committed version's sources
 * include the ones it inherited, so existence alone would let a response be
 * linked to a record that predates the request entirely. It also makes the
 * duplicate case precise: a response containing something research already
 * held adds no source, so there is nothing to accept.
 *
 * NOTE: the foreign key being non-deferrable does **not** prove the commit
 * happened — it requires only that the row be visible at statement time, and
 * #7 inserts version-scoped rows before advancing the committed pointer. An
 * earlier version of this comment claimed otherwise and was wrong; condition 2
 * is what establishes commitment.
 */
export async function acceptIntakeSource(
  db: SnapshotDatabase, intakeId: string, accepted: {
    investigationId: string
    committedVersion: number
    sourceId: string
    acceptedAt: string
  },
): Promise<number> {
  const rows = (await db.query(
    'SELECT COALESCE(MAX(ordinal) + 1, 0) AS next FROM ati_intake_source_acceptances WHERE intake_id=$1',
    [intakeId])).rows
  const ordinal = Number(rows[0].next)
  await db.query(
    `INSERT INTO ati_intake_source_acceptances(intake_id, ordinal, investigation_id,
       committed_version, source_id, accepted_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [intakeId, ordinal, accepted.investigationId, accepted.committedVersion,
      accepted.sourceId, accepted.acceptedAt])
  return ordinal
}

// ---------------------------------------------------------------------------
// Derived reads
// ---------------------------------------------------------------------------

export interface RevisionRow extends RevisionContent {
  revision: number
}

export interface EventRow {
  sequence: number
  act: ATIAct
  occurredAt: string
  revision?: number
  submittedExportSequence?: number
  submissionMethod?: string
  externalReference?: string
  destination?: string
  note?: string
}

export interface ResponseRow {
  sequence: number
  receivedAt: string
  completeness: ResponseCompleteness
  summary?: string
  intakes: readonly (IntakeRecord & { acceptedSources: readonly AcceptedSource[] })[]
}

export interface AcceptedSource {
  investigationId: string
  committedVersion: number
  sourceId: string
  acceptedAt: string
}

/** Derived status. The enum's progression, replayed from history. */
export type DerivedStatus =
  'DRAFT' | 'EXPORTED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'RESPONDED' | 'CLOSED'

export function deriveStatus(
  events: readonly EventRow[], responses: readonly ResponseRow[],
): DerivedStatus {
  const acts = new Set(events.map((event) => event.act))
  // Closure ends the thread whatever else happened.
  if (acts.has('CLOSE')) return 'CLOSED'
  if (responses.length > 0) return 'RESPONDED'
  if (acts.has('ACKNOWLEDGE')) return 'ACKNOWLEDGED'
  // EXPORTED is never SUBMITTED: only a human assertion moves it.
  if (acts.has('SUBMIT')) return 'SUBMITTED'
  if (acts.has('EXPORT')) return 'EXPORTED'
  return 'DRAFT'
}

/**
 * The whole action history for one request, plus the derived lifecycle view.
 *
 * `status`, `draftedAt`, `submittedAt`, `respondedAt` and `receivedSourceIds`
 * are computed here. None of them is a stored authoritative fact, and none of
 * them belongs to an immutable research graph (#10 C1/C2/C7).
 */
export interface RequestLifecycle {
  requestId: string
  investigationId: string
  originVersion: number
  gapId: string
  jurisdiction: 'KE'
  revisions: readonly RevisionRow[]
  events: readonly EventRow[]
  responses: readonly ResponseRow[]
  status: DerivedStatus
  draftedAt: string
  submittedAt?: string
  respondedAt?: string
  /** Canonical source ids accepted from responses. Never intake identifiers. */
  receivedSourceIds: readonly string[]
}

const optional = <T>(value: unknown): T | undefined =>
  value === null || value === undefined ? undefined : (value as T)

export async function readRequestLifecycle(
  db: SnapshotDatabase, requestId: string,
): Promise<RequestLifecycle | undefined> {
  const identity = (await db.query(
    `SELECT investigation_id, origin_version, gap_id, jurisdiction
       FROM ati_requests WHERE id=$1`, [requestId])).rows
  if (identity.length !== 1) return undefined

  const revisions: RevisionRow[] = (await db.query(
    `SELECT revision, created_at, holding_institution, holding_office, custody_basis,
            holder_context_origin, custody_basis_rationale, requested_records,
            public_interest_context, investigation_url, rendered_body
       FROM ati_request_revisions WHERE request_id=$1 ORDER BY revision`,
    [requestId])).rows.map((row) => ({
    revision: row.revision as number,
    createdAt: row.created_at as string,
    holdingInstitution: row.holding_institution as string,
    ...(row.holding_office === null ? {} : { holdingOffice: row.holding_office as string }),
    custodyBasis: row.custody_basis as CustodyBasis,
    holderContextOrigin: row.holder_context_origin as HolderContextOrigin,
    ...(row.custody_basis_rationale === null
      ? {} : { custodyBasisRationale: row.custody_basis_rationale as string }),
    requestedRecords: row.requested_records as string[],
    publicInterestContext: row.public_interest_context as string,
    ...(row.investigation_url === null ? {} : { investigationUrl: row.investigation_url as string }),
    ...(row.rendered_body === null ? {} : { rendered: row.rendered_body as string }),
  }))

  const events: EventRow[] = (await db.query(
    `SELECT sequence, act, occurred_at, revision, submitted_export_sequence,
            submission_method, external_reference, destination, note
       FROM ati_request_events WHERE request_id=$1 ORDER BY sequence`,
    [requestId])).rows.map((row) => ({
    sequence: row.sequence as number,
    act: row.act as ATIAct,
    occurredAt: row.occurred_at as string,
    ...(row.revision === null ? {} : { revision: row.revision as number }),
    ...(row.submitted_export_sequence === null
      ? {} : { submittedExportSequence: row.submitted_export_sequence as number }),
    ...(row.submission_method === null ? {} : { submissionMethod: row.submission_method as string }),
    ...(row.external_reference === null ? {} : { externalReference: row.external_reference as string }),
    ...(row.destination === null ? {} : { destination: row.destination as string }),
    ...(row.note === null ? {} : { note: row.note as string }),
  }))

  const intakeRows = (await db.query(
    `SELECT i.intake_id, i.response_sequence, i.received_at, i.described_as,
            i.media_type, i.content_hash
       FROM ati_response_intakes i WHERE i.request_id=$1 ORDER BY i.intake_id`,
    [requestId])).rows

  const acceptanceRows = (await db.query(
    `SELECT a.intake_id, a.investigation_id, a.committed_version, a.source_id, a.accepted_at
       FROM ati_intake_source_acceptances a
       JOIN ati_response_intakes i ON i.intake_id = a.intake_id
      WHERE i.request_id=$1 ORDER BY a.intake_id, a.ordinal`, [requestId])).rows

  const acceptedByIntake = new Map<string, AcceptedSource[]>()
  for (const row of acceptanceRows) {
    const list = acceptedByIntake.get(row.intake_id as string) ?? []
    list.push({
      investigationId: row.investigation_id as string,
      committedVersion: row.committed_version as number,
      sourceId: row.source_id as string,
      acceptedAt: row.accepted_at as string,
    })
    acceptedByIntake.set(row.intake_id as string, list)
  }

  const responses: ResponseRow[] = (await db.query(
    `SELECT sequence, received_at, completeness, summary FROM ati_responses
      WHERE request_id=$1 ORDER BY sequence`, [requestId])).rows.map((row) => ({
    sequence: row.sequence as number,
    receivedAt: row.received_at as string,
    completeness: row.completeness as ResponseCompleteness,
    ...(row.summary === null ? {} : { summary: row.summary as string }),
    intakes: intakeRows
      .filter((intake) => intake.response_sequence === row.sequence)
      .map((intake) => ({
        intakeId: intake.intake_id as string,
        receivedAt: intake.received_at as string,
        describedAs: intake.described_as as string,
        ...(intake.media_type === null ? {} : { mediaType: intake.media_type as string }),
        ...(intake.content_hash === null ? {} : { contentHash: intake.content_hash as string }),
        acceptedSources: acceptedByIntake.get(intake.intake_id as string) ?? [],
      })),
  }))

  const firstSubmit = events.find((event) => event.act === 'SUBMIT')

  return {
    requestId,
    investigationId: identity[0].investigation_id as string,
    originVersion: identity[0].origin_version as number,
    gapId: identity[0].gap_id as string,
    jurisdiction: identity[0].jurisdiction as 'KE',
    revisions,
    events,
    responses,
    status: deriveStatus(events, responses),
    draftedAt: revisions[0]?.createdAt ?? '',
    ...(firstSubmit === undefined ? {} : { submittedAt: firstSubmit.occurredAt }),
    ...(responses[0] === undefined ? {} : { respondedAt: responses[0].receivedAt }),
    receivedSourceIds: [...new Set(
      responses.flatMap((response) =>
        response.intakes.flatMap((intake) =>
          intake.acceptedSources.map((accepted) => accepted.sourceId))))],
  }
}

/** Every request originating from one exact gap. There may be several (C3). */
export async function readRequestsForGap(
  db: SnapshotDatabase, investigationId: string, originVersion: number, gapId: string,
): Promise<readonly string[]> {
  return (await db.query(
    `SELECT id FROM ati_requests
      WHERE investigation_id=$1 AND origin_version=$2 AND gap_id=$3 ORDER BY ordinal`,
    [investigationId, originVersion, gapId])).rows.map((row) => row.id as string)
}

export const optionalValue = optional
