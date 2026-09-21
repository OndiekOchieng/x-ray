/**
 * The ATI action command boundary (#10 slice 10b).
 *
 * WHAT THIS IS
 * ============
 * The only legitimate way to act on a public-record request. 10a supplied
 * append-only storage and let the database hold the structural invariants;
 * this is where the *semantic* ones live — which gap a request may act on,
 * which records it may name, and which action sequences are possible at all.
 *
 * WHERE XR-INV-009 NOW LIVES
 * ==========================
 * It used to be enforced in `validation/epistemic.ts` over a normalized
 * `XRayGraph.atiRequests` collection. That placement could not work, for a
 * reason that is structural rather than stylistic: a request is an action
 * taken *about* an immutable version, and its own state keeps changing after
 * that version is frozen. Holding it in the graph made action state look like
 * version-scoped research state, and the validator could only ever see
 * requests someone had already assembled into a graph — which, once the graph
 * stopped carrying them, was never.
 *
 * So the invariant moves to the moment a request is created or revised, where
 * there is something to reject:
 *
 *   ATI eligibility           → the origin gap must be PUBLIC_RECORD_REQUEST
 *                               and `atiEligible: true`
 *   Requested-record grounding → requestedRecords ⊆ gap.resolvingEvidence
 *
 * Both are checked against the **exact frozen origin snapshot**
 * `(investigationId, originVersion)` — never the latest committed state. A
 * request anchored to v2 is validated against v2 even after v3 exists, so a
 * later version cannot retroactively enlarge what an older request was allowed
 * to ask for (#10 C4, release 10b §F). If the new record should be requested,
 * that is a new request anchored to the newer snapshot.
 *
 * The gap half of XR-INV-009 — that `atiEligible` agrees with
 * `resolutionPath` — stays in graph validation, because it is a property of a
 * gap and gaps remain version-scoped research state.
 *
 * WHAT THIS IS NOT
 * ================
 * Not a response-intake orchestrator. 10a can store a response; the command
 * and API semantics for receiving one are 10c's, and nothing here creates a
 * Source, seeds a workspace, or commits a version.
 *
 * Not an authorisation layer. "A human did this" is represented by the caller
 * having to say so explicitly (`humanConfirmed: true`); who that human is has
 * no representation anywhere in the system yet.
 *
 * EXACT STRING MEMBERSHIP
 * =======================
 * Record grounding is exact string membership in `gap.resolvingEvidence`. No
 * normalization, no fuzzy or semantic matching (release 10b §E). A human may
 * reword the prose around a request freely; the records it names are the gap
 * ledger's words or they are not in the request.
 */

import { createHash } from 'node:crypto'

import type { CustodyBasis, Gap } from '@/lib/xray/domain'
import { readSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  closeRequest, confirmSubmission, createRequest, readRequestLifecycle,
  readRequestsForGap, recordAcknowledgement, recordExport, recordResponse,
  reviseRequest,
  type DigestOrigin, type EventRow, type IntakeRecord, type RequestLifecycle,
  type ResponseCompleteness, type RevisionContent, type SubmissionFacts,
} from '@/lib/xray/persistence/ati-lifecycle'
import { projectATIRequest, type ATIRequestView } from './ati-read-model'

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

/**
 * Why a command was refused.
 *
 * The two `XR-INV-009/...` members are deliberately the same strings the
 * epistemic validator emitted for the same two conditions. They are the
 * evidence that the invariant moved rather than lapsed: the code a reader
 * would have seen from graph validation is the code they now see from the
 * command boundary.
 */
export type ATIRejectionCode =
  | 'XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP'
  | 'XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP'
  | 'ATI/ORIGIN_SNAPSHOT_NOT_FOUND'
  | 'ATI/ORIGIN_GAP_NOT_FOUND'
  | 'ATI/NO_RECORDS_REQUESTED'
  | 'ATI/HOLDER_CONTEXT_MISSING'
  | 'ATI/CUSTODY_BASIS_RATIONALE_REQUIRED'
  | 'ATI/REQUEST_NOT_FOUND'
  | 'ATI/REQUEST_CLOSED'
  | 'ATI/REVISION_NOT_FOUND'
  | 'ATI/EXPORT_NOT_FOUND'
  | 'ATI/ACKNOWLEDGEMENT_BEFORE_SUBMISSION'
  | 'ATI/CLOSE_REQUIRES_POST_DRAFT_STATE'
  | 'ATI/RETROGRADE_EVENT'
  | 'ATI/RESPONSE_REQUIRES_SUBMISSION'
  | 'ATI/INTAKE_DESCRIPTION_MISSING'
  | 'ATI/DIGEST_MALFORMED'
  | 'ATI/DIGEST_MISMATCH'

