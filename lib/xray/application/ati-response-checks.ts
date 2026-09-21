/**
 * ATI response command and intake boundary checks (#10 slice 10c).
 *
 * THE BOUNDARY THIS GATE DEFENDS
 * ==============================
 * ADR-0018: response received ≠ Source created. Everything here records what
 * arrived; nothing here interprets it, and nothing here can reach canonical
 * research state. So the checks come in three groups:
 *
 *   authorization  — a response answers a request that was actually filed
 *   recording      — what was stated is preserved exactly, and nothing else
 *                    is inferred
 *   containment    — no Source, Evidence, Finding or version, and no way for
 *                    an operator to assert one
 *
 * HONEST LIMITATION
 * =================
 * PGlite runs one connection. The interleaving checks prove the *ordering* —
 * that authorization and chronology read state taken after the lock — by
 * landing another command's commit at the instant the lock returns. Native
 * concurrent row-lock scheduling is not proven here and needs a real
 * PostgreSQL gate.
 *
 * Run:  pnpm check:ati-responses
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

import { readSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  AT, ATI_MIGRATIONS, MIGRATIONS, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import {
  acceptIntakeSource, confirmSubmission, recordExport, recordResponse,
} from '@/lib/xray/persistence/ati-lifecycle'
import { ATIActionRejected, ATIActionService, type ResponseAssertion } from './ati-service'
import { projectATIRequest } from './ati-read-model'
import { LockInterleavingDatabase } from './ati-check-support'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const rejectedWith = async (
  code: string, act: () => Promise<unknown>,
): Promise<string | null> => {
  let error: Error | null = null
  try { await act() } catch (caught) { error = caught as Error }
  if (error === null) return `accepted; expected ${code}`
  if (!(error instanceof ATIActionRejected)) return `threw ${error.name}: ${error.message}`
  return error.code === code ? null : `rejected with ${error.code}, expected ${code}`
}

const INV = 'XRAY-ATI-RESP'
const FILED_AT = '2026-09-22T10:00:00Z'
const ARRIVED_AT = '2026-10-15T09:00:00Z'

/** Canonical collections a response must never touch. */
const CANONICAL = ['sources', 'evidence', 'findings', 'gaps', 'claims',
  'investigation_versions', 'version_added_sources'] as const

