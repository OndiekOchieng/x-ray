/**
 * ATI action surface and integrated lifecycle checks (#10 slice 10e).
 *
 * WHAT THIS GATE IS FOR
 * =====================
 * Two things the slices underneath it could not prove.
 *
 * First, the **whole loop through the product's own routes**: gap → draft →
 * revise → export → human-confirmed filing → acknowledgement → response and
 * intake → research → successor version → accepted Source. Every step goes
 * through an exported route handler with a real `Request`, so what is proven is
 * the transport, the parsing, the status codes and the DTOs the surface
 * actually renders — not the services underneath them.
 *
 * Second, **the wording**. The responsible-share table is product policy, so
 * this gate reads the rendered copy and looks for the eight forbidden
 * implications. A surface can have perfect data and still say that silence
 * means refusal.
 *
 * HONEST LIMITATION
 * =================
 * The accessibility checks read the component's source, because Node's
 * type-stripping cannot execute JSX and this repository has no renderer in its
 * harnesses. They assert labels, accessible names, keyboard-reachable controls
 * and status-not-by-colour-alone structurally. That is weaker than rendering,
 * and #11 owns the full audit.
 *
 * Run:  pnpm check:ati-surface
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { readSnapshot } from '@/lib/xray/persistence/snapshot'
import {
  AT, ATI_MIGRATIONS, MIGRATIONS, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import { readAtiActionSurfaces } from '@/lib/xray/persistence/ati-surface-reader'
import { gapView } from '@/lib/xray/projections/gap-view'
import { atiDraftFor } from '@/lib/xray/projections/ati-draft'
import type { ATIRequestSurface } from '@/lib/xray/projections/ati-surface'
import { setDatabaseProvider, setExecutionRuntimeProvider } from './runtime'
import { intakeResearchAdapter } from './ati-research-bridge'
import type { ExecutionRuntime } from './inline-execution'
import { ATI_PROPOSAL, atiStagePlan } from './ati-research-support'

import { GET as listRequests, POST as createDraft } from '@/app/api/investigations/[id]/ati/requests/route'
import { GET as readRequest } from '@/app/api/investigations/[id]/ati/requests/[requestId]/route'
import { POST as revise } from '@/app/api/investigations/[id]/ati/requests/[requestId]/revisions/route'
import { POST as exportRevision } from '@/app/api/investigations/[id]/ati/requests/[requestId]/exports/route'
import { POST as confirmSubmission } from '@/app/api/investigations/[id]/ati/requests/[requestId]/submission/route'
import { POST as acknowledge } from '@/app/api/investigations/[id]/ati/requests/[requestId]/acknowledgements/route'
import { POST as close } from '@/app/api/investigations/[id]/ati/requests/[requestId]/closure/route'
import { POST as recordResponse } from '@/app/api/investigations/[id]/ati/requests/[requestId]/responses/route'
import {
  GET as readProcessing, POST as processIntake,
} from '@/app/api/investigations/[id]/ati/intakes/[intakeId]/processing/route'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []
const rendered: { where: string; text: string }[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const INV = 'XRAY-ATI-SURFACE'
const BASE = `http://localhost/api/investigations/${INV}/ati`
const RECORD = 'Award notice, Lot 3 supervision consultancy. Contract sum KSh 412,000,000.'
const sha256 = (content: string) =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`

const params = <T,>(value: T) => Promise.resolve(value)
const post = (url: string, body?: unknown) => new Request(url,
  { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const get = (url: string) => new Request(url)

/** Call a route, record the body for the wording sweep, return status + JSON. */
async function call(where: string, response: Promise<Response>) {
  const res = await response
  const text = await res.text()
  rendered.push({ where, text })
  return { status: res.status, body: (text ? JSON.parse(text) : null) as any }
}

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Every forbidden implication from the responsible-share table, as a phrase a
 * surface might actually use.
 */
