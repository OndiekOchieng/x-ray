/**
 * Public route, tombstone and cache checks (#9 slice 9d).
 *
 * The critical proof is the lifecycle one: publish, serve, withdraw, and the
 * **next** request is a tombstone — with no invalidation call anywhere.
 *
 * To make that meaningful the harness installs a projection that memoizes
 * **forever** and never expires. That is stricter than `cacheLife('max')`, so
 * if withdrawal still bites immediately, it bites because presentation state
 * was never cached — not because a cache happened to be cold. The memo's hit
 * count is asserted too, so the cache is demonstrably live during the test.
 *
 * Run:  pnpm check:public-routes
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import type { XRayGraphInput } from '@/lib/xray/selectors'
import { setDatabaseProvider } from '@/lib/xray/application/runtime'
import { publishVersion, readSlug, withdrawVersion } from '@/lib/xray/persistence/publication'
import {
  AT, commitFurtherVersion, linkVersion, migrate, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import { deterministicSlug } from '@/lib/xray/persistence/publication'
import {
  loadAssuranceDisclosure, loadPublicVersionProjection, loadVersionGraph,
  type AssuranceDisclosure, type PublicVersionView,
} from './public-view'
import { setPublicProjections } from './public-page'

import { GET as aliasRoute } from '@/app/xray/[slug]/route'
import { GET as versionRoute } from '@/app/xray/[slug]/[version]/route'

const P1 = 'principal:editor-1'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

interface Fetched { status: number; body: string; headers: Headers }
const bodies: { route: string; body: string }[] = []

async function alias(slug: string): Promise<Fetched> {
  const res = await aliasRoute(new Request(`http://localhost/xray/${slug}`),
    { params: Promise.resolve({ slug }) })
  const body = await res.text()
  bodies.push({ route: `alias:${slug}`, body })
  return { status: res.status, body, headers: res.headers }
}

async function exact(slug: string, segment: string): Promise<Fetched> {
  const res = await versionRoute(new Request(`http://localhost/xray/${slug}/${segment}`),
    { params: Promise.resolve({ slug, version: segment }) })
  const body = await res.text()
  bodies.push({ route: `exact:${slug}/${segment}`, body })
  return { status: res.status, body, headers: res.headers }
}

/** A projection that caches forever — stricter than the real cacheLife('max'). */
function permanentMemo() {
  const graphs = new Map<string, Promise<XRayGraphInput>>()
  const views = new Map<string, Promise<PublicVersionView>>()
  const assurances = new Map<string, Promise<AssuranceDisclosure>>()
  const state = {
    hits: 0,
    misses: 0,
    install() {
      setPublicProjections({
        versionGraph(id, v) {
          const key = `${id}|${v}`
          const held = graphs.get(key)
          if (held) { state.hits += 1; return held }
          state.misses += 1
          const fresh = loadVersionGraph(id, v)
          graphs.set(key, fresh)
          return fresh
        },
        versionProjection(id, v) {
          const key = `${id}|${v}`
          const held = views.get(key)
          if (held) { state.hits += 1; return held }
          state.misses += 1
          const fresh = loadPublicVersionProjection(id, v)
          views.set(key, fresh)
          return fresh
        },
        assurance(runId, index) {
          const key = `${runId}|${index}`
          const held = assurances.get(key)
          if (held) { state.hits += 1; return held }
          state.misses += 1
          const fresh = loadAssuranceDisclosure(runId, index)
          assurances.set(key, fresh)
          return fresh
        },
      })
    },
    reset() { state.hits = 0; state.misses = 0 },
  }
  return state
}

