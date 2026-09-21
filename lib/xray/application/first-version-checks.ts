/**
 * The initial investigation journey, end to end (#20 first-light Finding 5).
 *
 *   research stages -> FULL VALIDATE -> live ReviewerModel judgments
 *   -> durable REVIEW -> graduation -> immutable version 1
 *
 * Driven through the real application path: `InvestigationService` to submit,
 * `InlineExecutionService` to run, the registered host seam for the reviewer,
 * and `graduateRun` to graduate. No service is handed a reviewer directly —
 * that is the point of the check, since first light's defect was a capability
 * that was configured and never reached.
 *
 * The stages emit the canonical fixture's artifacts, re-keyed to a fresh
 * investigation. That is deliberate and it is not benchmark substitution: the
 * subject here is the *plumbing*, and a validator-clean graph is needed to
 * reach graduation at all. What is being proven is that a review happens, is
 * durable, is reused, and authorises a v1 — not that anything was researched.
 *
 * Run:  pnpm check:first-version
 */

import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import { available } from '@/lib/xray/capability'
import type { CapabilityResult } from '@/lib/xray/capability'
import type { Claim, InvestigationVersion } from '@/lib/xray/domain'
import { createXRayGraph, type XRayGraph } from '@/lib/xray/selectors'
import { xrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { fingerprintGraph, type ModelJudgment, type ReviewerModel, type ReviewerModelQuery,
  activePortChecks } from '@/lib/xray/review'
import { unavailable } from '@/lib/xray/capability'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { readExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import {
  loadCandidateCheckpoint, saveCandidateCheckpoint,
} from '@/lib/xray/persistence/workspace'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { readSnapshot } from '@/lib/xray/persistence/snapshot'
import { assertFirstVersion } from '@/lib/xray/persistence/version-commit'
import { InvestigationService } from './investigation-service'
import { InlineExecutionService, type ExecutionRuntime } from './inline-execution'
import { GraduationService } from './graduation-service'
import { assessCandidate, graduateRun } from './assessment'
import { setReviewerModelProvider, submittedInvestigation } from './runtime'

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []
const check = (name: string, run: Check['run']) => { checks.push({ name, run }) }

const AT = '2026-09-21T12:00:00Z'

/** Every migration, in order, so the schema is the real one. */
async function migrate(db: PGlite): Promise<void> {
  const dir = new URL('../../../db/migrations/', import.meta.url)
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.up.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, dir), 'utf8'))
  }
}

/** The canonical artifacts, re-keyed to a fresh investigation. */
function rekeyed(investigationId: string): XRayGraph {
  const claims = xrayKe001Graph.claims.map((claim) => ({ ...claim, investigationId })) as Claim[]
  return createXRayGraph({
    ...xrayKe001Graph,
    claims,
    investigation: { ...xrayKe001Graph.investigation, id: investigationId },
    version: { ...xrayKe001Graph.version as InvestigationVersion, investigationId },
  })
}

/** A reviewer that records every question it was asked. */
function countingReviewer(behaviour: { readonly refuse?: boolean; readonly broken?: boolean } = {}):
ReviewerModel & { asked: ReviewerModelQuery['kind'][] } {
  const asked: ReviewerModelQuery['kind'][] = []
  return {
    name: 'stub:reviewer',
    asked,
    async judge(query): Promise<CapabilityResult<ModelJudgment>> {
      asked.push(query.kind)
      if (behaviour.broken === true) throw new Error('synthetic reviewer outage')
      if (behaviour.refuse === true) {
        return unavailable(`reviewer-model:${query.kind}`, 'REFUSED_FOR_INPUT',
          'the stub declined this query', 'configure a reviewer that answers it')
      }
      return available({
        flagged: false, severity: 'ADVISORY', rationale: 'No concern.',
        requiredAction: 'None.', targets: [],
      })
    },
  }
}

