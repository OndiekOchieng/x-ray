/**
 * ATI action command boundary checks (#10 slice 10b).
 *
 * WHAT THIS GATE IS FOR
 * =====================
 * XR-INV-009's request half moved out of graph validation and into the command
 * boundary. This is the proof that it arrived — and, because the release made
 * the handoff a temporal requirement, the proof exists and passes *before* the
 * graph-level check is removed.
 *
 * Every check runs against a real committed lineage in PGlite, so the origin
 * snapshot a request is authorized against is one `commitNextVersion` actually
 * produced.
 *
 * HONEST LIMITATION
 * =================
 * PGlite runs one connection. Serialization is proven by the lock being taken
 * and the outcome being deterministic; native concurrent row-lock behaviour is
 * not proven here, and needs a real PostgreSQL gate — the same limitation #7
 * and #9 already record.
 *
 * Run:  pnpm check:ati-commands
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import { createXRayGraph, type XRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import { assessGraduation } from '@/lib/xray/acceptance'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import type { ViolationCode } from '@/lib/xray/validation'
import { readSnapshot, writeInitialSnapshot } from '@/lib/xray/persistence/snapshot'
import { commitNextVersion } from '@/lib/xray/persistence/version-commit'
import { prepareAssessedRun } from '@/lib/xray/persistence/graduation-check-support'
import {
  AT, MIGRATIONS, candidateNext, corpusFor, reEvaluationAudit, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import { ATIActionRejected, ATIActionService } from './ati-service'
import { projectATIRequest } from './ati-read-model'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const ATI_MIGRATIONS = [
  '0009_ati_lifecycle', '0010_ati_origin_and_acceptance',
  '0011_ati_acceptance_requires_added_source',
]

async function migrate(db: PGlite) {
  for (const n of [...MIGRATIONS, ...ATI_MIGRATIONS])
    await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
}

/**
 * Attempt a command and report the rejection, so a check can assert the exact
 * code rather than matching on message prose.
 */
async function rejection(act: () => Promise<unknown>): Promise<ATIActionRejected | Error | null> {
  try { await act(); return null } catch (error) { return error as Error }
}

const rejectedWith = async (
  code: string, act: () => Promise<unknown>,
): Promise<string | null> => {
  const error = await rejection(act)
  if (error === null) return `accepted; expected ${code}`
  if (!(error instanceof ATIActionRejected)) return `threw ${error.name}: ${error.message}`
  return error.code === code ? null : `rejected with ${error.code}, expected ${code}`
}

const INV = 'XRAY-ATI-CMD'
const NO_HOLDER_INV = 'XRAY-ATI-NOHOLDER'
/** A record name no gap in any version ever names. */
const INVENTED = 'The internal minute nobody has ever described'

