/**
 * ATI action lifecycle persistence checks (#10 slice 10a).
 *
 * The eight things this gate has to prove, from the released slice gate:
 * exact and eligible origin; several requests per gap; append-only revisions,
 * events, responses and intakes; export/submission binding to an exact
 * revision; frozen holder context with custody basis; an intake that cannot
 * reach a Source prematurely; acceptance only against an existing committed
 * Source; and ATI mutation leaving immutable snapshots byte-identical.
 *
 * Run:  pnpm check:ati-lifecycle
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import { readSnapshot } from './snapshot'
import {
  AT, MIGRATIONS, commitFurtherVersion, seedLineage,
} from './publication-check-support'
import {
  acceptIntakeSource, closeRequest, confirmSubmission, createRequest, deriveStatus,
  readRequestLifecycle, readRequestsForGap, recordAcknowledgement, recordExport,
  recordResponse, reviseRequest, type RevisionContent,
} from './ati-lifecycle'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

async function migrate(db: PGlite) {
  const ati = ['0009_ati_lifecycle', '0010_ati_origin_and_acceptance']
  for (const n of [...MIGRATIONS, ...ati])
    await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
  // Both ATI migrations must remain reversible, newest first.
  for (const n of [...ati].reverse())
    await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.down.sql`, import.meta.url), 'utf8'))
  for (const n of ati)
    await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
}

const INV = 'XRAY-ATI-001'

/** Holder context as the origin gap stated it. */
const fromGap = (institution: string, office?: string): RevisionContent => ({
  createdAt: AT,
  holdingInstitution: institution,
  ...(office === undefined ? {} : { holdingOffice: office }),
  custodyBasis: 'INFERRED',
  holderContextOrigin: 'ORIGIN_GAP',
  requestedRecords: ['The supervision award notice for Lot 3'],
  publicInterestContext: 'The award figure is unverified in the public record.',
  investigationUrl: '/xray/example-slug-0123456789/v2',
})

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)
    const seeded = await seedLineage(db, INV, 'RUN-ATI')
    const snapshotV1Before = await readSnapshot(db, INV, 1)
    const snapshotV2Before = await readSnapshot(db, INV, 2)

    // Which gaps exist, and which are ATI-eligible, at v2.
    const gaps = (await db.query(
      `SELECT id, resolution_path, ati_eligible FROM gaps
        WHERE investigation_id=$1 AND version_number=2 ORDER BY id`, [INV])).rows as
      { id: string; resolution_path: string; ati_eligible: boolean }[]
    const eligible = gaps.find((g) => g.ati_eligible)!
    const ineligible = gaps.find((g) => !g.ati_eligible)!

    // -- 1: exact, eligible origin ------------------------------------------
    await check('1 · a request binds an exact eligible origin gap', async () => {
      await createRequest(db, {
        requestId: 'ATI-1', investigationId: INV, originVersion: 2,
        gapId: eligible.id, ordinal: 0, jurisdiction: 'KE',
      }, fromGap('Kenya National Highways Authority', 'Office of the Director General'))
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      if (lifecycle.gapId !== eligible.id) return 'the wrong gap was bound'
      if (lifecycle.originVersion !== 2) return `origin version ${lifecycle.originVersion}`
      return lifecycle.status === 'DRAFT' ? null : `status ${lifecycle.status}`
    })

    await check('1 · an ineligible gap, wrong version or unknown gap cannot originate', async () => {
      const attempts: [string, string, number, string][] = [
        ['ATI-INELIGIBLE', INV, 2, ineligible.id],
        ['ATI-WRONG-VERSION', INV, 99, eligible.id],
        ['ATI-UNKNOWN-GAP', INV, 2, 'GAP-NOT-REAL'],
        ['ATI-WRONG-INV', 'XRAY-NOBODY', 2, eligible.id],
      ]
      for (const [requestId, investigationId, originVersion, gapId] of attempts) {
        const outcome = await createRequest(db, {
          requestId, investigationId, originVersion, gapId, ordinal: 9, jurisdiction: 'KE',
        }, fromGap('Some Institution')).then(() => null, (e: unknown) => e as Error)
        if (outcome === null) return `${requestId} was accepted`
        if (!/foreign key|violates/i.test(outcome.message)) return `${requestId}: ${outcome.message}`
      }
      return null
    })

    // -- 2: several requests per gap ------------------------------------------
    await check('2 · several requests may target the same gap (C3)', async () => {
      await createRequest(db, {
        requestId: 'ATI-2', investigationId: INV, originVersion: 2,
        gapId: eligible.id, ordinal: 1, jurisdiction: 'KE',
      }, fromGap('The National Treasury'))
      const forGap = await readRequestsForGap(db, INV, 2, eligible.id)
      if (forGap.length !== 2) return `${forGap.length} request(s) for the gap`
      const constraints = (await db.query(
        `SELECT count(*)::int AS n FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage k USING (constraint_name)
          WHERE tc.table_name='ati_requests' AND tc.constraint_type='UNIQUE'
            AND k.column_name='gap_id'`)).rows[0] as { n: number }
      return constraints.n === 0 ? null : 'a unique constraint forbids a second request per gap'
    })

    // -- 3: frozen holder context, and no silent upgrade -----------------------
    await check('3 · a revision freezes holder institution, office and custody basis', async () => {
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      const rev1 = lifecycle.revisions[0]
      if (rev1.holdingInstitution !== 'Kenya National Highways Authority') return 'institution lost'
      if (rev1.holdingOffice !== 'Office of the Director General') return 'office lost'
      if (rev1.custodyBasis !== 'INFERRED') return `basis ${rev1.custodyBasis}`
      return rev1.holderContextOrigin === 'ORIGIN_GAP' ? null : 'provenance of holder context lost'
    })

    await check('3 · a human may not silently upgrade INFERRED to CONFIRMED', async () => {
      const silent = await reviseRequest(db, 'ATI-1', {
        ...fromGap('Kenya National Highways Authority'),
        custodyBasis: 'CONFIRMED', holderContextOrigin: 'HUMAN_SUPPLIED',
      }).then(() => null, (e: unknown) => e as Error)
      if (silent === null) return 'an unstated confirmation was accepted'
      if (!/custody|check/i.test(silent.message)) return `rejected as: ${silent.message}`
      // With a stated basis it is permitted.
      const stated = await reviseRequest(db, 'ATI-1', {
        ...fromGap('Kenya National Highways Authority'),
        custodyBasis: 'CONFIRMED', holderContextOrigin: 'HUMAN_SUPPLIED',
        custodyBasisRationale: 'The authority confirmed custody by letter of 12 September.',
      })
      return stated === 2 ? null : `revision ${stated}`
    })

    await check('3 · a later revision does not rewrite an earlier one', async () => {
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      if (lifecycle.revisions.length !== 2) return `${lifecycle.revisions.length} revisions`
      const [first, second] = lifecycle.revisions
      if (first.custodyBasis !== 'INFERRED') return 'revision 1 was mutated'
      return second.custodyBasis === 'CONFIRMED' ? null : 'revision 2 is wrong'
    })

    // -- 4: export and submission binding ---------------------------------------
    let exportSeq = 0
    await check('4 · an export names an exact revision; EXPORTED is not SUBMITTED', async () => {
      exportSeq = await recordExport(db, 'ATI-1', 1, AT)
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      const exported = lifecycle.events.find((e) => e.act === 'EXPORT')!
      if (exported.revision !== 1) return `the export names revision ${exported.revision}`
      if (lifecycle.status !== 'EXPORTED') return `status ${lifecycle.status}`
      return lifecycle.submittedAt === undefined ? null : 'an export produced a submission time'
    })

    await check('4 · an export cannot name a revision that does not exist', async () => {
      const outcome = await recordExport(db, 'ATI-1', 99, AT)
        .then(() => null, (e: unknown) => e as Error)
      return outcome && /foreign key|violates/i.test(outcome.message)
        ? null : 'a phantom revision was exported'
    })

    await check('4 · a submission must reference an act that was an export', async () => {
      const ack = await recordAcknowledgement(db, 'ATI-2', AT)
      const outcome = await confirmSubmission(db, 'ATI-2', ack, AT)
        .then(() => null, (e: unknown) => e as Error)
      if (outcome === null) return 'an acknowledgement was accepted as an export'
      if (!/must reference an export/i.test(outcome.message)) return `rejected as: ${outcome.message}`
      const missing = await confirmSubmission(db, 'ATI-2', 999, AT)
        .then(() => null, (e: unknown) => e as Error)
      return missing !== null ? null : 'a submission referenced nothing'
    })

    await check('4 · submission records only supplied facts, and invents none', async () => {
      await confirmSubmission(db, 'ATI-1', exportSeq, AT, {
        method: 'Hand delivered', externalReference: 'KeNHA/ATI/2026/114',
      })
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      const submit = lifecycle.events.find((e) => e.act === 'SUBMIT')!
      if (submit.submittedExportSequence !== exportSeq) return 'the filed export is not named'
      if (submit.destination !== undefined) return 'an unsupplied destination was invented'
      if (lifecycle.status !== 'SUBMITTED') return `status ${lifecycle.status}`
      return lifecycle.submittedAt === AT ? null : 'submittedAt was not derived'
    })

    await check('4 · filing metadata cannot ride on a non-submission act', async () => {
      const outcome = await db.query(
        `INSERT INTO ati_request_events(request_id, sequence, act, occurred_at, submission_method)
         VALUES ('ATI-1', 90, 'ACKNOWLEDGE', $1, 'Hand delivered')`, [AT])
        .then(() => null, (e: unknown) => e as Error)
      return outcome && /filing_metadata_only_on_submit|check/i.test(outcome.message)
        ? null : 'an acknowledgement carried filing metadata'
    })

    // -- 5: responses and intakes -------------------------------------------------
    await check('5 · a response may carry no records at all', async () => {
      await recordAcknowledgement(db, 'ATI-1', AT, 'Receipt acknowledged by email.')
      await recordResponse(db, 'ATI-1', {
        receivedAt: AT, completeness: 'PARTIAL',
        summary: 'A covering letter with no enclosures.',
      })
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      if (lifecycle.responses.length !== 1) return `${lifecycle.responses.length} responses`
      if (lifecycle.responses[0].intakes.length !== 0) return 'records were invented'
      if (lifecycle.status !== 'RESPONDED') return `status ${lifecycle.status}`
      return lifecycle.receivedSourceIds.length === 0 ? null : 'sources appeared from nothing'
    })

    await check('5 · one response may carry several records, and there may be several responses', async () => {
      await recordResponse(db, 'ATI-1', {
        receivedAt: AT, completeness: 'FINAL',
        intakes: [
          { intakeId: 'INTAKE-1', receivedAt: AT, describedAs: 'Award notice, 3 pages' },
          { intakeId: 'INTAKE-2', receivedAt: AT, describedAs: 'Annex A, schedule of rates' },
        ],
      })
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      if (lifecycle.responses.length !== 2) return `${lifecycle.responses.length} responses`
      const second = lifecycle.responses[1]
      if (second.intakes.length !== 2) return `${second.intakes.length} intakes`
      // Still no canonical sources: nothing has been accepted.
      return lifecycle.receivedSourceIds.length === 0
        ? null : 'intakes were treated as sources'
    })

    // -- 6: an intake cannot name a Source --------------------------------------------
    await check('6 · an intake table has no column that could hold a source id', async () => {
      const columns = (await db.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name='ati_response_intakes'`)).rows
        .map((row) => (row as { column_name: string }).column_name)
      const offending = columns.filter((c) => /source/i.test(c))
      return offending.length === 0 ? null : `intakes carry ${offending.join(', ')}`
    })

    // -- 7: acceptance requires an existing committed source ----------------------------
    await check('7 · acceptance of a nonexistent source is refused', async () => {
      const outcome = await acceptIntakeSource(db, 'INTAKE-1', {
        investigationId: INV, committedVersion: 2, sourceId: 'SRC-DOES-NOT-EXIST', acceptedAt: AT,
      }).then(() => null, (e: unknown) => e as Error)
      if (outcome === null) return 'an imaginary source id was accepted'
      if (!/foreign key|violates/i.test(outcome.message)) return `rejected as: ${outcome.message}`
      // And not in a future version either.
      const future = await acceptIntakeSource(db, 'INTAKE-1', {
        investigationId: INV, committedVersion: 3, sourceId: 'SRC-NEW-2', acceptedAt: AT,
      }).then(() => null, (e: unknown) => e as Error)
      return future !== null ? null : 'a source in an uncommitted version was accepted'
    })

    await check('7 · acceptance succeeds against an exact committed source', async () => {
      const source = (await db.query(
        `SELECT id FROM sources WHERE investigation_id=$1 AND version_number=2
          ORDER BY id LIMIT 1`, [INV])).rows[0] as { id: string }
      await acceptIntakeSource(db, 'INTAKE-1',
        { investigationId: INV, committedVersion: 2, sourceId: source.id, acceptedAt: AT })
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      if (!lifecycle.receivedSourceIds.includes(source.id)) return 'the accepted source is absent'
      const intake = lifecycle.responses[1].intakes.find((i) => i.intakeId === 'INTAKE-1')!
      return intake.acceptedSources[0]?.committedVersion === 2
        ? null : 'the acceptance version was not recorded'
    })

    await check('7 · one intake may be accepted as several sources', async () => {
      const sources = (await db.query(
        `SELECT id FROM sources WHERE investigation_id=$1 AND version_number=2
          ORDER BY id LIMIT 3`, [INV])).rows as { id: string }[]
      await acceptIntakeSource(db, 'INTAKE-2',
        { investigationId: INV, committedVersion: 2, sourceId: sources[1].id, acceptedAt: AT })
      await acceptIntakeSource(db, 'INTAKE-2',
        { investigationId: INV, committedVersion: 2, sourceId: sources[2].id, acceptedAt: AT })
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      const intake = lifecycle.responses[1].intakes.find((i) => i.intakeId === 'INTAKE-2')!
      if (intake.acceptedSources.length !== 2) return `${intake.acceptedSources.length} accepted`
      return lifecycle.receivedSourceIds.length === 3
        ? null : `${lifecycle.receivedSourceIds.length} derived source ids`
    })

    // -- R1/R2/R3: the three remediation invariants -----------------------------------------

    await check('R1 · request identity and origin are immutable once history exists', async () => {
      const otherEligible = gaps.find((g) => g.ati_eligible && g.id !== eligible.id)
      // These three moved freely before remediation: the composite gap foreign
      // key is satisfied by any eligible gap at any version, so a request could
      // be re-pointed at a different version's gap while its history claimed
      // to originate from the old one.
      const holes: [string, string][] = [
        ['origin version', `UPDATE ati_requests SET origin_version=1 WHERE id='ATI-1'`],
        ['gap', `UPDATE ati_requests SET gap_id='${otherEligible?.id ?? eligible.id}' WHERE id='ATI-1'`],
        ['ordinal', `UPDATE ati_requests SET ordinal=42 WHERE id='ATI-1'`],
      ]
      for (const [what, sql] of holes) {
        const outcome = await db.query(sql).then(() => null, (e: unknown) => e as Error)
        if (outcome === null) return `${what} was changed after history existed`
        if (!/immutable/i.test(outcome.message))
          return `${what} was rejected, but not as immutable: ${outcome.message}`
      }
      // The rest are rejected too, whether by the new trigger or by an existing
      // foreign key — either way the origin cannot move.
      // Real changes, not no-ops: setting a column to the value it already
      // holds is not a change, and asserting it were would prove nothing.
      for (const [what, sql] of [
        ['investigation', `UPDATE ati_requests SET investigation_id='XRAY-ATI-B' WHERE id='ATI-1'`],
        ['eligibility flag', `UPDATE ati_requests SET origin_ati_eligible=false WHERE id='ATI-1'`],
        ['jurisdiction', `UPDATE ati_requests SET jurisdiction='TZ' WHERE id='ATI-1'`],
        ['id', `UPDATE ati_requests SET id='ATI-MOVED' WHERE id='ATI-1'`],
      ] as const) {
        const outcome = await db.query(sql).then(() => null, (e: unknown) => e as Error)
        if (outcome === null) return `${what} was changed after history existed`
      }
      // The superseded lifecycle columns #7's gate still writes stay writable.
      // Probed on ATI-2 so ATI-1's superseded columns remain untouched for the
      // derived-state check below, which asserts this slice never writes them.
      const legacy = await db.query(
        `UPDATE ati_requests SET status='CLOSED', submitted_at=$1, responded_at=$1,
           received_source_ids='["SRC-LEGACY"]' WHERE id='ATI-2'`, [AT])
        .then(() => null, (e: unknown) => e as Error)
      return legacy === null ? null : `a legacy column became unwritable: ${legacy.message}`
    })

    await check('R2 · an intake cannot be accepted against another investigation\'s source', async () => {
      await seedLineage(db, 'XRAY-ATI-B', 'RUN-ATI-B')
      const foreign = (await db.query(
        `SELECT id FROM sources WHERE investigation_id='XRAY-ATI-B' AND version_number=2
          ORDER BY id LIMIT 1`)).rows[0] as { id: string }
      const outcome = await acceptIntakeSource(db, 'INTAKE-1', {
        investigationId: 'XRAY-ATI-B', committedVersion: 2, sourceId: foreign.id, acceptedAt: AT,
      }).then(() => null, (e: unknown) => e as Error)
      if (outcome === null)
        return "another investigation's source was accepted into this request"
      return /same investigation|investigation/i.test(outcome.message)
        ? null : `rejected as: ${outcome.message}`
    })

    await check('R3 · acceptance requires the version to be committed, not merely present', async () => {
      // A Source row is visible inside the transaction that is still building
      // the next version, before the committed pointer advances. A
      // non-deferrable foreign key sees that row and is satisfied by it — so
      // the FK alone never proved the commit had happened.
      await db.query('BEGIN')
      let accepted: Error | null = null
      try {
        await db.query(
          `INSERT INTO sources(investigation_id, version_number, id, title, retrieved_at,
             source_type, evidence_class, origin_status, accessibility)
           VALUES ($1, 3, 'SRC-UNCOMMITTED', 'A record arriving with version 3', $2,
             'PROCUREMENT_RECORD', 'PRIMARY', 'ORIGINATING', 'RETRIEVED')`, [INV, AT])
        accepted = await acceptIntakeSource(db, 'INTAKE-1', {
          investigationId: INV, committedVersion: 3, sourceId: 'SRC-UNCOMMITTED', acceptedAt: AT,
        }).then(() => null, (e: unknown) => e as Error)
      } finally {
        await db.query('ROLLBACK')
      }
      if (accepted === null) return 'a source in an uncommitted version was accepted'
      if (!/not committed|committed/i.test(accepted.message))
        return `rejected as: ${accepted.message}`
      // And the same shape of acceptance succeeds once a version is committed.
      const committed = await commitFurtherVersion(db, INV, 'RUN-ATI-V3', seeded.candidate, 3)
      const newSource = (await db.query(
        `SELECT id FROM sources WHERE investigation_id=$1 AND version_number=3
          ORDER BY id LIMIT 1`, [INV])).rows[0] as { id: string }
      void committed
      await acceptIntakeSource(db, 'INTAKE-2',
        { investigationId: INV, committedVersion: 3, sourceId: newSource.id, acceptedAt: AT })
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      return lifecycle.receivedSourceIds.includes(newSource.id)
        ? null : 'the committed acceptance was not recorded'
    })

    // -- 8: append-only, and research untouched -------------------------------------------
    await check('8 · every history table rejects UPDATE and DELETE', async () => {
      const cases: [string, string][] = [
        ['ati_request_revisions', `UPDATE ati_request_revisions SET custody_basis='CONFIRMED' WHERE request_id='ATI-1'`],
        ['ati_request_revisions', `DELETE FROM ati_request_revisions WHERE request_id='ATI-1'`],
        ['ati_request_events', `UPDATE ati_request_events SET act='CLOSE' WHERE request_id='ATI-1'`],
        ['ati_request_events', `DELETE FROM ati_request_events WHERE request_id='ATI-1'`],
        ['ati_responses', `UPDATE ati_responses SET completeness='FINAL' WHERE request_id='ATI-1'`],
        ['ati_responses', `DELETE FROM ati_responses WHERE request_id='ATI-1'`],
        ['ati_response_intakes', `UPDATE ati_response_intakes SET described_as='x' WHERE intake_id='INTAKE-1'`],
        ['ati_response_intakes', `DELETE FROM ati_response_intakes WHERE intake_id='INTAKE-1'`],
        ['ati_intake_source_acceptances', `UPDATE ati_intake_source_acceptances SET source_id='x' WHERE intake_id='INTAKE-1'`],
        ['ati_intake_source_acceptances', `DELETE FROM ati_intake_source_acceptances WHERE intake_id='INTAKE-1'`],
      ]
      for (const [table, sql] of cases) {
        const outcome = await db.query(sql).then(() => null, (e: unknown) => e as Error)
        if (outcome === null) return `${table} accepted a mutation`
        if (!/append-only/i.test(outcome.message)) return `${table}: ${outcome.message}`
      }
      return null
    })

    await check('8 · closure is administrative and changes no gap', async () => {
      const gapBefore = (await db.query(
        `SELECT status, resolution_path FROM gaps
          WHERE investigation_id=$1 AND version_number=2 AND id=$2`, [INV, eligible.id])).rows[0]
      await closeRequest(db, 'ATI-1', AT, 'No further records expected.')
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      if (lifecycle.status !== 'CLOSED') return `status ${lifecycle.status}`
      const gapAfter = (await db.query(
        `SELECT status, resolution_path FROM gaps
          WHERE investigation_id=$1 AND version_number=2 AND id=$2`, [INV, eligible.id])).rows[0]
      return JSON.stringify(gapAfter) === JSON.stringify(gapBefore)
        ? null : 'closing the request changed the gap'
    })

    await check('8 · ATI activity moves no canonical state', async () => {
      const strip = (g: unknown) => JSON.stringify(g, (k, v) => k === 'index' ? undefined : v)
      // Committed versions are byte-identical after every ATI act above.
      if (strip(await readSnapshot(db, INV, 1)) !== strip(snapshotV1Before)) return 'v1 changed'
      if (strip(await readSnapshot(db, INV, 2)) !== strip(snapshotV2Before)) return 'v2 changed'

      // The pointer is at 3 because R3 committed a version through #7's own
      // machinery — research moving it is correct. What must hold is that no
      // ATI write moves it, so one more ATI act is performed and compared.
      const pointerOf = async () => ((await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1',
        [INV])).rows[0] as { v: number }).v
      const before = await pointerOf()
      await recordAcknowledgement(db, 'ATI-2', AT, 'A further acknowledgement.')
      await recordResponse(db, 'ATI-2', { receivedAt: AT, completeness: 'UNSTATED' })
      if (await pointerOf() !== before) return 'an ATI write moved the version pointer'

      const v3 = strip(await readSnapshot(db, INV, 3))
      await recordAcknowledgement(db, 'ATI-2', AT)
      return strip(await readSnapshot(db, INV, 3)) === v3
        ? null : 'an ATI write changed a committed version'
    })

    // -- derived state ------------------------------------------------------------------------
    await check('status is derived from history, never read from a column', async () => {
      const stored = (await db.query(
        `SELECT status, drafted_at, received_source_ids FROM ati_requests WHERE id='ATI-1'`))
        .rows[0] as { status: string | null; drafted_at: string | null; received_source_ids: unknown }
      // The superseded columns were never written by this slice.
      if (stored.status !== null) return `a status column was written: ${stored.status}`
      if (stored.drafted_at !== null) return 'a drafted_at column was written'
      if (stored.received_source_ids !== null) return 'a received_source_ids column was written'
      const lifecycle = (await readRequestLifecycle(db, 'ATI-1'))!
      return lifecycle.draftedAt !== '' && lifecycle.status === 'CLOSED'
        ? null : 'the derived view is incomplete'
    })

    await check('deriveStatus follows the released progression', async () => {
      const at = AT
      const ev = (act: 'EXPORT' | 'SUBMIT' | 'ACKNOWLEDGE' | 'CLOSE', sequence: number) =>
        ({ sequence, act, occurredAt: at })
      const none = deriveStatus([], [])
      const exported = deriveStatus([ev('EXPORT', 1)], [])
      const submitted = deriveStatus([ev('EXPORT', 1), ev('SUBMIT', 2)], [])
      const acked = deriveStatus([ev('EXPORT', 1), ev('SUBMIT', 2), ev('ACKNOWLEDGE', 3)], [])
      const responded = deriveStatus([ev('EXPORT', 1)],
        [{ sequence: 1, receivedAt: at, completeness: 'UNSTATED', intakes: [] }])
      const closed = deriveStatus([ev('EXPORT', 1), ev('CLOSE', 2)],
        [{ sequence: 1, receivedAt: at, completeness: 'FINAL', intakes: [] }])
      const observed = [none, exported, submitted, acked, responded, closed].join()
      return observed === 'DRAFT,EXPORTED,SUBMITTED,ACKNOWLEDGED,RESPONDED,CLOSED'
        ? null : observed
    })

    await check('10a wrote nothing into the evidence-graph aggregate', async () => {
      const code = readFileSync(new URL('./ati-lifecycle.ts', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const [pattern, what] of [
        [/createXRayGraph|XRayGraph/, 'the graph aggregate'],
        [/INSERT INTO (claims|sources|evidence|findings|gaps|investigation_versions)/, 'a canonical table'],
        [/UPDATE (claims|sources|evidence|findings|gaps|investigation_versions|investigations)/, 'canonical state'],
      ] as const) if (pattern.test(code)) return `the module touches ${what}`
      return null
    })

    // -- Report -------------------------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray ATI action lifecycle — 10a\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log('\nStatus, draftedAt, submittedAt, respondedAt and receivedSourceIds are all'
      + '\nderived; the superseded columns were never written.\n')
    if (failed.length) process.exitCode = 1
  } finally {
    await db.close()
  }
}