export class ATIActionRejected extends Error {
  readonly code: ATIRejectionCode
  readonly detail: Readonly<Record<string, unknown>>

  constructor(code: ATIRejectionCode, message: string, detail: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ATIActionRejected'
    this.code = code
    this.detail = detail
  }
}

const reject = (
  code: ATIRejectionCode, message: string, detail?: Record<string, unknown>,
): never => {
  throw new ATIActionRejected(code, message, detail)
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Where a request is anchored. All three parts are exact. */
export interface OriginRef {
  investigationId: string
  /** The exact committed version. Not "the latest". */
  originVersion: number
  gapId: string
}

/**
 * Holder context a human supplied, overriding what the origin gap says.
 *
 * A `CONFIRMED` basis supplied here needs a stated rationale: the gap ledger
 * recorded custody as inferred, and an inferred holder must never become a
 * confirmed one just because someone retyped it (10a's database check enforces
 * the same rule from below).
 */
export interface SuppliedHolderContext {
  institution: string
  office?: string
  basis: CustodyBasis
  rationale?: string
}

export interface CreateDraftInput extends OriginRef {
  requestedRecords: readonly string[]
  publicInterestContext: string
  investigationUrl?: string
  rendered?: string

  /** Omit to derive the addressee from the origin gap's `likelyHolder`. */
  holder?: SuppliedHolderContext

  /** Defaults to a deterministic id derived from the allocated ordinal. */
  requestId?: string
  createdAt?: string
}

export interface ReviseDraftInput {
  requestedRecords: readonly string[]
  publicInterestContext: string
  investigationUrl?: string
  rendered?: string
  holder?: SuppliedHolderContext
  createdAt?: string
}

/**
 * A human asserting they filed an exact export.
 *
 * `humanConfirmed` is a required literal `true` rather than an optional flag,
 * so no orchestration can reach SUBMITTED as a continuation of exporting.
 * X-Ray does not file requests (ADR-0008); submission is only ever a human
 * statement about something that happened outside the system.
 */
export interface SubmissionAssertion extends SubmissionFacts {
  humanConfirmed: true
}

/**
 * One record that arrived, as described on arrival.
 *
 * The caller may name a file; it does not name an intake. `intakeId` is
 * X-Ray-owned and allocated by the command (release 10c §I) — a raw filename
 * is not identity, because two institutions both send `scan.pdf`.
 *
 * `material` is used to compute a receipt digest and is then discarded.
 * Nothing here is persisted beyond receipt facts: there is no document store,
 * and 10c deliberately did not invent one (§G).
 */
export interface IntakeAssertion {
  /** What arrived, as described on arrival. Not a claim about what it shows. */
  describedAs: string
  receivedAt?: string
  mediaType?: string

  /**
   * Content held at receipt time. Hashed, never stored.
   *
   * Preferred over `suppliedDigest`: a digest X-Ray computed from bytes it had
   * means something a stated one does not (§H).
   */
  material?: string | Uint8Array

  /**
   * A digest someone else stated — an institution's covering letter, a portal
   * listing. Recorded as their claim. If `material` is also present the two
   * must agree, and the result is `COMPUTED`.
   */
  suppliedDigest?: string
}

/**
 * A response that arrived, as reported.
 *
 * `completeness` is required and never defaulted. `UNSTATED` is an explicit
 * choice the caller has to make, because the honest reading of silence is "we
 * were not told", and a command that filled it in would be inferring the one
 * thing ADR-0018 says may not be inferred (§D).
 */
export interface ResponseAssertion {
  receivedAt: string
  completeness: ResponseCompleteness
  /** What the response said, if anything. Never synthesized from the intakes. */
  summary?: string
  intakes?: readonly IntakeAssertion[]
}

/** Closure is administrative and says nothing about whether anyone answered. */
export interface ClosureAssertion {
  humanConfirmed: true
  /** Why the thread was closed. Required: closure with no stated reason is unreadable later. */
  reason: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Every command that depends on action history runs as:
 *
 *   BEGIN → lock the request row → re-read history → check → append → COMMIT
 *
 * Every sequence 10a allocates is `MAX(...) + 1`, which two concurrent callers
 * can read identically, and every lifecycle rule is a statement about history
 * that a concurrent command can invalidate. Both problems have the same fix, so
 * the lock covers the checks as well as the allocation — see
 * `withRequestLock`.
 *
 * HONEST LIMITATION: PGlite runs a single connection. The gates prove the
 * ordering — that checks run on state re-read after the lock — and prove the
 * outcome deterministic. They do not prove native concurrent row-lock
 * behaviour; that needs a real PostgreSQL gate, the same limitation #7 and #9
 * record.
 */
export class ATIActionService {
  private readonly db: SnapshotDatabase
  private readonly clock: () => string

  constructor(db: SnapshotDatabase, clock: () => string = () => new Date().toISOString()) {
    this.db = db
    this.clock = clock
  }

  // -- reads ---------------------------------------------------------------

  async readLifecycle(requestId: string): Promise<RequestLifecycle | undefined> {
    return readRequestLifecycle(this.db, requestId)
  }

  /**
   * The derived read model. Throws if the request does not exist.
   *
   * Takes no lock: it is a read, and a caller acting on what it returns goes
   * back through a command, which re-reads under one.
   */
  async view(requestId: string): Promise<ATIRequestView> {
    const lifecycle = await readRequestLifecycle(this.db, requestId)
    if (lifecycle === undefined) {
      reject('ATI/REQUEST_NOT_FOUND', `no ATI request ${requestId}`, { requestId })
    }
    return projectATIRequest(lifecycle!)
  }

  /** Every request anchored to one exact gap. There may legitimately be several (C3). */
  async listRequestsForGap(origin: OriginRef): Promise<readonly string[]> {
    return readRequestsForGap(
      this.db, origin.investigationId, origin.originVersion, origin.gapId)
  }

  // -- create --------------------------------------------------------------

  /**
   * Create a request and its first revision, authorized against the exact
   * origin snapshot.
   *
   * The ordinal is allocated here, under a row lock on the investigation, and
   * never by the caller: `ati_requests` is `UNIQUE (investigation_id, ordinal)`
   * and an API that let a caller choose would let two concurrent creates
   * collide on it.
   */
  async createDraft(input: CreateDraftInput): Promise<{ requestId: string; revision: number }> {
    const gap = await this.loadOriginGap(input)
    const content = this.buildContent(gap, input, input.createdAt ?? this.clock())

    await this.db.query('BEGIN')
    try {
      // Serializes ordinal allocation per investigation against a concurrent
      // create. See the concurrency note at the foot of this file.
      const locked = (await this.db.query(
        'SELECT id FROM investigations WHERE id=$1 FOR UPDATE',
        [input.investigationId])).rows
      if (locked.length !== 1) {
        reject('ATI/ORIGIN_SNAPSHOT_NOT_FOUND',
          `investigation ${input.investigationId} does not exist`,
          { investigationId: input.investigationId })
      }
      const ordinal = Number((await this.db.query(
        'SELECT COALESCE(MAX(ordinal) + 1, 0) AS next FROM ati_requests WHERE investigation_id=$1',
        [input.investigationId])).rows[0].next)
      const requestId = input.requestId
        ?? `${input.investigationId}-ATI-${String(ordinal + 1).padStart(3, '0')}`
      const created = await createRequest(this.db, {
        requestId,
        investigationId: input.investigationId,
        originVersion: input.originVersion,
        gapId: input.gapId,
        ordinal,
        jurisdiction: 'KE',
      }, content, { inTransaction: true })
      await this.db.query('COMMIT')
      return created
    } catch (error) {
      await this.db.query('ROLLBACK')
      throw error
    }
  }

  // -- revise --------------------------------------------------------------

  /**
   * Add a revision, bounded by the request's **frozen** origin snapshot.
   *
   * The origin is read from the request's own row, not taken from the caller,
   * so a revision cannot quietly re-anchor itself to a newer version that names
   * more records.
   */
  async reviseDraft(requestId: string, input: ReviseDraftInput): Promise<number> {
    return this.withRequestLock(requestId, async (lifecycle) => {
      this.refuseIfClosed(lifecycle)

      const gap = await this.loadOriginGap({
        investigationId: lifecycle.investigationId,
        originVersion: lifecycle.originVersion,
        gapId: lifecycle.gapId,
      })
      const createdAt = input.createdAt ?? this.clock()
      const content = this.buildContent(gap, input, createdAt)

      // Sequence is authoritative for ordering, so a revision may not be
      // stamped before the revision it follows — that would make the history
      // read as though the older text were the newer one.
      const latest = lifecycle.revisions[lifecycle.revisions.length - 1]
      if (latest !== undefined && createdAt < latest.createdAt) {
        reject('ATI/RETROGRADE_EVENT',
          `revision would be stamped ${createdAt}, before revision ${latest.revision} at ${latest.createdAt}`,
          { requestId, createdAt, previousRevision: latest.revision, previousCreatedAt: latest.createdAt })
      }

      return reviseRequest(this.db, requestId, content)
    })
  }

  // -- lifecycle acts ------------------------------------------------------

  /** Freeze one exact revision for a human to file. An export is not a filing. */
  async exportRevision(
    requestId: string, revision: number, occurredAt?: string,
  ): Promise<number> {
    return this.withRequestLock(requestId, async (lifecycle) => {
      this.refuseIfClosed(lifecycle)

      const frozen = lifecycle.revisions.find((row) => row.revision === revision)
      if (frozen === undefined) {
        reject('ATI/REVISION_NOT_FOUND',
          `request ${requestId} has no revision ${revision}`,
          { requestId, revision, revisions: lifecycle.revisions.map((r) => r.revision) })
      }

      const at = occurredAt ?? this.clock()
      if (at < frozen!.createdAt) {
        reject('ATI/RETROGRADE_EVENT',
          `export at ${at} precedes revision ${revision}, created at ${frozen!.createdAt}`,
          { requestId, revision, occurredAt: at, revisionCreatedAt: frozen!.createdAt })
      }

      return recordExport(this.db, requestId, revision, at)
    })
  }

  /**
   * Record that a human filed one exact export.
   *
   * Never inferred. The export sequence must name an event that was actually
   * an export, and the assertion has to be made explicitly.
   */
  async confirmSubmitted(
    requestId: string, exportSequence: number, assertion: SubmissionAssertion,
    occurredAt?: string,
  ): Promise<number> {
    return this.withRequestLock(requestId, async (lifecycle) => {
      this.refuseIfClosed(lifecycle)

      const named = lifecycle.events.find((event) => event.sequence === exportSequence)
      if (named === undefined || named.act !== 'EXPORT') {
        reject('ATI/EXPORT_NOT_FOUND',
          named === undefined
            ? `request ${requestId} has no event ${exportSequence}`
            : `event ${exportSequence} of ${requestId} is a ${named.act}, not an export`,
          { requestId, exportSequence, ...(named === undefined ? {} : { act: named.act }) })
      }

      const at = occurredAt ?? this.clock()
      if (at < named!.occurredAt) {
        reject('ATI/RETROGRADE_EVENT',
          `submission at ${at} precedes the export it names, at ${named!.occurredAt}`,
          { requestId, exportSequence, occurredAt: at, exportOccurredAt: named!.occurredAt })
      }

      const { humanConfirmed: _confirmed, ...facts } = assertion
      return confirmSubmission(this.db, requestId, exportSequence, at, facts)
    })
  }

  /** An institution acknowledged a request that was actually filed. */
  async acknowledge(requestId: string, occurredAt?: string, note?: string): Promise<number> {
    return this.withRequestLock(requestId, async (lifecycle) => {
      this.refuseIfClosed(lifecycle)

      const submissions = lifecycle.events.filter((event) => event.act === 'SUBMIT')
      if (submissions.length === 0) {
        reject('ATI/ACKNOWLEDGEMENT_BEFORE_SUBMISSION',
          `request ${requestId} has not been filed, so there is nothing to acknowledge`,
          { requestId, status: lifecycle.status })
      }

      const at = occurredAt ?? this.clock()
      const earliest = submissions[0] as EventRow
      if (at < earliest.occurredAt) {
        reject('ATI/RETROGRADE_EVENT',
          `acknowledgement at ${at} precedes the submission at ${earliest.occurredAt}`,
          { requestId, occurredAt: at, submittedAt: earliest.occurredAt })
      }

      return recordAcknowledgement(this.db, requestId, at, note)
    })
  }

  /**
   * Close the action thread.
   *
   * Explicit and administrative. It is not available from DRAFT — there is no
   * thread to close before anything has been done — and nothing may follow it,
   * because reopening is not designed (release 10b §G).
   */
  async close(
    requestId: string, assertion: ClosureAssertion, occurredAt?: string,
  ): Promise<number> {
    return this.withRequestLock(requestId, async (lifecycle) => {
      this.refuseIfClosed(lifecycle)

      if (lifecycle.events.length === 0) {
        reject('ATI/CLOSE_REQUIRES_POST_DRAFT_STATE',
          `request ${requestId} is still a draft; closure is a post-draft administrative act`,
          { requestId, status: lifecycle.status })
      }
      if (assertion.reason.trim() === '') {
        reject('ATI/CLOSE_REQUIRES_POST_DRAFT_STATE',
          `closing ${requestId} requires a stated reason`, { requestId })
      }

      const at = occurredAt ?? this.clock()
      return closeRequest(this.db, requestId, at, assertion.reason)
    })
  }

  // -- response ------------------------------------------------------------

  /**
   * Record that something arrived in answer to a filed request.
   *
   * **A response requires a request that was actually submitted.** At least one
   * `SUBMIT` must exist; a `DRAFT` or `EXPORTED` request cannot receive one
   * (release 10c §B). `EXPORTED` is not `SUBMITTED`, and without this rule a
   * document found by other means could be laundered into ATI provenance
   * because a draft happened to exist. Material that arrived through another
   * channel belongs on the normal retrieval path, not here.
   *
   * An acknowledgement is not required. Institutions answer without one.
   *
   * **A response may arrive after `CLOSE`.** This is the one act that is not
   * refused on a closed request, and it is deliberate (§C). Closure is
   * administrative — it records that the operator stopped chasing, not a claim
   * that no further external event can occur. A ministry can reply afterwards,
   * and that reply is a fact that happened outside X-Ray. Recording it does not
   * reopen anything: `deriveStatus` keeps `CLOSED` because closure is still the
   * current administrative state, and revise, export, submit, acknowledge and a
   * second close all stay refused.
   *
   * **Nothing here creates a Source.** Response received ≠ Source created
   * (ADR-0018). No canonical id is written, `receivedSourceIds` stays empty
   * until 10d's research actually commits a version, and this boundary exposes
   * no way for an operator to assert one (§L).
   */
  async recordResponseReceived(
    requestId: string, assertion: ResponseAssertion,
  ): Promise<{ sequence: number; intakeIds: readonly string[] }> {
    return this.withRequestLock(requestId, async (lifecycle) => {
      const submissions = lifecycle.events.filter((event) => event.act === 'SUBMIT')
      if (submissions.length === 0) {
        reject('ATI/RESPONSE_REQUIRES_SUBMISSION',
          `request ${requestId} was never filed (${lifecycle.status}), so nothing can be a response to it`,
          { requestId, status: lifecycle.status })
      }

      // A response cannot predate the filing it answers. Note what is NOT
      // checked: a response after a close may be stamped before that close.
      // It genuinely arrived when it arrived and was entered later, and the
      // close is an administrative act, not an event the response answers.
      const filedAt = (submissions[0] as EventRow).occurredAt
      if (assertion.receivedAt < filedAt) {
        reject('ATI/RETROGRADE_EVENT',
          `response at ${assertion.receivedAt} precedes the submission it answers, at ${filedAt}`,
          { requestId, receivedAt: assertion.receivedAt, submittedAt: filedAt })
      }

      const sequence = lifecycle.responses.length + 1
      const intakes = (assertion.intakes ?? []).map((intake, index) =>
        this.buildIntake(requestId, sequence, index, intake, assertion.receivedAt))

      await recordResponse(this.db, requestId, {
        receivedAt: assertion.receivedAt,
        completeness: assertion.completeness,
        ...(assertion.summary === undefined ? {} : { summary: assertion.summary }),
        intakes,
      }, { inTransaction: true })

      return { sequence, intakeIds: intakes.map((intake) => intake.intakeId) }
    })
  }

  // -- internals -----------------------------------------------------------

  /**
   * One intake's receipt facts, with an X-Ray-owned identity.
   *
   * The id is derived from the locked request, the response sequence and the
   * position, so it is stable, collision-free under the lock, and carries no
   * caller-supplied string. The filename lives in `describedAs`, where it is
   * a description rather than an identifier.
   */
  private buildIntake(
    requestId: string, sequence: number, index: number,
    assertion: IntakeAssertion, responseReceivedAt: string,
  ): IntakeRecord {
    if (assertion.describedAs.trim() === '') {
      reject('ATI/INTAKE_DESCRIPTION_MISSING',
        `an intake must say what arrived; response ${sequence} record ${index + 1} describes nothing`,
        { requestId, responseSequence: sequence, position: index + 1 })
    }

    const receivedAt = assertion.receivedAt ?? responseReceivedAt
    // A record cannot arrive before the response that carried it.
    if (receivedAt < responseReceivedAt) {
      reject('ATI/RETROGRADE_EVENT',
        `intake received ${receivedAt}, before the response that carried it at ${responseReceivedAt}`,
        { requestId, responseSequence: sequence, receivedAt, responseReceivedAt })
    }

    const digest = this.resolveDigest(requestId, sequence, index, assertion)

    return {
      intakeId: `${requestId}/R${sequence}/I${index + 1}`,
      receivedAt,
      describedAs: assertion.describedAs,
      ...(assertion.mediaType === undefined ? {} : { mediaType: assertion.mediaType }),
      ...(digest === undefined ? {} : digest),
    }
  }

  /**
   * Establish the receipt digest, and say who established it.
   *
   * A digest X-Ray computed from content it held is not the same fact as one an
   * institution stated in a covering letter, and 10d has to be able to tell
   * them apart before it will research the material. So provenance is stored
   * beside the value and a supplied digest is never silently upgraded (§H).
   *
   * Where both exist they must agree — a stated digest that does not match the
   * bytes is a discrepancy to surface, not something to quietly overwrite.
   */
  private resolveDigest(
    requestId: string, sequence: number, index: number, assertion: IntakeAssertion,
  ): { contentHash: string; contentHashOrigin: DigestOrigin } | undefined {
    const supplied = assertion.suppliedDigest === undefined
      ? undefined : this.normalizeDigest(requestId, sequence, index, assertion.suppliedDigest)

    if (assertion.material === undefined) {
      return supplied === undefined
        ? undefined : { contentHash: supplied, contentHashOrigin: 'SUPPLIED' }
    }

    const computed = `sha256:${createHash('sha256').update(assertion.material).digest('hex')}`
    if (supplied !== undefined && supplied !== computed) {
      reject('ATI/DIGEST_MISMATCH',
        `the stated digest does not match the material received for response ${sequence} record ${index + 1}`,
        { requestId, responseSequence: sequence, position: index + 1, supplied, computed })
    }
    return { contentHash: computed, contentHashOrigin: 'COMPUTED' }
  }

  /**
   * One accepted representation: `sha256:<64 lowercase hex>`.
   *
   * A bare hex string is accepted and prefixed, because that is how digests are
   * usually quoted; anything else is refused rather than guessed at. The
   * database holds the same constraint, so a malformed digest cannot arrive by
   * another route.
   */
  private normalizeDigest(
    requestId: string, sequence: number, index: number, digest: string,
  ): string {
    const trimmed = digest.trim().toLowerCase()
    const bare = trimmed.startsWith('sha256:') ? trimmed.slice('sha256:'.length) : trimmed
    if (!/^[0-9a-f]{64}$/.test(bare)) {
      reject('ATI/DIGEST_MALFORMED',
        `"${digest}" is not a sha256 digest; v0 records sha256 only, and adding an algorithm is a migration`,
        { requestId, responseSequence: sequence, position: index + 1, digest })
    }
    return `sha256:${bare}`
  }

  /**
   * Take the request's row lock FIRST, then read the history every check will
   * run against.
   *
   * THE ORDER IS THE POINT
   * ======================
   * An earlier version of this file validated before locking:
   *
   *   read lifecycle → validate → lock → append
   *
   * which is wrong in a way a perfectly behaving lock cannot save. Two
   * commands, B arriving second:
   *
   *   B reads the history: OPEN, an export is legal
   *   A takes the lock, appends CLOSE, commits
   *   B takes the lock — and appends the EXPORT it decided on before A ran
   *
   * The result is a history reading `... CLOSE → EXPORT`, which the whole
   * point of refusing post-close acts was to make impossible. B's decision was
   * sound when it was made and stale by the time it was applied.
   *
   * So the lifecycle is re-read after the lock is held, inside the same
   * transaction, and every lifecycle-dependent check — closure, sequence
   * allocation, predecessor lookup, chronology — runs on that fresh read.
   * Nothing can change between the check and the append, because nothing else
   * can hold the row.
   *
   * This relies on READ COMMITTED, PostgreSQL's default and what every other
   * transaction in this codebase uses: once `FOR UPDATE` returns, a later
   * statement in the same transaction sees what the blocking transaction
   * committed. Under REPEATABLE READ the re-read would return the pre-lock
   * snapshot instead and this would have to be a serialization-failure retry.
   *
   * The lock query doubles as the existence check: no row, no request.
   */
  private async withRequestLock<T>(
    requestId: string, act: (lifecycle: RequestLifecycle) => Promise<T>,
  ): Promise<T> {
    await this.db.query('BEGIN')
    try {
      const locked = (await this.db.query(
        'SELECT id FROM ati_requests WHERE id=$1 FOR UPDATE', [requestId])).rows
      if (locked.length !== 1) {
        reject('ATI/REQUEST_NOT_FOUND', `no ATI request ${requestId}`, { requestId })
      }
      // Re-read under the lock. Anything a concurrent command committed while
      // this one waited is visible here, and nothing further can change until
      // this transaction ends.
      const lifecycle = await readRequestLifecycle(this.db, requestId)
      if (lifecycle === undefined) {
        reject('ATI/REQUEST_NOT_FOUND', `no ATI request ${requestId}`, { requestId })
      }
      const out = await act(lifecycle!)
      await this.db.query('COMMIT')
      return out
    } catch (error) {
      await this.db.query('ROLLBACK')
      throw error
    }
  }

  /**
   * Nothing happens to a closed request.
   *
   * The database would happily append after a CLOSE — append-only means no
   * mutation, not no sequel — so this is the layer that has to refuse it.
   */
  private refuseIfClosed(lifecycle: RequestLifecycle): void {
    const closed = lifecycle.events.find((event) => event.act === 'CLOSE')
    if (closed !== undefined) {
      reject('ATI/REQUEST_CLOSED',
        `request ${lifecycle.requestId} was closed at ${closed.occurredAt}; reopening is not designed`,
        { requestId: lifecycle.requestId, closedAt: closed.occurredAt })
    }
  }

  /**
   * Load the exact immutable origin snapshot and resolve the exact gap.
   *
   * `readSnapshot` is the same primitive every other reader of committed
   * research state uses, so the gap this authorizes against is byte-for-byte
   * the gap that version committed — not a re-derivation of it.
   */
  private async loadOriginGap(origin: OriginRef): Promise<Gap> {
    // A version inside an open commit transaction has rows but is not yet
    // immutable. The committed pointer is what makes "frozen" true — the same
    // reasoning as 10a's acceptance condition 2.
    const found = (await this.db.query(
      'SELECT latest_committed_version FROM investigations WHERE id=$1',
      [origin.investigationId])).rows
    const committed = found.length === 1
      ? Number(found[0].latest_committed_version) : undefined
    if (committed === undefined || !(committed >= origin.originVersion)) {
      reject('ATI/ORIGIN_SNAPSHOT_NOT_FOUND',
        `${origin.investigationId} has no committed version ${origin.originVersion}`,
        { ...origin, latestCommittedVersion: committed ?? null })
    }

    const snapshot = await readSnapshot(
      this.db, origin.investigationId, origin.originVersion)
    const gap = snapshot.index.gap.get(origin.gapId)
    if (gap === undefined) {
      reject('ATI/ORIGIN_GAP_NOT_FOUND',
        `gap ${origin.gapId} does not exist in ${origin.investigationId} v${origin.originVersion}`,
        { ...origin })
    }

    // XR-INV-009, first half. Eligibility is read from the frozen gap; it is
    // never recomputed here, because a second derivation could only drift from
    // the one graph validation already binds to `resolutionPath`.
    if (!gap!.atiEligible) {
      reject('XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP',
        `gap ${gap!.id} is not eligible for an information request (${gap!.resolutionPath})`,
        { ...origin, resolutionPath: gap!.resolutionPath })
    }
    return gap!
  }

  /**
   * Build one revision's frozen content, enforcing record grounding and
   * holder-context rules.
   */
  private buildContent(
    gap: Gap,
    input: {
      requestedRecords: readonly string[]
      publicInterestContext: string
      investigationUrl?: string
      rendered?: string
      holder?: SuppliedHolderContext
    },
    createdAt: string,
  ): RevisionContent {
    if (input.requestedRecords.length === 0) {
      reject('ATI/NO_RECORDS_REQUESTED',
        `a request must name at least one of gap ${gap.id}'s resolving records`,
        { gapId: gap.id })
    }

    // XR-INV-009, second half. Exact string membership, no normalization.
    const invented = input.requestedRecords.filter(
      (record) => !gap.resolvingEvidence.includes(record))
    if (invented.length > 0) {
      reject('XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP',
        `${invented.length} requested record(s) are not named by gap ${gap.id}. A request may not invent the name of a record the gap ledger has not established.`,
        { gapId: gap.id, invented, resolvingEvidence: [...gap.resolvingEvidence] })
    }

    const holder = this.resolveHolder(gap, input.holder)

    return {
      createdAt,
      holdingInstitution: holder.institution,
      ...(holder.office === undefined ? {} : { holdingOffice: holder.office }),
      custodyBasis: holder.basis,
      holderContextOrigin: holder.origin,
      ...(holder.rationale === undefined ? {} : { custodyBasisRationale: holder.rationale }),
      requestedRecords: [...input.requestedRecords],
      publicInterestContext: input.publicInterestContext,
      ...(input.investigationUrl === undefined
        ? {} : { investigationUrl: input.investigationUrl }),
      ...(input.rendered === undefined ? {} : { rendered: input.rendered }),
    }
  }

  /**
   * Decide who the request is addressed to.
   *
   * Explicit human context wins over the gap's; where neither exists the
   * command refuses. It does not fall back to a plausible ministry, an
   * "Information Access Officer" at an unnamed body, or the institution from
   * some other gap — a fabricated addressee is the exact failure ADR-0008
   * forbids, and it would be indistinguishable from a real one once frozen
   * into a revision.
   */
  private resolveHolder(gap: Gap, supplied?: SuppliedHolderContext): {
    institution: string
    office?: string
    basis: CustodyBasis
    origin: 'ORIGIN_GAP' | 'HUMAN_SUPPLIED'
    rationale?: string
  } {
    if (supplied !== undefined) {
      // An inferred holder must never become a confirmed one silently. 10a's
      // database check says the same thing; saying it here too means the
      // caller gets a named rejection rather than a constraint violation.
      if (supplied.basis === 'CONFIRMED'
          && (supplied.rationale === undefined || supplied.rationale.trim() === '')) {
        reject('ATI/CUSTODY_BASIS_RATIONALE_REQUIRED',
          'a human-supplied CONFIRMED custody basis must state on what basis custody was confirmed',
          { gapId: gap.id, institution: supplied.institution })
      }
      return {
        institution: supplied.institution,
        ...(supplied.office === undefined ? {} : { office: supplied.office }),
        basis: supplied.basis,
        origin: 'HUMAN_SUPPLIED',
        ...(supplied.rationale === undefined ? {} : { rationale: supplied.rationale }),
      }
    }

    const likely = gap.likelyHolder
    if (likely === undefined) {
      reject('ATI/HOLDER_CONTEXT_MISSING',
        `gap ${gap.id} names no likely holder, so there is no addressee to derive. Supply holder context explicitly.`,
        { gapId: gap.id })
    }
    return {
      institution: likely!.institution,
      ...(likely!.office === undefined ? {} : { office: likely!.office }),
      basis: likely!.basis,
      origin: 'ORIGIN_GAP',
    }
  }

}