/** Stages that contribute the whole canonical graph, then stop on saturation. */
function contributingStages(source: XRayGraph): readonly StageDefinition[] {
  const contributed = {
    sources: [...source.sources], claims: [...source.claims],
    sourcePositions: [...source.sourcePositions],
    sourceDependencies: [...source.sourceDependencies],
    evidence: [...source.evidence], evidenceProvenance: [...source.evidenceProvenance],
    discrepancies: [...source.discrepancies], disconfirmations: [...source.disconfirmations],
    findings: [...source.findings], gaps: [...source.gaps],
  }
  /*
   * `Finding.gapIds` is a back-reference GAPS owns: a finding cannot carry it
   * at GRADE because the gaps do not exist yet, and staged validation rejects
   * exactly that. So GRADE emits the findings without it and GAPS re-emits
   * them with it — which is what `live-stages.ts` does, for the same reason.
   */
  return [
    { stage: 'INGEST', run: () => ({ sources: contributed.sources }) },
    { stage: 'DECOMPOSE', run: () => ({ claims: contributed.claims }) },
    { stage: 'CLASSIFY', run: () => ({}) },
    { stage: 'PLAN', run: () => ({}) },
    { stage: 'TRACE', run: () => ({ evidence: contributed.evidence }) },
    {
      stage: 'PROVENANCE',
      run: () => ({
        sourceDependencies: contributed.sourceDependencies,
        evidenceProvenance: contributed.evidenceProvenance,
      }),
    },
    { stage: 'DISCONFIRM', run: () => ({ disconfirmations: contributed.disconfirmations }) },
    { stage: 'RECONCILE', run: () => ({ discrepancies: contributed.discrepancies }) },
    { stage: 'GRADE', run: () => ({ findings: contributed.findings.map((finding) => ({ ...finding, gapIds: [] })) }) },
    {
      stage: 'GAPS',
      run: () => ({ gaps: contributed.gaps, findings: contributed.findings }),
    },
  ]
}

interface Harness {
  readonly db: PGlite
  readonly investigationId: string
  readonly executionRunId: string
  readonly reviewer: ReturnType<typeof countingReviewer>
}

/** Submit and run one initial investigation through the real services. */
async function runInitial(
  behaviour: { readonly reviewer?: 'ok' | 'refuse' | 'broken' | 'absent' } = {},
): Promise<Harness> {
  const db = new PGlite()
  await migrate(db)

  const reviewer = countingReviewer({
    refuse: behaviour.reviewer === 'refuse',
    broken: behaviour.reviewer === 'broken',
  })
  setReviewerModelProvider(behaviour.reviewer === 'absent' ? null : async () => reviewer)

  const investigations = new InvestigationService(db, () => AT, () => 'XRAY-FIRST-VERSION')
  const { investigationId } = await investigations.createInvestigation({
    sourceUrl: 'https://example.invalid/first-version',
  })

  const canonical = rekeyed(investigationId)
  const runtime: ExecutionRuntime = {
    async initial() {
      return {
        investigation: submittedInvestigation(investigationId, AT),
        stages: contributingStages(canonical),
        stopEvidence: { saturationObserved: true },
        maxAttempts: 1,
      }
    },
    async resume() {
      return { stages: contributingStages(canonical), maxAttempts: 1 }
    },
  }

  let runCounter = 0
  const execution = new InlineExecutionService(
    db, runtime, () => AT, () => `RUN-FV-${++runCounter}`)
  const status = await execution.startExecution(investigationId)
  return { db, investigationId, executionRunId: status.executionRunId, reviewer }
}

const modelAssisted = (graph: XRayGraph, review: { checks: readonly {
  checkId: string; capability: string; outcome: string
}[] }) => { void graph; return review.checks.filter((c) => c.capability === 'MODEL_ASSISTED') }

// ---------------------------------------------------------------------------