const clock = (at: string) => () => at

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)
    const seeded = await seedLineage(db, INV, 'RUN-ATI-CMD')
    const service = new ATIActionService(db, clock(AT))

    const gapRows = (await db.query(
      `SELECT id, resolution_path, ati_eligible, resolving_evidence, likely_holder
         FROM gaps WHERE investigation_id=$1 AND version_number=2 ORDER BY id`, [INV])).rows as {
      id: string; resolution_path: string; ati_eligible: boolean
      resolving_evidence: string[]; likely_holder: { institution: string; office?: string; basis: string } | null
    }[]
    const eligible = gapRows.find((g) => g.ati_eligible && g.likely_holder?.office)!
    const ineligible = gapRows.find((g) => !g.ati_eligible)!
    const records = eligible.resolving_evidence
    const context = 'The award figure is unverified in the public record.'

    const snapshotsBefore = {
      1: JSON.stringify(await readSnapshot(db, INV, 1)),
      2: JSON.stringify(await readSnapshot(db, INV, 2)),
    }

    const origin = { investigationId: INV, originVersion: 2, gapId: eligible.id }

    // -- 1 -------------------------------------------------------------------
    await check('1 · an eligible exact-origin gap creates a draft', async () => {
      const created = await service.createDraft({
        ...origin, requestedRecords: [records[0]], publicInterestContext: context,
        requestId: 'ATI-A',
      })
      if (created.revision !== 1) return `first revision is ${created.revision}`
      const view = await service.view('ATI-A')
      if (view.gapId !== eligible.id) return `bound gap ${view.gapId}`
      if (view.originVersion !== 2) return `origin version ${view.originVersion}`
      return view.status === 'DRAFT' ? null : `status ${view.status}`
    })

    // -- 2 -------------------------------------------------------------------
    await check('2 · a non-ATI gap is rejected at the command boundary', () =>
      rejectedWith('XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP', () => service.createDraft({
        investigationId: INV, originVersion: 2, gapId: ineligible.id,
        requestedRecords: [ineligible.resolving_evidence[0]], publicInterestContext: context,
        requestId: 'ATI-INELIGIBLE',
      })))

    // -- 3 -------------------------------------------------------------------
    await check('3 · unknown investigation, version or gap is rejected', async () => {
      const cases: [string, Parameters<typeof service.createDraft>[0]][] = [
        ['ATI/ORIGIN_SNAPSHOT_NOT_FOUND', {
          investigationId: 'XRAY-NOBODY', originVersion: 2, gapId: eligible.id,
          requestedRecords: [records[0]], publicInterestContext: context, requestId: 'ATI-X1' }],
        ['ATI/ORIGIN_SNAPSHOT_NOT_FOUND', {
          ...origin, originVersion: 99,
          requestedRecords: [records[0]], publicInterestContext: context, requestId: 'ATI-X2' }],
        ['ATI/ORIGIN_GAP_NOT_FOUND', {
          ...origin, gapId: 'GAP-NOT-REAL',
          requestedRecords: [records[0]], publicInterestContext: context, requestId: 'ATI-X3' }],
      ]
      for (const [code, input] of cases) {
        const failure = await rejectedWith(code, () => service.createDraft(input))
        if (failure !== null) return `${input.investigationId} v${input.originVersion} ${input.gapId}: ${failure}`
      }
      return null
    })

    // -- 4 -------------------------------------------------------------------
    await check('4 · a requested record the origin gap does not name is rejected', async () => {
      const failure = await rejectedWith(
        'XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP', () => service.createDraft({
          ...origin, requestedRecords: [records[0], INVENTED],
          publicInterestContext: context, requestId: 'ATI-INVENTED',
        }))
      if (failure !== null) return failure
      // The rejection is total: nothing was written.
      const rows = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_requests WHERE id=$1', ['ATI-INVENTED'])).rows
      if (rows[0].n !== 0) return 'a rejected request was persisted anyway'
      // Near-misses are rejected too: membership is exact, not normalized.
      for (const nearMiss of [records[0].toLowerCase(), `${records[0]} `, records[0].trim().replace(/\.$/, '')]) {
        if (records.includes(nearMiss)) continue
        const near = await rejectedWith(
          'XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP', () => service.createDraft({
            ...origin, requestedRecords: [nearMiss], publicInterestContext: context,
            requestId: `ATI-NEAR-${nearMiss.length}`,
          }))
        if (near !== null) return `near-miss "${nearMiss.slice(0, 24)}…": ${near}`
      }
      return null
    })

    await check('4b · a request naming no record at all is rejected', () =>
      rejectedWith('ATI/NO_RECORDS_REQUESTED', () => service.createDraft({
        ...origin, requestedRecords: [], publicInterestContext: context, requestId: 'ATI-EMPTY',
      })))

    // -- 5 -------------------------------------------------------------------
    await check('5 · any exact subset of the origin gap\'s resolving evidence is accepted', async () => {
      if (records.length < 2) return `the origin gap names only ${records.length} record(s)`
      await service.createDraft({
        ...origin, requestedRecords: [...records], publicInterestContext: context,
        requestId: 'ATI-FULL-SET',
      })
      const full = await service.view('ATI-FULL-SET')
      if (full.requestedRecords.length !== records.length) return 'the full set was not stored'
      await service.createDraft({
        ...origin, requestedRecords: [records[records.length - 1]],
        publicInterestContext: context, requestId: 'ATI-SUBSET',
      })
      const subset = await service.view('ATI-SUBSET')
      return subset.requestedRecords.length === 1 ? null : 'a one-record subset was not stored'
    })

    // -- 6 -------------------------------------------------------------------
    await check('6 · initial holder institution, office and basis come from the origin gap', async () => {
      const view = await service.view('ATI-A')
      const holder = eligible.likely_holder!
      if (view.holdingInstitution !== holder.institution)
        return `institution "${view.holdingInstitution}" is not the gap's "${holder.institution}"`
      if (view.holdingOffice !== holder.office)
        return `office "${String(view.holdingOffice)}" is not the gap's "${String(holder.office)}"`
      if (view.custodyBasis !== holder.basis)
        return `basis ${view.custodyBasis} is not the gap's ${holder.basis}`
      if (view.holderContextOrigin !== 'ORIGIN_GAP')
        return `holder context origin ${view.holderContextOrigin}`
      return view.custodyBasisRationale === undefined
        ? null : 'a rationale was invented for context carried from the gap'
    })

    // -- 7 -------------------------------------------------------------------
    await check('7 · a gap with no likely holder never gets one invented', async () => {
      // A lineage whose eligible gap states no likely holder. The fixture has
      // none, so one is constructed rather than asserted into the database.
      const v1 = corpusFor(NO_HOLDER_INV)
      const stripped = createXRayGraph({
        ...(v1 as XRayGraphInput),
        gaps: v1.gaps.map((gap) => {
          if (!gap.atiEligible) return gap
          const { likelyHolder: _dropped, ...rest } = gap
          return rest as typeof gap
        }),
      })
      await writeInitialSnapshot(db, stripped)
      const bare = stripped.gaps.find((gap) => gap.atiEligible)!
      const bareOrigin = {
        investigationId: NO_HOLDER_INV, originVersion: 1, gapId: bare.id,
      }
      const failure = await rejectedWith('ATI/HOLDER_CONTEXT_MISSING', () =>
        service.createDraft({
          ...bareOrigin, requestedRecords: [bare.resolvingEvidence[0]],
          publicInterestContext: context, requestId: 'ATI-NO-HOLDER',
        }))
      if (failure !== null) return failure
      // With context supplied explicitly it proceeds, and says it was supplied.
      await service.createDraft({
        ...bareOrigin, requestedRecords: [bare.resolvingEvidence[0]],
        publicInterestContext: context, requestId: 'ATI-SUPPLIED',
        holder: { institution: 'The National Treasury', basis: 'INFERRED' },
      })
      const view = await service.view('ATI-SUPPLIED')
      if (view.holderContextOrigin !== 'HUMAN_SUPPLIED')
        return `supplied context recorded as ${view.holderContextOrigin}`
      return view.holdingInstitution === 'The National Treasury'
        ? null : `institution "${view.holdingInstitution}"`
    })

    // -- 8 -------------------------------------------------------------------
    await check('8 · a human CONFIRMED custody basis requires a stated rationale', async () => {
      const failure = await rejectedWith('ATI/CUSTODY_BASIS_RATIONALE_REQUIRED', () =>
        service.createDraft({
          ...origin, requestedRecords: [records[0]], publicInterestContext: context,
          requestId: 'ATI-CONFIRMED-BARE',
          holder: { institution: 'Kenya Rural Roads Authority', basis: 'CONFIRMED' },
        }))
      if (failure !== null) return failure
      const blank = await rejectedWith('ATI/CUSTODY_BASIS_RATIONALE_REQUIRED', () =>
        service.createDraft({
          ...origin, requestedRecords: [records[0]], publicInterestContext: context,
          requestId: 'ATI-CONFIRMED-BLANK',
          holder: { institution: 'Kenya Rural Roads Authority', basis: 'CONFIRMED', rationale: '   ' },
        }))
      if (blank !== null) return `blank rationale: ${blank}`
      await service.createDraft({
        ...origin, requestedRecords: [records[0]], publicInterestContext: context,
        requestId: 'ATI-CONFIRMED-OK',
        holder: {
          institution: 'Kenya Rural Roads Authority', basis: 'CONFIRMED',
          rationale: 'Named information access officer confirmed custody by telephone.',
        },
      })
      const view = await service.view('ATI-CONFIRMED-OK')
      if (view.custodyBasis !== 'CONFIRMED') return `basis ${view.custodyBasis}`
      return view.custodyBasisRationale === undefined ? 'the rationale was dropped' : null
    })

    // -- a later version that names one more record -------------------------
    const v3Record = 'The Lot 3 variation order register, as tabled in 2026'
    const v3 = await commitWithExtraRecord(db, 'RUN-ATI-CMD-3', seeded.candidate, 3,
      eligible.id, v3Record)
    const snapshotV3Before = JSON.stringify(await readSnapshot(db, INV, 3))

    // -- 9 -------------------------------------------------------------------
    await check('9 · a revision stays bounded by the frozen origin after a later version exists', async () => {
      const atV3 = v3.gaps.find((gap) => gap.id === eligible.id)!
      if (!atV3.resolvingEvidence.includes(v3Record))
        return 'v3 does not name the new record, so the check proves nothing'
      const atV2 = seeded.candidate.gaps.find((gap) => gap.id === eligible.id)!
      if (atV2.resolvingEvidence.includes(v3Record))
        return 'v2 already named the new record, so the check proves nothing'

      // ATI-A is anchored to v2. v3 names one more record; the old request
      // still may not ask for it.
      const failure = await rejectedWith(
        'XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP', () =>
          service.reviseDraft('ATI-A', {
            requestedRecords: [records[0], v3Record], publicInterestContext: context,
          }))
      if (failure !== null) return failure

      // Anchored to v3, the same record is legitimate.
      await service.createDraft({
        investigationId: INV, originVersion: 3, gapId: eligible.id,
        requestedRecords: [v3Record], publicInterestContext: context, requestId: 'ATI-V3',
      })
      const anchored = await service.view('ATI-V3')
      if (anchored.originVersion !== 3) return `origin version ${anchored.originVersion}`

      // And a revision within the frozen scope still works.
      const revision = await service.reviseDraft('ATI-A', {
        requestedRecords: [...records], publicInterestContext: `${context} Reworded.`,
      })
      return revision === 2 ? null : `revision ${revision}`
    })

    // -- 10 ------------------------------------------------------------------
    await check('10 · several requests may target the same exact gap (C3)', async () => {
      const forGap = await service.listRequestsForGap(origin)
      if (forGap.length < 3) return `${forGap.length} request(s) for the gap`
      const v3Requests = await service.listRequestsForGap({ ...origin, originVersion: 3 })
      return v3Requests.length === 1
        ? null : `${v3Requests.length} request(s) anchored to v3`
    })

    // -- 11 ------------------------------------------------------------------
    await check('11 · the service allocates the ordinal; the caller cannot', async () => {
      const source = readFileSync(new URL('./ati-service.ts', import.meta.url), 'utf8')
      const declaration = source.slice(
        source.indexOf('export interface CreateDraftInput'),
        source.indexOf('export interface ReviseDraftInput'))
      if (declaration === '') return 'CreateDraftInput could not be located'
      if (/\bordinal\b/.test(stripComments(declaration)))
        return 'CreateDraftInput still lets a caller name an ordinal'
      // Allocation is contiguous and gapless in creation order.
      const ordinals = (await db.query<{ ordinal: number }>(
        'SELECT ordinal FROM ati_requests WHERE investigation_id=$1 ORDER BY ordinal', [INV]))
        .rows.map((row) => Number(row.ordinal))
      const expected = ordinals.map((_, index) => index)
      if (JSON.stringify(ordinals) !== JSON.stringify(expected))
        return `ordinals ${JSON.stringify(ordinals)}`
      // Allocation happens under a row lock on the investigation.
      return /SELECT id FROM investigations WHERE id=\$1 FOR UPDATE/.test(source)
        ? null : 'ordinal allocation takes no lock on the investigation'
    })

    // -- 12 ------------------------------------------------------------------
    await check('12 · exporting an exact existing revision succeeds', async () => {
      const sequence = await service.exportRevision('ATI-A', 2, '2026-09-21T09:00:00Z')
      if (sequence !== 1) return `sequence ${sequence}`
      const lifecycle = (await service.readLifecycle('ATI-A'))!
      const event = lifecycle.events.find((e) => e.sequence === 1)!
      if (event.act !== 'EXPORT') return `act ${event.act}`
      return event.revision === 2 ? null : `froze revision ${String(event.revision)}`
    })

    // -- 13 ------------------------------------------------------------------
    await check('13 · exporting a revision that does not exist fails', () =>
      rejectedWith('ATI/REVISION_NOT_FOUND', () => service.exportRevision('ATI-A', 99)))

    await check('13b · an export stamped before the revision it freezes fails', () =>
      rejectedWith('ATI/RETROGRADE_EVENT', () =>
        service.exportRevision('ATI-A', 2, '2020-01-01T00:00:00Z')))

    await check('13c · acting on a request that does not exist fails', () =>
      rejectedWith('ATI/REQUEST_NOT_FOUND', () => service.exportRevision('ATI-NOBODY', 1)))

    // -- 14 ------------------------------------------------------------------
    await check('14 · an export does not imply a submission', async () => {
      const view = await service.view('ATI-A')
      if (view.status !== 'EXPORTED') return `status ${view.status}`
      if (view.exportedAt === undefined) return 'the export was not recorded'
      if ('submittedAt' in view)
        return 'submittedAt is present on a request nobody said they filed'
      const source = readFileSync(new URL('./ati-service.ts', import.meta.url), 'utf8')
      const writes = (stripComments(source).match(/confirmSubmission\(/g) ?? []).length
      return writes === 1 ? null : `${writes} call sites write a SUBMIT event`
    })

    // -- 15 ------------------------------------------------------------------
    await check('15 · submission requires an explicit human assertion about an exact export', async () => {
      const source = stripComments(
        readFileSync(new URL('./ati-service.ts', import.meta.url), 'utf8'))
      if (!/interface SubmissionAssertion[^}]*humanConfirmed: true/.test(
        source.replace(/\n/g, ' ')))
        return 'SubmissionAssertion does not require humanConfirmed: true'
      const sequence = await service.confirmSubmitted('ATI-A', 1,
        { humanConfirmed: true, method: 'Filed on the institution portal', externalReference: 'KENHA/ATI/2026/114' },
        '2026-09-22T10:00:00Z')
      if (sequence !== 2) return `sequence ${sequence}`
      const view = await service.view('ATI-A')
      if (view.status !== 'SUBMITTED') return `status ${view.status}`
      return view.submittedAt === '2026-09-22T10:00:00Z'
        ? null : `submittedAt ${String(view.submittedAt)}`
    })

    // -- 16 ------------------------------------------------------------------
    await check('16 · a submission naming something that was not an export fails', async () => {
      // Sequence 2 is the SUBMIT just recorded, not an export.
      const notExport = await rejectedWith('ATI/EXPORT_NOT_FOUND', () =>
        service.confirmSubmitted('ATI-A', 2, { humanConfirmed: true }))
      if (notExport !== null) return `naming a SUBMIT: ${notExport}`
      return rejectedWith('ATI/EXPORT_NOT_FOUND', () =>
        service.confirmSubmitted('ATI-A', 87, { humanConfirmed: true }))
    })

    // -- 17 ------------------------------------------------------------------
    await check('17 · a submission stamped before the export it names fails', () =>
      rejectedWith('ATI/RETROGRADE_EVENT', () =>
        service.confirmSubmitted('ATI-A', 1, { humanConfirmed: true },
          '2026-09-21T08:00:00Z')))

    // -- 18 ------------------------------------------------------------------
    await check('18 · an acknowledgement before any submission fails', async () => {
      await service.createDraft({
        ...origin, requestedRecords: [records[0]], publicInterestContext: context,
        requestId: 'ATI-UNFILED',
      })
      const unfiled = await rejectedWith('ATI/ACKNOWLEDGEMENT_BEFORE_SUBMISSION', () =>
        service.acknowledge('ATI-UNFILED', '2026-09-23T10:00:00Z'))
      if (unfiled !== null) return `on a draft: ${unfiled}`
      await service.exportRevision('ATI-UNFILED', 1, '2026-09-21T09:00:00Z')
      // Exported is still not filed, so there is still nothing to acknowledge.
      return rejectedWith('ATI/ACKNOWLEDGEMENT_BEFORE_SUBMISSION', () =>
        service.acknowledge('ATI-UNFILED', '2026-09-23T10:00:00Z'))
    })

    await check('18b · an acknowledgement stamped before the submission fails', () =>
      rejectedWith('ATI/RETROGRADE_EVENT', () =>
        service.acknowledge('ATI-A', '2026-09-21T23:00:00Z')))

    // -- 19 ------------------------------------------------------------------
    await check('19 · an acknowledgement after a submission succeeds', async () => {
      const sequence = await service.acknowledge('ATI-A', '2026-09-24T10:00:00Z',
        'Acknowledged in writing; statutory clock started.')
      if (sequence !== 3) return `sequence ${sequence}`
      const view = await service.view('ATI-A')
      if (view.status !== 'ACKNOWLEDGED') return `status ${view.status}`
      return view.acknowledgedAt === '2026-09-24T10:00:00Z'
        ? null : `acknowledgedAt ${String(view.acknowledgedAt)}`
    })

    // -- 20 ------------------------------------------------------------------
    await check('20 · closure is explicit, administrative, and unavailable from DRAFT', async () => {
      await service.createDraft({
        ...origin, requestedRecords: [records[0]], publicInterestContext: context,
        requestId: 'ATI-STILL-DRAFT',
      })
      const fromDraft = await rejectedWith('ATI/CLOSE_REQUIRES_POST_DRAFT_STATE', () =>
        service.close('ATI-STILL-DRAFT', { humanConfirmed: true, reason: 'Abandoned.' }))
      if (fromDraft !== null) return `from DRAFT: ${fromDraft}`
      const noReason = await rejectedWith('ATI/CLOSE_REQUIRES_POST_DRAFT_STATE', () =>
        service.close('ATI-A', { humanConfirmed: true, reason: '  ' }))
      if (noReason !== null) return `with no stated reason: ${noReason}`

      const sequence = await service.close('ATI-A',
        { humanConfirmed: true, reason: 'No response within the statutory period; escalated separately.' },
        '2026-10-30T10:00:00Z')
      if (sequence !== 4) return `sequence ${sequence}`
      const view = await service.view('ATI-A')
      if (view.status !== 'CLOSED') return `status ${view.status}`
      // Closure says nothing about whether anyone answered.
      return view.respondedAt === undefined && view.receivedSourceIds.length === 0
        ? null : 'closure implied a response'
    })

    // -- 21 ------------------------------------------------------------------
    await check('21 · nothing may follow a close', async () => {
      const attempts: [string, () => Promise<unknown>][] = [
        ['revise', () => service.reviseDraft('ATI-A', {
          requestedRecords: [records[0]], publicInterestContext: context })],
        ['export', () => service.exportRevision('ATI-A', 1, '2026-11-01T10:00:00Z')],
        ['submit', () => service.confirmSubmitted('ATI-A', 1, { humanConfirmed: true },
          '2026-11-01T10:00:00Z')],
        ['acknowledge', () => service.acknowledge('ATI-A', '2026-11-01T10:00:00Z')],
        ['close again', () => service.close('ATI-A',
          { humanConfirmed: true, reason: 'Closing twice.' }, '2026-11-01T10:00:00Z')],
      ]
      for (const [label, act] of attempts) {
        const failure = await rejectedWith('ATI/REQUEST_CLOSED', act)
        if (failure !== null) return `${label}: ${failure}`
      }
      const lifecycle = (await service.readLifecycle('ATI-A'))!
      return lifecycle.events.length === 4
        ? null : `${lifecycle.events.length} events after the close attempts`
    })

    // -- 22 ------------------------------------------------------------------
    await check('22 · the derived read model replays history without inventing anything', async () => {
      const lifecycle = (await service.readLifecycle('ATI-A'))!
      const view = projectATIRequest(lifecycle)
      if (view.id !== 'ATI-A' || view.gapId !== eligible.id) return 'identity is wrong'
      if (view.revision !== 2 || JSON.stringify(view.revisions) !== '[1,2]')
        return `revisions ${JSON.stringify(view.revisions)} / current ${view.revision}`
      if (view.draftedAt !== lifecycle.revisions[0].createdAt) return 'draftedAt is not the first revision'
      // Content is the latest revision's, which is not necessarily what was filed.
      if (view.requestedRecords.length !== records.length) return 'content is not the latest revision'
      const exported = lifecycle.events.find((e) => e.act === 'EXPORT')!
      if (exported.revision !== 2) return 'the frozen export revision was lost'
      // A request that was exported and never filed keeps submittedAt absent.
      const unfiled = await service.view('ATI-UNFILED')
      if (unfiled.status !== 'EXPORTED') return `unfiled status ${unfiled.status}`
      if ('submittedAt' in unfiled) return 'an exported request reported a submission time'
      if (unfiled.exportedAt === undefined) return 'the export time was lost'
      // Custody basis survives the projection into the ATIRequest shape.
      return unfiled.custodyBasis === eligible.likely_holder!.basis
        ? null : `custody basis ${unfiled.custodyBasis}`
    })

    // -- 23 ------------------------------------------------------------------
    await check('23 · every action write leaves committed snapshots byte-identical', async () => {
      for (const version of [1, 2] as const) {
        const after = JSON.stringify(await readSnapshot(db, INV, version))
        if (after !== snapshotsBefore[version]) return `v${version} changed`
      }
      if (JSON.stringify(await readSnapshot(db, INV, 3)) !== snapshotV3Before)
        return 'v3 changed'
      // And no action write reached a canonical table at all.
      const canonical = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM gaps WHERE investigation_id=$1', [INV])).rows
      return canonical[0].n === gapRows.length * 3
        ? null : `${canonical[0].n} gap rows across three versions`
    })

    // -- 26 ------------------------------------------------------------------
    await check('26 · the command boundary emits XR-INV-009\'s own violation codes', async () => {
      // Vocabulary continuity: these are the exact codes graph validation used
      // for the same two conditions, so the invariant reads as moved, not lapsed.
      const moved: ViolationCode[] = [
        'XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP',
        'XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP',
      ]
      const ineligibleError = await rejection(() => service.createDraft({
        investigationId: INV, originVersion: 2, gapId: ineligible.id,
        requestedRecords: [ineligible.resolving_evidence[0]],
        publicInterestContext: context, requestId: 'ATI-CODE-1',
      })) as ATIActionRejected
      const inventedError = await rejection(() => service.createDraft({
        ...origin, requestedRecords: [INVENTED], publicInterestContext: context,
        requestId: 'ATI-CODE-2',
      })) as ATIActionRejected
      const emitted = [ineligibleError?.code, inventedError?.code]
      return JSON.stringify(emitted) === JSON.stringify(moved)
        ? null : `emitted ${JSON.stringify(emitted)}`
    })
  } finally {
    await db.close()
  }

  report()
}

