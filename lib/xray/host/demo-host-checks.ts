/**
 * Seeded demo host checks (#11 slice 11b).
 *
 * WHAT IS PROVEN HERE AND WHAT IS PROVEN LIVE
 * ===========================================
 * This gate runs the seed against a real database and then reads the demo
 * through the same application functions the pages call — so provisioning,
 * idempotency, the seeded lineage and every surface's availability are proven
 * against storage rather than asserted.
 *
 * HTTP status lines cannot be proven from here: they belong to a running Next
 * server. Those are captured live in
 * `verification/issue-11-11b/live-journey.txt`, against a real PostgreSQL.
 *
 * DATABASE
 * ========
 * PGlite by default, so the gate needs no service. `XRAY_POSTGRES_URL` runs the
 * same checks against real PostgreSQL, which is what the deployed demo uses.
 *
 * Run:  pnpm check:demo-host
 */

import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { PGlite } from '@electric-sql/pglite'

import { setDatabaseProvider, setExecutionRuntimeProvider } from '@/lib/xray/application/runtime'
import { readAtiActionSurfaces } from '@/lib/xray/persistence/ati-surface-reader'
import { readSnapshot } from '@/lib/xray/persistence/snapshot'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import {
  featuredPublicationAvailability, publishedLibraryAvailability,
} from '@/lib/xray/publication/public-library'
import { executionStateView } from '@/lib/xray/projections/execution-state'
import { hostConnection, type RawConnection } from './database'
import { DEMO_SEED, migrateHost, seedDemoLineage } from './demo-seed'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const readSql = async (name: string) =>
  readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8')

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const pglite = new PGlite()
  const db = hostConnection(pglite as unknown as RawConnection)

  try {
    setExecutionRuntimeProvider(null)

    // === provisioning ====================================================

    await check('1 · a fresh database and one seed create exactly one demo lineage', async () => {
      const applied = await migrateHost(db, readSql)
      if (applied.length !== 13) return `${applied.length} migrations applied`
      const first = await seedDemoLineage(db)
      if (first.outcome.result !== 'SEEDED') return `first seed: ${first.outcome.result}`
      if (first.outcome.slug !== DEMO_SEED.slug) return `slug ${first.outcome.slug}`
      const lineages = Number((await db.query(
        'SELECT count(*)::int AS n FROM investigations')).rows[0].n)
      const versions = Number((await db.query(
        'SELECT count(*)::int AS n FROM investigation_versions')).rows[0].n)
      return lineages === 1 && versions === 1
        ? null : `${lineages} lineage(s), ${versions} version(s)`
    })

    await check('2 · a second seed duplicates no version and no publication event', async () => {
      const before = (await db.query(
        `SELECT (SELECT count(*) FROM investigation_versions) AS versions,
                (SELECT count(*) FROM publication_events) AS events,
                (SELECT count(*) FROM investigation_slugs) AS slugs`)).rows[0]
      const migrations = await migrateHost(db, readSql)
      const again = await seedDemoLineage(db)
      if (again.outcome.result !== 'ALREADY_SEEDED') return `second seed: ${again.outcome.result}`
      if (migrations.length !== 0) return `${migrations.length} migrations re-applied`
      const after = (await db.query(
        `SELECT (SELECT count(*) FROM investigation_versions) AS versions,
                (SELECT count(*) FROM publication_events) AS events,
                (SELECT count(*) FROM investigation_slugs) AS slugs`)).rows[0]
      return JSON.stringify(before) === JSON.stringify(after)
        ? null : `${JSON.stringify(before)} → ${JSON.stringify(after)}`
    })

    await check('3 · the seeded version round-trips as the benchmark froze it', async () => {
      const stored = await readSnapshot(db, DEMO_SEED.investigationId, DEMO_SEED.version)
      const corpus = createXrayKe001Graph()
      const strip = (graph: unknown) => {
        const { index: _index, ...rest } = graph as Record<string, unknown>
        return rest
      }
      // Structural equality, not serialized equality. `JSON.stringify` is
      // key-order sensitive and the round trip reconstructs objects field by
      // field, so comparing strings reports an identical graph as different —
      // which is what the first version of this check did.
      return isDeepStrictEqual(strip(stored), strip(corpus))
        ? null : 'the stored version differs from the corpus'
    })

    // Every surface reads through the registered provider, as a page does.
    setDatabaseProvider(async () => db)

    // The cached projection wrappers import `next/cache`, which only the
    // bundler resolves — #9 built the seam for exactly this. Injecting the
    // uncached projection exercises the same library code path.
    const { setPublicProjections } = await import('@/lib/xray/publication/public-page')
    const view = await import('@/lib/xray/publication/public-view')
    setPublicProjections({
      versionGraph: (id, v) => view.loadVersionGraph(id, v),
      versionProjection: (id, v) => view.loadPublicVersionProjection(id, v),
      assurance: (runId, index) => view.loadAssuranceDisclosure(runId, index),
    })

    // === the demo surfaces ================================================

    await check('4/5 · the featured publication is discoverable from stored state', async () => {
      const featured = await featuredPublicationAvailability()
      if (featured.status !== 'AVAILABLE') return `featured: ${featured.status}`
      if (featured.featured === null) return 'nothing is featured after seeding'
      if (featured.featured.slug !== DEMO_SEED.slug)
        return `featured slug ${featured.featured.slug}`
      return featured.featured.version === DEMO_SEED.version
        ? null : `featured version ${featured.featured.version}`
    })

    await check('6 · the library lists exactly the demo card', async () => {
      const library = await publishedLibraryAvailability()
      if (library.status !== 'AVAILABLE') return `library: ${library.status}`
      if (library.entries.length !== 1) return `${library.entries.length} entries`
      return library.entries[0].slug === DEMO_SEED.slug
        ? null : `entry slug ${library.entries[0].slug}`
    })

    await check('7/8/9 · alias, exact version and history all resolve from the seed', async () => {
      const { PublicResolver } = await import('@/lib/xray/application/public-resolver')
      const resolver = new PublicResolver(db)
      const alias = await resolver.resolveAlias(DEMO_SEED.slug)
      if (alias.kind !== 'PUBLISHED') return `alias resolved ${alias.kind}`
      if (alias.version !== DEMO_SEED.version) return `alias version ${alias.version}`

      const exact = await resolver.resolveExactVersion(DEMO_SEED.slug, DEMO_SEED.version)
      if (exact.kind !== 'PUBLISHED') return `exact resolved ${exact.kind}`

      const { publicLineage, loadVersionChangeSummary } =
        await import('@/lib/xray/publication/version-lineage')
      const lineage = await publicLineage(DEMO_SEED.slug, loadVersionChangeSummary, db)
      return lineage !== undefined && lineage.entries.length === 1
        ? null : `lineage ${JSON.stringify(lineage?.entries.length)}`
    })

    await check('10 · the internal explorer resolves from storage, not the fixture', async () => {
      const { getExplorerPayload } = await import('@/lib/xray/investigations')
      const payload = await getExplorerPayload(DEMO_SEED.investigationId)
      if (!payload) return 'the explorer found nothing'
      if (payload.claims.length === 0) return 'the explorer payload carries no claims'
      // Proven by removing storage's answer: a fixture fallback would still
      // answer, and this must not.
      const missing = await getExplorerPayload('XRAY-NOT-SEEDED')
      return missing === null ? null : 'an unseeded id was answered by a fixture'
    })

    await check('11 · ATI action availability is readable from stored state', async () => {
      const surfaces = await readAtiActionSurfaces(db, DEMO_SEED.investigationId)
      // The seed deliberately creates no action history; the demo script may.
      if (surfaces.length !== 0) return `${surfaces.length} seeded requests`
      const eligible = Number((await db.query(
        `SELECT count(*)::int AS n FROM gaps
          WHERE investigation_id=$1 AND version_number=$2 AND ati_eligible`,
        [DEMO_SEED.investigationId, DEMO_SEED.version])).rows[0].n)
      return eligible > 0 ? null : 'the seeded version exposes no ATI-eligible gap'
    })

    // === storage unavailable ==============================================

    await check('12/13 · storage unavailable is authored, and never an empty library', async () => {
      setDatabaseProvider(null)
      const featured = await featuredPublicationAvailability()
      if (featured.status !== 'UNAVAILABLE') return `featured reported ${featured.status}`
      const library = await publishedLibraryAvailability()
      if (library.status !== 'UNAVAILABLE') return `library reported ${library.status}`
      // The distinction that matters: unavailable is not "no entries".
      if ('entries' in library) return 'an unavailable library carried entries'

      // And the pages render the distinction rather than collapsing it.
      const landing = readFileSync(
        new URL('../../../app/page.tsx', import.meta.url), 'utf8')
      if (!/temporarily unavailable/.test(landing)) return 'the landing page states no outage'
      if (!/No investigation has been published yet/.test(landing))
        return 'the landing page cannot tell an outage from an empty corpus'
      const libraryPage = readFileSync(
        new URL('../../../app/library/page.tsx', import.meta.url), 'utf8')
      if (!/temporarily unavailable/.test(libraryPage))
        return 'the library page states no outage'
      return /not a statement that nothing is published/.test(libraryPage)
        ? null : 'the library page does not separate an outage from an empty corpus'
    })

    setDatabaseProvider(async () => db)

    // === the honest fresh path ============================================

    await check('19/20/21 · a run that could do no work reports itself, and commits nothing', async () => {
      // The shape the unconfigured runtime produces: every stage scheduled,
      // none executed. Projected exactly as the progress screen projects it.
      const view = executionStateView({
        investigationId: 'XRAY-FRESH', executionRunId: 'RUN-FRESH',
        status: 'GATE_BLOCKED', startedAt: DEMO_SEED.provisionedAt, committedVersion: null,
        stageRuns: ['INGEST', 'DECOMPOSE', 'CLASSIFY', 'PLAN', 'TRACE'].map((stage, index) => ({
          id: `SR-00${index + 1}`, stage, status: 'PENDING', inputArtifactVersion: 0,
        })),
      })
      if (!view.blockedBeforeResearch) return 'a run where nothing ran was not recognised'
      if (view.statusLabel !== 'Research capability unavailable')
        return `status label "${view.statusLabel}"`
      if (view.stagesNotRun.length !== 5)
        return `${view.stagesNotRun.length} stage(s) reported as not run`
      if (view.committedVersion !== null) return 'a blocked run reported a version'
      if (!/no evidence was gathered/i.test(view.explanation))
        return 'the copy does not say that nothing was concluded'
      if (!/says nothing about the submitted source/i.test(view.explanation))
        return 'the copy does not separate the run from the source'
      // The recorded outcome is never rewritten — only its presentation.
      return view.outcome === 'GATE_BLOCKED'
        ? null : `the recorded outcome was rewritten to ${view.outcome}`
    })

    await check('22 · no benchmark graph can stand in for a fresh investigation', async () => {
      const { getInvestigationGraph } = await import('@/lib/xray/investigations')
      // An id storage knows without a committed version must not be answered
      // by the fixture, and an unknown id must not be answered by it either.
      await db.query('INSERT INTO investigations(id) VALUES ($1)', ['XRAY-FRESH-NO-VERSION'])
      if (await getInvestigationGraph('XRAY-FRESH-NO-VERSION') !== null)
        return 'a known-but-uncommitted investigation was answered by a fixture'
      // The benchmark id itself is answered from storage, because it is seeded.
      const seeded = await getInvestigationGraph(DEMO_SEED.investigationId)
      return seeded !== null ? null : 'the seeded investigation could not be read'
    })

    // === the transaction guard ============================================

    await check('guard · the single-connection limitation is stated, not papered over', async () => {
      /*
       * An earlier version of this host claimed to serialize transactions over
       * its one connection, using `AsyncLocalStorage` to tell the owning flow
       * apart from any other. This check caught it failing: `enterWith` inside
       * the wrapper mutates the *shared* context it was called from, so every
       * flow saw the same token, recognised itself as the owner, and wrote
       * straight through somebody else's open transaction.
       *
       * A guard that does not guard is worse than none, so it is gone. What
       * remains is the honest statement: one connection per process, safe for
       * one writer at a time, and a documented follow-up — a `withTransaction`
       * scope on `SnapshotDatabase` — before concurrent writers are safe.
       */
      const host = readFileSync(new URL('./database.ts', import.meta.url), 'utf8')
      // The import, not the word: the file explains the removed guard at length.
      if (/from 'node:async_hooks'/.test(host))
        return 'the host still carries the transaction guard that did not work'
      if (!/one writer at a time/i.test(host))
        return 'the host does not state its concurrency limitation'
      return /withTransaction/.test(host)
        ? null : 'the host does not name the follow-up that would make pooling safe'
    })

    await check('23 · a route with no database still fails without leaking', async () => {
      setDatabaseProvider(null)
      const { GET } = await import('@/app/api/investigations/[id]/versions/route')
      const response = await GET(
        new Request('http://localhost/api/investigations/X/versions'),
        { params: Promise.resolve({ id: 'X' }) })
      if (response.status !== 503) return `status ${response.status}`
      const text = await response.text()
      if (!text.includes('SERVICE_UNAVAILABLE')) return `body ${text}`
      for (const leak of ['postgres', 'pglite', 'select ', 'BEGIN', 'connectionString']) {
        if (text.toLowerCase().includes(leak.toLowerCase())) return `body leaks ${leak}`
      }
      return null
    })
  } finally {
    setDatabaseProvider(null)
    setExecutionRuntimeProvider(null)
    await pglite.close()
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} demo host checks passed`)
  if (failed > 0) process.exitCode = 1
}
