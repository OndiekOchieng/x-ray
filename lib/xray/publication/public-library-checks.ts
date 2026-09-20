/**
 * Public library, metadata search and the integrated #9 lifecycle (slice 9e).
 *
 * The central rule is an ordering one: **publication membership first, graph
 * projection second.** Drafts, withdrawn heads and unpublished versions must
 * cause zero canonical reads, which is asserted by counting them rather than
 * by inspecting the result.
 *
 * Run:  pnpm check:public-library
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import type { XRayGraphInput } from '@/lib/xray/selectors'
import { setDatabaseProvider } from '@/lib/xray/application/runtime'
import {
  deterministicSlug, publishVersion, readSlug, withdrawVersion,
} from '@/lib/xray/persistence/publication'
import {
  AT, commitFurtherVersion, linkVersion, migrate, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import {
  loadAssuranceDisclosure, loadPublicVersionProjection, loadVersionGraph,
  projectPublicVersion, type AssuranceDisclosure, type PublicVersionView,
} from './public-view'
import { setPublicProjections } from './public-page'
import { featuredPublication, publishedLibrary } from './public-library'
import { createXRayGraph } from '@/lib/xray/selectors'

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

const alias = async (slug: string) => {
  const res = await aliasRoute(new Request(`http://localhost/xray/${slug}`),
    { params: Promise.resolve({ slug }) })
  return { status: res.status, location: res.headers.get('location'), body: await res.text() }
}
const exact = async (slug: string, segment: string) => {
  const res = await versionRoute(new Request(`http://localhost/xray/${slug}/${segment}`),
    { params: Promise.resolve({ slug, version: segment }) })
  return { status: res.status, body: await res.text() }
}

/** Permanent memo, as in 9d: stricter than cacheLife('max'). */
function permanentMemo() {
  const graphs = new Map<string, Promise<XRayGraphInput>>()
  const views = new Map<string, Promise<PublicVersionView>>()
  const assurances = new Map<string, Promise<AssuranceDisclosure>>()
  const state = {
    hits: 0, misses: 0, reads: 0,
    reset() { state.hits = 0; state.misses = 0; state.reads = 0 },
    install() {
      setPublicProjections({
        versionGraph(id, v) {
          const key = `${id}|${v}`
          state.reads += 1
          const held = graphs.get(key)
          if (held) { state.hits += 1; return held }
          state.misses += 1
          const fresh = loadVersionGraph(id, v); graphs.set(key, fresh); return fresh
        },
        versionProjection(id, v) {
          const key = `${id}|${v}`
          state.reads += 1
          const held = views.get(key)
          if (held) { state.hits += 1; return held }
          state.misses += 1
          const fresh = loadPublicVersionProjection(id, v); views.set(key, fresh); return fresh
        },
        assurance(runId, index) {
          const key = `${runId}|${index}`
          const held = assurances.get(key)
          if (held) { state.hits += 1; return held }
          state.misses += 1
          const fresh = loadAssuranceDisclosure(runId, index)
          assurances.set(key, fresh); return fresh
        },
      })
    },
  }
  return state
}

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  const memo = permanentMemo()
  try {
    await migrate(db)
    setDatabaseProvider(async () => db)
    memo.install()

    // -- 1/2: nothing published, nothing discoverable --------------------------
    await check('1 · a database with no publications yields an empty library', async () => {
      memo.reset()
      const library = await publishedLibrary()
      if (library.length !== 0) return `${library.length} entries`
      return memo.reads === 0 ? null : `${memo.reads} canonical read(s)`
    })

    const DRAFT = 'XRAY-LIB-DRAFT'
    const draft = await seedLineage(db, DRAFT, 'RUN-LDRAFT')
    const draftSlug = deterministicSlug(DRAFT, draft.candidate.sources.find(
      (s) => s.id === draft.candidate.investigation.surfaceSourceId)!.title)

    await check('2/27 · a committed draft contributes nothing and causes zero reads', async () => {
      memo.reset()
      const library = await publishedLibrary()
      if (library.length !== 0) return `${library.length} entries`
      if (memo.reads !== 0) return `${memo.reads} canonical read(s) for a draft`
      const searched = await publishedLibrary({ q: draft.candidate.sources[0].title })
      return searched.length === 0 ? null : 'a draft answered a search'
    })

    await check('22 · the draft deterministic slug produces no search hit', async () => {
      memo.reset()
      const bySlug = await publishedLibrary({ slug: draftSlug })
      if (bySlug.length !== 0) return 'the would-be slug matched'
      return memo.reads === 0 ? null : `${memo.reads} canonical read(s)`
    })

    // -- 3-6: the first publication ---------------------------------------------
    const LIVE = 'XRAY-LIB-LIVE'
    const live = await seedLineage(db, LIVE, 'RUN-LLIVE')
    await linkVersion(db, LIVE, 1, 'RUN-LLIVE-V1', live.v1, live.assessment)
    await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
    const slug = (await readSlug(db, LIVE))!

    await check('3/4 · first publication produces one entry matching the head', async () => {
      const library = await publishedLibrary()
      if (library.length !== 1) return `${library.length} entries`
      const [entry] = library
      if (entry.slug !== slug) return `slug ${entry.slug}`
      return entry.version === 2 ? null : `version ${entry.version}`
    })

    await check('5/6 · card fields and counts come from the exact published projection', async () => {
      const [entry] = await publishedLibrary()
      const view = projectPublicVersion(createXRayGraph(await loadVersionGraph(LIVE, 2)))
      if (entry.title !== view.surface.title) return 'title differs'
      if (entry.surfacePublisher !== view.surface.publisher) return 'publisher differs'
      if (entry.protocolVersion !== view.protocolVersion) return 'protocol differs'
      if (entry.researchCutoffAt !== view.researchCutoffAt) return 'cutoff differs'
      const mismatched = ([
        ['claimCount', entry.claimCount, view.counts.claims],
        ['receiptCount', entry.receiptCount, view.counts.evidence],
        ['sourceCount', entry.sourceCount, view.counts.sources],
        ['openGapCount', entry.openGapCount, view.counts.openGaps],
        ['independentOriginCount', entry.independentOriginCount, view.independentOrigins],
      ] as const).filter(([, a, b]) => a !== b)
      return mismatched.length ? `${mismatched.map(([n]) => n).join(', ')} differ` : null
    })

    // -- 7/8/13: which version a card presents -------------------------------------
    await check('7/L · a newer committed unpublished version does not alter the card', async () => {
      await commitFurtherVersion(db, LIVE, 'RUN-LLIVE-V3', live.candidate, 3)
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [LIVE])).rows[0] as { v: number }
      if (pointer.v !== 3) return `pointer ${pointer.v}`
      const [entry] = await publishedLibrary()
      return entry.version === 2 ? null : `card moved to v${entry.version}`
    })

    await check('8 · publishing the newer version moves the card to it', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 3, principalId: P1, occurredAt: AT })
      const [entry] = await publishedLibrary()
      return entry.version === 3 && entry.citationHref === `/xray/${slug}/v3`
        ? null : `card presents v${entry.version}`
    })

    await check('13 · a deliberate rollback moves the card to the older version', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      const [entry] = await publishedLibrary()
      return entry.version === 2 ? null : `card presents v${entry.version}`
    })

    // -- 9/10/11/12: withdrawal and discovery ----------------------------------------
    await check('9/10 · withdrawing the head removes the card while the URL stays 410', async () => {
      await withdrawVersion(db, { investigationId: LIVE, version: 2, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })
      memo.reset()
      const library = await publishedLibrary()
      if (library.length !== 0) return `${library.length} entries after withdrawal`
      if (memo.reads !== 0) return `${memo.reads} canonical read(s) for a withdrawn head`
      const res = await exact(slug, 'v2')
      return res.status === 410 ? null : `exact URL gave ${res.status}`
    })

    await check('11 · republishing restores the card', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      const library = await publishedLibrary()
      return library.length === 1 && library[0].version === 2
        ? null : `${library.length} entries`
    })

    await check('12 · a historical non-head withdrawal leaves the current card present', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      await withdrawVersion(db, { investigationId: LIVE, version: 1, principalId: P1,
        occurredAt: AT, reason: 'OUT_OF_SCOPE' })
      const library = await publishedLibrary()
      if (library.length !== 1) return `${library.length} entries`
      if (library[0].version !== 2) return `card presents v${library[0].version}`
      return (await exact(slug, 'v1')).status === 410 ? null : 'the withdrawn v1 is not 410'
    })

    // -- 14/15/16: links, benchmark, featured -------------------------------------------
    await check('14 · cards link through the public namespace, never the internal route', async () => {
      const [entry] = await publishedLibrary()
      if (entry.href !== `/xray/${slug}`) return `href ${entry.href}`
      if (entry.citationHref !== `/xray/${slug}/v2`) return `citation ${entry.citationHref}`
      const text = JSON.stringify(entry)
      if (/\/investigations\//.test(text)) return 'a card links to the internal explorer'
      return /XRAY-LIB-LIVE/.test(text) ? 'a card carries an internal id' : null
    })

    await check('15/16 · an unpublished benchmark is absent and cannot be featured', async () => {
      await seedLineage(db, 'XRAY-KE-001', 'RUN-LBENCH')
      const library = await publishedLibrary()
      if (library.some((e) => /mamboleo|kipsitet/i.test(e.slug))) return 'the benchmark appeared'
      const featured = await featuredPublication()
      if (featured === null) return 'nothing is published at all'
      return featured.slug === slug ? null : `featured is ${featured.slug}`
    })

    await check('16 · featured selection reads no benchmark registry', async () => {
      const code = source('./public-library.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return /BENCHMARK|fixtures\/|createXrayKe001Graph/.test(code)
        ? 'the library reaches a fixture' : null
    })

    // -- 17-23: search ---------------------------------------------------------------------
    await check('17 · title matching is case-insensitive and trimmed', async () => {
      const [entry] = await publishedLibrary()
      const word = entry.title.split(/\s+/).find((w) => w.length > 4)!
      const upper = await publishedLibrary({ q: `  ${word.toUpperCase()}  ` })
      const lower = await publishedLibrary({ q: word.toLocaleLowerCase('en') })
      return upper.length === 1 && lower.length === 1 ? null : 'case or whitespace changed the result'
    })

    await check('18 · publisher matching works', async () => {
      const [entry] = await publishedLibrary()
      if (!entry.surfacePublisher) return 'the fixture has no publisher to match'
      const hits = await publishedLibrary({ publisher: entry.surfacePublisher.toUpperCase() })
      const misses = await publishedLibrary({ publisher: 'a publisher that does not exist' })
      return hits.length === 1 && misses.length === 0 ? null : 'publisher filtering is wrong'
    })

    await check('19/20 · exact slug search works and an empty query returns everything', async () => {
      const bySlug = await publishedLibrary({ slug })
      if (bySlug.length !== 1) return `${bySlug.length} for the exact slug`
      const wrong = await publishedLibrary({ slug: 'not-a-slug-0000000000' })
      if (wrong.length !== 0) return 'an unknown slug matched'
      const all = await publishedLibrary({ q: '   ' })
      return all.length === 1 ? null : `${all.length} for an empty query`
    })

    await check('21 · a withdrawn entry produces no search hit', async () => {
      const [entry] = await publishedLibrary()
      const word = entry.title.split(/\s+/).find((w) => w.length > 4)!
      await withdrawVersion(db, { investigationId: LIVE, version: 2, principalId: P1,
        occurredAt: AT, reason: 'PRIVACY_HARM' })
      const hits = await publishedLibrary({ q: word })
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      return hits.length === 0 ? null : 'a withdrawn entry answered a search'
    })

    await check('23 · search never inspects evidence prose', async () => {
      const graph = createXRayGraph(await loadVersionGraph(LIVE, 2))
      const probes = [
        graph.claims[0].text.split(/\s+/).slice(2, 5).join(' '),
        graph.evidence[0].proposition.split(/\s+/).slice(2, 5).join(' '),
        graph.findings[0].rationale.split(/\s+/).slice(4, 7).join(' '),
        graph.gaps[0].missingEvidence.split(/\s+/).slice(1, 4).join(' '),
      ]
      for (const probe of probes) {
        if (probe.trim() === '') continue
        const hits = await publishedLibrary({ q: probe })
        if (hits.length > 0) return `evidence prose matched: "${probe}"`
      }
      // Prose *fields*, not the words. Reading `counts.claims` is required by
      // the card contract; reading `claim.text` would be the leak.
      const code = source('./public-library.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      const prose = /\.(text|proposition|rationale|missingEvidence|whyItMatters|quotedPassage|sourcePassage)\b/
      if (prose.test(code)) return 'the library reads an evidence prose field'
      const query = source('./public-library.ts')
        .slice(source('./public-library.ts').indexOf('export function matchesQuery'))
      return prose.test(query) ? 'search reads evidence prose' : null
    })

    // -- 24/25/26: no stored library state -----------------------------------------------------
    await check('24/25 · no canonical library table or stored display field exists', async () => {
      const tables = (await db.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema='public' AND (table_name LIKE '%librar%' OR table_name LIKE '%search%'
             OR table_name LIKE '%card%' OR table_name LIKE '%featured%')`)).rows[0] as { n: number }
      if (tables.n !== 0) return `${tables.n} discovery table(s) exist`
      // `counter_hypothesis` is a #7 disconfirmation field, not a display
      // count; the earlier `count_%` pattern caught it and proved nothing.
      const columns = (await db.query(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema='public'
            AND (column_name LIKE '%\\_count' OR column_name LIKE '%display%'
                 OR column_name LIKE '%card%')`)).rows as { table_name: string; column_name: string }[]
      return columns.length === 0
        ? null
        : `stored display state: ${columns.map((c) => `${c.table_name}.${c.column_name}`).join(', ')}`
    })

    await check('26 · membership is resolved before any graph read', async () => {
      const order: string[] = []
      setDatabaseProvider(async () => ({
        query: async (sql, params) => {
          if (/publication_events|investigation_slugs/.test(sql)) order.push('membership')
          else if (/FROM claims|FROM evidence|FROM investigation_versions/.test(sql)) order.push('canonical')
          return db.query(sql, params)
        },
      }))
      try {
        memo.reset()
        await publishedLibrary()
        if (order.length === 0) return 'no queries were observed'
        if (order[0] !== 'membership') return `the first query was ${order[0]}`
        const firstCanonical = order.indexOf('canonical')
        return firstCanonical === -1 || order.slice(0, firstCanonical).includes('membership')
          ? null : 'a canonical read preceded membership resolution'
      } finally { setDatabaseProvider(async () => db) }
    })

    // -- 28: outage --------------------------------------------------------------------------
    await check('28 · a storage failure propagates rather than emptying the library', async () => {
      setDatabaseProvider(async () => ({
        query: async () => { throw new Error('connection terminated unexpectedly') },
      }))
      try {
        const outcome = await publishedLibrary().then((r) => ({ r }), (e: unknown) => ({ e }))
        if ('r' in outcome) return `an outage returned ${outcome.r.length} entries`
        return (outcome.e as Error).message === 'connection terminated unexpectedly'
          ? null : `propagated ${(outcome.e as Error).message}`
      } finally { setDatabaseProvider(async () => db) }
    })

    // -- 29/30/31: the integrated lifecycle ----------------------------------------------------
    await check('29/30/31 · the full publish → withdraw → republish lifecycle', async () => {
      const id = 'XRAY-LIB-CYCLE'
      const cycle = await seedLineage(db, id, 'RUN-LCYCLE')
      void cycle
      await publishVersion(db, { investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      const s = (await readSlug(db, id))!
      const present = () => publishedLibrary({ slug: s })

      // published
      const a1 = await alias(s)
      const e1 = await exact(s, 'v2')
      const l1 = await present()
      if (a1.status !== 307 || a1.location !== `/xray/${s}/v2`) return `alias ${a1.status}`
      if (e1.status !== 200) return `exact ${e1.status}`
      if (l1.length !== 1) return 'absent from the library while published'

      // withdrawn — no invalidation call anywhere
      await withdrawVersion(db, { investigationId: id, version: 2, principalId: P1,
        occurredAt: AT, reason: 'ERRONEOUS', note: 'A figure was misattributed.' })
      const a2 = await alias(s)
      const e2 = await exact(s, 'v2')
      const l2 = await present()
      if (a2.status !== 410) return `withdrawn alias ${a2.status}`
      if (e2.status !== 410) return `withdrawn exact ${e2.status}`
      if (l2.length !== 0) return 'still discoverable after withdrawal'

      // republished, reusing the immutable projection
      await publishVersion(db, { investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      memo.reset()
      const a3 = await alias(s)
      const e3 = await exact(s, 'v2')
      const l3 = await present()
      if (a3.status !== 307 || a3.location !== `/xray/${s}/v2`) return `republished alias ${a3.status}`
      if (e3.status !== 200) return `republished exact ${e3.status}`
      if (l3.length !== 1) return 'not discoverable after republication'
      if (memo.misses > 0) return 'the projection was recomputed after republication'
      return memo.hits > 0 ? null : 'the projection cache was not consulted'
    })

    // -- 32/33/34: boundaries ----------------------------------------------------------------
    await check('32/33 · the internal explorer and benchmark path are intact', async () => {
      const page = source('../../../app/investigations/[id]/page.tsx')
      if (!page.includes('getExplorerPayload')) return 'the explorer seam changed'
      const registry = source('../investigations.ts')
      if (!registry.includes('BENCHMARKS')) return 'the benchmark path is gone'
      if (!registry.includes('UNKNOWN_IN_STORAGE')) return '#8 tri-state resolution changed'
      const code = registry.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return /libraryEntryView|getLibraryEntries|getFeaturedInvestigation/.test(code)
        ? 'the old benchmark library source survives' : null
    })

    await check('N · accepted 9b/9c/9d boundaries are untouched by discovery', async () => {
      const library = source('./public-library.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const [pattern, what] of [
        [/getInvestigationGraph/, "#8's resolver"],
        [/latest_committed_version|latestCommittedVersion/, 'the committed-version pointer'],
        [/INSERT |UPDATE |DELETE /, 'a write'],
      ] as const) if (pattern.test(library)) return `the library touches ${what}`
      return null
    })

    // -- Report --------------------------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray public library and lifecycle — 9e\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log('\nDrafts and withdrawn heads caused zero canonical reads. The projection cache'
      + '\nwas a permanent memo throughout: discovery still changed on the next request.\n')
    if (failed.length) process.exitCode = 1
  } finally {
    setPublicProjections(null)
    setDatabaseProvider(null)
    await db.close()
  }
}