/** Commit a further version whose eligible gap names one additional record. */
async function commitWithExtraRecord(
  db: PGlite, runId: string, predecessor: XRayGraph, version: number,
  gapId: string, extraRecord: string,
): Promise<XRayGraph> {
  const base = candidateNext(predecessor, version)
  const widened = base.gaps.map((gap) => gap.id === gapId
    ? { ...gap, resolvingEvidence: [...gap.resolvingEvidence, extraRecord] }
    : gap)

  // Extending a gap's resolving evidence re-evaluates every claim that gap
  // blocks, so #7 requires each of them in the version record and in the audit.
  const audit = reEvaluationAudit(version)
  const listed = new Set(audit.map((entry) => entry.claimId))
  const alsoChanged = (widened.find((gap) => gap.id === gapId)!.claimIds)
    .filter((claimId) => !listed.has(claimId))

  const candidate = createXRayGraph({
    ...(base as XRayGraphInput),
    gaps: widened,
    version: {
      ...base.version!,
      reEvaluatedClaimIds: [...base.version!.reEvaluatedClaimIds, ...alsoChanged],
    },
  })
  const assessment = assessGraduation(candidate,
    { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: AT })
  await prepareAssessedRun(db, runId, candidate, assessment, 'CAPABILITY_BLOCKED')
  await commitNextVersion(db, {
    expectedPredecessor: version - 1, graph: candidate, assessment,
    reEvaluationAudit: [
      ...audit,
      ...alsoChanged.map((claimId) => ({
        claimId, reason: 'REVIEW_REVISION' as const,
        detail: 'The gap ledger named one further resolving record; the finding is unchanged.',
        causes: [],
      })),
    ],
    executionRunId: runId,
  })
  return candidate
}

/** Strip comments, so a claim about source text is a claim about code. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function report(): void {
  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} ATI command checks passed`)
  if (failed > 0) process.exitCode = 1
}
