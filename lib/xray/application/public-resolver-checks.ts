/**
 * Public resolver trust-boundary checks (#9 slice 9c).
 *
 * The core of this gate is adversarial and mechanical rather than
 * observational: the canonical reader is instrumented, and for every
 * `NOT_PUBLIC` outcome and every withdrawn `COMPELLED` / `PRIVACY_HARM`
 * outcome the invocation count must remain **zero**.
 *
 * A resolver that loads the graph and filters afterwards can still produce a
 * safe-looking DTO. Counting the reads is what distinguishes the two.
 *
 * Run:  pnpm check:public-resolver
 */

import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import type { XRayGraphInput } from '@/lib/xray/selectors'
import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  deterministicSlug, publishVersion, readSlug, resolveSlug, withdrawVersion,
} from '@/lib/xray/persistence/publication'
import {
  AT, commitFurtherVersion, linkVersion, migrate, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import { InvestigationService } from './investigation-service'
import {
  PublicResolver, defaultCommittedVersionReader, type CommittedVersionReader,
  type PublicPresentation,
} from './public-resolver'

const P1 = 'principal:editor-1'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

/** The canonical reader, counted and ordered against publication lookups. */
interface Probe {
  reader: CommittedVersionReader
  db: SnapshotDatabase
  reads: number
  trace: string[]
  reset(): void
}

function probe(db: PGlite): Probe {
  const inner = defaultCommittedVersionReader(db)
  const state: Probe = {
    reads: 0,
    trace: [],
    reset() { state.reads = 0; state.trace = [] },
    db: {
      async query(sql, params) {
        if (/publication_events|investigation_slugs/.test(sql)) state.trace.push('authorize')
        return db.query(sql, params)
      },
    },
    reader: {
      async read(investigationId, version) {
        state.reads += 1
        state.trace.push('canonical-read')
        return inner.read(investigationId, version)
      },
    },
  }
  return state
}

const isNotPublic = (r: PublicPresentation) =>
  r.kind === 'NOT_PUBLIC' && Object.keys(r).length === 1

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)

    const p = probe(db)
    const resolver = new PublicResolver(p.db, p.reader)

    // A published lineage: v1 and v2 committed and linked, v3 committed and
    // never published.
    const LIVE = 'XRAY-PUBLIC-LIVE'
    const live = await seedLineage(db, LIVE, 'RUN-LIVE')
    await linkVersion(db, LIVE, 1, 'RUN-LIVE-V1', live.v1, live.assessment)
    await commitFurtherVersion(db, LIVE, 'RUN-LIVE-V3', live.candidate, 3)
    await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
    const liveSlug = (await readSlug(db, LIVE))!

    // A lineage that is committed but has never been published at all — and
    // whose future public address is already computable, because 9b made slug
    // minting deterministic. That is the address an adversary would probe.
    const DRAFT = 'XRAY-PUBLIC-DRAFT'
    const draft = await seedLineage(db, DRAFT, 'RUN-DRAFT')
    const surfaceTitle = (graph: { sources: readonly { id: string; title: string }[];
      investigation: { surfaceSourceId: string } }) =>
      graph.sources.find((s) => s.id === graph.investigation.surfaceSourceId)!.title
    const draftWouldBeSlug = deterministicSlug(DRAFT, surfaceTitle(draft.candidate))

    // -- 1–4: the four NOT_PUBLIC cases, all with zero canonical reads -------
    const notPublicCases: [string, () => Promise<PublicPresentation>][] = [
      ['1 · unknown slug', () => resolver.resolveAlias('no-such-slug-0000000000')],
      // The real draft lineage, probed at the exact address first publication
      // would mint for it. An arbitrary unknown string proves nothing here:
      // case 1 already covers that, and the released requirement is that a
      // knowable future address stays unobservable until it is allocated.
      ['2 · the draft lineage at its own computable would-be slug', () =>
        resolver.resolveAlias(draftWouldBeSlug)],
      ['3 · committed but never published version', () =>
        resolver.resolveExactVersion(liveSlug, 3)],
      ['4 · known slug, exact version never published', () =>
        resolver.resolveExactVersion(liveSlug, 1)],
    ]

    const shapes: string[] = []
    for (const [name, run] of notPublicCases) {
      await check(`${name} → NOT_PUBLIC with zero canonical reads`, async () => {
        p.reset()
        const result = await run()
        if (!isNotPublic(result)) return `returned ${JSON.stringify(result).slice(0, 80)}`
        if (p.reads !== 0) return `${p.reads} canonical read(s)`
        shapes.push(JSON.stringify(result))
        return null
      })
    }

    await check('2 · the would-be slug is real, unallocated, and allocates nothing when probed', async () => {
      // It is genuinely the address publication would mint: same derivation,
      // same inputs. Computing it is not the leak; answering it would be.
      if (draftWouldBeSlug !== deterministicSlug(DRAFT, surfaceTitle(draft.candidate)))
        return 'the would-be slug is not deterministic'
      if (draftWouldBeSlug === 'any-plausible-slug-abcdef0123')
        return 'the probe is still an arbitrary string'

      const before = (await db.query('SELECT count(*)::int AS n FROM investigation_slugs')).rows[0] as { n: number }
      p.reset()
      const alias = await resolver.resolveAlias(draftWouldBeSlug)
      const exact = await resolver.resolveExactVersion(draftWouldBeSlug, 2)
      if (!isNotPublic(alias)) return `alias returned ${JSON.stringify(alias).slice(0, 80)}`
      if (!isNotPublic(exact)) return `exact returned ${JSON.stringify(exact).slice(0, 80)}`
      if (p.reads !== 0) return `${p.reads} canonical read(s)`

      // Nothing was allocated by being asked about.
      if (await resolveSlug(db, draftWouldBeSlug) !== undefined)
        return 'the would-be slug resolved to an owner'
      if (await readSlug(db, DRAFT) !== undefined) return 'the draft lineage acquired a slug'
      const after = (await db.query('SELECT count(*)::int AS n FROM investigation_slugs')).rows[0] as { n: number }
      return after.n === before.n ? null : 'probing allocated a slug row'
    })

    await check('2 · the same address becomes public only once it is allocated', async () => {
      // The complement: the address was not special before publication, and it
      // is exactly this address afterwards. That is what makes the earlier
      // NOT_PUBLIC a statement about publication rather than about the slug.
      await publishVersion(db, { investigationId: DRAFT, version: 2, principalId: P1, occurredAt: AT })
      const allocated = await readSlug(db, DRAFT)
      if (allocated !== draftWouldBeSlug) return `minted ${allocated}, predicted ${draftWouldBeSlug}`
      const alias = await resolver.resolveAlias(draftWouldBeSlug)
      return alias.kind === 'PUBLISHED' && alias.version === 2
        ? null : `alias is ${alias.kind}`
    })

    await check('1–4 · every NOT_PUBLIC outcome is byte-identical', async () => {
      const distinct = new Set(shapes)
      if (distinct.size !== 1) return `${distinct.size} distinct shapes: ${[...distinct].join(' ')}`
      return shapes[0] === '{"kind":"NOT_PUBLIC"}' ? null : `shape is ${shapes[0]}`
    })

    // -- 5/6/7: published resolution ------------------------------------------
    await check('5 · the alias resolves the selected head, not the latest committed', async () => {
      p.reset()
      const result = await resolver.resolveAlias(liveSlug)
      if (result.kind !== 'PUBLISHED') return `alias is ${result.kind}`
      // v3 is committed and newer. The alias must still present v2.
      const pointer = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [LIVE])).rows[0] as { v: number }
      if (pointer.v !== 3) return `the lineage has no newer committed version (pointer ${pointer.v})`
      return result.version === 2 ? null : `alias presented v${result.version}`
    })

    await check('6 · an exact-version address reads that exact version', async () => {
      const result = await resolver.resolveExactVersion(liveSlug, 2)
      if (result.kind !== 'PUBLISHED') return `exact v2 is ${result.kind}`
      const graph = result.graph as XRayGraphInput
      return graph.investigation.currentVersion === 2
        ? null : `read v${graph.investigation.currentVersion}`
    })

    await check('7 · a committed unpublished v3 stays invisible while the alias serves v2', async () => {
      p.reset()
      const exact = await resolver.resolveExactVersion(liveSlug, 3)
      if (!isNotPublic(exact)) return 'v3 is publicly visible'
      if (p.reads !== 0) return `${p.reads} canonical read(s) for v3`
      const alias = await resolver.resolveAlias(liveSlug)
      return alias.kind === 'PUBLISHED' && alias.version === 2
        ? null : 'the alias moved'
    })

    // -- 8–12: withdrawal -------------------------------------------------------
    await check('8 · a withdrawn head resolves WITHDRAWN with zero canonical reads', async () => {
      await withdrawVersion(db, { investigationId: LIVE, version: 2, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })
      p.reset()
      const result = await resolver.resolveAlias(liveSlug)
      if (result.kind !== 'WITHDRAWN') return `alias is ${result.kind}`
      if (p.reads !== 0) return `${p.reads} canonical read(s)`
      return result.version === 2 && result.reason === 'COMPELLED'
        ? null : 'the tombstone names the wrong act'
    })

    await check('10 · a COMPELLED tombstone carries no canonical content', async () => {
      p.reset()
      const result = await resolver.resolveExactVersion(liveSlug, 2)
      if (result.kind !== 'WITHDRAWN') return `exact v2 is ${result.kind}`
      if (p.reads !== 0) return `${p.reads} canonical read(s)`
      const text = JSON.stringify(result)
      if (/"graph"|"claims"|"evidence"|"findings"/.test(text)) return 'canonical content leaked'
      return result.note === undefined ? null : 'a note was invented for COMPELLED'
    })

    // A second lineage for PRIVACY_HARM and ERRONEOUS, so acts stay separable.
    const HARM = 'XRAY-PUBLIC-HARM'
    const harm = await seedLineage(db, HARM, 'RUN-HARM')
    void harm
    await publishVersion(db, { investigationId: HARM, version: 2, principalId: P1, occurredAt: AT })
    const harmSlug = (await readSlug(db, HARM))!

    await check('11 · a PRIVACY_HARM tombstone carries no canonical content', async () => {
      await withdrawVersion(db, { investigationId: HARM, version: 2, principalId: P1,
        occurredAt: AT, reason: 'PRIVACY_HARM' })
      p.reset()
      const result = await resolver.resolveAlias(harmSlug)
      if (result.kind !== 'WITHDRAWN') return `alias is ${result.kind}`
      if (p.reads !== 0) return `${p.reads} canonical read(s)`
      if (/"graph"|"claims"|"evidence"/.test(JSON.stringify(result))) return 'canonical content leaked'
      return result.reason === 'PRIVACY_HARM' ? null : `reason ${result.reason}`
    })

    const ERR = 'XRAY-PUBLIC-ERRONEOUS'
    await seedLineage(db, ERR, 'RUN-ERR')
    await publishVersion(db, { investigationId: ERR, version: 2, principalId: P1, occurredAt: AT })
    const errSlug = (await readSlug(db, ERR))!

    await check('12 · an ERRONEOUS tombstone carries its note and no canonical content', async () => {
      await withdrawVersion(db, { investigationId: ERR, version: 2, principalId: P1,
        occurredAt: AT, reason: 'ERRONEOUS', note: 'The lot 3 award figure conflated two contracts.' })
      p.reset()
      const result = await resolver.resolveAlias(errSlug)
      if (result.kind !== 'WITHDRAWN') return `alias is ${result.kind}`
      if (p.reads !== 0) return `${p.reads} canonical read(s)`
      if (!result.note?.includes('conflated two contracts')) return 'the note was dropped'
      return /"graph"|"claims"|"evidence"/.test(JSON.stringify(result))
        ? 'canonical content leaked' : null
    })

    await check('9 · a withdrawn historical version does not move the published alias', async () => {
      // Republish the LIVE head, then withdraw the older v1 after publishing it.
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: LIVE, version: 2, principalId: P1, occurredAt: AT })
      await withdrawVersion(db, { investigationId: LIVE, version: 1, principalId: P1,
        occurredAt: AT, reason: 'OUT_OF_SCOPE' })

      p.reset()
      const historical = await resolver.resolveExactVersion(liveSlug, 1)
      if (historical.kind !== 'WITHDRAWN') return `v1 is ${historical.kind}`
      if (p.reads !== 0) return `${p.reads} canonical read(s) for a withdrawn version`
      const alias = await resolver.resolveAlias(liveSlug)
      return alias.kind === 'PUBLISHED' && alias.version === 2
        ? null : `alias became ${alias.kind} v${(alias as { version?: number }).version}`
    })

    // -- 13/14: rollback and republication ---------------------------------------
    await check('13 · a deliberate rollback makes the alias resolve the earlier version', async () => {
      await publishVersion(db, { investigationId: LIVE, version: 1, principalId: P1, occurredAt: AT })
      const alias = await resolver.resolveAlias(liveSlug)
      if (alias.kind !== 'PUBLISHED') return `alias is ${alias.kind}`
      return alias.version === 1 ? null : `alias presents v${alias.version}`
    })

    await check('14 · republication after withdrawal restores PUBLISHED', async () => {
      const before = await resolver.resolveAlias(harmSlug)
      if (before.kind !== 'WITHDRAWN') return 'the lineage was not withdrawn'
      await publishVersion(db, { investigationId: HARM, version: 2, principalId: P1, occurredAt: AT })
      const after = await resolver.resolveAlias(harmSlug)
      return after.kind === 'PUBLISHED' && after.version === 2
        ? null : `alias is ${after.kind}`
    })

    // -- 15: outage is not absence -------------------------------------------------
    await check('15 · a storage failure propagates and is never rewritten as NOT_PUBLIC', async () => {
      const broken = new PublicResolver({
        query: async () => { throw new Error('connection terminated unexpectedly') },
      }, p.reader)
      const outcome = await broken.resolveAlias(liveSlug)
        .then((r) => ({ r }), (e: unknown) => ({ e }))
      if ('r' in outcome) return `an outage returned ${JSON.stringify(outcome.r)}`
      return (outcome.e as Error).message === 'connection terminated unexpectedly'
        ? null : `propagated ${(outcome.e as Error).message}`
    })

    // -- 16/17: boundaries -----------------------------------------------------------
    await check('16 · #8 tri-state resolver is untouched and knows nothing of publication', async () => {
      const raw = readFileSync(new URL('../investigations.ts', import.meta.url), 'utf8')
      for (const marker of ['UNKNOWN_IN_STORAGE', 'KNOWN_WITHOUT_COMMITTED_VERSION', 'COMMITTED_GRAPH'])
        if (!raw.includes(marker)) return `${marker} is gone from the #8 resolver`
      // Comments stripped: 8c documents the boundary in prose ("publication is
      // #9"), and matching its own explanation would be self-defeating.
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return /publication|PublicResolver|NOT_PUBLIC|PUBLISHED/.test(code)
        ? 'the #8 resolver acquired publication semantics' : null
    })

    await check('17 · no fixture can answer a public lookup', async () => {
      const source = readFileSync(new URL('./public-resolver.ts', import.meta.url), 'utf8')
      if (/fixtures\/|createXrayKe001Graph|BENCHMARK/.test(source))
        return 'the public resolver reaches a fixture'
      // XRAY-KE-001 is a benchmark id. Unpublished, it is not public.
      await seedLineage(db, 'XRAY-KE-001', 'RUN-BENCH')
      p.reset()
      const result = await resolver.resolveAlias('mamboleo-miwani-road-abcdef0123')
      if (!isNotPublic(result)) return 'a benchmark slug resolved publicly'
      return p.reads === 0 ? null : `${p.reads} canonical read(s)`
    })

    // -- 18/19: DTO contents -----------------------------------------------------------
    await check('18 · no resolver output contains a principal identity', async () => {
      const outputs = [
        await resolver.resolveAlias(liveSlug),
        await resolver.resolveExactVersion(liveSlug, 1),
        await resolver.resolveAlias('no-such-slug-0000000000'),
        await resolver.resolveAlias(errSlug),
      ]
      for (const output of outputs) {
        // The resolver's own fields, with canonical content set aside. The
        // graph legitimately contains the English word — "the principal/main
        // road corridor", "Office of the Principal Secretary" — which is
        // exactly the collision that made `Principal` the name for the
        // administrative identity rather than `Actor`. Attribution must be
        // absent structurally, so this inspects the DTO's own fields.
        const own = { ...output, graph: undefined }
        const text = JSON.stringify(own)
        if (text.includes(P1)) return `${output.kind} carries a principal id`
        if (Object.keys(own).some((key) => /principal/i.test(key)))
          return `${output.kind} has a principal-named field`
        if (/principal/i.test(text)) return `${output.kind} leaked a principal value`
      }
      // And the type itself offers nowhere to put one.
      const source = readFileSync(new URL('./public-resolver.ts', import.meta.url), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return /principalId/.test(source) ? 'the resolver reads a principal id' : null
    })

    await check('19 · an eligible BLOCKED publication keeps its authorizing linkage', async () => {
      const result = await resolver.resolveExactVersion(liveSlug, 2)
      if (result.kind !== 'PUBLISHED') return `v2 is ${result.kind}`
      if (result.authorizingExecutionRunId !== 'RUN-LIVE') return 'the authorizing run is wrong'
      if (typeof result.authorizingGraduationIndex !== 'number') return 'no graduation index'
      // The blockers are reachable through the linkage, not copied here.
      const recorded = (await db.query(
        'SELECT verdict FROM run_graduations WHERE execution_run_id=$1 AND assessment_index=$2',
        [result.authorizingExecutionRunId, result.authorizingGraduationIndex])).rows[0] as { verdict: string }
      if (recorded.verdict !== 'BLOCKED') return `linked verdict is ${recorded.verdict}`
      return /"blockers"|"capability"/i.test(JSON.stringify({
        ...result, graph: undefined })) ? 'blockers were copied into the DTO' : null
    })

    // -- 20: ordering on the PUBLISHED path too -----------------------------------------
    await check('20 · authorization is resolved before the canonical read, always', async () => {
      p.reset()
      const result = await resolver.resolveAlias(liveSlug)
      if (result.kind !== 'PUBLISHED') return `alias is ${result.kind}`
      const firstRead = p.trace.indexOf('canonical-read')
      if (firstRead === -1) return 'no canonical read happened at all'
      if (p.trace.slice(0, firstRead).filter((s) => s === 'authorize').length === 0)
        return 'the canonical read came before any publication lookup'
      if (p.reads !== 1) return `${p.reads} canonical reads for one address`
      return p.trace[0] === 'authorize' ? null : `the first operation was ${p.trace[0]}`
    })

    await check('20 · the same holds for an exact-version address', async () => {
      p.reset()
      const result = await resolver.resolveExactVersion(liveSlug, 2)
      if (result.kind !== 'PUBLISHED') return `exact v2 is ${result.kind}`
      return p.trace[0] === 'authorize' && p.reads === 1
        ? null : `trace began with ${p.trace[0]}, ${p.reads} read(s)`
    })

    await check('the default reader is the narrow exact-version seam', async () => {
      const service = new InvestigationService(db)
      const direct = await service.getCommittedVersion(LIVE, 2)
      const viaReader = await defaultCommittedVersionReader(db).read(LIVE, 2)
      return JSON.stringify(viaReader) === JSON.stringify(direct.graph)
        ? null : 'the default reader diverges from the exact-version service call'
    })

    // -- Report ----------------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray public presentation resolver — 9c\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log('\nCanonical reads stayed at zero for every NOT_PUBLIC outcome and for'
      + '\nCOMPELLED, PRIVACY_HARM and ERRONEOUS tombstones.\n')
    if (failed.length) process.exitCode = 1
  } finally {
    await db.close()
  }
}
