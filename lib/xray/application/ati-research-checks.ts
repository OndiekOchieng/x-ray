/**
 * ATI research bridge checks (#10 slice 10d).
 *
 * WHAT THIS GATE HAS TO PROVE
 * ===========================
 * Not that ATI has a working path — that a received record gets no shortcut,
 * no privileged evidence status, and no second version writer. Almost every
 * check here asserts that some existing rule still applies.
 *
 * The run is real: `startReevaluation` seeds from a committed snapshot,
 * `runPipeline` executes every research stage and both control gates, and
 * `GraduationService` promotes, assesses and commits on #7's rules unchanged.
 * The stages are deterministic stubs which make the canonical decisions
 * themselves, because that boundary is what is under test.
 *
 * ONE BLOCKED GROUP
 * =================
 * The `B` checks record, rather than describe, a blocker found while building
 * this: new evidence bearing on an already-graded claim cannot cross a stage
 * boundary. See the 10d report. Those checks assert the current failure exactly
 * so that the remediation, when authorised, has something to flip.
 *
 * HONEST LIMITATION
 * =================
 * PGlite runs one connection. Predecessor conflict is proven by committing a
 * competing version and then attempting the stale commit, deterministically.
 * Native concurrent commit scheduling is not proven here.
 *
 * Run:  pnpm check:ati-research
 */

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import type { XRayGraph } from '@/lib/xray/selectors'
import { readSnapshot } from '@/lib/xray/persistence/snapshot'
import {
  AT, ATI_MIGRATIONS, MIGRATIONS, commitFurtherVersion, seedLineage,
} from '@/lib/xray/persistence/publication-check-support'
import { readExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import { loadCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { readExecutionCause } from '@/lib/xray/persistence/execution-cause'
import { readReEvaluationAudit, VersionConflict } from '@/lib/xray/persistence/version-commit'
import { ATIActionService } from './ati-service'
import { GraduationService } from './graduation-service'
import {
  ATIResearchBridge, IntakeProcessingRejected, intakeResearchAdapter,
  type ATIIntakeMaterial, type IntakeProcessingOutcome,
} from './ati-research-bridge'
import {
  InlineExecutionService, type ExecutionRuntime, type ReevaluationContext,
} from './inline-execution'
import {
  ATI_PROPOSAL, EXISTING_CLAIM, atiStagePlan, type AtiStagePlanOptions,
} from './ati-research-support'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

async function check(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try { detail = await fn() } catch (err) { detail = `threw: ${(err as Error).message}` }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const rejectedWith = async (code: string, act: () => Promise<unknown>): Promise<string | null> => {
  let error: Error | null = null
  try { await act() } catch (caught) { error = caught as Error }
  if (error === null) return `accepted; expected ${code}`
  if (!(error instanceof IntakeProcessingRejected)) return `threw ${error.name}: ${error.message}`
  return error.code === code ? null : `rejected with ${error.code}, expected ${code}`
}

const sha256 = (content: string) =>
  `sha256:${createHash('sha256').update(content).digest('hex')}`

const RECORD = 'Award notice, Lot 3 supervision consultancy. Contract sum KSh 412,000,000.'
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const material = (intakeId: string, content = RECORD): ATIIntakeMaterial => ({
  intakeId, boundedContent: content, truncated: false, mediaType: 'application/pdf',
  locator: 'released-record.pdf',
  observedMetadata: {
    title: 'Award notice — Lot 3 supervision consultancy',
    institution: 'Kenya National Highways Authority (KeNHA)',
    publisher: 'Kenya National Highways Authority (KeNHA)',
    publishedAt: '2026-08',
  },
})

const INV = 'XRAY-ATI-RESEARCH'
const graphOf = (value: XRayGraph) => {
  const { index: _index, ...rest } = value
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>
}

main().catch((error) => { console.error(error); process.exitCode = 1 })

async function main(): Promise<void> {
  const db = new PGlite()
  try {
    for (const n of [...MIGRATIONS, ...ATI_MIGRATIONS])
      await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))

    const seeded = await seedLineage(db, INV, 'RUN-ATI-RESEARCH-SEED')
    const action = new ATIActionService(db, () => AT)
    const graduation = new GraduationService(db, () => AT)

    const gapRow = (await db.query<{ id: string; resolving_evidence: string[]; claim_ids: string[] }>(
      `SELECT g.id, g.resolving_evidence,
              (SELECT array_agg(l.claim_id ORDER BY l.ordinal) FROM gap_claims l
                WHERE l.investigation_id=g.investigation_id AND l.version_number=g.version_number
                  AND l.owner_id=g.id) AS claim_ids
         FROM gaps g
        WHERE g.investigation_id=$1 AND g.version_number=2 AND g.ati_eligible
        ORDER BY g.id LIMIT 1`, [INV])).rows[0]

    /** A filed request carrying one response with the given records. */
    const filedWithRecords = async (
      requestId: string, records: readonly { describedAs: string; material?: string }[],
    ) => {
      await action.createDraft({
        investigationId: INV, originVersion: 2, gapId: gapRow.id,
        requestedRecords: [gapRow.resolving_evidence[0]],
        publicInterestContext: 'The award figure is unverified in the public record.',
        requestId, createdAt: '2026-09-21T08:00:00Z',
      })
      await action.exportRevision(requestId, 1, '2026-09-21T09:00:00Z')
      await action.confirmSubmitted(requestId, 1, { humanConfirmed: true }, '2026-09-22T10:00:00Z')
      return action.recordResponseReceived(requestId, {
        receivedAt: '2026-10-15T09:00:00Z', completeness: 'FINAL',
        intakes: records.map((record) => ({
          describedAs: record.describedAs,
          ...(record.material === undefined ? {} : { material: record.material }),
        })),
      })
    }

    let planOptions: AtiStagePlanOptions = {}
    let currentMaterial: ATIIntakeMaterial = material('placeholder')
    let seenContext: ReevaluationContext | undefined
    const runtime: ExecutionRuntime = {
      async initial() { throw new Error('not used by this gate') },
      async resume() { throw new Error('not used by this gate') },
      async reevaluation(context) {
        seenContext = context
        return {
          stages: atiStagePlan(planOptions),
          adapters: { research: intakeResearchAdapter(currentMaterial, ATI_PROPOSAL) },
          stopEvidence: { saturationObserved: true },
        }
      },
    }
    let runCounter = 0
    const execution = new InlineExecutionService(
      db, runtime, () => AT, () => `RUN-ATI-D-${++runCounter}`)
    const bridge = new ATIResearchBridge(db, execution, () => AT)

    const v1Before = JSON.stringify(await readSnapshot(db, INV, 1))
    const v2Before = JSON.stringify(await readSnapshot(db, INV, 2))
    const lifecycleBefore = new Map<string, string>()

    // === binding, before anything executes =================================

    await check('1 · an unknown intake is rejected before any run exists', async () => {
      const failure = await rejectedWith('ATI/INTAKE_NOT_FOUND', () =>
        bridge.processIntake({ intakeId: 'NOT-AN-INTAKE',
          material: material('NOT-AN-INTAKE') }))
      if (failure !== null) return failure
      const runs = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM execution_runs')).rows
      return runs[0].n === 1 ? null : `${runs[0].n} execution runs exist`
    })

    await check('2 · material that names another intake is rejected', async () => {
      const filed = await filedWithRecords('ATI-D-OTHER',
        [{ describedAs: 'Award notice', material: RECORD }])
      return rejectedWith('ATI/INTAKE_WRONG_INVESTIGATION', () =>
        bridge.processIntake({ intakeId: filed.intakeIds[0],
          material: material('ATI-D-OTHER/R1/I9') }))
    })

    await check('3 · material whose digest differs from the receipt is rejected before execution', async () => {
      const filed = await filedWithRecords('ATI-D-MISMATCH',
        [{ describedAs: 'Award notice', material: RECORD }])
      const intakeId = filed.intakeIds[0]
      const runsBefore = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM execution_runs')).rows[0].n
      const failure = await rejectedWith('ATI/MATERIAL_DIGEST_MISMATCH', () =>
        bridge.processIntake({ intakeId, material: material(intakeId, 'different bytes entirely') }))
      if (failure !== null) return failure
      // Neither a run, nor a workspace, nor a cause, nor canonical state.
      const after = (await db.query<{ runs: number; workspaces: number; causes: number }>(
        `SELECT (SELECT count(*) FROM execution_runs) AS runs,
                (SELECT count(*) FROM candidate_workspaces) AS workspaces,
                (SELECT count(*) FROM execution_run_causes) AS causes`)).rows[0]
      if (Number(after.runs) !== runsBefore) return 'a run was created for mismatched material'
      if (Number(after.causes) !== 0) return 'a cause was recorded for mismatched material'
      // And a caller's own stated digest must match the bytes it supplied.
      return rejectedWith('ATI/MATERIAL_DIGEST_MISMATCH', () => bridge.processIntake({
        intakeId, material: { ...material(intakeId), contentDigest: sha256('other') } }))
    })

    await check('4/5/6 · receipt digests are checked, and their provenance is never rewritten', async () => {
      // COMPUTED at receipt: 10c hashed bytes it held.
      const computed = await filedWithRecords('ATI-D-COMPUTED',
        [{ describedAs: 'Award notice', material: RECORD }])
      const computedBinding = await bridge.bindMaterial(
        computed.intakeIds[0], material(computed.intakeIds[0]))
      if (computedBinding.receiptDigestOrigin !== 'COMPUTED'
        || !computedBinding.receiptDigestVerified)
        return `computed receipt: ${JSON.stringify(computedBinding)}`

      // SUPPLIED at receipt: somebody stated it. Matching bytes prove
      // correspondence to that claim — not that X-Ray hashed them at receipt.
      await action.createDraft({
        investigationId: INV, originVersion: 2, gapId: gapRow.id,
        requestedRecords: [gapRow.resolving_evidence[0]],
        publicInterestContext: 'context', requestId: 'ATI-D-SUPPLIED',
        createdAt: '2026-09-21T08:00:00Z',
      })
      await action.exportRevision('ATI-D-SUPPLIED', 1, '2026-09-21T09:00:00Z')
      await action.confirmSubmitted('ATI-D-SUPPLIED', 1, { humanConfirmed: true },
        '2026-09-22T10:00:00Z')
      const supplied = await action.recordResponseReceived('ATI-D-SUPPLIED', {
        receivedAt: '2026-10-15T09:00:00Z', completeness: 'FINAL',
        intakes: [{ describedAs: 'Award notice', suppliedDigest: sha256(RECORD) }],
      })
      const suppliedId = supplied.intakeIds[0]
      const suppliedBinding = await bridge.bindMaterial(suppliedId, material(suppliedId))
      if (suppliedBinding.receiptDigestOrigin !== 'SUPPLIED')
        return `supplied receipt: ${String(suppliedBinding.receiptDigestOrigin)}`
      if (!suppliedBinding.receiptDigestVerified) return 'a matching supplied digest did not verify'
      const stored = (await db.query<{ content_hash_origin: string }>(
        'SELECT content_hash_origin FROM ati_response_intakes WHERE intake_id=$1',
        [suppliedId])).rows[0]
      if (stored.content_hash_origin !== 'SUPPLIED')
        return `receipt provenance was rewritten to ${stored.content_hash_origin}`

      // No receipt digest at all: processing computes one for this run and the
      // receipt row stays exactly as 10c wrote it.
      const bare = await filedWithRecords('ATI-D-NODIGEST', [{ describedAs: 'Award notice' }])
      const bareId = bare.intakeIds[0]
      const receiptBefore = JSON.stringify((await db.query(
        'SELECT * FROM ati_response_intakes WHERE intake_id=$1', [bareId])).rows[0])
      const bareBinding = await bridge.bindMaterial(bareId, material(bareId))
      if (bareBinding.receiptDigest !== undefined) return 'a receipt digest was invented'
      if (bareBinding.receiptDigestVerified) return 'an absent digest reported as verified'
      if (bareBinding.suppliedDigest !== sha256(RECORD)) return 'the execution digest is wrong'
      const receiptAfter = JSON.stringify((await db.query(
        'SELECT * FROM ati_response_intakes WHERE intake_id=$1', [bareId])).rows[0])
      return receiptBefore === receiptAfter ? null : 'the receipt row was rewritten'
    })

    // === the committed path ================================================

    const filed = await filedWithRecords('ATI-D-1',
      [{ describedAs: 'Award notice, 4 pages', material: RECORD }])
    const intakeId = filed.intakeIds[0]
    currentMaterial = material(intakeId)
    const stagesRan: string[] = []
    let seedGraph: XRayGraph | undefined
    planOptions = { sources: 1, ran: stagesRan, observeSeed: (graph) => { seedGraph = graph } }

    for (const request of ['ATI-D-1', 'ATI-D-OTHER', 'ATI-D-COMPUTED']) {
      lifecycleBefore.set(request,
        JSON.stringify(await action.readLifecycle(request)))
    }

    let committed: IntakeProcessingOutcome | undefined
    const addedSources = (): readonly string[] =>
      committed?.result === 'COMMITTED' ? committed.addedSourceIds : []
    await check('happy path · one intake yields one committed successor version', async () => {
      committed = await bridge.processIntake({
        intakeId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE,
        detail: 'A record released under an information request was considered.',
      })
      if (committed.result !== 'COMMITTED') {
        const audit = await readExecutionAudit(db, `RUN-ATI-D-${runCounter}`)
        const failed = audit.journal.entries
          .map((entry) => (entry as { run?: { stage?: string; error?: string } }).run)
          .filter((run) => run?.error !== undefined)
        return `result ${committed.result}: ${JSON.stringify(failed)}`
      }
      return committed.version === 3 ? null : `version ${committed.version}`
    })

    const runId = committed?.result === 'COMMITTED' ? committed.executionRunId : 'RUN-ATI-D-NONE'

    // === what the run was, and where it came from ==========================

    await check('7 · the run carries a durable cause naming the exact intake and response', async () => {
      const cause = await readExecutionCause(db, runId)
      if (!cause) return 'the run has no recorded cause'
      if (cause.kind !== 'ATI_INTAKE') return `kind ${cause.kind}`
      if (cause.atiIntakeId !== intakeId) return `intake ${String(cause.atiIntakeId)}`
      if (cause.atiResponseRef !== 'ATI_RESPONSE:ATI-D-1:1')
        return `response ${String(cause.atiResponseRef)}`
      if (cause.expectedPredecessorVersion !== 2)
        return `predecessor ${cause.expectedPredecessorVersion}`
      if (cause.intendedTrigger !== 'ATI_RESPONSE_RECEIVED')
        return `trigger ${cause.intendedTrigger}`
      // The whole chain is reconstructable, including for a run that adds
      // nothing: response → intake → run → version → added sources.
      const runs = await bridge.runsForIntake(intakeId)
      if (runs.length !== 1 || runs[0].committedVersion !== 3)
        return `runs for intake: ${JSON.stringify(runs)}`
      // And the cause cannot be edited afterwards.
      const mutated = await db.query(
        'UPDATE execution_run_causes SET reference=$1 WHERE execution_run_id=$2',
        ['rewritten', runId]).then(() => null, (e: unknown) => e as Error)
      return mutated === null ? 'the recorded cause was editable' : null
    })

    await check('8/9 · the candidate was seeded from the exact latest committed predecessor', async () => {
      if (!seenContext) return 'the runtime was never asked to plan'
      if (seenContext.expectedPredecessorVersion !== 2)
        return `seeded from v${seenContext.expectedPredecessorVersion}`
      const committedV2 = await readSnapshot(db, INV, 2)
      if (JSON.stringify(graphOf(seenContext.predecessor)) !== JSON.stringify(graphOf(committedV2)))
        return 'the plan was handed something other than the committed v2 snapshot'
      if (!seedGraph) return 'no stage observed the seed'
      // Every canonical collection is inherited whole, before any stage output.
      for (const collection of ['claims', 'sources', 'sourcePositions', 'evidence',
        'evidenceProvenance', 'discrepancies', 'disconfirmations', 'findings', 'gaps',
        'sourceDependencies'] as const) {
        const before = JSON.stringify(committedV2[collection])
        const seen = JSON.stringify(seedGraph[collection])
        if (before !== seen) return `${collection} was not inherited exactly`
      }
      return null
    })

    await check('11 · the predecessor\'s completion state is not carried into the new run', async () => {
      if (!seedGraph) return 'no stage observed the seed'
      const investigation = seedGraph.investigation
      if (investigation.currentVersion !== 3) return `currentVersion ${investigation.currentVersion}`
      if (investigation.status !== 'RUNNING') return `status ${investigation.status}`
      if (investigation.completedAt !== undefined) return 'completedAt was inherited'
      if (investigation.researchStop !== undefined) return 'researchStop was inherited'
      if (investigation.stageRuns.length !== 0)
        return `${investigation.stageRuns.length} inherited stage runs`
      // Identity and context do carry.
      const predecessor = (await readSnapshot(db, INV, 2)).investigation
      return investigation.id === predecessor.id
        && investigation.surfaceSourceId === predecessor.surfaceSourceId
        && investigation.protocolVersion === predecessor.protocolVersion
        ? null : 'identity or context was lost'
    })

    await check('12/13 · material enters at the retrieval boundary and cannot be a Source', async () => {
      const bridgeSource = stripComments(
        readFileSync(new URL('./ati-research-bridge.ts', import.meta.url), 'utf8'))
      const materialDeclaration = bridgeSource.slice(
        bridgeSource.indexOf('export interface ATIIntakeMaterial'),
        bridgeSource.indexOf('export interface MaterialBinding'))
      for (const forbidden of ['evidenceClass', 'originStatus', 'accessibility',
        'sourceId', 'claimIds', 'relationship', 'proposition']) {
        if (materialDeclaration.includes(forbidden))
          return `ATIIntakeMaterial carries ${forbidden}`
      }
      // What the adapter can return at all: material, never an artifact.
      const adapter = intakeResearchAdapter(currentMaterial, ATI_PROPOSAL)
      const reached = await adapter.retrieve('ati-intake')
      if (reached.kind !== 'AVAILABLE') return 'the adapter could not return its own material'
      const keys = Object.keys(reached.value)
      const minting = keys.filter((key) =>
        /^(evidenceClass|originStatus|accessibility|sourceType|claimIds|relationship)$/.test(key))
      if (minting.length > 0) return `the adapter returned ${minting.join(', ')}`
      if (!('extract' in reached.value)) return 'the adapter returned no material'
      // The committed Source's determinations came from the stage.
      const v3 = await readSnapshot(db, INV, 3)
      const added = v3.sources.find((item) => item.id === addedSources()[0])!
      return added.evidenceClass === 'PRIMARY' && added.originStatus === 'ORIGINATING'
        && added.accessibility === 'RETRIEVED'
        ? null : `the added source reads ${JSON.stringify(added)}`
    })

    await check('14 · every research stage and both control gates ran', async () => {
      const expected = ['PLAN', 'TRACE', 'PROVENANCE', 'DISCONFIRM', 'RECONCILE', 'GRADE', 'GAPS']
      if (JSON.stringify(stagesRan) !== JSON.stringify(expected))
        return `stages ran ${JSON.stringify(stagesRan)}`
      const audit = await readExecutionAudit(db, runId)
      const gates = audit.journal.gateEntries().map((entry) => entry.gate)
      if (!gates.includes('VALIDATE')) return 'VALIDATE did not run'
      if (!gates.includes('REVIEW')) return 'REVIEW did not run'
      if (audit.validations.length === 0) return 'no validation result was recorded'
      return audit.validations.at(-1)!.result.valid ? null : 'VALIDATE recorded an invalid graph'
    })

    await check('15 · added Source ids come from stage allocation, never from the intake', async () => {
      const added = committed?.result === 'COMMITTED' ? committed.addedSourceIds : []
      if (added.length !== 1) return `${added.length} added source(s)`
      const [sourceId] = added
      if (sourceId.includes(intakeId) || sourceId.includes('released-record')
        || sourceId.includes('.pdf')) return `${sourceId} carries the intake or filename`
      return /^SRC-\d+$/.test(sourceId) ? null : `${sourceId} is not an allocated source id`
    })

    // === which claims were re-evaluated ===================================

    await check('16/18/19 · the audit set is evidence-driven, not the origin gap\'s claims', async () => {
      const reEvaluated = committed?.result === 'COMMITTED' ? committed.reEvaluatedClaimIds : ['?']
      const gapClaims = gapRow.claim_ids ?? []
      if (gapClaims.length === 0) return 'the origin gap names no claims, so this proves nothing'
      // The gap names claims. None of them changed, so none is recorded — a gap
      // says what someone expected the record to bear on, not what it did.
      const wronglyIncluded = reEvaluated.filter((id) => gapClaims.includes(id))
      if (wronglyIncluded.length > 0)
        return `origin-gap claims recorded without changing: ${wronglyIncluded.join(', ')}`
      // A newly discovered claim gets its first evaluation, not a re-evaluation.
      const v3 = await readSnapshot(db, INV, 3)
      const discovered = v3.claims.filter((claim) => claim.origin === 'DISCOVERED'
        && !seedGraph!.claims.some((seed) => seed.id === claim.id))
      if (discovered.length !== 1) return `${discovered.length} newly discovered claim(s)`
      if (reEvaluated.includes(discovered[0].id))
        return `discovered claim ${discovered[0].id} was recorded as re-evaluated`
      return reEvaluated.length === 0 ? null : `re-evaluated ${JSON.stringify(reEvaluated)}`
    })

    await check('20/21/22 · an ATI_RESPONSE cause is written, read back exactly, and is a real key', async () => {
      // Driven at the persistence layer, because the pipeline cannot yet carry
      // new evidence onto an already-graded claim — see the B group and the
      // 10d report. The audit-writing and FK halves are provable regardless.
      const responseRef = 'ATI_RESPONSE:ATI-D-1:1'
      const v3 = await readSnapshot(db, INV, 3)

      // Relationally real, proven where it matters: a commit whose audit names
      // a response that does not exist is refused by the deferred foreign key,
      // and takes the whole version with it.
      const dangling = await commitFurtherVersion(db, INV, 'RUN-ATI-DANGLING', v3, 4, {
        reEvaluationAudit: [
          { claimId: 'C001', reason: 'EXTERNAL_RECORD_RESPONSE',
            causes: [{ kind: 'ATI_RESPONSE', id: 'ATI_RESPONSE:NOBODY:1' }] },
          { claimId: 'C002', reason: 'EXTERNAL_RECORD_RESPONSE',
            causes: [{ kind: 'ATI_RESPONSE', id: 'ATI_RESPONSE:NOBODY:1' }] },
        ],
      }).then(() => null, (e: unknown) => e as Error)
      if (dangling === null) return 'a dangling response reference committed'
      if (!/foreign key|violates/i.test(dangling.message))
        return `dangling reference refused as: ${dangling.message}`
      const written = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM investigation_versions
          WHERE investigation_id=$1 AND version_number=4`, [INV])).rows
      if (written[0].n !== 0) return 'a version survived its refused causal reference'

      const commitProbe = await commitFurtherVersion(db, INV, 'RUN-ATI-CAUSE', v3, 4, {
          reEvaluationAudit: [
            { claimId: 'C001', reason: 'EXTERNAL_RECORD_RESPONSE',
              detail: 'Reassessed against a released record.',
              causes: [{ kind: 'ATI_RESPONSE', id: responseRef }] },
            { claimId: 'C002', reason: 'EXTERNAL_RECORD_RESPONSE',
              causes: [{ kind: 'ATI_RESPONSE', id: responseRef }] },
          ],
        })
      if (!commitProbe) return 'the probe version did not commit'
      const audit = await readReEvaluationAudit(db, INV, 4)
      if (audit.length !== 2) return `${audit.length} audit rows`
      for (const row of audit) {
        if (row.reason !== 'EXTERNAL_RECORD_RESPONSE') return `${row.claimId} reason ${row.reason}`
        const cause = row.causes?.[0]
        if (!cause || cause.kind !== 'ATI_RESPONSE' || cause.id !== responseRef)
          return `${row.claimId} cause ${JSON.stringify(cause)}`
      }
      // And the reference resolves to the response the run actually answered.
      const named = (await db.query<{ request_id: string; sequence: number }>(
        'SELECT request_id, sequence FROM ati_responses WHERE id=$1', [responseRef])).rows
      return named.length === 1 && named[0].request_id === 'ATI-D-1' && named[0].sequence === 1
        ? null : `the causal reference resolves to ${JSON.stringify(named)}`
    })

    await check('23 · the committed version carries the ATI trigger and its exact predecessor', async () => {
      const v3 = await readSnapshot(db, INV, 3)
      if (v3.version!.trigger !== 'ATI_RESPONSE_RECEIVED')
        return `trigger ${v3.version!.trigger}`
      if (v3.version!.supersedesVersion !== 2)
        return `supersedes ${String(v3.version!.supersedesVersion)}`
      return v3.version!.version === 3 && v3.investigation.currentVersion === 3
        ? null : 'version arithmetic is wrong'
    })

    await check('26/27 · graduation is required before commit, on #7\'s existing rules', async () => {
      const bare = await filedWithRecords('ATI-D-UNASSESSED',
        [{ describedAs: 'Award notice', material: RECORD }])
      const bareId = bare.intakeIds[0]
      currentMaterial = material(bareId)
      const started = await execution.startReevaluation({
        investigationId: INV, expectedPredecessorVersion: 4,
        trigger: 'ATI_RESPONSE_RECEIVED',
        cause: { kind: 'ATI_INTAKE', reference: `intake ${bareId}`,
          atiIntakeId: bareId, atiResponseRef: 'ATI_RESPONSE:ATI-D-UNASSESSED:1' },
      })
      await graduation.promote(INV, started.executionRunId,
        { expectedPredecessor: 4, trigger: 'ATI_RESPONSE_RECEIVED', createdAt: AT })
      const refused = await graduation.commit(INV, started.executionRunId,
        { expectedPredecessor: 4, reEvaluationAudit: [] })
        .then(() => null, (e: unknown) => e as Error)
      if (refused === null) return 'an unassessed candidate committed'
      if (!/graduation assessment/i.test(refused.message)) return `refused as: ${refused.message}`
      // The recorded assessment for the committed run is a real one, and its
      // eligibility is #7's rule, unchanged.
      const assessment = await graduation.latestAssessment(runId)
      if (!assessment) return 'the committed run has no assessment'
      return assessment.verdict === 'PASS' || assessment.verdict === 'BLOCKED'
        ? null : `verdict ${assessment.verdict}`
    })

    await check('28/38 · the predecessor stays byte-identical and its findings addressable', async () => {
      if (JSON.stringify(await readSnapshot(db, INV, 1)) !== v1Before) return 'v1 changed'
      if (JSON.stringify(await readSnapshot(db, INV, 2)) !== v2Before) return 'v2 changed'
      const v2 = await readSnapshot(db, INV, 2)
      const v3 = await readSnapshot(db, INV, 3)
      // v2's findings are still readable at v2, and v3 carries its own.
      if (v2.findings.length === 0) return 'v2 has no findings to address'
      if (v3.findings.length <= v2.findings.length)
        return 'v3 did not add its own finding for the discovered claim'
      const shared = v2.findings[0]
      const atV3 = v3.findings.find((finding) => finding.id === shared.id)
      return atV3 !== undefined ? null : 'an inherited finding is unreachable at v3'
    })

    await check('29/34 · a stale predecessor conflicts and writes no version or acceptance', async () => {
      const stale = await filedWithRecords('ATI-D-STALE',
        [{ describedAs: 'Award notice', material: RECORD }])
      const staleId = stale.intakeIds[0]
      currentMaterial = material(staleId)
      const latest = (await db.query<{ v: number }>(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [INV])).rows[0].v
      const started = await execution.startReevaluation({
        investigationId: INV, expectedPredecessorVersion: latest,
        trigger: 'ATI_RESPONSE_RECEIVED',
        cause: { kind: 'ATI_INTAKE', reference: `intake ${staleId}`,
          atiIntakeId: staleId, atiResponseRef: 'ATI_RESPONSE:ATI-D-STALE:1' },
      })
      await graduation.promote(INV, started.executionRunId,
        { expectedPredecessor: latest, trigger: 'ATI_RESPONSE_RECEIVED', createdAt: AT })
      await graduation.assess(INV, started.executionRunId,
        { behaviors: XRAY_KE_001_ACCEPTANCE })

      // Another version commits first. No rebase, no replay.
      await commitFurtherVersion(db, INV, 'RUN-ATI-OVERTAKE',
        await readSnapshot(db, INV, latest), latest + 1)
      const versionsBefore = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
        [INV])).rows[0].n
      const acceptancesBefore = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_intake_source_acceptances WHERE intake_id=$1',
        [staleId])).rows[0].n

      const conflict = await graduation.commit(INV, started.executionRunId, {
        expectedPredecessor: latest, reEvaluationAudit: [],
        intakeAcceptances: [{ intakeId: staleId, sourceId: 'SRC-ANY', acceptedAt: AT }],
      }).then(() => null, (e: unknown) => e as Error)
      if (conflict === null) return 'a stale commit succeeded'
      const versionsAfter = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
        [INV])).rows[0].n
      const acceptancesAfter = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_intake_source_acceptances WHERE intake_id=$1',
        [staleId])).rows[0].n
      if (versionsAfter !== versionsBefore) return 'a version was written by a conflicted commit'
      if (acceptancesAfter !== acceptancesBefore)
        return 'an acceptance outlived the version it pointed at'
      return conflict instanceof VersionConflict || /Acceptance names source/.test(conflict.message)
        ? null : `refused as: ${conflict.name}: ${conflict.message}`
    })

    await check('30 · a response yielding nothing commits no version and accepts nothing', async () => {
      const duplicate = await filedWithRecords('ATI-D-DUPLICATE',
        [{ describedAs: 'A copy of a record already held', material: RECORD }])
      const duplicateId = duplicate.intakeIds[0]
      currentMaterial = material(duplicateId)
      planOptions = { sources: 0, ran: [] }
      const versionsBefore = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
        [INV])).rows[0].n
      const outcome = await bridge.processIntake({
        intakeId: duplicateId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE })
      if (outcome.result !== 'NO_CANONICAL_CHANGE') return `result ${outcome.result}`
      const versionsAfter = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
        [INV])).rows[0].n
      if (versionsAfter !== versionsBefore) return 'an empty version was committed'
      const accepted = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_intake_source_acceptances WHERE intake_id=$1',
        [duplicateId])).rows[0].n
      if (accepted !== 0) return 'a duplicate was accepted as a source'
      // Not a failure, and not invisible: the run and its cause remain readable.
      const runs = await bridge.runsForIntake(duplicateId)
      if (runs.length !== 1 || runs[0].committedVersion !== null)
        return `runs for the duplicate: ${JSON.stringify(runs)}`
      // The intake stays received and unaccepted, so it can be processed again.
      const lifecycle = await bridge.lifecycleForIntake(duplicateId)
      return lifecycle?.receivedSourceIds.length === 0
        ? null : 'the duplicate reported an accepted source'
    })

    await check('31 · one added Source maps exactly one acceptance', async () => {
      const accepted = (await db.query<{ investigation_id: string; committed_version: number; source_id: string }>(
        `SELECT investigation_id, committed_version, source_id
           FROM ati_intake_source_acceptances WHERE intake_id=$1 ORDER BY ordinal`,
        [intakeId])).rows
      if (accepted.length !== 1) return `${accepted.length} acceptance(s)`
      const [row] = accepted
      if (row.committed_version !== 3) return `accepted against v${row.committed_version}`
      if (row.source_id !== addedSources()[0])
        return `accepted ${row.source_id}, not the added source`
      const lifecycle = await bridge.lifecycleForIntake(intakeId)
      return JSON.stringify(lifecycle?.receivedSourceIds) === JSON.stringify([row.source_id])
        ? null : `lifecycle reports ${JSON.stringify(lifecycle?.receivedSourceIds)}`
    })

    await check('32 · several added Sources map all and only those Sources', async () => {
      const many = await filedWithRecords('ATI-D-MANY',
        [{ describedAs: 'An archive of three records', material: RECORD }])
      const manyId = many.intakeIds[0]
      currentMaterial = material(manyId)
      planOptions = { sources: 3, ran: [] }
      const outcome = await bridge.processIntake({
        intakeId: manyId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE })
      if (outcome.result !== 'COMMITTED') return `result ${outcome.result}`
      if (outcome.addedSourceIds.length !== 3)
        return `${outcome.addedSourceIds.length} added source(s)`
      const accepted = (await db.query<{ source_id: string }>(
        `SELECT source_id FROM ati_intake_source_acceptances
          WHERE intake_id=$1 ORDER BY ordinal`, [manyId])).rows.map((row) => row.source_id)
      if (JSON.stringify([...accepted].sort())
        !== JSON.stringify([...outcome.addedSourceIds].sort()))
        return `accepted ${JSON.stringify(accepted)} for added ${JSON.stringify(outcome.addedSourceIds)}`
      // And only those: nothing inherited came along.
      const version = (await readSnapshot(db, INV, outcome.version)).version!
      return accepted.every((id) => version.addedSourceIds.includes(id))
        ? null : 'an acceptance names a source this version did not add'
    })

    await check('33 · an inherited Source can never be accepted', async () => {
      const latest = (await db.query<{ v: number }>(
        'SELECT latest_committed_version AS v FROM investigations WHERE id=$1', [INV])).rows[0].v
      const inherited = (await readSnapshot(db, INV, latest)).investigation.surfaceSourceId
      const refused = await graduation.commit(INV, runId, {
        expectedPredecessor: 2, reEvaluationAudit: [],
        intakeAcceptances: [{ intakeId, sourceId: inherited, acceptedAt: AT }],
      }).then(() => null, (e: unknown) => e as Error)
      if (refused === null) return 'an inherited source was accepted'
      return /did not add|Acceptance names source|committed/i.test(refused.message)
        ? null : `refused as: ${refused.message}`
    })

    await check('35 · an intake already accepted is not researched a second time', () =>
      rejectedWith('ATI/INTAKE_ALREADY_ACCEPTED', () => bridge.processIntake({
        intakeId, material: material(intakeId), behaviors: XRAY_KE_001_ACCEPTANCE })))

    await check('36 · an uncommitted prior run leaves the intake processable', async () => {
      const retried = await filedWithRecords('ATI-D-RETRY',
        [{ describedAs: 'Award notice', material: RECORD }])
      const retryId = retried.intakeIds[0]
      currentMaterial = material(retryId)
      // A run that cannot reach a committable state.
      planOptions = { sources: 1, bearOnExistingClaim: true, ran: [] }
      const failedRun = await bridge.processIntake({
        intakeId: retryId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE })
      if (failedRun.result !== 'NOT_COMMITTABLE') return `first run: ${failedRun.result}`
      const accepted = (await db.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ati_intake_source_acceptances WHERE intake_id=$1',
        [retryId])).rows[0].n
      if (accepted !== 0) return 'a failed run wrote an acceptance'
      // The intake is not poisoned: a second attempt runs and commits.
      planOptions = { sources: 1, ran: [] }
      const second = await bridge.processIntake({
        intakeId: retryId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE })
      if (second.result !== 'COMMITTED') return `second run: ${second.result}`
      const runs = await bridge.runsForIntake(retryId)
      return runs.length === 2 && runs.filter((run) => run.committedVersion !== null).length === 1
        ? null : `runs for intake: ${JSON.stringify(runs)}`
    })

    await check('37 · the run\'s execution audit stays restart and resume compatible', async () => {
      const audit = await readExecutionAudit(db, runId)
      const workspace = await loadCandidateCheckpoint(db, runId)
      if (JSON.stringify(audit.journal.entries) !== JSON.stringify(workspace.journal.entries))
        return 'the workspace and the audit journal diverge'
      if (workspace.journal.staleStages().length !== 0)
        return `${workspace.journal.staleStages().length} stale stage(s) after a committed run`
      const status = (await db.query<{ status: string; committed_version: number }>(
        'SELECT status, committed_version FROM execution_runs WHERE id=$1', [runId])).rows[0]
      return status.committed_version === 3 ? null : `run committed ${String(status.committed_version)}`
    })

    await check('39 · research changed no ATI action-lifecycle row', async () => {
      for (const [request, before] of lifecycleBefore) {
        const after = JSON.stringify(await action.readLifecycle(request))
        if (request !== 'ATI-D-1' && after !== before) return `${request} changed`
        if (request === 'ATI-D-1') {
          // The only permitted difference is the acceptance mapping research
          // itself produced — the receipt, the events and the revisions stand.
          const beforeParsed = JSON.parse(before) as Record<string, unknown>
          const afterParsed = JSON.parse(after) as Record<string, unknown>
          for (const key of ['revisions', 'events', 'status', 'draftedAt', 'submittedAt']) {
            if (JSON.stringify(beforeParsed[key]) !== JSON.stringify(afterParsed[key]))
              return `ATI-D-1 ${key} changed`
          }
        }
      }
      return null
    })

    // === the blocked group ================================================

    await check('B1 · BLOCKED: new evidence on an already-graded claim fails at the stage boundary', async () => {
      const probe = await filedWithRecords('ATI-D-BLOCKED',
        [{ describedAs: 'Award notice', material: RECORD }])
      const probeId = probe.intakeIds[0]
      currentMaterial = material(probeId)
      planOptions = { sources: 1, bearOnExistingClaim: true, ran: [] }
      const outcome = await bridge.processIntake({
        intakeId: probeId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE })
      if (outcome.result !== 'NOT_COMMITTABLE') return `result ${outcome.result}`
      const audit = await readExecutionAudit(db, outcome.executionRunId)
      const failure = audit.journal.entries
        .map((entry) => (entry as { run?: { stage?: string; error?: string } }).run)
        .find((run) => run?.error !== undefined)
      if (!failure) return 'the run failed without a journalled stage error'
      if (failure.stage !== 'TRACE') return `failed at ${String(failure.stage)}`
      return failure.error?.includes('XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH')
        ? null : `failed with: ${String(failure.error)}`
    })

    await check('B2 · BLOCKED: TRACE cannot repair the mismatch, because it does not own findings', async () => {
      const probe = await filedWithRecords('ATI-D-BLOCKED-2',
        [{ describedAs: 'Award notice', material: RECORD }])
      const probeId = probe.intakeIds[0]
      currentMaterial = material(probeId)
      planOptions = { sources: 1, bearOnExistingClaim: true, traceWritesFinding: true, ran: [] }
      const outcome = await bridge.processIntake({
        intakeId: probeId, material: currentMaterial, behaviors: XRAY_KE_001_ACCEPTANCE })
      if (outcome.result !== 'NOT_COMMITTABLE') return `result ${outcome.result}`
      const audit = await readExecutionAudit(db, outcome.executionRunId)
      const failure = audit.journal.entries
        .map((entry) => (entry as { run?: { stage?: string; error?: string } }).run)
        .find((run) => run?.error !== undefined)
      return failure?.error?.includes("wrote 'findings', which it does not own")
        ? null : `failed with: ${String(failure?.error)}`
    })

    await check('B3 · BLOCKED: so the evidence-driven audit set is provably empty, not merely absent', async () => {
      // The consequence, stated exactly. The only currently representable
      // committed path adds evidence on newly discovered claims, and
      // changedClaimIds correctly filters those out — so no run can yet produce
      // an EXTERNAL_RECORD_RESPONSE audit row through the pipeline.
      const reEvaluated = committed?.result === 'COMMITTED' ? committed.reEvaluatedClaimIds : ['?']
      if (reEvaluated.length !== 0) return `re-evaluated ${JSON.stringify(reEvaluated)}`
      const rows = (await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM claim_reevaluation_audit
          WHERE investigation_id=$1 AND version_number=3`, [INV])).rows
      if (rows[0].n !== 0) return `${rows[0].n} audit rows at the ATI-committed version`
      // And the existing claim is genuinely present and graded, so the empty
      // set is the blocker's consequence rather than a missing fixture.
      const v3 = await readSnapshot(db, INV, 3)
      return v3.claims.some((claim) => claim.id === EXISTING_CLAIM)
        && v3.findings.some((finding) => finding.claimId === EXISTING_CLAIM)
        ? null : `${EXISTING_CLAIM} is not a graded claim at v3`
    })

    void seeded
  } finally {
    await db.close()
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`\n${results.length - failed}/${results.length} ATI research checks passed`)
  if (failed > 0) process.exitCode = 1
}