check('1 · the configured reviewer is asked during the initial REVIEW gate', async () => {
  const { db, executionRunId, reviewer } = await runInitial()
  try {
    if (reviewer.asked.length === 0)
      return 'judge() was never called during the initial run'
    const kinds = [...new Set(reviewer.asked)]
    if (!kinds.includes('CLAIM_ATOMICITY'))
      return `asked ${JSON.stringify(kinds)}`

    // And the judgments landed: model-assisted checks are EVALUATED.
    const audit = await readExecutionAudit(db, executionRunId)
    const round = audit?.reviewHistory.rounds.at(-1)
    if (round === undefined) return 'no review round was recorded'
    const assisted = modelAssisted(
      (await loadCandidateCheckpoint(db, executionRunId)).accumulator.rebuild(),
      round.result)
    if (assisted.length === 0) return 'no model-assisted checks were reported'
    const evaluated = assisted.filter((entry) => entry.outcome === 'EVALUATED')
    return evaluated.length === assisted.length
      ? null : `${evaluated.length}/${assisted.length} model-assisted checks EVALUATED`
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('2 · the review survives a durable checkpoint and readback', async () => {
  const { db, executionRunId } = await runInitial()
  try {
    // Read from storage, not from the in-memory result.
    const audit = await readExecutionAudit(db, executionRunId)
    if (audit === undefined) return 'no execution audit was persisted'
    if (audit.reviewHistory.rounds.length !== 1)
      return `${audit.reviewHistory.rounds.length} rounds persisted`

    const checkpoint = await loadCandidateCheckpoint(db, executionRunId)
    const graph = checkpoint.accumulator.rebuild()
    const round = audit.reviewHistory.rounds[0]!
    if (round.result.graphFingerprint !== fingerprintGraph(graph))
      return 'the persisted review does not fingerprint the persisted candidate'

    // The REVIEW gate references the round rather than copying it.
    const gate = audit.journal.entries.find((entry) =>
      entry.kind === 'GATE' && (entry.run as { gate: string }).gate === 'REVIEW')
    if (gate === undefined) return 'no REVIEW gate was journalled'
    const result = (gate.run as { result?: { kind: string; roundIndex?: number } }).result
    return result?.kind === 'REVIEW_HISTORY' && result.roundIndex === 0
      ? null : `the gate records ${JSON.stringify(result)}`
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('3 · graduation reuses that review without a second reviewer call', async () => {
  const { db, investigationId, executionRunId, reviewer } = await runInitial()
  try {
    const afterRun = reviewer.asked.length
    if (afterRun === 0) return 'the run asked nothing'

    /*
     * Through `assessCandidate`, which reads the host seam — not
     * `graduation.assess` directly. An earlier version of this check called
     * `assess` with no model, so the reviewer was unreachable and "asked
     * nothing more" was trivially true: it passed while testing nothing. Check
     * 4 is what exposed that, by failing for the same reason.
     */
    const graduation = new GraduationService(db, () => AT)
    const audit = await assessCandidate(graduation, investigationId, executionRunId, {
      behaviors: [],
    })

    if (reviewer.asked.length !== afterRun)
      return `graduation asked ${reviewer.asked.length - afterRun} more question(s)`

    // And it is the *same* review, not a fresh one that happens to agree.
    const persisted = await readExecutionAudit(db, executionRunId)
    const round = persisted?.reviewHistory.rounds.at(-1)
    if (round === undefined) return 'no review round to reuse'
    if (audit.result.detail.review.reviewedAt !== round.result.reviewedAt)
      return 'the assessment carries a different review than the one recorded'
    return audit.result.detail.review.graphFingerprint === round.result.graphFingerprint
      ? null : 'the assessment reviewed a different graph'
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('4 · a mutated candidate forces a fresh review', async () => {
  const { db, investigationId, executionRunId, reviewer } = await runInitial()
  try {
    const afterRun = reviewer.asked.length
    const graduation = new GraduationService(db, () => AT)

    /*
     * Mutate something the review turns on.
     *
     * My first attempt used `promote`, on the assumption that writing the
     * version envelope changes the graph. It does not change the *fingerprint*:
     * `fingerprintGraph` hashes claims, evidence, findings and
     * `currentVersion`, and for a first version `currentVersion` is 1 before
     * and after. That is correct — promoting does not change what a reviewer
     * examined — so the check was asserting a mutation that had not happened.
     *
     * A changed finding status is a real one.
     */
    const checkpoint = await loadCandidateCheckpoint(db, executionRunId)
    const graph = checkpoint.accumulator.rebuild()
    const before = fingerprintGraph(graph)
    const mutated = createXRayGraph({
      ...graph,
      findings: graph.findings.map((finding, index) => index === 0
        ? { ...finding, status: 'CONTESTED' as const } : finding),
    })
    if (fingerprintGraph(mutated) === before)
      return 'the fixture mutation did not change the fingerprint'
    await saveCandidateCheckpoint(db, {
      ...checkpoint,
      updatedAt: AT,
      accumulator: new GraphAccumulator(mutated.investigation, mutated),
    })

    await assessCandidate(graduation, investigationId, executionRunId, { behaviors: [] })
    return reviewer.asked.length > afterRun
      ? null : 'a changed candidate reused a review of the earlier graph'
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('5 · the first candidate becomes an immutable version 1', async () => {
  const { db, investigationId, executionRunId } = await runInitial()
  try {
    const outcome = await graduateRun(
      new GraduationService(db, () => AT), investigationId, executionRunId,
      { expectedPredecessor: null, createdAt: AT })

    if (outcome.result !== 'COMMITTED')
      return `not committed: ${outcome.verdict} — ${outcome.reasons.join(' | ').slice(0, 200)}`
    if (outcome.version !== 1) return `committed v${outcome.version}`

    // Read it back from storage as an immutable snapshot.
    const committed = await readSnapshot(db, investigationId, 1)
    const version = committed.version
    if (version === undefined) return 'the committed snapshot has no version envelope'
    if (version.supersedesVersion !== undefined)
      return `v1 supersedes v${version.supersedesVersion}`
    if (version.reEvaluatedClaimIds.length !== 0)
      return `v1 re-evaluated ${version.reEvaluatedClaimIds.length} claim(s)`
    if (version.addedSourceIds.length !== committed.sources.length)
      return `v1 added ${version.addedSourceIds.length} of ${committed.sources.length} sources`
    if (version.addedEvidenceIds.length !== committed.evidence.length)
      return `v1 added ${version.addedEvidenceIds.length} of ${committed.evidence.length} evidence`

    // The pointer moved from nothing to 1.
    const rows = (await db.query(
      'SELECT latest_committed_version FROM investigations WHERE id=$1',
      [investigationId])).rows as Record<string, unknown>[]
    const pointer = rows[0]?.['latest_committed_version']
    return pointer === 1 ? null : `the committed pointer is ${String(pointer)}`
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('6 · no reviewer yields BLOCKED, never PASS', async () => {
  const { db, investigationId, executionRunId } = await runInitial({ reviewer: 'absent' })
  try {
    const graduation = new GraduationService(db, () => AT)
    await graduation.promote(investigationId, executionRunId, {
      expectedPredecessor: null, trigger: 'INITIAL_RESEARCH', createdAt: AT,
    })
    const audit = await assessCandidate(graduation, investigationId, executionRunId, {
      behaviors: [],
    })

    if (audit.result.verdict === 'PASS') return 'an unreviewed candidate passed'
    if (audit.result.verdict !== 'BLOCKED') return `verdict ${audit.result.verdict}`
    if (audit.result.review.fullCapability)
      return 'full review capability was claimed with no reviewer'

    const assisted = audit.result.detail.review.checks
      .filter((entry) => entry.capability === 'MODEL_ASSISTED')
    for (const entry of assisted) {
      if (entry.outcome !== 'NOT_EVALUATED')
        return `${entry.checkId} is ${entry.outcome} with no reviewer`
      if ((entry.notEvaluatedReason ?? '') === '')
        return `${entry.checkId} gives no reason`
    }
    return audit.result.blockers.some((blocker) => /Reviewer/i.test(blocker.resolvedBy))
      ? null : 'no blocker names the missing reviewer'
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('7 · a refusing reviewer keeps the asked checks unevaluated', async () => {
  const { db, executionRunId, reviewer } = await runInitial({ reviewer: 'refuse' })
  try {
    if (reviewer.asked.length === 0) return 'judge() was never called'
    const audit = await readExecutionAudit(db, executionRunId)
    const round = audit?.reviewHistory.rounds.at(-1)
    if (round === undefined) return 'no review round was recorded'

    const askedKinds = new Set(reviewer.asked)
    const refusedIds = new Set(activePortChecks(round.result.checks.length > 0 ? '0.1.0' : '0.1.0')
      .filter((portCheck) => askedKinds.has(portCheck.queryKind))
      .map((portCheck) => portCheck.checkId))
    const relevant = round.result.checks.filter((entry) => refusedIds.has(entry.checkId))
    if (relevant.length === 0) return 'no refused check was reported'
    for (const entry of relevant) {
      if (entry.outcome !== 'NOT_EVALUATED')
        return `${entry.checkId} was ${entry.outcome} after a refusal`
    }
    // A refusal is capability state, not a finding about the graph.
    return round.result.findings.length === 0
      ? null : `${round.result.findings.length} finding(s) came out of refusals`
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('8 · a reviewer outage leaves no eligible graduation and no review', async () => {
  const { db, investigationId, executionRunId } = await runInitial({ reviewer: 'broken' })
  try {
    /*
     * The gate could not run, so no round exists. Nothing was fabricated, and
     * the run is GATE_BLOCKED rather than COMPLETED.
     */
    const audit = await readExecutionAudit(db, executionRunId)
    if ((audit?.reviewHistory.rounds.length ?? 0) !== 0)
      return `${audit?.reviewHistory.rounds.length} review round(s) after an outage`

    const gate = audit?.journal.entries.find((entry) =>
      entry.kind === 'GATE' && (entry.run as { gate: string }).gate === 'REVIEW')
    const outcome = (gate?.run as { outcome?: string } | undefined)?.outcome
    if (outcome !== 'SKIPPED') return `the REVIEW gate is ${String(outcome)}`
    const reason = (gate?.run as { error?: string } | undefined)?.error ?? ''
    if (!/could not be reached/.test(reason)) return `the gate records "${reason}"`

    /*
     * And nothing can be committed. The assertion is about the *consequence*,
     * not the control flow: graduation may throw — `collectModelJudgments`
     * deliberately does not swallow an outage — or refuse. What must hold
     * either way is that no assessment was recorded and no version exists.
     * An earlier version of this check demanded NOT_ELIGIBLE specifically and
     * failed on a throw that was correct behaviour.
     */
    const graduation = new GraduationService(db, () => AT)
    let committed: number | undefined
    try {
      const result = await graduateRun(graduation, investigationId, executionRunId,
        { expectedPredecessor: null, createdAt: AT })
      if (result.result === 'COMMITTED') committed = result.version
    } catch { /* an outage is allowed to surface */ }

    if (committed !== undefined) return `an outage still committed v${committed}`
    if (await graduation.latestAssessment(executionRunId) !== undefined)
      return 'an assessment was recorded despite the outage'
    const versions = (await db.query(
      'SELECT count(*)::int AS n FROM investigation_versions WHERE investigation_id=$1',
      [investigationId])).rows as Record<string, unknown>[]
    return versions[0]?.['n'] === 0
      ? null : `${String(versions[0]?.['n'])} version(s) exist after an outage`
  } finally { await db.close(); setReviewerModelProvider(null) }
})

check('9 · the reviewer never reaches a research stage', async () => {
  /*
   * Decision 1. The reviewer travels on `RunOptions`, and `StageAdapters`
   * carries `{ model?, research? }` and nothing else — so a stage cannot ask
   * for a judgment about the graph it is building.
   */
  const stages = readFileSync(
    new URL('../pipeline/stages.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const adapters = stages.slice(stages.indexOf('export interface StageAdapters'), 400)
  if (/Reviewer/.test(adapters)) return 'StageAdapters carries a reviewer'

  const run = readFileSync(new URL('../pipeline/run.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  if (!/reviewer\?: ReviewerModel/.test(run)) return 'RunOptions has no reviewer'
  if (/adapters[^\n]*reviewer|reviewer[^\n]*adapters/.test(run))
    return 'run.ts puts the reviewer near the adapters'
  // And the gate asks, then reviews purely.
  if (!/collectModelJudgments\(graph, options\.reviewer\)/.test(run))
    return 'the gate does not collect judgments from the reviewer'
  return /reviewXRayGraph\(graph, \{/.test(run)
    ? null : 'the gate no longer calls the pure reviewer'
})

check('10 · the first-version rule accepts the canonical v1 and rejects a successor shape', () => {
  /*
   * The canonical fixture *is* a v1 — supersedes nothing, adds every source.
   * Asserting the rule against it is the strongest available evidence that
   * "first version" was described as v1 really looks, rather than as
   * convenient for this gate.
   */
  const version = xrayKe001Graph.version
  if (version === undefined) return 'the canonical fixture has no version'
  if (version.version !== 1) return `the canonical fixture is v${version.version}`
  if (version.supersedesVersion !== undefined)
    return 'the canonical v1 supersedes something'
  if (version.addedSourceIds.length !== xrayKe001Graph.sources.length)
    return 'the canonical v1 does not add every source'
  return version.reEvaluatedClaimIds.length === 0
    ? null : 'the canonical v1 re-evaluates claims'
})

check('11 · the first-version rule refuses every incoherent v1', () => {
  /*
   * Each refusal, driven directly. `promote` never produces a v1 carrying
   * `supersedesVersion`, so that branch is unreachable through the application
   * path — control BE removed it and the whole gate still passed. An
   * unreachable guard is a guard nobody has run, so it is exercised here.
   */
  const base = xrayKe001Graph
  const version = base.version as InvestigationVersion
  const graphWith = (envelope: Partial<InvestigationVersion>): XRayGraph =>
    createXRayGraph({ ...base, version: { ...version, ...envelope } })

  // The canonical v1 is accepted.
  try { assertFirstVersion(base, []) } catch (err) {
    return `the canonical v1 was refused: ${(err as Error).message}`
  }

  const refusals: [string, () => void][] = [
    ['a v1 that supersedes something',
      () => assertFirstVersion(graphWith({ supersedesVersion: 0 }), [])],
    ['a v1 numbered 2',
      () => assertFirstVersion(graphWith({ version: 2 }), [])],
    ['a v1 that does not add every source',
      () => assertFirstVersion(graphWith({ addedSourceIds: [] }), [])],
    ['a v1 that does not add every evidence',
      () => assertFirstVersion(graphWith({ addedEvidenceIds: [] }), [])],
    ['a v1 listing a re-evaluated claim',
      () => assertFirstVersion(
        graphWith({ reEvaluatedClaimIds: [base.claims[0]!.id] }), [])],
    ['a v1 carrying a re-evaluation audit row',
      () => assertFirstVersion(base, [{ claimId: base.claims[0]!.id, reason: 'CORRECTION' }])],
  ]
  for (const [label, act] of refusals) {
    let threw = false
    try { act() } catch { threw = true }
    if (!threw) return `${label} was accepted`
  }
  return null
})

// ---------------------------------------------------------------------------

let failures = 0

async function main(): Promise<void> {
  for (const { name, run } of checks) {
    let detail: string | null
    try { detail = await run() } catch (err) { detail = `threw: ${(err as Error).message}` }
    console.log(`${detail === null ? 'ok  ' : 'FAIL'}  ${name}${detail === null ? '' : ` — ${detail}`}`)
    if (detail !== null) failures += 1
  }
  console.log(`\n${checks.length - failures}/${checks.length} first-version checks passed`)
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
