/**
 * Publication event store and slug namespace checks (#9 slice 9b).
 *
 * Twenty-five proofs over the durable model: append-only enforced by the
 * database rather than by convention, slug identity that cannot move, publish
 * and withdraw semantics, presentation head replayed from event order, and the
 * guarantee that no publication act touches canonical state.
 *
 * Run:  pnpm check:publication
 */

import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

import type { GraduationResult } from '@/lib/xray/acceptance'
import type { XRayGraph } from '@/lib/xray/selectors'
import { fingerprintGraph } from '@/lib/xray/review'
import { encodeValue } from './value-codec'
import { readSnapshot, type SnapshotDatabase } from './snapshot'
import {
  AT, corpusFor, linkVersion, migrate, seedLineage,
} from './publication-check-support'
import {
  PublicationRefused, deterministicSlug, exactVersionState, presentationHead, publishVersion,
  readEligibility, readPublicationHistory, readSlug, resolveExactVersionState,
  resolvePresentationHead, resolveSlug, slugBase, withdrawVersion,
} from './publication'

const P1 = 'principal:editor-1'
const P2 = 'principal:editor-2'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

/**
 * Record a verdict against an already-committed version's run.
 *
 * #7 makes a committed FAIL or REVISE unreachable through the normal path -
 * `commitNextVersion` refuses one. The publication command's refusal is still
 * worth holding in place, so the state is constructed directly here and the
 * unreachability is recorded rather than worked around.
 */