const source = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8')

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  const memo = permanentMemo()
  try {
    await migrate(db)
    setDatabaseProvider(async () => db)
    memo.install()

    // A published lineage: v1 and v2 linked, v3 committed and never published.
    const LIVE = 'XRAY-ROUTE-LIVE'
    const live = await seedLineage(db, LIVE, 'RUN-RLIVE')
    await linkVersion(db, LIVE, 1, 'RUN-RLIVE-V1', live.v1, live.assessment)
    await commitFurtherVersion(db, LIVE, 'RUN-RLIVE-V3', live.candidate, 3)
    await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
    const slug = (await readSlug(db, LIVE))!

    // A committed lineage that was never published.
    const DRAFT = 'XRAY-ROUTE-DRAFT'
    const draft = await seedLineage(db, DRAFT, 'RUN-RDRAFT')
    const draftSlug = deterministicSlug(DRAFT, draft.candidate.sources.find(
      (s) => s.id === draft.candidate.investigation.surfaceSourceId)!.title)

    // -- 1/2: not-found with no draft hint -------------------------------------
    await check('1 · unknown alias is not-found with no draft hint', async () => {
      const res = await alias('no-such-slug-0000000000')
      if (res.status !== 404) return `status ${res.status}`
      return /draft|investigation|version|XRAY-/i.test(res.body) ? 'the body hints at state' : null
    })

    await check('2 · the draft lineage at its real would-be slug behaves identically', async () => {
      const unknown = await alias('no-such-slug-0000000000')
      const draftRes = await alias(draftSlug)
      if (draftRes.status !== 404) return `status ${draftRes.status}`
      if (draftRes.body !== unknown.body) return 'the draft response differs from an unknown one'
      const exactRes = await exact(draftSlug, 'v2')
      return exactRes.status === 404 ? null : `exact gave ${exactRes.status}`
    })

    // -- 3/4: alias redirect ----------------------------------------------------
    await check('3 · a published alias temporarily redirects to the exact version', async () => {
      const res = await alias(slug)
      if (res.status !== 307) return `status ${res.status}`
      const location = res.headers.get('location')
      return location === `/xray/${slug}/v2` ? null : `location ${location}`
    })

    await check('4 · the redirect target ignores a newer committed but unpublished version', async () => {
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [LIVE])).rows[0] as { v: number }
      if (pointer.v !== 3) return `no newer committed version exists (pointer ${pointer.v})`
      const res = await alias(slug)
      return res.headers.get('location') === `/xray/${slug}/v2`
        ? null : `redirected to ${res.headers.get('location')}`
    })

    // -- 5/6: exact version -----------------------------------------------------
    await check('5 · an exact published version renders at 200', async () => {
      const res = await exact(slug, 'v2')
      if (res.status !== 200) return `status ${res.status}`
      if (!res.body.includes('Published X-Ray')) return 'the page did not render'
      return res.headers.get('content-type')?.startsWith('text/html')
        ? null : `content-type ${res.headers.get('content-type')}`
    })

    await check('6 · an exact never-published version is not-found', async () => {
      const three = await exact(slug, 'v3')
      if (three.status !== 404) return `v3 gave ${three.status}`
      const one = await exact(slug, 'v1')
      if (one.status !== 404) return `v1 gave ${one.status}`
      const nonsense = await exact(slug, 'version-two')
      return nonsense.status === 404 ? null : `malformed segment gave ${nonsense.status}`
    })

    // -- 19/20/21: the cache-correctness lifecycle --------------------------------
    await check('19 · withdrawal shows on the very next request, with no invalidation', async () => {
      memo.reset()
      const before = await exact(slug, 'v2')
      if (before.status !== 200) return `before: ${before.status}`

      await withdrawVersion(db, { investigationId: LIVE, version: 2, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })

      // No invalidation call of any kind between these two requests.
      const after = await exact(slug, 'v2')
      if (after.status !== 410) return `after: ${after.status}`
      if (memo.hits === 0) return 'the projection cache was never hit, so it proves nothing'
      return after.body.includes('Removed under compulsion')
        ? null : 'the tombstone did not render'
    })

    await check('21 · the alias changes on the next request too, with no invalidation', async () => {
      const withdrawn = await alias(slug)
      if (withdrawn.status !== 410) return `withdrawn alias gave ${withdrawn.status}`
      if (withdrawn.headers.get('location') !== null) return 'the withdrawn alias redirected'
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      const republished = await alias(slug)
      return republished.status === 307 && republished.headers.get('location') === `/xray/${slug}/v2`
        ? null : `republished alias gave ${republished.status}`
    })

    await check('20 · republication serves the same immutable projection again', async () => {
      memo.reset()
      const res = await exact(slug, 'v2')
      if (res.status !== 200) return `status ${res.status}`
      if (memo.misses > 0) return 'the projection was recomputed rather than reused'
      if (memo.hits === 0) return 'the cache was not consulted'
      return res.body.includes('Published X-Ray') ? null : 'the page did not render'
    })

    // -- 7/8/9: withdrawal addressing ----------------------------------------------
    await check('9 · a withdrawn historical version is 410 while the alias still redirects', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      await withdrawVersion(db, { investigationId: LIVE, version: 1, principalId: P1,
        occurredAt: AT, reason: 'OUT_OF_SCOPE' })
      const historical = await exact(slug, 'v1')
      if (historical.status !== 410) return `v1 gave ${historical.status}`
      const current = await alias(slug)
      return current.status === 307 && current.headers.get('location') === `/xray/${slug}/v2`
        ? null : `alias gave ${current.status}`
    })

    await check('13 · OUT_OF_SCOPE says what it means and nothing more', async () => {
      const res = await exact(slug, 'v1')
      if (!res.body.includes('Outside X-Ray')) return 'the reason copy is missing'
      if (/error|wrong|incorrect|retract/i.test(res.body.replace(/Retracted by X-Ray/g, '')))
        return 'out-of-scope copy implies an evidentiary error'
      return null
    })

    // -- 10/11/12: reason-specific tombstones ----------------------------------------
    const cases: [string, 'ERRONEOUS' | 'PRIVACY_HARM', string, string | undefined][] = [
      ['12 · PRIVACY_HARM exposes no withdrawn graph content', 'PRIVACY_HARM',
        'XRAY-ROUTE-HARM', undefined],
      ['10 · ERRONEOUS includes the recorded correction note', 'ERRONEOUS',
        'XRAY-ROUTE-ERR', 'The lot 3 award figure conflated two contracts.'],
    ]
    for (const [name, reason, id, note] of cases) {
      await check(name, async () => {
        const seeded = await seedLineage(db, id, `RUN-${id}`)
        void seeded
        await publishVersion(db, { investigationId: id, version: 2, principalId: P1, occurredAt: AT })
        const s = (await readSlug(db, id))!
        const before = await exact(s, 'v2')
        if (before.status !== 200) return `publish gave ${before.status}`
        await withdrawVersion(db, { investigationId: id, version: 2, principalId: P1,
          occurredAt: AT, reason, ...(note === undefined ? {} : { note }) })
        const after = await exact(s, 'v2')
        if (after.status !== 410) return `withdrawn gave ${after.status}`
        if (/Claims examined|Published X-Ray/.test(after.body)) return 'withdrawn content re-served'
        if (note !== undefined && !after.body.includes('conflated two contracts'))
          return 'the correction note is missing'
        return null
      })
    }

    await check('11 · COMPELLED does not imply an evidentiary error', async () => {
      const id = 'XRAY-ROUTE-COMPELLED'
      await seedLineage(db, id, `RUN-${id}`)
      await publishVersion(db, { investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      const s = (await readSlug(db, id))!
      await withdrawVersion(db, { investigationId: id, version: 2, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })
      const res = await exact(s, 'v2')
      if (res.status !== 410) return `status ${res.status}`
      if (!res.body.includes('is not conceding one')) return 'the non-concession is missing'
      if (/censor|suppress|silenc|cover.?up/i.test(res.body)) return 'the copy insinuates suppression'
      return /Claims examined/.test(res.body) ? 'withdrawn content re-served' : null
    })

    await check('7/8 · a withdrawn exact version is 410 and a withdrawn head renders at the alias', async () => {
      const id = 'XRAY-ROUTE-HEAD'
      await seedLineage(db, id, `RUN-${id}`)
      await publishVersion(db, { investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      const s = (await readSlug(db, id))!
      await withdrawVersion(db, { investigationId: id, version: 2, principalId: P1,
        occurredAt: AT, reason: 'ERRONEOUS', note: 'A figure was misattributed.' })
      const exactRes = await exact(s, 'v2')
      const aliasRes = await alias(s)
      if (exactRes.status !== 410) return `exact gave ${exactRes.status}`
      if (aliasRes.status !== 410) return `alias gave ${aliasRes.status}`
      return aliasRes.headers.get('location') === null ? null : 'the withdrawn alias redirected'
    })

    // -- 15/16: assurance disclosure ---------------------------------------------------
    await check('15 · an eligible BLOCKED page exposes its capability blockers', async () => {
      const res = await exact(slug, 'v2')
      if (res.status !== 200) return `status ${res.status}`
      if (!res.body.includes('Checks that could not be run')) return 'no disclosure section'
      if (!res.body.includes('data-testid="assurance-disclosure"')) return 'the section is unmarked'
      return /passed every check|less assurance/.test(res.body)
        ? null : 'BLOCKED is presented without qualification'
    })

    await check('16 · the disclosure comes from the persisted graduation record', async () => {
      const recorded = (await db.query(
        `SELECT result FROM run_graduations WHERE execution_run_id='RUN-RLIVE' AND assessment_index=0`)).rows[0]
      const titles = (JSON.parse(JSON.stringify(recorded)).result as { value?: unknown })
      void titles
      const fromRecord = await loadAssuranceDisclosure('RUN-RLIVE', 0)
      if (fromRecord.verdict !== 'BLOCKED') return `recorded verdict ${fromRecord.verdict}`
      if (fromRecord.unavailableChecks.length === 0) return 'no blockers recorded'
      const res = await exact(slug, 'v2')
      const missing = fromRecord.unavailableChecks.filter((t) => !res.body.includes(t))
      if (missing.length) return `${missing.length} recorded blocker(s) not rendered`
      // Nothing is copied into publication state.
      const eventColumns = (await db.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_name='publication_events' AND column_name LIKE '%blocker%'`)).rows[0] as { n: number }
      return eventColumns.n === 0 ? null : 'blockers were copied into publication state'
    })

    await check('16 · a later appended assessment cannot displace the authorizing one', async () => {
      // 9b binds publication to an exact (run, index) pair. Appending a further
      // assessment must not change what an already-published version discloses:
      // the reader is entitled to the assessment that actually authorized it.
      const authorizing = await loadAssuranceDisclosure('RUN-RLIVE', 0)
      if (authorizing.unavailableChecks.length === 0) return 'assessment 0 records no blockers'

      // Append assessment 1 to the same run, carrying no blockers.
      await db.query(
        `INSERT INTO run_graduations(execution_run_id,assessment_index,investigation_id,verdict,
           graph_fingerprint,candidate_digest,assessed_at,result)
         SELECT execution_run_id,1,investigation_id,'PASS',graph_fingerprint,candidate_digest,
                assessed_at, jsonb_set(result, '{value,blockers}', '[]'::jsonb)
           FROM run_graduations WHERE execution_run_id='RUN-RLIVE' AND assessment_index=0`)

      const exactRow = await loadAssuranceDisclosure('RUN-RLIVE', 0)
      if (exactRow.unavailableChecks.length !== authorizing.unavailableChecks.length)
        return `the later assessment displaced the authorizing one (${exactRow.unavailableChecks.length} blockers)`
      const res = await exact(slug, 'v2')
      const missing = authorizing.unavailableChecks.filter((title) => !res.body.includes(title))
      return missing.length === 0
        ? null : `${missing.length} authorizing blocker(s) vanished from the page`
    })

    await check('16 · a missing authorizing assessment is a failure, not invented assurance', async () => {
      const outcome = await loadAssuranceDisclosure('RUN-RLIVE', 99)
        .then((r) => ({ r }), (e: unknown) => ({ e }))
      if ('r' in outcome)
        return `an absent assessment produced ${JSON.stringify(outcome.r)} instead of failing`
      return /RUN-RLIVE|assessment/i.test((outcome.e as Error).message)
        ? null : `failed with ${(outcome.e as Error).message}`
    })

    // -- 17/18: cache contents and key ---------------------------------------------------
    await check('17 · the cached projection contains no presentation state', async () => {
      const view = await loadPublicVersionProjection(LIVE, 2)
      const text = JSON.stringify(view)
      // Field names, not prose. The canonical claim text legitimately contains
      // "principal" — "the principal/main road corridor" — and matching it
      // would repeat the 9c false positive rather than test anything.
      const fieldNames = [...text.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)":/g)].map((m) => m[1])
      for (const [pattern, what] of [
        [/^(presentationState|state|withdrawal\w*|publication\w*)$/i, 'presentation state'],
        [/^slug$/i, 'an alias target'],
        [/latestCommitted/i, 'a latest-version pointer'],
        [/principal/i, 'a principal'],
        [/^library|featured$/i, 'library membership'],
      ] as const) {
        const hit = fieldNames.find((name) => pattern.test(name))
        if (hit) return `the projection carries ${what} (field "${hit}")`
      }
      // Values that could only come from publication state.
      for (const [pattern, what] of [
        [/"(WITHDRAWN|NOT_PUBLIC)"/, 'a presentation verdict'],
        [/principal:/i, 'a principal handle'],
      ] as const) if (pattern.test(text)) return `the projection carries ${what}`
      // And the wrappers declare the intended lifetime.
      const wrapper = source('./version-cache.ts')
      if (!wrapper.includes("'use cache'")) return "the wrappers do not declare 'use cache'"
      return wrapper.includes("cacheLife('max')") ? null : "the wrappers do not declare cacheLife('max')"
    })

    await check('18 · the projection is keyed by exact investigation and version', async () => {
      await seedLineage(db, 'XRAY-ROUTE-KEYED', 'RUN-KEYED')
      const { versionProjection } = (await import('./public-page')).installedProjections()

      // Two lineages built from the same corpus project identically by content
      // — the projection deliberately carries no investigation id — so content
      // equality proves nothing. What must hold is that the *key* separates
      // them: a new (investigation, version) pair misses, a repeat hits.
      memo.reset()
      await versionProjection(LIVE, 2)
      if (memo.hits !== 1 && memo.misses !== 1) return 'the first lookup was neither hit nor miss'
      memo.reset()
      await versionProjection('XRAY-ROUTE-KEYED', 2)
      if (memo.misses !== 1) return 'a different investigation reused the cached entry'
      memo.reset()
      await versionProjection(LIVE, 1)
      if (memo.misses !== 1) return 'a different version reused the cached entry'
      memo.reset()
      await versionProjection(LIVE, 1)
      if (memo.hits !== 1) return 'the same key did not reuse its entry'

      const v1 = await loadPublicVersionProjection(LIVE, 1)
      const v2 = await loadPublicVersionProjection(LIVE, 2)
      return v1.version === 1 && v2.version === 2 ? null : 'versions are not distinguished'
    })

    // -- 22/23/24: redirect, citation and context -----------------------------------------
    await check('22 · the alias redirect is temporary, never permanent', async () => {
      const res = await alias(slug)
      if (res.status === 308 || res.status === 301) return `permanent redirect (${res.status})`
      if (res.status !== 307) return `status ${res.status}`
      // Comment-stripped: the route's own doc comment says "307, never 308",
      // and matching a file's explanation of a rule tests nothing.
      const code = source('../../../app/xray/[slug]/route.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return /\b(301|308)\b/.test(code) ? 'a permanent status appears in the route' : null
    })

    await check('23 · the canonical link points at the version URL, not the alias', async () => {
      const res = await exact(slug, 'v2')
      if (!res.body.includes(`data-testid="canonical-link"`)) return 'no canonical link'
      if (!res.body.includes(`href="/xray/${slug}/v2"`)) return 'the canonical link is not the version URL'
      return res.body.includes(`href="/xray/${slug}"`) ? 'the alias is offered as canonical' : null
    })

    await check('24 · research cutoff, protocol version and version context are visible', async () => {
      const res = await exact(slug, 'v2')
      const view = await loadPublicVersionProjection(LIVE, 2)
      if (!res.body.includes(`v${view.version}`)) return 'no version context'
      if (!res.body.includes(view.protocolVersion)) return 'no protocol version'
      return view.researchCutoffAt && res.body.includes(view.researchCutoffAt)
        ? null : 'no research cutoff'
    })

    await check('25 · publishing a newer version does not alter the rendered older one', async () => {
      const beforeBody = (await exact(slug, 'v2')).body
      await publishVersion(db, { investigationId: LIVE, version: 3, principalId: P1, occurredAt: AT })
      const afterBody = (await exact(slug, 'v2')).body
      if (beforeBody !== afterBody) return 'v2 changed when v3 published'
      const v3 = await exact(slug, 'v3')
      if (v3.status !== 200) return `v3 gave ${v3.status}`
      return (await alias(slug)).headers.get('location') === `/xray/${slug}/v3`
        ? null : 'the alias did not follow the new publication'
    })

    // -- 26: outage ---------------------------------------------------------------------
    await check('26 · a storage failure is a generic failure, never not-found', async () => {
      setDatabaseProvider(async () => ({
        query: async () => { throw new Error('connection terminated: host=10.0.0.4 password=hunter2') },
      }))
      try {
        const res = await alias(slug)
        if (res.status === 404) return 'an outage became not-found'
        if (res.status < 500) return `status ${res.status}`
        return /hunter2|10\.0\.0\.4|connection terminated/.test(res.body)
          ? 'the internal message reached the caller' : null
      } finally { setDatabaseProvider(async () => db) }
    })

    // -- 27/28/29: boundaries ------------------------------------------------------------
    await check('27 · the internal explorer route is unchanged apart from its address', async () => {
      const page = source('../../../app/investigations/[id]/page.tsx')
      if (!page.includes('getExplorerPayload')) return 'the loader seam changed'
      if (!page.includes('notFound()')) return 'the not-found behaviour changed'
      const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return /publication|slug|PublicResolver|WITHDRAWN/.test(code)
        ? 'the internal route gained publication semantics' : null
    })

    await check('28 · no public route reaches a fixture or benchmark fallback', async () => {
      for (const file of ['../../../app/xray/[slug]/route.ts',
        '../../../app/xray/[slug]/[version]/route.ts', './public-page.ts', './public-view.ts',
        './public-html.ts', './version-cache.ts']) {
        const code = source(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
        if (/fixtures\/|createXrayKe001Graph|BENCHMARK|getInvestigationGraph/.test(code))
          return `${file} reaches a fixture or the #8 resolver`
      }
      return null
    })

    await check('29 · no public response declares itself permanently immutable', async () => {
      const responses = [await alias(slug), await exact(slug, 'v2'), await exact(slug, 'v1'),
        await alias('no-such-slug-0000000000')]
      for (const res of responses) {
        const control = res.headers.get('cache-control') ?? ''
        if (/immutable|max-age=\d{6,}|s-maxage=\d{6,}/.test(control))
          return `a response declared ${control}`
      }
      return responses.every((r) => (r.headers.get('cache-control') ?? '').includes('no-store'))
        ? null : 'a response omitted a freshness directive'
    })

    // -- 14: principal ---------------------------------------------------------------------
    await check('14 · no public payload contains a raw principal id', async () => {
      for (const { route, body } of bodies) {
        if (body.includes(P1)) return `${route} carries a principal id`
        if (/principal:/i.test(body)) return `${route} carries a principal handle`
      }
      const rendered = source('./public-html.ts')
      return /principalId/.test(rendered) ? 'the public document reads a principal id' : null
    })

    await check('K · no public payload leaks SQL, stacks, prompts or internal ids', async () => {
      const forbidden: [RegExp, string][] = [
        [/\b(SELECT|INSERT INTO|UPDATE |DELETE FROM)\b/i, 'SQL'],
        [/\b(at ModuleJob|node:internal|\.ts:\d+:\d+)\b/, 'a stack trace'],
        [/systemPrompt|promptTemplate/, 'a prompt'],
        [/XRAY-ROUTE-|RUN-RLIVE|execution_run/i, 'an internal id'],
        [/pk_[0-9a-f]{8}_/, 'a correlation key'],
      ]
      const hits: string[] = []
      for (const { route, body } of bodies)
        for (const [pattern, what] of forbidden)
          if (pattern.test(body)) hits.push(`${route}: ${what}`)
      return hits.length ? [...new Set(hits)].join('; ') : null
    })

    // -- Report ------------------------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray public routes and projection cache — 9d\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log(`\n${bodies.length} public responses inspected. The projection cache was a`
      + `\npermanent memo throughout: withdrawal still took effect on the next request.\n`)
    if (failed.length) process.exitCode = 1
  } finally {
    setPublicProjections(null)
    setDatabaseProvider(null)
    await db.close()
  }
}
