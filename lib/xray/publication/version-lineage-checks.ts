/**
 * Public version lineage checks (#9 slice 9f).
 *
 * The surface exists to answer "what changed, and when" without either leaking
 * drafts or making the citation-grade version document mutable. Both are
 * asserted mechanically: canonical reads are counted, and a v2 document is
 * compared byte-for-byte across the publication of v3.
 *
 * Run:  pnpm check:version-lineage
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import { setDatabaseProvider } from '@/lib/xray/application/runtime'
import {
  deterministicSlug, publishVersion, readSlug, withdrawVersion,
} from '@/lib/xray/persistence/publication'
import {
  AT, commitFurtherVersion, linkVersion, migrate, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import {
  loadVersionChangeSummary, publicLineage, type VersionChangeSummary,
} from './version-lineage'
import { setPublicProjections } from './public-page'
import {
  loadAssuranceDisclosure, loadPublicVersionProjection, loadVersionGraph,
} from './public-view'

import { GET as historyRoute } from '@/app/xray/[slug]/history/route'
import { GET as versionRoute } from '@/app/xray/[slug]/[version]/route'

const P1 = 'principal:editor-1'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const history = async (slug: string) => {
  const res = await historyRoute(new Request(`http://localhost/xray/${slug}/history`),
    { params: Promise.resolve({ slug }) })
  return { status: res.status, body: await res.text() }
}
const exact = async (slug: string, segment: string) => {
  const res = await versionRoute(new Request(`http://localhost/xray/${slug}/${segment}`),
    { params: Promise.resolve({ slug, version: segment }) })
  return { status: res.status, body: await res.text() }
}

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)
    setDatabaseProvider(async () => db)
    // The 9d projection seam, uncached here: lineage must not depend on it.
    setPublicProjections({
      versionGraph: loadVersionGraph,
      versionProjection: loadPublicVersionProjection,
      assurance: loadAssuranceDisclosure,
    })

    /** Count reads of the immutable version-change tables. */
    let changeReads = 0
    const countingReader = async (id: string, v: number): Promise<VersionChangeSummary | undefined> => {
      changeReads += 1
      return loadVersionChangeSummary(id, v)
    }

    const LIVE = 'XRAY-LIN-LIVE'
    const live = await seedLineage(db, LIVE, 'RUN-NLIVE')
    await linkVersion(db, LIVE, 1, 'RUN-NLIVE-V1', live.v1, live.assessment)
    await commitFurtherVersion(db, LIVE, 'RUN-NLIVE-V3', live.candidate, 3)
    await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
    const slug = (await readSlug(db, LIVE))!

    const DRAFT = 'XRAY-LIN-DRAFT'
    const draft = await seedLineage(db, DRAFT, 'RUN-NDRAFT')
    const draftSlug = deterministicSlug(DRAFT, draft.candidate.sources.find(
      (s) => s.id === draft.candidate.investigation.surfaceSourceId)!.title)

    // -- 1/2: non-public addresses --------------------------------------------
    await check('1/2 · unknown and draft slugs answer identically with zero reads', async () => {
      changeReads = 0
      const unknown = await history('no-such-slug-0000000000')
      const draftRes = await history(draftSlug)
      if (unknown.status !== 404) return `unknown gave ${unknown.status}`
      if (draftRes.status !== 404) return `draft gave ${draftRes.status}`
      if (draftRes.body !== unknown.body) return 'the draft answer differs from an unknown one'
      const viaReader = await publicLineage(draftSlug, countingReader)
      if (viaReader !== undefined) return 'a draft produced lineage'
      return changeReads === 0 ? null : `${changeReads} version read(s) for a draft`
    })

    // -- 3/4/18: unpublished versions stay invisible ------------------------------
    await check('3/4/18 · a committed unpublished v3 never appears and costs no read', async () => {
      changeReads = 0
      const lineage = await publicLineage(slug, countingReader)
      if (lineage === undefined) return 'no lineage for a published slug'
      const versions = lineage.entries.map((e) => e.version)
      if (versions.includes(3)) return 'the unpublished v3 appeared'
      if (versions.join() !== '2') return `entries: ${versions.join()}`
      if (changeReads !== 1) return `${changeReads} version reads for one public version`
      const rendered = await history(slug)
      return /v3/.test(rendered.body) ? 'v3 leaked into the page' : null
    })

    // -- 5/6/7: what changed --------------------------------------------------------
    await check('5 · publishing v1 as well lists both with exact public URLs', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      const lineage = (await publicLineage(slug))!
      const versions = [...lineage.entries.map((e) => e.version)].sort()
      if (versions.join() !== '1,2') return `entries: ${versions.join()}`
      const hrefs = lineage.entries.map((e) => e.citationHref).sort()
      return hrefs.join() === `/xray/${slug}/v1,/xray/${slug}/v2`
        ? null : `hrefs: ${hrefs.join()}`
    })

    await check('6 · rows carry trigger and immutable change counts', async () => {
      const lineage = (await publicLineage(slug))!
      const v2 = lineage.entries.find((e) => e.version === 2)!
      const recorded = (await db.query(
        `SELECT v.trigger,
                (SELECT count(*)::int FROM version_added_sources a
                  WHERE a.investigation_id=v.investigation_id AND a.version_number=2) AS s,
                (SELECT count(*)::int FROM version_added_evidence e
                  WHERE e.investigation_id=v.investigation_id AND e.version_number=2) AS ev,
                (SELECT count(*)::int FROM version_reevaluated_claims c
                  WHERE c.investigation_id=v.investigation_id AND c.version_number=2) AS re
           FROM investigation_versions v WHERE v.investigation_id=$1 AND v.version_number=2`,
        [LIVE])).rows[0] as { trigger: string; s: number; ev: number; re: number }
      if (v2.change.trigger !== recorded.trigger) return 'trigger differs'
      if (v2.change.addedSources !== recorded.s) return 'added sources differ'
      if (v2.change.addedEvidence !== recorded.ev) return 'added evidence differs'
      if (v2.change.reEvaluatedClaims !== recorded.re) return 're-evaluated claims differ'
      if (Object.values(v2.change.reEvaluationReasons).every((n) => n === 0))
        return 'no re-evaluation reasons recorded'
      const page = await history(slug)
      return page.body.includes('new source') ? null : 'the page shows no change summary'
    })

    await check('7 · no canonical ids leak through the change summary', async () => {
      const lineage = (await publicLineage(slug))!
      const text = JSON.stringify(lineage)
      const page = (await history(slug)).body
      for (const probe of ['SRC-NEW-2', 'EV-NEW-2', 'C001', 'C002', LIVE, 'RUN-NLIVE']) {
        if (text.includes(probe)) return `the lineage carries ${probe}`
        if (page.includes(probe)) return `the page carries ${probe}`
      }
      return null
    })

    // -- 8/9/10/11: withdrawal in history ---------------------------------------------
    await check('8/9 · a withdrawn historical version stays in history, alias unaffected', async () => {
      await withdrawVersion(db, { investigationId: LIVE, version: 1, principalId: P1,
        occurredAt: AT, reason: 'OUT_OF_SCOPE' })
      const lineage = (await publicLineage(slug))!
      const v1 = lineage.entries.find((e) => e.version === 1)
      if (v1 === undefined) return 'the withdrawn version vanished from history'
      if (v1.state !== 'WITHDRAWN') return `v1 reads ${v1.state}`
      if (lineage.currentVersion !== 2 || lineage.currentState !== 'PUBLISHED')
        return `current is v${lineage.currentVersion}/${lineage.currentState}`
      return (await exact(slug, 'v1')).status === 410 ? null : 'v1 is not 410'
    })

    await check('10/11 · withdrawing the head marks it, and republication restores it', async () => {
      await withdrawVersion(db, { investigationId: LIVE, version: 2, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })
      const withdrawn = (await publicLineage(slug))!
      if (withdrawn.currentVersion !== 2) return 'the head fell back to a predecessor'
      if (withdrawn.currentState !== 'WITHDRAWN') return `head reads ${withdrawn.currentState}`
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      const restored = (await publicLineage(slug))!
      const v2 = restored.entries.find((e) => e.version === 2)!
      return v2.state === 'PUBLISHED' && restored.currentState === 'PUBLISHED'
        ? null : `v2 reads ${v2.state}`
    })

    // -- 12/13: rollback and repeated publication ---------------------------------------
    await check('12 · a deliberate rollback moves the current indicator, not max(version)', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      const lineage = (await publicLineage(slug))!
      if (lineage.currentVersion !== 1) return `current is v${lineage.currentVersion}`
      const page = await history(slug)
      if (!page.body.includes(`/xray/${slug}/v1">v1</a> <strong>· currently presented`))
        return 'the page does not mark v1 as current'
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      return (await publicLineage(slug))!.currentVersion === 2 ? null : 'the head did not move back'
    })

    await check('13 · repeated publication does not fabricate version rows', async () => {
      const before = (await publicLineage(slug))!.entries.length
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      const after = (await publicLineage(slug))!
      if (after.entries.length !== before) return `${after.entries.length} rows, was ${before}`
      const versions = after.entries.map((e) => e.version)
      return new Set(versions).size === versions.length ? null : 'a version appears twice'
    })

    // -- 14/15: the immutability invariant ------------------------------------------------
    await check('14 · the exact version document links to history', async () => {
      const page = await exact(slug, 'v2')
      if (page.status !== 200) return `status ${page.status}`
      if (!page.body.includes(`href="/xray/${slug}/history"`)) return 'no history link'
      return page.body.includes('data-testid="history-link"') ? null : 'the link is unmarked'
    })

    await check('15 · publishing v3 does not change the rendered v2 document', async () => {
      const before = (await exact(slug, 'v2')).body
      await publishVersion(db, { investigationId: LIVE, version: 3, principalId: P1, occurredAt: AT })
      const after = (await exact(slug, 'v2')).body
      if (before !== after) return 'the v2 document changed when v3 published'
      // And history did change, which is the point of separating them.
      const lineage = (await publicLineage(slug))!
      return lineage.entries.some((e) => e.version === 3)
        ? null : 'history did not pick up v3'
    })

    // -- 16/17: freshness and ordering ------------------------------------------------------
    await check('16 · history updates on the next request with no invalidation', async () => {
      const before = (await history(slug)).body
      await withdrawVersion(db, { investigationId: LIVE, version: 3, principalId: P1,
        occurredAt: AT, reason: 'PRIVACY_HARM' })
      const after = (await history(slug)).body
      if (before === after) return 'history did not change after a withdrawal'
      return after.includes('withdrawn') ? null : 'the withdrawal is not shown'
    })

    await check('17 · membership resolves before any version read', async () => {
      const order: string[] = []
      setDatabaseProvider(async () => ({
        query: async (sql, params) => {
          if (/publication_events|investigation_slugs/.test(sql)) order.push('membership')
          else if (/investigation_versions|version_added|version_reevaluated/.test(sql))
            order.push('version')
          return db.query(sql, params)
        },
      }))
      try {
        await publicLineage(slug)
        if (order.length === 0) return 'no queries observed'
        if (order[0] !== 'membership') return `first query was ${order[0]}`
        const firstVersion = order.indexOf('version')
        return firstVersion === -1 || order.slice(0, firstVersion).includes('membership')
          ? null : 'a version read preceded membership'
      } finally { setDatabaseProvider(async () => db) }
    })

    // -- 19/20: boundaries -------------------------------------------------------------------
    await check('19 · an unpublished benchmark acquires no public lineage', async () => {
      await seedLineage(db, 'XRAY-KE-001', 'RUN-NBENCH')
      const bench = deterministicSlug('XRAY-KE-001', 'anything')
      if (await publicLineage(bench) !== undefined) return 'the benchmark has lineage'
      return (await history(bench)).status === 404 ? null : 'the benchmark history resolved'
    })

    await check('20 · no stored public-history table or generated diff prose', async () => {
      const tables = (await db.query(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema='public' AND (table_name LIKE '%histor%' OR table_name LIKE '%lineage%'
             OR table_name LIKE '%change_summar%')`)).rows[0] as { n: number }
      if (tables.n !== 0) return `${tables.n} lineage table(s)`
      const code = source('./version-lineage.ts')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const [pattern, what] of [
        [/INSERT |UPDATE |DELETE /, 'a write'],
        [/\.(text|proposition|rationale)\b/, 'evidence prose'],
        [/getInvestigationGraph/, "#8's resolver"],
        [/fixtures\//, 'a fixture'],
      ] as const) if (pattern.test(code)) return `the lineage reader touches ${what}`
      return null
    })

    // -- Report -------------------------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray public version lineage — 9f\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log('\nUnpublished versions caused zero version reads. The v2 document was'
      + '\nbyte-identical across the publication of v3.\n')
    if (failed.length) process.exitCode = 1
  } finally {
    setPublicProjections(null)
    setDatabaseProvider(null)
    await db.close()
  }
}