const FORBIDDEN: readonly { implication: string; patterns: readonly RegExp[] }[] = [
  { implication: 'the record does not exist',
    patterns: [/does not exist/i, /no such record/i, /never existed/i] },
  { implication: 'the institution refused',
    patterns: [/refus\w*/i, /stonewall\w*/i, /withheld/i, /conceal\w*/i, /obstruct\w*/i,
      /ignored (?:our|the) request/i] },
  { implication: 'custody is confirmed when it is inferred',
    patterns: [/the responsible office/i, /the custodian of record/i] },
  { implication: 'the gap is resolved',
    patterns: [/gap (?:is |was )?resolved/i, /resolved the gap/i, /closes the gap/i] },
  { implication: 'the claim is established',
    patterns: [/claim (?:is |was )?(?:established|confirmed|proven)/i, /proves the claim/i,
      /confirms the claim/i] },
  { implication: 'the response was complete',
    patterns: [/complete response/i, /responded in full/i, /fully answered/i] },
  { implication: 'a Source exists because a record arrived',
    patterns: [/received (?:source|evidence)/i, /new evidence received/i] },
  { implication: 'a supplied digest was verified',
    patterns: [/digest verified/i, /verified digest/i, /integrity verified/i] },
  { implication: 'X-Ray filed the request',
    patterns: [/x-ray (?:has )?(?:filed|submitted|sent) (?:the|this|your)/i,
      /we filed (?:the|this|your)/i, /request (?:was )?sent by x-ray/i] },
  { implication: 'motive, blame or a ranking',
    patterns: [/\bblame\b/i, /\bculpab\w*/i, /worst offender/i, /\bcorrupt\b/i,
      /deliberately (?:hid|withheld)/i] },
]

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    for (const n of [...MIGRATIONS, ...ATI_MIGRATIONS])
      await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
    await seedLineage(db, INV, 'RUN-ATI-SURFACE-SEED')

    let material = RECORD
    const runtime: ExecutionRuntime = {
      async initial() { throw new Error('not used by this gate') },
      async resume() {
        return {
          stages: atiStagePlan({ sources: 1, bearOnExistingClaim: true, regradeExisting: true }),
          adapters: { research: intakeResearchAdapter(
            { intakeId: 'x', boundedContent: material, truncated: false }, ATI_PROPOSAL) },
          stopEvidence: { saturationObserved: true },
        }
      },
      async reevaluation() {
        return {
          stages: atiStagePlan({ sources: 1, bearOnExistingClaim: true, regradeExisting: true }),
          adapters: { research: intakeResearchAdapter(
            { intakeId: 'x', boundedContent: material, truncated: false }, ATI_PROPOSAL) },
          stopEvidence: { saturationObserved: true },
        }
      },
    }
    setDatabaseProvider(async () => db)
    setExecutionRuntimeProvider(async () => runtime)

    const v2 = await readSnapshot(db, INV, 2)
    const eligible = v2.gaps.find((gap) => gap.atiEligible && gap.likelyHolder?.office)!
    const waiting = v2.gaps.find((gap) => gap.resolutionPath === 'WAIT_FOR_RECORD')!
    const v1Before = JSON.stringify(await readSnapshot(db, INV, 1))
    const v2Before = JSON.stringify(await readSnapshot(db, INV, 2))
    const gapStatusBefore = new Map(v2.gaps.map((gap) => [gap.id, gap.status]))

    // -- 1, 2, 34 ------------------------------------------------------------
    await check('1/2/34 · only a public-record gap offers the draft action', async () => {
      const draftable = atiDraftFor(gapView(v2, eligible))
      if (draftable === null) return 'an ATI-eligible gap offers no draft'
      if (draftable.status !== 'DRAFT') return `the offered draft reads ${draftable.status}`
      const notDraftable = atiDraftFor(gapView(v2, waiting))
      if (notDraftable !== null)
        return `${waiting.resolutionPath} offered an information request`
      // The two gaps visibly take different actions, not the same one greyed.
      // 11c moved this copy into `gapView.nextStep`, authored per resolution
      // path, so the assertion is now over the rendered strings rather than
      // over one hand-written sentence in the component.
      const eligibleView = gapView(v2, eligible)
      const waitingView = gapView(v2, waiting)
      if (!eligibleView.offersRecordsRequest)
        return 'the eligible gap does not offer a records request'
      if (waitingView.offersRecordsRequest)
        return `${waiting.resolutionPath} offers a records request`
      if (eligibleView.nextStep === waitingView.nextStep)
        return 'both paths state the same next step'
      if (/request/i.test(waitingView.nextStep) && !/nothing to request/i.test(waitingView.nextStep))
        return `the waiting path's next step reads as a request: "${waitingView.nextStep}"`
      return /can be requested/i.test(eligibleView.nextStep)
        ? null : `the eligible path's next step does not offer a request: "${eligibleView.nextStep}"`
    })

    // -- the loop, through the routes ---------------------------------------
    let requestId = ''
    await check('3/4/6 · a created draft names its exact origin and states it is not filed', async () => {
      const created = await call('POST requests', createDraft(post(`${BASE}/requests`, {
        originVersion: 2, gapId: eligible.id,
        requestedRecords: [eligible.resolvingEvidence[0]],
        publicInterestContext: 'The award figure is unverified in the public record.',
      }), { params: params({ id: INV }) }))
      if (created.status !== 201) return `status ${created.status}: ${JSON.stringify(created.body)}`
      const surface = created.body as ATIRequestSurface
      requestId = surface.requestId
      if (surface.origin.originVersion !== 2 || surface.origin.gapId !== eligible.id)
        return `anchored to ${JSON.stringify(surface.origin)}`
      if (surface.origin.label !== `Version 2 · ${eligible.id}`)
        return `origin label "${surface.origin.label}"`
      if (surface.filing.stage !== 'DRAFT') return `stage ${surface.filing.stage}`
      if (!/does not file/i.test(surface.filing.notFiledNotice))
        return 'the draft does not state that X-Ray does not file it'
      return /not filed/i.test(surface.filing.statusLabel)
        ? null : `status label "${surface.filing.statusLabel}"`
    })

    await check('4/5 · inferred custody renders as inferred, confirmed as confirmed', async () => {
      const surface = (await call('GET request',
        readRequest(get(`${BASE}/requests/${requestId}`),
          { params: params({ id: INV, requestId }) }))).body as ATIRequestSurface
      if (surface.holder.basis !== 'INFERRED') return `basis ${surface.holder.basis}`
      if (!surface.holder.inferred) return 'inferred custody did not report as inferred'
      if (surface.holder.label !== 'Likely holder — inferred')
        return `label "${surface.holder.label}"`
      if (/responsible office/i.test(JSON.stringify(surface.holder)))
        return 'inferred custody is described as the responsible office'

      // A human-confirmed holder, with its stated basis, on a second request.
      const confirmed = await call('POST requests confirmed',
        createDraft(post(`${BASE}/requests`, {
          originVersion: 2, gapId: eligible.id,
          requestedRecords: [eligible.resolvingEvidence[0]],
          publicInterestContext: 'context',
          holder: { institution: 'Kenya Rural Roads Authority', basis: 'CONFIRMED',
            rationale: 'A named information access officer confirmed custody by telephone.' },
        }), { params: params({ id: INV }) }))
      if (confirmed.status !== 201) return `confirmed holder: ${JSON.stringify(confirmed.body)}`
      const second = confirmed.body as ATIRequestSurface
      if (second.holder.label !== 'Holder — confirmed') return `label "${second.holder.label}"`
      if (second.holder.inferred) return 'confirmed custody reported as inferred'
      return second.holder.rationale === undefined ? 'the stated basis was dropped' : null
    })

    await check('7 · an export names the exact revision and does not report a filing', async () => {
      const revised = await call('POST revisions', revise(post(
        `${BASE}/requests/${requestId}/revisions`,
        { requestedRecords: [...eligible.resolvingEvidence],
          publicInterestContext: 'Reworded for clarity.' }),
      { params: params({ id: INV, requestId }) }))
      if (revised.status !== 201) return `revise: ${JSON.stringify(revised.body)}`
      if ((revised.body as ATIRequestSurface).request.revision !== 2)
        return `revision ${(revised.body as ATIRequestSurface).request.revision}`

      const exported = await call('POST exports', exportRevision(post(
        `${BASE}/requests/${requestId}/exports`, { revision: 2 }),
      { params: params({ id: INV, requestId }) }))
      if (exported.status !== 201) return `export: ${JSON.stringify(exported.body)}`
      const surface = exported.body as ATIRequestSurface
      if (surface.filing.stage !== 'EXPORTED') return `stage ${surface.filing.stage}`
      if (surface.filing.exportedRevisionLabel !== 'Exported revision 2')
        return `exported label "${String(surface.filing.exportedRevisionLabel)}"`
      if ('filedNote' in surface.filing) return 'an export produced a filing note'
      if ('submittedAt' in surface.request) return 'an export produced a submission time'
      return /not filed/i.test(surface.filing.statusLabel)
        ? null : `status label "${surface.filing.statusLabel}"`
    })

    await check('8/9 · only an explicit human statement moves it to filed', async () => {
      // Without the affirmation, the route refuses.
      const bare = await call('POST submission bare', confirmSubmission(post(
        `${BASE}/requests/${requestId}/submission`, { exportSequence: 1 }),
      { params: params({ id: INV, requestId }) }))
      if (bare.status !== 400) return `unaffirmed submission returned ${bare.status}`

      const filed = await call('POST submission', confirmSubmission(post(
        `${BASE}/requests/${requestId}/submission`,
        { exportSequence: 1, humanConfirmed: true, method: 'Filed on the institution portal' }),
      { params: params({ id: INV, requestId }) }))
      if (filed.status !== 201) return `submission: ${JSON.stringify(filed.body)}`
      const surface = filed.body as ATIRequestSurface
      if (surface.filing.stage !== 'SUBMITTED') return `stage ${surface.filing.stage}`
      if (surface.filing.filedNote === undefined) return 'the filing was not recorded'
      if (!/a person/i.test(surface.filing.filedNote))
        return `filed note "${surface.filing.filedNote}"`
      // Unsupplied metadata stays absent.
      const submission = surface.timeline.find((entry) => entry.kind === 'SUBMISSION')!
      if (submission.detail !== 'Filed on the institution portal')
        return `submission detail "${String(submission.detail)}"`
      return surface.filing.confirmationStatement === 'I filed this exported request outside X-Ray.'
        ? null : `confirmation statement "${surface.filing.confirmationStatement}"`
    })

    await check('10 · an acknowledgement is an event, never inferred', async () => {
      const acked = await call('POST acknowledgements', acknowledge(post(
        `${BASE}/requests/${requestId}/acknowledgements`,
        { note: 'Acknowledged in writing; statutory clock started.' }),
      { params: params({ id: INV, requestId }) }))
      if (acked.status !== 201) return `acknowledge: ${JSON.stringify(acked.body)}`
      const surface = acked.body as ATIRequestSurface
      const entry = surface.timeline.find((item) => item.kind === 'ACKNOWLEDGEMENT')
      if (!entry) return 'the acknowledgement is not in the history'
      return surface.filing.stage === 'ACKNOWLEDGED' ? null : `stage ${surface.filing.stage}`
    })

    let intakeId = ''
    await check('11/14/15/16 · a received record is a receipt, and a supplied digest says so', async () => {
      const responded = await call('POST responses', recordResponse(post(
        `${BASE}/requests/${requestId}/responses`,
        { receivedAt: '2026-10-15T09:00:00Z', completeness: 'PARTIAL',
          summary: 'Two of the four requested records, released in part.',
          records: [
            { describedAs: 'Award notice, 4 pages', material: RECORD,
              mediaType: 'application/pdf' },
            { describedAs: 'Annex A', suppliedDigest: sha256('annex') },
          ] }),
      { params: params({ id: INV, requestId }) }))
      if (responded.status !== 201) return `response: ${JSON.stringify(responded.body)}`
      const surface = responded.body as ATIRequestSurface
      const response = surface.responses[0]
      if (response.completeness !== 'PARTIAL') return `completeness ${response.completeness}`
      if (response.completenessLabel !== 'Completeness as stated: partial')
        return `completeness label "${response.completenessLabel}"`

      const byName = new Map(response.intakes.map((intake) => [intake.describedAs, intake]))
      const notice = byName.get('Award notice, 4 pages')!
      intakeId = notice.intakeId
      if (notice.receiptLabel !== 'Received record') return `receipt label "${notice.receiptLabel}"`
      if (notice.researchLabel !== 'Awaiting research')
        return `research label "${notice.researchLabel}"`
      if (notice.acceptedSourceIds.length !== 0) return 'an unresearched record names a Source'
      if (notice.digestLabel !== 'Integrity digest — computed by X-Ray')
        return `computed digest label "${String(notice.digestLabel)}"`
      const annex = byName.get('Annex A')!
      if (annex.digestLabel !== 'Integrity digest — supplied externally')
        return `supplied digest label "${String(annex.digestLabel)}"`
      if (/verif/i.test(JSON.stringify(annex))) return 'a supplied digest renders as verified'
      // No route lets a caller name an intake.
      const named = await call('POST responses named', recordResponse(post(
        `${BASE}/requests/${requestId}/responses`,
        { receivedAt: '2026-10-16T09:00:00Z', completeness: 'UNSTATED',
          records: [{ describedAs: 'x', intakeId: 'MINE' }] }),
      { params: params({ id: INV, requestId }) }))
      return named.status === 400 ? null : `a caller-named intake returned ${named.status}`
    })

    await check('17/18 · processing needs the material, and a mismatch creates no run', async () => {
      const runsBefore = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM execution_runs')).rows[0].n
      const bare = await call('POST processing bare', processIntake(post(
        `${BASE}/intakes/${intakeId}/processing`, {}),
      { params: params({ id: INV, intakeId }) }))
      if (bare.status !== 400) return `missing material returned ${bare.status}`
      if (!/receipt/i.test(String(bare.body?.error?.message)))
        return `message "${String(bare.body?.error?.message)}"`

      const wrong = await call('POST processing mismatch', processIntake(post(
        `${BASE}/intakes/${intakeId}/processing`, { material: 'different bytes entirely' }),
      { params: params({ id: INV, intakeId }) }))
      if (wrong.status !== 422) return `mismatch returned ${wrong.status}`
      if (wrong.body?.error?.code !== 'ATI/MATERIAL_DIGEST_MISMATCH')
        return `mismatch code ${String(wrong.body?.error?.code)}`
      const runsAfter = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM execution_runs')).rows[0].n
      return runsAfter === runsBefore ? null : 'a mismatch created an execution run'
    })

    let committedVersion = 0
    await check('19/20 · a committed outcome links the exact successor version', async () => {
      const processed = await call('POST processing', processIntake(post(
        `${BASE}/intakes/${intakeId}/processing`,
        { material: RECORD, mediaType: 'application/pdf' }),
      { params: params({ id: INV, intakeId }) }))
      if (processed.status !== 201) return `processing: ${JSON.stringify(processed.body)}`
      if (processed.body.result !== 'COMMITTED') return `result ${processed.body.result}`
      committedVersion = processed.body.committedVersion as number
      if (committedVersion !== 3) return `version ${committedVersion}`
      if (!Array.isArray(processed.body.addedSourceIds) || processed.body.addedSourceIds.length !== 1)
        return `added ${JSON.stringify(processed.body.addedSourceIds)}`
      if (!String(processed.body.versionHref).startsWith('/investigations/'))
        return `version href ${String(processed.body.versionHref)}`

      // The accepted Source appears on the receipt only now.
      const after = (await call('GET request after research',
        readRequest(get(`${BASE}/requests/${requestId}`),
          { params: params({ id: INV, requestId }) }))).body as ATIRequestSurface
      const notice = after.responses[0].intakes.find((item) => item.intakeId === intakeId)!
      if (notice.acceptedSourceIds.length !== 1)
        return `accepted ${JSON.stringify(notice.acceptedSourceIds)}`
      if (!notice.researchLabel.startsWith('Researched into Source '))
        return `research label "${notice.researchLabel}"`
      // The receipt is still a receipt.
      return notice.receiptLabel === 'Received record' ? null : 'acceptance rewrote the receipt'
    })

    await check('21 · a record that produced nothing shows no version and no Source', async () => {
      // A second request, filed, answered, and researched to no canonical change.
      const created = (await call('POST requests duplicate',
        createDraft(post(`${BASE}/requests`, {
          originVersion: 2, gapId: eligible.id,
          requestedRecords: [eligible.resolvingEvidence[0]],
          publicInterestContext: 'context',
        }), { params: params({ id: INV }) }))).body as ATIRequestSurface
      const duplicateRequest = created.requestId
      await call('POST exports duplicate', exportRevision(post(
        `${BASE}/requests/${duplicateRequest}/exports`, { revision: 1 }),
      { params: params({ id: INV, requestId: duplicateRequest }) }))
      await call('POST submission duplicate', confirmSubmission(post(
        `${BASE}/requests/${duplicateRequest}/submission`,
        { exportSequence: 1, humanConfirmed: true }),
      { params: params({ id: INV, requestId: duplicateRequest }) }))
      const responded = (await call('POST responses duplicate', recordResponse(post(
        `${BASE}/requests/${duplicateRequest}/responses`,
        { receivedAt: '2026-11-01T09:00:00Z', completeness: 'FINAL',
          records: [{ describedAs: 'A copy of a record already held', material: 'duplicate' }] }),
      { params: params({ id: INV, requestId: duplicateRequest }) }))).body as ATIRequestSurface
      const duplicateIntake = responded.responses[0].intakes[0].intakeId

      const versionsBefore = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
        [INV])).rows[0].n
      material = 'duplicate'
      const runtimeNothing: ExecutionRuntime = {
        async initial() { throw new Error('unused') },
        async resume() { throw new Error('unused') },
        async reevaluation() {
          return { stages: atiStagePlan({ sources: 0 }),
            adapters: { research: intakeResearchAdapter(
              { intakeId: 'x', boundedContent: 'duplicate', truncated: false }, ATI_PROPOSAL) },
            stopEvidence: { saturationObserved: true } }
        },
      }
      setExecutionRuntimeProvider(async () => runtimeNothing)
      const processed = await call('POST processing duplicate', processIntake(post(
        `${BASE}/intakes/${duplicateIntake}/processing`, { material: 'duplicate' }),
      { params: params({ id: INV, intakeId: duplicateIntake }) }))
      setExecutionRuntimeProvider(async () => runtime)
      material = RECORD

      if (processed.status !== 201) return `processing: ${JSON.stringify(processed.body)}`
      if (processed.body.result !== 'NO_CANONICAL_CHANGE') return `result ${processed.body.result}`
      if ('committedVersion' in processed.body) return 'a phantom version was reported'
      if ('addedSourceIds' in processed.body) return 'sources were reported without a version'
      if (!/research result, not a failure/i.test(String(processed.body.detail)))
        return `detail "${String(processed.body.detail)}"`
      const versionsAfter = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
        [INV])).rows[0].n
      if (versionsAfter !== versionsBefore) return 'an empty version was committed'
      // The run is still readable, so the result is legible as a result.
      const outcome = await call('GET processing duplicate', readProcessing(
        get(`${BASE}/intakes/${duplicateIntake}/processing`),
        { params: params({ id: INV, intakeId: duplicateIntake }) }))
      return outcome.body.runs.length === 1 && outcome.body.outcome === undefined
        ? null : `runs ${JSON.stringify(outcome.body.runs)}`
    })

    await check('12/13 · a response after closure is visible and unlocks nothing', async () => {
      const closed = await call('POST closure', close(post(
        `${BASE}/requests/${requestId}/closure`,
        { humanConfirmed: true, reason: 'Records received; no further chase needed.' }),
      { params: params({ id: INV, requestId }) }))
      if (closed.status !== 201) return `closure: ${JSON.stringify(closed.body)}`

      const late = await call('POST responses late', recordResponse(post(
        `${BASE}/requests/${requestId}/responses`,
        { receivedAt: '2026-12-01T09:00:00Z', completeness: 'UNSTATED',
          records: [{ describedAs: 'A further annex, sent after closure' }] }),
      { params: params({ id: INV, requestId }) }))
      if (late.status !== 201) return `late response: ${JSON.stringify(late.body)}`
      const surface = late.body as ATIRequestSurface
      if (surface.filing.stage !== 'CLOSED') return `stage ${surface.filing.stage}`
      if (surface.filing.statusLabel !== 'Closed') return `status "${surface.filing.statusLabel}"`
      const lateEntry = surface.timeline.find((entry) => entry.afterClosure === true)
      if (!lateEntry) return 'the late response is not marked as after closure'
      if (!/after closure/i.test(lateEntry.label)) return `label "${lateEntry.label}"`
      const lateResponse = surface.responses[surface.responses.length - 1]
      if (!/stays closed/i.test(String(lateResponse.afterClosureNote)))
        return `note "${String(lateResponse.afterClosureNote)}"`

      // Nothing else is unlocked, and the surface says why in words.
      for (const id of ['REVISE', 'EXPORT', 'CONFIRM_SUBMISSION', 'ACKNOWLEDGE', 'CLOSE'] as const) {
        const action = surface.actions.find((item) => item.id === id)!
        if (action.available) return `${id} is still offered on a closed request`
        if (action.unavailableReason === undefined) return `${id} is disabled with no reason given`
      }
      const rejected = await call('POST exports after close', exportRevision(post(
        `${BASE}/requests/${requestId}/exports`, { revision: 1 }),
      { params: params({ id: INV, requestId }) }))
      return rejected.status === 409 ? null : `export after close returned ${rejected.status}`
    })

    // -- what the action record does not say --------------------------------
    await check('23/24/25/26 · no action changed a gap; only the new version did', async () => {
      // The whole lifecycle above ran: filed, acknowledged, answered, closed.
      for (const [gapId, status] of gapStatusBefore) {
        const atV2 = (await readSnapshot(db, INV, 2)).gaps.find((gap) => gap.id === gapId)!
        if (atV2.status !== status) return `${gapId} changed at v2`
      }
      // v3 is where a gap may differ, because the research graph changed.
      const v3 = await readSnapshot(db, INV, 3)
      if (v3.version!.trigger !== 'ATI_RESPONSE_RECEIVED')
        return `v3 trigger ${v3.version!.trigger}`
      // And the surface says so rather than claiming the request did it.
      const surface = (await call('GET request note',
        readRequest(get(`${BASE}/requests/${requestId}`),
          { params: params({ id: INV, requestId }) }))).body as ATIRequestSurface
      return /only a newly researched version/i.test(surface.gapStatusNote)
        ? null : `note "${surface.gapStatusNote}"`
    })

    await check('27/28/29 · v2 is byte-identical and the exact exported revision survives edits', async () => {
      if (JSON.stringify(await readSnapshot(db, INV, 1)) !== v1Before) return 'v1 changed'
      if (JSON.stringify(await readSnapshot(db, INV, 2)) !== v2Before) return 'v2 changed'
      const surface = (await call('GET request history',
        readRequest(get(`${BASE}/requests/${requestId}`),
          { params: params({ id: INV, requestId }) }))).body as ATIRequestSurface
      // Revision 2 was exported; the history still names it exactly.
      const exported = surface.timeline.find((entry) => entry.kind === 'EXPORT')!
      if (!/revision 2/i.test(exported.label)) return `export label "${exported.label}"`
      for (const kind of ['REVISION', 'EXPORT', 'SUBMISSION', 'ACKNOWLEDGEMENT',
        'RESPONSE', 'CLOSURE'] as const) {
        if (!surface.timeline.some((entry) => entry.kind === kind))
          return `${kind} is missing from the history`
      }
      return surface.request.revisions.length === 2
        ? null : `revisions ${JSON.stringify(surface.request.revisions)}`
    })

    // -- what no route exposes ---------------------------------------------
    await check('30/31 · no route accepts a Source id, a version commit or an audit row', async () => {
      const files = [
        'requests/route.ts', 'requests/[requestId]/route.ts',
        'requests/[requestId]/revisions/route.ts', 'requests/[requestId]/exports/route.ts',
        'requests/[requestId]/submission/route.ts',
        'requests/[requestId]/acknowledgements/route.ts',
        'requests/[requestId]/closure/route.ts', 'requests/[requestId]/responses/route.ts',
        'intakes/[intakeId]/processing/route.ts',
      ]
      const sources = files.map((file) => stripComments(readFileSync(new URL(
        `../../../app/api/investigations/[id]/ati/${file}`, import.meta.url), 'utf8')))
      const transport = stripComments(readFileSync(
        new URL('./ati-routes.ts', import.meta.url), 'utf8'))
      for (const forbidden of ['acceptIntakeSource', 'commitNextVersion',
        'claim_reevaluation_audit', 'recordExport(', 'recordResponse(db',
        'insertSnapshotRows']) {
        if (transport.includes(forbidden)) return `the transport references ${forbidden}`
        if (sources.some((source) => source.includes(forbidden)))
          return `a route references ${forbidden}`
      }
      // And a caller cannot smuggle a source id into any write body.
      if (/requiredString\(body, 'sourceId'\)|body\.sourceId/.test(transport))
        return 'a route reads a sourceId from the caller'
      return null
    })

    await check('32 · no public immutable version payload carries ATI lifecycle state', async () => {
      const { loadPublicVersionProjection } = await import('@/lib/xray/publication/public-view')
      const projection = JSON.stringify(await loadPublicVersionProjection(INV, 3))
      for (const leak of ['ati_', 'ATI_RESPONSE', requestId, intakeId,
        'holdingInstitution', 'custodyBasis', 'receiptLabel']) {
        if (projection.includes(leak)) return `the public v3 projection carries ${leak}`
      }
      // The explorer, which is dynamic, is where action state lives.
      const page = readFileSync(new URL(
        '../../../app/investigations/[id]/page.tsx', import.meta.url), 'utf8')
      if (!page.includes('getAtiActionSurfaces')) return 'the explorer does not load action state'
      const publicRoute = stripComments(readFileSync(new URL(
        '../../../app/xray/[slug]/[version]/route.ts', import.meta.url), 'utf8'))
      // Precise tokens, not /ati/i — "investigation" contains those letters.
      const atiToken = /\bATI\b|\bati_|\batiRequest|AtiRequest|ati-service|ati-routes|ati-surface/
      return atiToken.test(publicRoute)
        ? 'the public version route references ATI state' : null
    })

    // -- wording -----------------------------------------------------------
    await check('33/35/36/37 · the rendered copy carries none of the forbidden implications', async () => {
      const surfaces = await readAtiActionSurfaces(db, INV)
      if (surfaces.length < 2) return `${surfaces.length} surface(s) to inspect`
      const copy = [
        ...rendered.map((entry) => entry.text),
        JSON.stringify(surfaces),
      ].join('\n')
      /*
       * Scanned sentence by sentence, and a sentence that DENIES a forbidden
       * implication is the policy working rather than a violation — the whole
       * point of `gapStatusNote` is to say "this says nothing about whether the
       * gap is resolved", which contains the phrase it exists to refuse.
       *
       * So a match is a failure unless its own sentence negates it. That is
       * weaker than forbidding the phrase outright and stronger than not
       * checking: an affirmative claim has nowhere to hide, and a denial is
       * allowed to use the words it denies.
       */
      const DENIAL = /\bnot\b|\bnothing\b|\bnever\b|\bcannot\b|\bno\b|≠|does not|says nothing/i
      const sentences = copy.split(/(?<=[.!?])\s+|\\n|"\s*,\s*"/)
      for (const { implication, patterns } of FORBIDDEN) {
        for (const pattern of patterns) {
          for (const sentence of sentences) {
            const hit = pattern.exec(sentence)
            if (!hit) continue
            if (DENIAL.test(sentence)) continue
            return `"${hit[0]}" implies ${implication} — in: ${sentence.slice(0, 120)}`
          }
        }
      }
      // And the positive claims the surface must make.
      const first = surfaces[0]
      if (!/does not file/i.test(first.filing.notFiledNotice))
        return 'no surface states that X-Ray does not file requests'
      return /says nothing about whether the gap is resolved/i.test(first.gapStatusNote)
        ? null : 'no surface separates the action record from the gap'
    })

    // -- the surface the page renders --------------------------------------
    await check('38 · the explorer loads the same surfaces the routes serve', async () => {
      const surfaces = await readAtiActionSurfaces(db, INV)
      const viaRoute = (await call('GET requests for gap', listRequests(
        get(`${BASE}/requests?version=2&gapId=${eligible.id}`),
        { params: params({ id: INV }) }))).body.requests as ATIRequestSurface[]
      if (viaRoute.length === 0) return 'the list route returned nothing'
      const fromReader = new Map(surfaces.map((surface) => [surface.requestId, surface]))
      for (const served of viaRoute) {
        const loaded = fromReader.get(served.requestId)
        if (!loaded) return `${served.requestId} is served but not loaded by the page`
        if (JSON.stringify(loaded) !== JSON.stringify(served))
          return `${served.requestId} differs between the route and the page loader`
      }
      // A request under another investigation is not found, not forbidden.
      const foreign = await call('GET foreign request', readRequest(
        get(`${BASE}/requests/${requestId}`),
        { params: params({ id: 'XRAY-SOMEONE-ELSE', requestId }) }))
      return foreign.status === 404 ? null : `foreign read returned ${foreign.status}`
    })

    await check('a11y · the ATI controls are labelled, reachable and not colour-only', async () => {
      const panel = readFileSync(new URL(
        '../../../components/investigations/ati-request-panel.tsx', import.meta.url), 'utf8')
      if (!/aria-labelledby=/.test(panel)) return 'the panel section has no accessible name'
      if (!/<button\b/.test(panel)) return 'the actions are not buttons'
      // Native buttons, so keyboard-reachable; no div-with-onClick anywhere.
      if (/<div[^>]*onClick/.test(panel)) return 'a div is used as a control'
      if (!/aria-disabled=/.test(panel)) return 'disabled state is not exposed to assistive tech'
      if (!/aria-describedby=/.test(panel))
        return 'an unavailable action does not reference its reason'
      // Status is a word, not a colour: every state label is rendered as text.
      if (!panel.includes('{filing.statusLabel}')) return 'the filing state is not rendered as text'
      if (!panel.includes('{holder.label}')) return 'custody basis is not rendered as text'
      if (!panel.includes('{action.unavailableReason}'))
        return 'the reason an action is unavailable is not rendered'
      // The component authors no prose of its own.
      const prose = stripComments(panel)
        .match(/>\s*[A-Z][a-z]+(?:\s+[a-z]{3,})+[^<>{}]*</g) ?? []
      const allowed = ['Information request', 'Records requested', 'What has happened',
        'Responses', 'Research outcome', 'Actions']
      const authored = prose
        .map((match) => match.replace(/^>\s*|\s*<$/g, '').trim())
        .filter((text) => text.length > 0 && !allowed.includes(text))
      return authored.length === 0
        ? null : `the component authors copy: ${JSON.stringify(authored.slice(0, 3))}`
    })
  } finally {
    setDatabaseProvider(null)
    setExecutionRuntimeProvider(null)
    await db.close()
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} ATI surface checks passed`)
  if (failed > 0) process.exitCode = 1
}