const sha256 = (content: string) =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`

const source = () => readFileSync(new URL('./ati-service.ts', import.meta.url), 'utf8')
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    for (const n of [...MIGRATIONS, ...ATI_MIGRATIONS])
      await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))

    const seeded = await seedLineage(db, INV, 'RUN-ATI-RESP')
    const service = new ATIActionService(db, () => AT)

    const gapRow = (await db.query<{ id: string; resolving_evidence: string[] }>(
      `SELECT id, resolving_evidence FROM gaps
        WHERE investigation_id=$1 AND version_number=2 AND ati_eligible ORDER BY id LIMIT 1`,
      [INV])).rows[0]
    const origin = { investigationId: INV, originVersion: 2, gapId: gapRow.id }
    const draftInput = {
      ...origin, requestedRecords: [gapRow.resolving_evidence[0]],
      publicInterestContext: 'The award figure is unverified in the public record.',
    }

    /** A request in an exact lifecycle state. */
    const requestIn = async (
      requestId: string, state: 'DRAFT' | 'EXPORTED' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'CLOSED',
    ) => {
      await service.createDraft({ ...draftInput, requestId, createdAt: '2026-09-21T08:00:00Z' })
      if (state === 'DRAFT') return requestId
      await service.exportRevision(requestId, 1, '2026-09-21T09:00:00Z')
      if (state === 'EXPORTED') return requestId
      await service.confirmSubmitted(requestId, 1, { humanConfirmed: true }, FILED_AT)
      if (state === 'SUBMITTED') return requestId
      if (state === 'ACKNOWLEDGED') {
        await service.acknowledge(requestId, '2026-09-24T10:00:00Z')
        return requestId
      }
      await service.close(requestId,
        { humanConfirmed: true, reason: 'No response within the statutory period.' },
        '2026-10-01T10:00:00Z')
      return requestId
    }

    const canonicalCounts = async () => {
      const counts: Record<string, number> = {}
      for (const table of CANONICAL) {
        counts[table] = (await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${table}`)).rows[0].n
      }
      counts.pointer = (await db.query<{ v: number }>(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [INV])).rows[0].v
      return counts
    }

    const countsBefore = await canonicalCounts()
    const snapshotsBefore = {
      1: JSON.stringify(await readSnapshot(db, INV, 1)),
      2: JSON.stringify(await readSnapshot(db, INV, 2)),
    }

    const unstated = (receivedAt = ARRIVED_AT): ResponseAssertion =>
      ({ receivedAt, completeness: 'UNSTATED' })

    // -- 1 -------------------------------------------------------------------
    await check('1 · a response to a request that does not exist is rejected', () =>
      rejectedWith('ATI/REQUEST_NOT_FOUND', () =>
        service.recordResponseReceived('ATI-NOBODY', unstated())))

    // -- 2 -------------------------------------------------------------------
    await check('2 · a DRAFT request cannot receive an ATI response', async () => {
      const id = await requestIn('ATI-R-DRAFT', 'DRAFT')
      const failure = await rejectedWith('ATI/RESPONSE_REQUIRES_SUBMISSION', () =>
        service.recordResponseReceived(id, unstated()))
      if (failure !== null) return failure
      const rows = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_responses WHERE request_id=$1', [id])).rows
      return rows[0].n === 0 ? null : 'a response was written to an unfiled request'
    })

    // -- 3 -------------------------------------------------------------------
    await check('3 · an EXPORTED but unsubmitted request cannot receive an ATI response', async () => {
      const id = await requestIn('ATI-R-EXPORTED', 'EXPORTED')
      const view = await service.view(id)
      if (view.status !== 'EXPORTED') return `setup status ${view.status}`
      // EXPORTED is not SUBMITTED. Without this rule a document found by other
      // means could acquire ATI provenance because a draft happened to exist.
      return rejectedWith('ATI/RESPONSE_REQUIRES_SUBMISSION', () =>
        service.recordResponseReceived(id, unstated()))
    })

    // -- 4 -------------------------------------------------------------------
    await check('4 · a SUBMITTED request receives a response with no prior acknowledgement', async () => {
      const id = await requestIn('ATI-R-SUBMITTED', 'SUBMITTED')
      const recorded = await service.recordResponseReceived(id, unstated())
      if (recorded.sequence !== 1) return `sequence ${recorded.sequence}`
      const view = await service.view(id)
      if (view.responses.length !== 1) return `${view.responses.length} responses`
      if (view.status !== 'RESPONDED') return `status ${view.status}`
      const acknowledged = view.acknowledgedAt !== undefined
      return acknowledged ? 'an acknowledgement was invented' : null
    })

    // -- 5 -------------------------------------------------------------------
    await check('5 · an ACKNOWLEDGED request receives a response', async () => {
      const id = await requestIn('ATI-R-ACKED', 'ACKNOWLEDGED')
      await service.recordResponseReceived(id, unstated())
      const view = await service.view(id)
      return view.status === 'RESPONDED' ? null : `status ${view.status}`
    })

    // -- 6 -------------------------------------------------------------------
    await check('6 · a response after CLOSE is recorded, and the status stays CLOSED', async () => {
      const id = await requestIn('ATI-R-CLOSED', 'CLOSED')
      const before = await service.view(id)
      if (before.status !== 'CLOSED') return `setup status ${before.status}`

      // Closure is administrative. A ministry can still reply, and that reply
      // is a fact that happened outside X-Ray (release 10c §C).
      const recorded = await service.recordResponseReceived(id, {
        receivedAt: '2026-11-20T09:00:00Z', completeness: 'PARTIAL',
        summary: 'Two of the four requested records, released in part.',
        intakes: [{ describedAs: 'Award notice, 3 pages, redacted' }],
      })
      if (recorded.sequence !== 1) return `sequence ${recorded.sequence}`

      const after = await service.view(id)
      if (after.status !== 'CLOSED')
        return `recording a late response moved the status to ${after.status}`
      if (after.responses.length !== 1) return 'the response is not visible on a closed request'
      if (after.closedAt !== '2026-10-01T10:00:00Z') return 'the closure time moved'
      // Not a hidden reopen: no new event was appended at all.
      const events = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_request_events WHERE request_id=$1', [id])).rows
      return events[0].n === 3 ? null : `${events[0].n} events after a late response`
    })

    // -- 7 -------------------------------------------------------------------
    await check('7 · a late response permits nothing else on a closed request', async () => {
      const id = 'ATI-R-CLOSED'
      const attempts: [string, () => Promise<unknown>][] = [
        ['revise', () => service.reviseDraft(id, {
          requestedRecords: [gapRow.resolving_evidence[0]],
          publicInterestContext: 'Reworded.', createdAt: '2026-11-21T10:00:00Z' })],
        ['export', () => service.exportRevision(id, 1, '2026-11-21T10:00:00Z')],
        ['submit', () => service.confirmSubmitted(id, 1, { humanConfirmed: true },
          '2026-11-21T10:00:00Z')],
        ['acknowledge', () => service.acknowledge(id, '2026-11-21T10:00:00Z')],
        ['reclose', () => service.close(id,
          { humanConfirmed: true, reason: 'Closing again.' }, '2026-11-21T10:00:00Z')],
      ]
      for (const [label, act] of attempts) {
        const failure = await rejectedWith('ATI/REQUEST_CLOSED', act)
        if (failure !== null) return `${label}: ${failure}`
      }
      // A second late response is still allowed — §C is about responses only.
      await service.recordResponseReceived(id, {
        receivedAt: '2026-11-25T09:00:00Z', completeness: 'UNSTATED',
      })
      const view = await service.view(id)
      return view.status === 'CLOSED' && view.responses.length === 2
        ? null : `status ${view.status}, ${view.responses.length} responses`
    })

    // -- 8, 9, 10 ------------------------------------------------------------
    await check('8/9 · PARTIAL and FINAL are preserved exactly as stated', async () => {
      const id = await requestIn('ATI-R-COMPLETENESS', 'SUBMITTED')
      await service.recordResponseReceived(id,
        { receivedAt: ARRIVED_AT, completeness: 'PARTIAL' })
      await service.recordResponseReceived(id,
        { receivedAt: '2026-10-20T09:00:00Z', completeness: 'FINAL' })
      const view = await service.view(id)
      const stated = view.responses.map((response) => response.completeness)
      return JSON.stringify(stated) === '["PARTIAL","FINAL"]'
        ? null : `recorded ${JSON.stringify(stated)}`
    })

    await check('10 · completeness is required, never defaulted, and UNSTATED is a choice', async () => {
      // The honest reading of silence is "we were not told", so the command
      // refuses to decide it: the field is required and the caller must say
      // UNSTATED out loud.
      const declaration = stripComments(source()).slice(
        stripComments(source()).indexOf('export interface ResponseAssertion'))
      const field = declaration.slice(0, declaration.indexOf('}'))
      if (!/\n  completeness: ResponseCompleteness\n/.test(field))
        return 'completeness is optional or renamed on ResponseAssertion'
      if (/completeness[^\n]*(\?\s*:|\?\?|'UNSTATED')/.test(field))
        return 'completeness is optional or carries a default'
      if (/completeness:[^\n]*\?\?/.test(stripComments(source())))
        return 'the command defaults completeness'

      const id = await requestIn('ATI-R-UNSTATED', 'SUBMITTED')
      await service.recordResponseReceived(id,
        { receivedAt: ARRIVED_AT, completeness: 'UNSTATED' })
      const view = await service.view(id)
      if (view.responses[0].completeness !== 'UNSTATED')
        return `recorded ${view.responses[0].completeness}`
      // Nothing about one arriving record makes a response FINAL.
      await service.recordResponseReceived(id, {
        receivedAt: '2026-10-21T09:00:00Z', completeness: 'UNSTATED',
        intakes: [{ describedAs: 'The only document sent' }],
      })
      const second = (await service.view(id)).responses[1]
      return second.completeness === 'UNSTATED'
        ? null : `one record made it ${second.completeness}`
    })

    // -- 11, 12, 13, 14 -----------------------------------------------------
    await check('11/12/13 · zero, one and several records are all valid responses', async () => {
      const id = await requestIn('ATI-R-COUNTS', 'SUBMITTED')
      const none = await service.recordResponseReceived(id, unstated())
      if (none.intakeIds.length !== 0) return 'records were invented'
      const one = await service.recordResponseReceived(id, {
        receivedAt: '2026-10-16T09:00:00Z', completeness: 'PARTIAL',
        intakes: [{ describedAs: 'Award notice' }],
      })
      if (one.intakeIds.length !== 1) return `${one.intakeIds.length} records for one`
      const several = await service.recordResponseReceived(id, {
        receivedAt: '2026-10-17T09:00:00Z', completeness: 'FINAL',
        intakes: [
          { describedAs: 'Annex A, schedule of rates' },
          { describedAs: 'Annex B, variation orders' },
          { describedAs: 'Covering letter' },
        ],
      })
      if (several.intakeIds.length !== 3) return `${several.intakeIds.length} records for three`
      const view = await service.view(id)
      // An acknowledgement letter with nothing attached is a real response;
      // zero records says nothing about completeness or about the gap.
      if (view.responses[0].completeness !== 'UNSTATED') return 'zero records implied completeness'
      const counts = view.responses.map((response) => response.intakes.length)
      return JSON.stringify(counts) === '[0,1,3]' ? null : `record counts ${JSON.stringify(counts)}`
    })

    await check('14 · several responses may accumulate on one request, partial then later', async () => {
      const view = await service.view('ATI-R-COUNTS')
      const sequences = view.responses.map((response) => response.sequence)
      if (JSON.stringify(sequences) !== '[1,2,3]') return `sequences ${JSON.stringify(sequences)}`
      const times = view.responses.map((response) => response.receivedAt)
      if (JSON.stringify(times) !== JSON.stringify([...times].sort()))
        return 'responses are not in arrival order'
      // respondedAt is the FIRST response, so a later one does not rewrite it.
      return view.respondedAt === ARRIVED_AT ? null : `respondedAt ${String(view.respondedAt)}`
    })

    // -- 15 ------------------------------------------------------------------
    await check('15 · intake identity is X-Ray-owned and never a filename', async () => {
      const id = await requestIn('ATI-R-IDENTITY', 'SUBMITTED')
      const recorded = await service.recordResponseReceived(id, {
        receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
        intakes: [{ describedAs: 'scan.pdf' }, { describedAs: 'scan.pdf' }],
      })
      // Two institutions both send scan.pdf. A filename is not identity.
      if (new Set(recorded.intakeIds).size !== 2) return 'two records collided on one id'
      for (const intakeId of recorded.intakeIds) {
        if (intakeId.includes('scan.pdf')) return `${intakeId} carries the filename`
        if (!intakeId.startsWith(`${id}/`)) return `${intakeId} is not owned by the request`
      }
      // The caller has no way to name one.
      const assertion = stripComments(source())
      const declaration = assertion.slice(
        assertion.indexOf('export interface IntakeAssertion'),
        assertion.indexOf('export interface ResponseAssertion'))
      if (/\bintakeId\b/.test(declaration)) return 'IntakeAssertion lets a caller name an intake'
      // And the id is stable across reads.
      const again = (await service.view(id)).responses[0].intakes.map((i) => i.intakeId)
      return JSON.stringify([...again].sort()) === JSON.stringify([...recorded.intakeIds].sort())
        ? null : 'the id changed between write and read'
    })

    // -- 16 ------------------------------------------------------------------
    await check('16 · neither the intake table nor the read model can hold a Source id', async () => {
      const columns = (await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name='ati_response_intakes'`)).rows.map((row) => row.column_name)
      const offending = columns.filter((name) => /source/.test(name))
      if (offending.length > 0) return `intake columns include ${offending.join(', ')}`

      const view = await service.view('ATI-R-IDENTITY')
      const intake = view.responses[0].intakes[0] as unknown as Record<string, unknown>
      // acceptedSourceIds is the one field that can ever name a source, and it
      // is empty until research commits a version.
      const naming = Object.keys(intake).filter((key) => /source/i.test(key))
      if (JSON.stringify(naming) !== '["acceptedSourceIds"]')
        return `intake view exposes ${JSON.stringify(naming)}`
      if (intake.acceptedSourceIds instanceof Array
        && (intake.acceptedSourceIds as unknown[]).length !== 0)
        return 'a freshly recorded intake already names a source'
      // Nothing that interprets the record is present.
      const interpreting = Object.keys(intake).filter((key) =>
        /evidenceClass|originStatus|accessibility|relationship|provenance|finding|verified/i.test(key))
      return interpreting.length === 0
        ? null : `intake view interprets: ${interpreting.join(', ')}`
    })

    // -- 17, 24 --------------------------------------------------------------
    await check('17/24 · no response created a Source, Evidence, Finding or version', async () => {
      const after = await canonicalCounts()
      for (const [table, count] of Object.entries(countsBefore)) {
        if (after[table] !== count)
          return `${table} moved from ${count} to ${after[table]}`
      }
      for (const version of [1, 2] as const) {
        if (JSON.stringify(await readSnapshot(db, INV, version)) !== snapshotsBefore[version])
          return `snapshot v${version} changed`
      }
      return null
    })

    // -- 18 ------------------------------------------------------------------
    await check('18 · receivedSourceIds stays empty until research accepts something', async () => {
      const view = await service.view('ATI-R-IDENTITY')
      if (view.receivedSourceIds.length !== 0)
        return `${view.receivedSourceIds.length} source(s) before any research`
      const acceptances = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_intake_source_acceptances')).rows
      return acceptances[0].n === 0 ? null : 'an acceptance exists with no research behind it'
    })

    // -- 19 ------------------------------------------------------------------
    await check('19 · a response stamped before the submission it answers is rejected', async () => {
      const id = await requestIn('ATI-R-EARLY', 'SUBMITTED')
      const failure = await rejectedWith('ATI/RETROGRADE_EVENT', () =>
        service.recordResponseReceived(id,
          { receivedAt: '2026-09-01T09:00:00Z', completeness: 'UNSTATED' }))
      if (failure !== null) return failure
      // The boundary is the filing, not the drafting.
      await service.recordResponseReceived(id, { receivedAt: FILED_AT, completeness: 'UNSTATED' })
      return (await service.view(id)).responses.length === 1 ? null : 'same-instant arrival refused'
    })

    // -- 20 ------------------------------------------------------------------
    await check('20 · a record stamped before the response that carried it is rejected', async () => {
      const id = await requestIn('ATI-R-INTAKE-EARLY', 'SUBMITTED')
      const failure = await rejectedWith('ATI/RETROGRADE_EVENT', () =>
        service.recordResponseReceived(id, {
          receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
          intakes: [{ describedAs: 'Award notice', receivedAt: '2026-10-01T09:00:00Z' }],
        }))
      if (failure !== null) return failure
      const rows = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_responses WHERE request_id=$1', [id])).rows
      if (rows[0].n !== 0) return 'the response survived its rejected record'
      // An unstamped record inherits the response's arrival time.
      await service.recordResponseReceived(id, {
        receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
        intakes: [{ describedAs: 'Award notice' }],
      })
      const intake = (await service.view(id)).responses[0].intakes[0]
      return intake.receivedAt === ARRIVED_AT ? null : `inherited ${intake.receivedAt}`
    })

    // -- 21 ------------------------------------------------------------------
    await check('21 · the response command decides under the request lock', async () => {
      const text = stripComments(source())
      const start = text.indexOf('  async recordResponseReceived')
      if (start < 0) return 'recordResponseReceived could not be located'
      const body = text.slice(start, text.indexOf('\n  private ', start))
      if (!body.includes('this.withRequestLock('))
        return 'the response command runs outside withRequestLock'
      if (body.includes('readRequestLifecycle('))
        return 'the response command reads history of its own'
      return /recordResponse\(this\.db[\s\S]*inTransaction: true/.test(body)
        ? null : 'the response is not written inside the locked transaction'
    })

    // -- 22 ------------------------------------------------------------------
    await check('22 · authorization and chronology come from post-lock state', async () => {
      // A draft. Another operator exports and files it while this response
      // command waits on the lock. Pre-lock state says DRAFT — unauthorized —
      // so only a post-lock read can authorize this, and only a post-lock read
      // knows what time the filing happened.
      const id = await requestIn('ATI-R-RACE', 'DRAFT')
      const filesUnderUs = async (inner: SnapshotDatabase) => {
        await recordExport(inner, id, 1, '2026-09-21T09:00:00Z')
        void await confirmSubmission(inner, id, 1, FILED_AT)
      }

      const raceDb = new LockInterleavingDatabase(db, id, filesUnderUs)
      const raced = new ATIActionService(raceDb, () => AT)
      const recorded = await raced.recordResponseReceived(id, {
        receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
      }).catch((error: unknown) => error as Error)
      if (recorded instanceof Error)
        return `a response authorized by post-lock state was refused: ${recorded.message}`
      if (raceDb.interleaved.length !== 1) return 'the response command took no request lock'

      // Chronology used the submission that landed under the lock: a response
      // stamped before it is refused, and there was no submission to compare
      // against before the lock at all.
      const stale = new LockInterleavingDatabase(db, 'ATI-R-RACE-2',
        async (inner: SnapshotDatabase) => {
          await recordExport(inner, 'ATI-R-RACE-2', 1, '2026-09-21T09:00:00Z')
          void await confirmSubmission(inner, 'ATI-R-RACE-2', 1, FILED_AT)
        })
      await requestIn('ATI-R-RACE-2', 'DRAFT')
      const early = await rejectedWith('ATI/RETROGRADE_EVENT', () =>
        new ATIActionService(stale, () => AT).recordResponseReceived('ATI-R-RACE-2',
          { receivedAt: '2026-09-21T23:00:00Z', completeness: 'UNSTATED' }))
      return early === null ? null : `post-lock chronology: ${early}`
    })

    // -- 23 ------------------------------------------------------------------
    await check('23 · a response and all of its records are written atomically', async () => {
      const id = await requestIn('ATI-R-ATOMIC', 'SUBMITTED')
      // Application level: one unusable record refuses the whole response, and
      // the refusal happens before anything is written.
      const failure = await rejectedWith('ATI/INTAKE_DESCRIPTION_MISSING', () =>
        service.recordResponseReceived(id, {
          receivedAt: ARRIVED_AT, completeness: 'FINAL',
          intakes: [{ describedAs: 'Award notice' }, { describedAs: '   ' }],
        }))
      if (failure !== null) return failure
      const partial = (await db.query<{ responses: number; intakes: number }>(
        `SELECT (SELECT count(*) FROM ati_responses WHERE request_id=$1) AS responses,
                (SELECT count(*) FROM ati_response_intakes WHERE request_id=$1) AS intakes`,
        [id])).rows[0]
      if (Number(partial.responses) !== 0 || Number(partial.intakes) !== 0)
        return `${partial.responses} response(s) and ${partial.intakes} record(s) survived`

      // Database level: the transaction that writes the response and its
      // records rolls back together. The command's own ids cannot collide, so
      // this drives the primitive to reach the failing insert.
      const duplicated = await recordResponse(db, id, {
        receivedAt: ARRIVED_AT, completeness: 'FINAL',
        intakes: [
          { intakeId: 'DUP', receivedAt: ARRIVED_AT, describedAs: 'First' },
          { intakeId: 'DUP', receivedAt: ARRIVED_AT, describedAs: 'Second' },
        ],
      }).then(() => null, (error: unknown) => error as Error)
      if (duplicated === null) return 'two records shared one id'
      const after = (await db.query<{ responses: number; intakes: number }>(
        `SELECT (SELECT count(*) FROM ati_responses WHERE request_id=$1) AS responses,
                (SELECT count(*) FROM ati_response_intakes WHERE request_id=$1) AS intakes`,
        [id])).rows[0]
      return Number(after.responses) === 0 && Number(after.intakes) === 0
        ? null : `rollback left ${after.responses} response(s), ${after.intakes} record(s)`
    })

    // -- 25 ------------------------------------------------------------------
    await check('25 · the read model separates what arrived from what research accepted', async () => {
      const id = 'ATI-R-IDENTITY'
      const view = await service.view(id)
      const intake = view.responses[0].intakes[0]
      if (intake.acceptedSourceIds.length !== 0) return 'an unresearched record names a source'

      // Once research has committed a version that introduced a source, the
      // mapping appears — through 10a's guarded bridge, never a command.
      const added = (await db.query<{ source_id: string }>(
        `SELECT source_id FROM version_added_sources
          WHERE investigation_id=$1 AND version_number=2 LIMIT 1`, [INV])).rows[0]
      await acceptIntakeSource(db, intake.intakeId, {
        investigationId: INV, committedVersion: 2,
        sourceId: added.source_id, acceptedAt: AT,
      })
      const accepted = await service.view(id)
      const mapped = accepted.responses[0].intakes[0]
      if (JSON.stringify(mapped.acceptedSourceIds) !== JSON.stringify([added.source_id]))
        return `accepted ${JSON.stringify(mapped.acceptedSourceIds)}`
      if (JSON.stringify(accepted.receivedSourceIds) !== JSON.stringify([added.source_id]))
        return 'the request does not report what research accepted'
      // The record itself is unchanged by being accepted: it is still a receipt.
      return mapped.describedAs === intake.describedAs && mapped.receivedAt === intake.receivedAt
        ? null : 'acceptance rewrote the receipt'
    })

    // -- 26 ------------------------------------------------------------------
    await check('26 · no application command exposes intake acceptance', async () => {
      const text = stripComments(source())
      if (text.includes('acceptIntakeSource'))
        return 'the command boundary references acceptIntakeSource'
      const readModel = stripComments(readFileSync(
        new URL('./ati-read-model.ts', import.meta.url), 'utf8'))
      if (readModel.includes('acceptIntakeSource'))
        return 'the read model references acceptIntakeSource'
      // An operator cannot say "make this intake SRC-123": no command takes a
      // source id at all.
      const takesSourceId = /async \w+\([^)]*sourceId/.test(text)
      return takesSourceId ? 'a command accepts a source id' : null
    })

    // -- digest provenance (§H) ---------------------------------------------
    await check('D1 · migration 0012 round-trips, and the database holds the digest shape', async () => {
      const probe = new PGlite()
      try {
        for (const n of [...MIGRATIONS, ...ATI_MIGRATIONS])
          await probe.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
        for (const n of [...ATI_MIGRATIONS].reverse())
          await probe.exec(readFileSync(new URL(`../../../db/migrations/${n}.down.sql`, import.meta.url), 'utf8'))
        for (const n of ATI_MIGRATIONS)
          await probe.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
        const columns = (await probe.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_name='ati_response_intakes' AND column_name='content_hash_origin'`)).rows
        if (columns.length !== 1) return 'content_hash_origin did not survive the round trip'
        const constraints = (await probe.query<{ conname: string }>(
          `SELECT conname FROM pg_constraint
            WHERE conrelid='ati_response_intakes'::regclass AND contype='c'`))
          .rows.map((row) => row.conname)
        for (const required of ['digest_states_its_provenance', 'digest_is_normalized'])
          if (!constraints.includes(required)) return `${required} is missing`
        return null
      } finally { await probe.close() }
    })

    await check('D2 · a digest arrives with its provenance, computed where possible', async () => {
      const id = await requestIn('ATI-R-DIGEST', 'SUBMITTED')
      const body = 'Award notice for Lot 3, supervision consultancy.'
      await service.recordResponseReceived(id, {
        receivedAt: ARRIVED_AT, completeness: 'PARTIAL',
        intakes: [
          // Content held at receipt: X-Ray hashes it and keeps only the digest.
          { describedAs: 'Award notice', material: body },
          // Somebody else's stated digest: recorded as their claim.
          { describedAs: 'Annex A', suppliedDigest: sha256('annex') },
          // Stated and held, agreeing: the computed one wins the provenance.
          { describedAs: 'Annex B', material: 'annex-b', suppliedDigest: sha256('annex-b') },
          // Nothing offered at all.
          { describedAs: 'Covering letter' },
        ],
      })
      const intakes = (await service.view(id)).responses[0].intakes
      const byName = new Map(intakes.map((intake) => [intake.describedAs, intake]))
      const expected: [string, boolean, string | undefined][] = [
        ['Award notice', true, 'COMPUTED'],
        ['Annex A', true, 'SUPPLIED'],
        ['Annex B', true, 'COMPUTED'],
        ['Covering letter', false, undefined],
      ]
      for (const [name, hasDigest, provenance] of expected) {
        const intake = byName.get(name)!
        if (intake.hasIntegrityDigest !== hasDigest)
          return `${name}: hasIntegrityDigest ${intake.hasIntegrityDigest}`
        if (intake.digestOrigin !== provenance)
          return `${name}: provenance ${String(intake.digestOrigin)}, expected ${String(provenance)}`
      }
      // The value itself is stored for 10d, normalized, and the material is not.
      const stored = (await db.query<{ content_hash: string; described_as: string }>(
        `SELECT described_as, content_hash FROM ati_response_intakes
          WHERE request_id=$1 AND described_as='Award notice'`, [id])).rows[0]
      if (stored.content_hash !== sha256(body)) return `stored ${stored.content_hash}`
      const columns = (await db.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name='ati_response_intakes'`)).rows.map((row) => row.column_name)
      const retention = columns.filter((name) =>
        /body|content(?!_hash)|blob|bytes|file_data|payload/.test(name))
      return retention.length === 0
        ? null : `intakes retain material in ${retention.join(', ')}`
    })

    await check('D3 · a stated digest is never silently upgraded, and a wrong one is refused', async () => {
      const id = await requestIn('ATI-R-DIGEST-BAD', 'SUBMITTED')
      // Stated and held, disagreeing: a discrepancy to surface, not to overwrite.
      const mismatch = await rejectedWith('ATI/DIGEST_MISMATCH', () =>
        service.recordResponseReceived(id, {
          receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
          intakes: [{ describedAs: 'Award notice', material: 'the real bytes',
            suppliedDigest: sha256('something else') }],
        }))
      if (mismatch !== null) return mismatch

      for (const malformed of ['not-a-digest', 'md5:abc', sha256('x').slice(0, -1)]) {
        const failure = await rejectedWith('ATI/DIGEST_MALFORMED', () =>
          service.recordResponseReceived(id, {
            receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
            intakes: [{ describedAs: 'Annex', suppliedDigest: malformed }],
          }))
        if (failure !== null) return `"${malformed}": ${failure}`
      }

      // Bare hex and upper case are normalized rather than guessed at.
      await service.recordResponseReceived(id, {
        receivedAt: ARRIVED_AT, completeness: 'UNSTATED',
        intakes: [{ describedAs: 'Annex',
          suppliedDigest: sha256('annex').slice('sha256:'.length).toUpperCase() }],
      })
      const stored = (await db.query<{ content_hash: string; content_hash_origin: string }>(
        `SELECT content_hash, content_hash_origin FROM ati_response_intakes
          WHERE request_id=$1`, [id])).rows[0]
      if (stored.content_hash !== sha256('annex')) return `normalized to ${stored.content_hash}`
      if (stored.content_hash_origin !== 'SUPPLIED')
        return `provenance ${stored.content_hash_origin}`

      // And the database refuses what the command would never send.
      const direct: [string, string][] = [
        ['a digest with no provenance',
          `INSERT INTO ati_response_intakes(intake_id, request_id, response_sequence, received_at, described_as, content_hash)
           VALUES ('D-1', $1, 1, '${ARRIVED_AT}', 'x', '${sha256('y')}')`],
        ['provenance with no digest',
          `INSERT INTO ati_response_intakes(intake_id, request_id, response_sequence, received_at, described_as, content_hash_origin)
           VALUES ('D-2', $1, 1, '${ARRIVED_AT}', 'x', 'COMPUTED')`],
        ['an unnormalized digest',
          `INSERT INTO ati_response_intakes(intake_id, request_id, response_sequence, received_at, described_as, content_hash, content_hash_origin)
           VALUES ('D-3', $1, 1, '${ARRIVED_AT}', 'x', 'deadbeef', 'COMPUTED')`],
      ]
      for (const [label, sql] of direct) {
        const outcome = await db.query(sql, [id]).then(() => null, (e: unknown) => e as Error)
        if (outcome === null) return `${label} was accepted by the database`
      }
      // Digest equality alone does not make two records the same record.
      const same = await service.recordResponseReceived(id, {
        receivedAt: '2026-10-18T09:00:00Z', completeness: 'UNSTATED',
        intakes: [
          { describedAs: 'First copy', material: 'identical' },
          { describedAs: 'Second copy, from a different office', material: 'identical' },
        ],
      })
      return new Set(same.intakeIds).size === 2
        ? null : 'two records with one digest collapsed into one'
    })
  } finally {
    await db.close()
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} ATI response checks passed`)
  if (failed > 0) process.exitCode = 1
}