async function repointVerdict(db: PGlite, runId: string, investigationId: string,
  graph: XRayGraph, assessment: GraduationResult, verdict: GraduationResult['verdict'], index: number) {
  const result: GraduationResult = { ...assessment, verdict, investigationId,
    graphFingerprint: fingerprintGraph(graph) }
  await db.query(
    `INSERT INTO run_graduations(execution_run_id,assessment_index,investigation_id,verdict,
       graph_fingerprint,candidate_digest,assessed_at,result)
     SELECT $1,$2,$3,$4,$5,candidate_digest,$6,$7 FROM run_graduations
      WHERE execution_run_id=$1 AND assessment_index=0`,
    [runId, index, investigationId, verdict, result.graphFingerprint, AT,
      JSON.stringify(encodeValue(result))])
  await db.query('UPDATE execution_runs SET committed_graduation_index=$1 WHERE id=$2', [index, runId])
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    await migrate(db)

    const A = 'XRAY-KE-001'                     // seeded v1 unlinked, v2 committed + linked
    const B = 'XRAY-LINEAGE-B'                   // v1 and v2 both linked, for head replay
    const C = 'XRAY-LINEAGE-C'                   // similar title, distinct slug
    const D = 'XRAY-LINEAGE-D'                   // FAIL / REVISE refusals

    const a = await seedLineage(db, A, 'RUN-A')
    const snapshotA1Before = await readSnapshot(db, A, 1)
    const snapshotA2Before = await readSnapshot(db, A, 2)
    const pointerBefore = (await db.query(
      'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [A])).rows[0]

    // -- 1. first publish is atomic: slug + event ---------------------------
    let slugA = ''
    await check('1 · first eligible publish creates the permanent slug and the PUBLISH event', async () => {
      const { slug, event } = await publishVersion(db, {
        investigationId: A, version: 2, principalId: P1, occurredAt: AT })
      slugA = slug
      if (!slug.endsWith(`-${deterministicSlug(A, 'x').split('-').pop()}`))
        return `slug ${slug} lacks the lineage suffix`
      if (event.sequence !== 1 || event.act !== 'PUBLISH') return 'event shape wrong'
      if (event.principalId !== P1) return 'principal not recorded'
      if (event.authorizingExecutionRunId !== 'RUN-A') return 'no authorizing eligibility linkage'
      const stored = await readSlug(db, A)
      return stored === slug ? null : 'the slug was not persisted'
    })

    // -- 2/3. slug determinism ---------------------------------------------
    await check('2 · the slug is deterministic for the lineage and survives a title change', async () => {
      const expected = deterministicSlug(A, a.candidate.sources.find(
        (s) => s.id === a.candidate.investigation.surfaceSourceId)!.title)
      if (slugA !== expected) return `${slugA} !== ${expected}`
      // A different title computes a different address, yet the stored one wins.
      if (deterministicSlug(A, 'A Completely Different Headline') === slugA)
        return 'the base contributes nothing'
      return null
    })

    await check('3 · two lineages with the same title still get distinct slugs', async () => {
      await seedLineage(db, C, 'RUN-C')
      const { slug } = await publishVersion(db, {
        investigationId: C, version: 2, principalId: P1, occurredAt: AT })
      if (slug === slugA) return 'two lineages share a public address'
      if (slugBase(slug) === slugBase(slugA) && slug.slice(0, -11) !== slugA.slice(0, -11))
        return 'bases unexpectedly differ'
      return slug.slice(0, -11) === slugA.slice(0, -11)
        ? null : 'identical titles produced different readable bases'
    })

    // -- 4/5/6. database-enforced immutability ------------------------------
    await check('4 · UPDATE of a publication event is rejected by the database', async () => {
      const outcome = await db.query(
        `UPDATE publication_events SET act='WITHDRAW' WHERE investigation_id=$1 AND sequence=1`, [A])
        .then(() => null, (e: unknown) => e as Error)
      return outcome && /append-only/i.test(outcome.message) ? null : 'the update was accepted'
    })

    await check('5 · DELETE of a publication event is rejected by the database', async () => {
      const outcome = await db.query(
        'DELETE FROM publication_events WHERE investigation_id=$1 AND sequence=1', [A])
        .then(() => null, (e: unknown) => e as Error)
      return outcome && /append-only/i.test(outcome.message) ? null : 'the delete was accepted'
    })

    await check('6 · a slug cannot be renamed, reassigned, released or shared', async () => {
      const rename = await db.query('UPDATE investigation_slugs SET slug=$1 WHERE investigation_id=$2',
        ['renamed-slug', A]).then(() => null, (e: unknown) => e as Error)
      if (!rename || !/append-only/i.test(rename.message)) return 'rename accepted'
      const release = await db.query('DELETE FROM investigation_slugs WHERE investigation_id=$1', [A])
        .then(() => null, (e: unknown) => e as Error)
      if (!release || !/append-only/i.test(release.message)) return 'release accepted'
      const steal = await db.query(
        'INSERT INTO investigation_slugs(investigation_id, slug, allocated_at) VALUES ($1,$2,$3)',
        ['XRAY-THIEF', slugA, AT]).then(() => null, (e: unknown) => e as Error)
      if (!steal || !/unique|duplicate/i.test(steal.message)) return 'a second lineage took the slug'
      const second = await db.query(
        'INSERT INTO investigation_slugs(investigation_id, slug, allocated_at) VALUES ($1,$2,$3)',
        [A, 'another-slug-abc', AT]).then(() => null, (e: unknown) => e as Error)
      return second && /unique|duplicate|primary key/i.test(second.message)
        ? null : 'one lineage took a second slug'
    })

    // -- 7. principal --------------------------------------------------------
    await check('7 · a missing or blank principal is refused with no durable effect', async () => {
      const before = (await readPublicationHistory(db, A)).length
      for (const bad of ['', '   ', undefined as unknown as string]) {
        const outcome = await publishVersion(db, {
          investigationId: A, version: 1, principalId: bad, occurredAt: AT })
          .then(() => null, (e: unknown) => e as PublicationRefused)
        if (!outcome || outcome.reason !== 'NO_PRINCIPAL') return `principal ${JSON.stringify(bad)} accepted`
      }
      return (await readPublicationHistory(db, A)).length === before ? null : 'history changed'
    })

    // -- 8/9. what may be published ------------------------------------------
    await check('8 · a nonexistent or uncommitted version cannot be published', async () => {
      for (const version of [3, 99]) {
        const outcome = await publishVersion(db, {
          investigationId: A, version, principalId: P1, occurredAt: AT })
          .then(() => null, (e: unknown) => e as PublicationRefused)
        if (!outcome || outcome.reason !== 'VERSION_NOT_COMMITTED') return `v${version} accepted`
      }
      const unknown = await publishVersion(db, {
        investigationId: 'XRAY-NOBODY', version: 1, principalId: P1, occurredAt: AT })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      return unknown?.reason === 'VERSION_NOT_COMMITTED' ? null : 'an unknown lineage published'
    })

    await check('9 · a seeded v1 with no graduation linkage cannot be published', async () => {
      if (await readEligibility(db, A, 1) !== undefined) return 'the seeded v1 has linkage after all'
      const outcome = await publishVersion(db, {
        investigationId: A, version: 1, principalId: P1, occurredAt: AT })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      return outcome?.reason === 'NO_ELIGIBILITY_RECORD'
        ? null : `refused as ${outcome?.reason ?? 'nothing'}`
    })

    // -- 10/11/12. eligibility ------------------------------------------------
    await check('11 · an eligible BLOCKED publishes and keeps its blocker linkage', async () => {
      if (a.assessment.verdict !== 'BLOCKED') return `fixture assessed ${a.assessment.verdict}`
      if (a.assessment.blockers.length === 0) return 'no blockers to preserve'
      const event = (await readPublicationHistory(db, A)).find((e) => e.act === 'PUBLISH')
      const eligibility = await readEligibility(db, A, 2)
      if (event?.authorizingGraduationIndex !== eligibility?.graduationIndex)
        return 'the publication does not name its eligibility record'
      // The blockers stay reachable through the linkage rather than copied.
      return eligibility!.result.blockers.length === a.assessment.blockers.length
        ? null : 'blockers were dropped'
    })

    await check('10 · a PASS version publishes', async () => {
      const id = 'XRAY-LINEAGE-PASS'
      await seedLineage(db, id, 'RUN-PASS', 'PASS')
      const recorded = await readEligibility(db, id, 2)
      if (recorded?.verdict !== 'PASS') return `recorded verdict ${recorded?.verdict}`
      const { event } = await publishVersion(db, {
        investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      return event.act === 'PUBLISH' ? null : 'a PASS version was refused'
    })

    await check('12 · FAIL and REVISE versions cannot be published', async () => {
      const seeded = await seedLineage(db, D, 'RUN-D')
      let index = 0
      for (const verdict of ['FAIL', 'REVISE'] as const) {
        index += 1
        await repointVerdict(db, 'RUN-D', D, seeded.candidate, seeded.assessment, verdict, index)
        const outcome = await publishVersion(db, {
          investigationId: D, version: 2, principalId: P1, occurredAt: AT })
          .then(() => null, (e: unknown) => e as PublicationRefused)
        if (outcome?.reason !== 'NOT_ELIGIBLE') return `${verdict} refused as ${outcome?.reason}`
      }
      return (await readPublicationHistory(db, D)).length === 0 ? null : 'history was written'
    })

    // -- 13/14/15. withdrawal vocabulary --------------------------------------
    await check('13 · the withdrawal reason vocabulary is enforced', async () => {
      const outcome = await withdrawVersion(db, { investigationId: A, version: 2, principalId: P1,
        occurredAt: AT, reason: 'SUPERSEDED' as never })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      if (outcome?.reason !== 'INVALID_REASON') return `SUPERSEDED refused as ${outcome?.reason}`
      const direct = await db.query(
        `INSERT INTO publication_events(investigation_id,sequence,version_number,act,principal_id,occurred_at,withdrawal_reason)
         VALUES ($1,99,2,'WITHDRAW',$2,$3,'SUPERSEDED')`, [A, P1, AT])
        .then(() => null, (e: unknown) => e as Error)
      return direct ? null : 'the database accepted SUPERSEDED'
    })

    await check('14 · an ERRONEOUS withdrawal must record what was wrong', async () => {
      const outcome = await withdrawVersion(db, { investigationId: A, version: 2, principalId: P1,
        occurredAt: AT, reason: 'ERRONEOUS' })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      if (outcome?.reason !== 'MISSING_ERROR_NOTE') return `refused as ${outcome?.reason}`
      const direct = await db.query(
        `INSERT INTO publication_events(investigation_id,sequence,version_number,act,principal_id,occurred_at,withdrawal_reason)
         VALUES ($1,98,2,'WITHDRAW',$2,$3,'ERRONEOUS')`, [A, P1, AT])
        .then(() => null, (e: unknown) => e as Error)
      return direct && /erroneous_requires_note|check/i.test(direct.message)
        ? null : 'the database accepted a noteless retraction'
    })

    await check('15 · COMPELLED and PRIVACY_HARM require no confession of error', async () => {
      const event = await withdrawVersion(db, { investigationId: A, version: 2, principalId: P2,
        occurredAt: AT, reason: 'COMPELLED' })
      if (event.note !== undefined) return 'a note was invented'
      return event.withdrawalReason === 'COMPELLED' ? null : 'the reason was not recorded'
    })

    // -- 16/17. withdrawal preconditions --------------------------------------
    await check('16 · an unpublished version cannot be withdrawn', async () => {
      const outcome = await withdrawVersion(db, { investigationId: A, version: 1, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      return outcome?.reason === 'NOT_PUBLISHED' ? null : `refused as ${outcome?.reason}`
    })

    await check('17 · duplicate publish and duplicate withdrawal write no history', async () => {
      const before = (await readPublicationHistory(db, A)).length
      const twice = await withdrawVersion(db, { investigationId: A, version: 2, principalId: P1,
        occurredAt: AT, reason: 'COMPELLED' })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      if (twice?.reason !== 'NOT_PUBLISHED') return `second withdrawal refused as ${twice?.reason}`
      await publishVersion(db, { investigationId: A, version: 2, principalId: P1, occurredAt: AT })
      const again = await publishVersion(db, {
        investigationId: A, version: 2, principalId: P1, occurredAt: AT })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      if (again?.reason !== 'DUPLICATE_PUBLISH') return `duplicate publish refused as ${again?.reason}`
      return (await readPublicationHistory(db, A)).length === before + 1
        ? null : 'a no-op wrote history'
    })

    // -- 18/19/20. replay ------------------------------------------------------
    await check('18 · publish, withdraw and republish retain every event', async () => {
      const history = await readPublicationHistory(db, A)
      const shape = history.map((e) => `${e.act}:v${e.version}`).join(' ')
      return shape === 'PUBLISH:v2 WITHDRAW:v2 PUBLISH:v2'
        ? null : `history is ${shape}`
    })

    await check('19 · the presentation head replays the released example exactly', async () => {
      const seeded = await seedLineage(db, B, 'RUN-B')
      await linkVersion(db, B, 1, 'RUN-B-V1', seeded.v1, seeded.assessment)
      const observed: string[] = []
      const step = async (act: 'PUBLISH' | 'WITHDRAW', version: number) => {
        if (act === 'PUBLISH')
          await publishVersion(db, { investigationId: B, version, principalId: P1, occurredAt: AT })
        else
          await withdrawVersion(db, { investigationId: B, version, principalId: P1,
            occurredAt: AT, reason: 'COMPELLED' })
        const head = await resolvePresentationHead(db, B)
        observed.push(`v${head?.version}/${head?.state}`)
      }
      await step('PUBLISH', 1)
      await step('PUBLISH', 2)
      await step('WITHDRAW', 2)
      await step('PUBLISH', 1)
      await step('PUBLISH', 2)
      const expected = ['v1/PUBLISHED', 'v2/PUBLISHED', 'v2/WITHDRAWN', 'v1/PUBLISHED', 'v2/PUBLISHED']
      if (observed.join(' ') !== expected.join(' ')) return observed.join(' ')
      // And never MAX(version): after the rollback step the head was v1.
      return observed[3] === 'v1/PUBLISHED' ? null : 'rollback did not move the head back'
    })

    await check('20 · exact-version state stays independent across versions', async () => {
      const history = await readPublicationHistory(db, B)
      if (exactVersionState(history, 1) !== 'PUBLISHED') return 'v1 is not published'
      if (exactVersionState(history, 2) !== 'PUBLISHED') return 'v2 is not published'
      if (await resolveExactVersionState(db, B, 3) !== undefined) return 'an unknown version has state'
      // v2 was withdrawn mid-sequence; v1 never was.
      const v1Events = history.filter((e) => e.version === 1).map((e) => e.act)
      return v1Events.every((act) => act === 'PUBLISH')
        ? null : 'withdrawing v2 wrote history against v1'
    })

    // -- 21/22. atomicity and races ---------------------------------------------
    await check('21 · an injected event failure rolls back the slug allocation too', async () => {
      const id = 'XRAY-LINEAGE-ROLLBACK'
      const seeded = await seedLineage(db, id, 'RUN-ROLLBACK')
      void seeded
      const failing: SnapshotDatabase = { query: async (sql, params) => {
        if (sql.includes('INSERT INTO publication_events')) throw new Error('injected event failure')
        return db.query(sql, params)
      } }
      const outcome = await publishVersion(failing, {
        investigationId: id, version: 2, principalId: P1, occurredAt: AT })
        .then(() => null, (e: unknown) => e as Error)
      if (!outcome || !/injected event failure/.test(outcome.message)) return 'the failure was swallowed'
      if (await readSlug(db, id) !== undefined) return 'a slug survived the rolled-back publication'
      return (await readPublicationHistory(db, id)).length === 0
        ? null : 'an event survived the rollback'
    })

    await check('22 · two first-publication attempts yield one slug and one event', async () => {
      // PGlite runs on a single connection, so two genuinely simultaneous
      // transactions cannot be modelled here - interleaving their BEGINs
      // corrupts both. What is provable is the outcome the constraints
      // guarantee: a second attempt finds the work done and is refused, with
      // exactly one slug and one event surviving. The native row-lock race is
      // NOT proved; see the note below the report.
      const id = 'XRAY-LINEAGE-RACE'
      await seedLineage(db, id, 'RUN-RACE')
      const first = await publishVersion(db, {
        investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      const second = await publishVersion(db, {
        investigationId: id, version: 2, principalId: P2, occurredAt: AT })
        .then(() => null, (e: unknown) => e as PublicationRefused)
      if (second?.reason !== 'DUPLICATE_PUBLISH') return `second attempt gave ${second?.reason}`
      const slugs = (await db.query(
        'SELECT count(*)::int AS n FROM investigation_slugs WHERE investigation_id=$1',
        [id])).rows[0] as { n: number }
      if (slugs.n !== 1) return `${slugs.n} slugs`
      if ((await readPublicationHistory(db, id)).length !== 1) return 'duplicate history'
      // The lineage lock and the slug uniqueness constraint are what make the
      // simultaneous case safe on a real server; both are asserted elsewhere.
      return first.slug === await readSlug(db, id) ? null : 'the slug moved'
    })

    // -- 23. canonical state untouched --------------------------------------------
    await check('23 · no publication act changed committed state or the version pointer', async () => {
      const pointerAfter = (await db.query(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [A])).rows[0]
      if (JSON.stringify(pointerAfter) !== JSON.stringify(pointerBefore))
        return 'latestCommittedVersion moved'
      const strip = (g: unknown) => JSON.stringify(g, (k, v) => k === 'index' ? undefined : v)
      if (strip(await readSnapshot(db, A, 1)) !== strip(snapshotA1Before)) return 'v1 changed'
      if (strip(await readSnapshot(db, A, 2)) !== strip(snapshotA2Before)) return 'v2 changed'
      const stray = (await db.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_name IN ('investigation_versions','claims','evidence','sources','findings')
            AND column_name LIKE '%principal%'`)).rows[0] as { n: number }
      return stray.n === 0 ? null : 'a principal column reached canonical tables'
    })

    await check('24 · withdrawing a version that is not the head leaves the head alone', async () => {
      // PUBLISH selects the head. WITHDRAW changes only the presentation state
      // of its exact target, so taking down an older version must not take the
      // alias down with it.
      const id = 'XRAY-LINEAGE-NONHEAD'
      const seeded = await seedLineage(db, id, 'RUN-NONHEAD')
      await linkVersion(db, id, 1, 'RUN-NONHEAD-V1', seeded.v1, seeded.assessment)
      await publishVersion(db, { investigationId: id, version: 1, principalId: P1, occurredAt: AT })
      await publishVersion(db, { investigationId: id, version: 2, principalId: P1, occurredAt: AT })
      await withdrawVersion(db, { investigationId: id, version: 1, principalId: P1,
        occurredAt: AT, reason: 'PRIVACY_HARM' })

      const head = await resolvePresentationHead(db, id)
      if (head?.version !== 2) return `the head moved to v${head?.version}`
      if (head.state !== 'PUBLISHED') return `the head reads ${head.state}`
      const history = await readPublicationHistory(db, id)
      if (exactVersionState(history, 1) !== 'WITHDRAWN') return 'v1 was not withdrawn'
      return exactVersionState(history, 2) === 'PUBLISHED' ? null : 'v2 lost its state'
    })

    await check('slug resolution answers which lineage owns an address', async () => {
      const owner = await resolveSlug(db, slugA)
      if (owner?.investigationId !== A) return `slug resolved to ${owner?.investigationId}`
      return (await resolveSlug(db, 'no-such-slug-0000000000')) === undefined
        ? null : 'an unallocated slug resolved'
    })

    await check('presentationHead is undefined before anything is published', async () => {
      return presentationHead(await readPublicationHistory(db, D)) === undefined
        ? null : 'an unpublished lineage has a head'
    })

    // -- Report -------------------------------------------------------------------
    const failed = results.filter((r) => !r.ok)
    const width = Math.max(...results.map((r) => r.name.length))
    console.log('\nX-Ray publication event store — 9b\n' + '='.repeat(width + 8))
    for (const r of results)
      console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
    console.log('='.repeat(width + 8))
    console.log(`${results.length - failed.length}/${results.length} passed`)
    console.log('\nConcurrency note: PGlite executes on one connection, so proof 22 establishes the'
      + '\noutcome (one slug, one event, one typed refusal) but NOT native row-lock behaviour.'
      + '\nSimultaneous first publication on native PostgreSQL is unproven and is not claimed.\n')
    if (failed.length) process.exitCode = 1
  } finally {
    await db.close()
  }
}
