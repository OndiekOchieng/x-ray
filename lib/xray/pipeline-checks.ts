/**
 * Pipeline execution checks (6a).
 *
 * Three things must be proven, and the second and third matter most:
 *
 * 1. The stage contracts hold — ownership, ordering, staged legality.
 * 2. The vocabulary is genuinely non-overlapping (#6 D15): a control gate
 *    cannot be scheduled as a stage, cannot claim an artifact revision, and
 *    cannot be mistaken for one by its record id.
 * 3. Canonical identity survives retry. A retried stage must produce the same
 *    identifiers, or every reference written against the first attempt
 *    dangles (research-pipeline §17).
 *
 * The traversal replays XRAY-KE-001 through hand-built stage stubs. The stubs
 * are not an implementation of anything: they hand back the frozen benchmark's
 * own artifacts, which is what makes the end state checkable against a graph
 * already known to be legal.
 *
 * Run:  pnpm check:pipeline
 */

import { readFileSync } from 'node:fs'

import { createXRayGraph, type XRayGraphInput } from './selectors'
import { validateXRayGraph } from './validation'
import { CHECK_ROUTING } from './review'
import {
  CONTROL_GATES,
  GraphAccumulator,
  JournalError,
  PipelineContractError,
  RESEARCH_STAGES,
  RunJournal,
  STAGE_OUTPUTS,
  createIdentityAllocator,
  isResearchStage,
  nextGateRunId,
  nextStageRunId,
  runPipeline,
  seedFrom,
  type IdentitySeed,
  type StageContribution,
  type StageDefinition,
} from './pipeline'
import type { ResearchStage } from './domain'

import { claims } from './fixtures/xray-ke-001/claims'
import { sources } from './fixtures/xray-ke-001/sources'
import { sourceDependencies } from './fixtures/xray-ke-001/source-dependencies'
import { evidence } from './fixtures/xray-ke-001/evidence'
import { evidenceProvenance } from './fixtures/xray-ke-001/evidence-provenance'
import { discrepancies } from './fixtures/xray-ke-001/discrepancies'
import { disconfirmations } from './fixtures/xray-ke-001/disconfirmation'
import { findings } from './fixtures/xray-ke-001/findings'
import { gaps } from './fixtures/xray-ke-001/gaps'
import { investigation, investigationVersion } from './fixtures/xray-ke-001/investigation'

type Result = { name: string; ok: boolean; detail?: string }
const results: Result[] = []

function check(name: string, fn: () => string | null): void {
  let detail: string | null
  try {
    detail = fn()
  } catch (err) {
    detail = `threw: ${(err as Error).message}`
  }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

async function checkAsync(name: string, fn: () => Promise<string | null>): Promise<void> {
  let detail: string | null
  try {
    detail = await fn()
  } catch (err) {
    detail = `threw: ${(err as Error).message}`
  }
  results.push({ name, ok: detail === null, detail: detail ?? undefined })
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const AT = '2026-09-18T00:00:00Z'

// ---------------------------------------------------------------------------
// Stage stubs replaying the frozen benchmark
// ---------------------------------------------------------------------------

const surfaceSourceId = investigation.surfaceSourceId

const stub = (stage: ResearchStage, contribution: () => StageContribution): StageDefinition => ({
  stage,
  run: () => contribution(),
})

const replayStages = (): StageDefinition[] => [
  stub('INGEST', () => ({ sources: clone(sources.filter((s) => s.id === surfaceSourceId)) })),
  stub('DECOMPOSE', () => ({ claims: clone(claims.filter((c) => c.origin === 'SURFACE')) })),
  stub('CLASSIFY', () => ({ claims: clone(claims.filter((c) => c.origin === 'SURFACE')) })),
  stub('PLAN', () => ({})),
  stub('TRACE', () => ({
    claims: clone(claims),
    sources: clone(sources),
    evidence: clone(evidence),
  })),
  stub('PROVENANCE', () => ({
    evidenceProvenance: clone(evidenceProvenance),
    sourceDependencies: clone(sourceDependencies),
  })),
  stub('DISCONFIRM', () => ({ disconfirmations: clone(disconfirmations) })),
  stub('RECONCILE', () => ({ discrepancies: clone(discrepancies) })),
  /**
   * GRADE grades. It cannot reference gaps stage 9 has not identified yet, so
   * the back-reference is absent here and GAPS supplies it.
   */
  stub('GRADE', () => ({ findings: clone(findings).map((f) => ({ ...f, gapIds: [] })) })),
  stub('GAPS', () => ({ gaps: clone(gaps), findings: clone(findings) })),
]

/** A run of the full replay. `failing` forces a stage to fail early attempts. */
function replay(options: { maxAttempts?: number; failing?: { stage: ResearchStage; until: number } }) {
  const base = replayStages()
  const stages = base.map((s) =>
    options.failing && s.stage === options.failing.stage
      ? ({
          stage: s.stage,
          run: (ctx) => {
            if (ctx.attempt < options.failing!.until) {
              throw new Error(`forced failure, attempt ${ctx.attempt}`)
            }
            return s.run(ctx)
          },
        } satisfies StageDefinition)
      : s,
  )
  return runPipeline({
    investigation: clone(investigation),
    stages,
    maxAttempts: options.maxAttempts ?? 1,
    clock: () => AT,
  })
}

const canonicalInput = (): XRayGraphInput => ({
  investigation: clone(investigation),
  version: clone(investigationVersion),
  claims: clone(claims),
  sources: clone(sources),
  sourceDependencies: clone(sourceDependencies),
  evidence: clone(evidence),
  evidenceProvenance: clone(evidenceProvenance),
  discrepancies: clone(discrepancies),
  disconfirmations: clone(disconfirmations),
  findings: clone(findings),
  gaps: clone(gaps),
})

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Vocabulary — stages and gates are disjoint (#6 D15)
  // -------------------------------------------------------------------------

  check('research stages exclude every control gate and lifecycle step', () => {
    const forbidden = ['VALIDATE', 'REVIEW', 'PERSIST', 'SYNTHESIZE', 'RESOLVE']
    const present = forbidden.filter((f) => (RESEARCH_STAGES as readonly string[]).includes(f))
    return present.length ? `RESEARCH_STAGES contains ${present.join(', ')}` : null
  })

  check('control gates and research stages share no member', () => {
    const overlap = CONTROL_GATES.filter((g) => (RESEARCH_STAGES as readonly string[]).includes(g))
    return overlap.length ? `overlap: ${overlap.join(', ')}` : null
  })

  check('isResearchStage rejects gate and lifecycle names', () => {
    const wrong = ['VALIDATE', 'REVIEW', 'PERSIST', 'SYNTHESIZE', 'RESOLVE'].filter(isResearchStage)
    return wrong.length ? `accepted ${wrong.join(', ')}` : null
  })

  check('every research stage has a declared ownership entry', () => {
    const missing = RESEARCH_STAGES.filter((s) => STAGE_OUTPUTS[s] === undefined)
    return missing.length ? `no STAGE_OUTPUTS for ${missing.join(', ')}` : null
  })

  check('PLAN owns no collection, and that is recorded not worked around', () => {
    if (STAGE_OUTPUTS.PLAN.length !== 0) return `PLAN owns ${STAGE_OUTPUTS.PLAN.join(', ')}`
    const src = readFileSync(new URL('./pipeline/stages.ts', import.meta.url), 'utf8')
    return src.includes('LIMITATION — `PLAN` owns nothing')
      ? null
      : 'the limitation is no longer documented'
  })

  check('no reviewer finding routes to a control gate', () => {
    const bad = Object.entries(CHECK_ROUTING).filter(
      ([, r]) => !isResearchStage(r.stage as string),
    )
    return bad.length ? `${bad.map(([k]) => k).join(', ')} route outside the research stages` : null
  })

  // -------------------------------------------------------------------------
  // 2. Historical compatibility — the frozen benchmark stays readable
  // -------------------------------------------------------------------------

  check('XRAY-KE-001 still records VALIDATE, SYNTHESIZE and RESOLVE stage runs', () => {
    const names = investigation.stageRuns.map((r) => r.stage)
    const expected = ['VALIDATE', 'SYNTHESIZE', 'RESOLVE']
    const missing = expected.filter((e) => !names.includes(e as never))
    return missing.length
      ? `historical observation was rewritten: ${missing.join(', ')} no longer present`
      : null
  })

  check('the legacy VALIDATE stage run is not schedulable as a research stage', () => {
    const legacy = investigation.stageRuns.find((r) => r.stage === 'VALIDATE')
    if (legacy === undefined) return 'fixture no longer records it'
    return isResearchStage(legacy.stage) ? 'VALIDATE would be scheduled as a stage' : null
  })

  check('the legacy records are PENDING, not rewritten to fit the new model', () => {
    const wrong = investigation.stageRuns
      .filter((r) => !isResearchStage(r.stage))
      .filter((r) => r.status !== 'PENDING')
    return wrong.length ? `${wrong.map((r) => r.stage).join(', ')} no longer PENDING` : null
  })

  // -------------------------------------------------------------------------
  // 3. Identity determinism
  // -------------------------------------------------------------------------

  const emptySeed = (over: Partial<IdentitySeed> = {}): IdentitySeed => ({
    claims: [],
    sources: [],
    evidence: [],
    sourceDependencies: [],
    evidenceProvenance: [],
    discrepancies: [],
    disconfirmations: [],
    gaps: [],
    ...over,
  })

  check('the same seed produces the same identifier sequence', () => {
    const seed = seedFrom(canonicalInput())
    const a = createIdentityAllocator(seed)
    const b = createIdentityAllocator(seed)
    const seqA = [a.source(), a.evidence(), a.discoveredClaim(), a.gap()]
    const seqB = [b.source(), b.evidence(), b.discoveredClaim(), b.gap()]
    return seqA.join() === seqB.join() ? null : `${seqA.join()} !== ${seqB.join()}`
  })

  check('the C and DC namespaces do not contaminate one another', () => {
    const a = createIdentityAllocator(emptySeed({ claims: ['C001', 'C002', 'DC001'] }))
    const next = [a.surfaceClaim(), a.discoveredClaim()]
    return next.join() === 'C003,DC002' ? null : `allocated ${next.join()}`
  })

  check('allocation uses the highest ordinal, not the count', () => {
    const a = createIdentityAllocator(emptySeed({ sources: ['SRC-001', 'SRC-009'] }))
    const next = a.source()
    return next === 'SRC-010' ? null : `allocated ${next}, which would collide or renumber`
  })

  check('a finding identifier derives from the claim, not a counter', () => {
    const a = createIdentityAllocator(emptySeed())
    const b = createIdentityAllocator(emptySeed({ claims: ['C001', 'C002', 'C003'] }))
    return a.finding('C002') === 'FND-C002' && b.finding('C002') === 'FND-C002'
      ? null
      : 'finding identity is not derived from the claim'
  })

  check('stage-run and gate-run identifiers occupy disjoint namespaces', () => {
    const sr = nextStageRunId(['SR-001'])
    const gr = nextGateRunId(['SR-001'])
    if (sr !== 'SR-002') return `stage run id ${sr}`
    if (gr !== 'GR-001') return `gate run id ${gr} is seeded by a stage run`
    return null
  })

  // -------------------------------------------------------------------------
  // 4. Accumulator
  // -------------------------------------------------------------------------

  check('rebuild produces the graph createXRayGraph produces over the same arrays', () => {
    const input = canonicalInput()
    const acc = new GraphAccumulator(input.investigation, input)
    const rebuilt = acc.rebuild()
    const direct = createXRayGraph(input)
    const strip = (g: unknown): string =>
      JSON.stringify(g, (k, v) => (k === 'index' ? undefined : v))
    return strip(rebuilt) === strip(direct) ? null : 'rebuilt graph differs from createXRayGraph'
  })

  check('a snapshot is a copy: mutating it cannot reach the run', () => {
    const input = canonicalInput()
    const acc = new GraphAccumulator(input.investigation, input)
    const snap = acc.snapshot()
    ;(snap.claims as unknown[]).push({ id: 'C999' })
    return acc.snapshot().claims.length === claims.length ? null : 'the run was mutated'
  })

  check('a stage may not write a collection it does not own', () => {
    const acc = new GraphAccumulator(clone(investigation))
    try {
      acc.merge('GRADE', { gaps: clone(gaps) })
      return 'GRADE wrote gaps unchallenged'
    } catch (err) {
      return err instanceof PipelineContractError ? null : `wrong error: ${(err as Error).name}`
    }
  })

  check('contributing a known identifier replaces rather than duplicates', () => {
    const acc = new GraphAccumulator(clone(investigation))
    acc.merge('DECOMPOSE', { claims: clone(claims) })
    acc.merge('CLASSIFY', { claims: clone(claims) })
    return acc.size('claims') === claims.length
      ? null
      : `${acc.size('claims')} claims after re-contribution of ${claims.length}`
  })

  check('a contribution repeating an identifier within itself is rejected', () => {
    const acc = new GraphAccumulator(clone(investigation))
    const dup = [clone(claims[0]), clone(claims[0])]
    try {
      acc.merge('DECOMPOSE', { claims: dup })
      return 'a duplicated identifier merged silently'
    } catch (err) {
      return err instanceof PipelineContractError ? null : `wrong error: ${(err as Error).name}`
    }
  })

  check('restore discards everything merged since the checkpoint', () => {
    const acc = new GraphAccumulator(clone(investigation))
    acc.merge('DECOMPOSE', { claims: clone(claims) })
    const cp = acc.checkpoint()
    acc.merge('INGEST', { sources: clone(sources) })
    acc.restore(cp)
    return acc.size('sources') === 0 && acc.size('claims') === claims.length
      ? null
      : `after restore: ${acc.size('claims')} claims, ${acc.size('sources')} sources`
  })

  // -------------------------------------------------------------------------
  // 5. Journal
  // -------------------------------------------------------------------------

  check('the journal refuses a duplicate record identifier', () => {
    const j = new RunJournal('I1')
    const run = {
      id: 'SR-001',
      investigationId: 'I1',
      stage: 'INGEST' as const,
      status: 'SUCCEEDED' as const,
      inputArtifactVersion: 0,
      outputArtifactVersion: 1,
    }
    j.appendStage(run)
    try {
      j.appendStage({ ...run })
      return 'a second SR-001 was appended'
    } catch (err) {
      return err instanceof JournalError ? null : `wrong error: ${(err as Error).name}`
    }
  })

  check('journal entries are frozen once appended', () => {
    const j = new RunJournal('I1')
    j.appendStage({
      id: 'SR-001',
      investigationId: 'I1',
      stage: 'INGEST',
      status: 'SUCCEEDED',
      inputArtifactVersion: 0,
      outputArtifactVersion: 1,
    })
    const entry = j.entries[0]
    try {
      ;(entry.run as { status: string }).status = 'FAILED'
    } catch {
      return null
    }
    return j.entries[0].run.status === 'SUCCEEDED' ? null : 'an appended entry was rewritten'
  })

  check('the journal refuses an entry from another investigation', () => {
    const j = new RunJournal('I1')
    try {
      j.appendStage({
        id: 'SR-001',
        investigationId: 'I2',
        stage: 'INGEST',
        status: 'SUCCEEDED',
        inputArtifactVersion: 0,
      })
      return 'a foreign investigation was appended'
    } catch (err) {
      return err instanceof JournalError ? null : `wrong error: ${(err as Error).name}`
    }
  })

  // -------------------------------------------------------------------------
  // 6. Traversal
  // -------------------------------------------------------------------------

  const clean = await replay({})

  await checkAsync('the full replay completes and both gates run', async () => {
    if (clean.status !== 'COMPLETED') {
      const failed = clean.journal.stageEntries().filter((r) => r.status === 'FAILED')
      return `status ${clean.status}${failed.length ? ' — ' + failed[0].error : ''}`
    }
    const gates = clean.journal.gateEntries().map((g) => g.gate)
    return gates.join() === 'VALIDATE,REVIEW' ? null : `gates ran: ${gates.join() || 'none'}`
  })

  check('the replayed graph is validator-clean under FULL', () => {
    const v = validateXRayGraph(clean.graph, { mode: 'FULL' })
    return v.valid ? null : `${v.summary.errorCount} error(s): ${v.violations[0]?.code}`
  })

  check('the replayed canonical state equals the benchmark graph', () => {
    // `version` is excluded: an InvestigationVersion is a published snapshot
    // authored at publication (ADR-0006, #7), not by a research run. The next
    // check asserts the pipeline did not author one.
    const strip = (g: unknown): string =>
      JSON.stringify(g, (k, v) => (k === 'index' || k === 'version' ? undefined : v))
    return strip(clean.graph) === strip(createXRayGraph(canonicalInput()))
      ? null
      : 'replay did not reproduce the canonical graph'
  })

  check('the pipeline authored no investigation version', () => {
    return clean.graph.version === undefined
      ? null
      : 'the run published a version; ADR-0006 and #7 own that'
  })

  check('the investigation index is projected from the arrays it indexes', () => {
    const inv = clean.graph.investigation
    const pairs: [string, readonly string[], readonly { id: string }[]][] = [
      ['claimIds', inv.claimIds, clean.graph.claims],
      ['sourceIds', inv.sourceIds, clean.graph.sources],
      ['evidenceIds', inv.evidenceIds, clean.graph.evidence],
      ['findingIds', inv.findingIds, clean.graph.findings],
      ['gapIds', inv.gapIds, clean.graph.gaps],
    ]
    const wrong = pairs.filter(([, index, arr]) => index.join() !== arr.map((a) => a.id).join())
    return wrong.length ? `${wrong.map(([n]) => n).join(', ')} disagree with the arrays` : null
  })

  check('stage runs are journalled in RESEARCH_STAGES order', () => {
    const order = clean.journal.stageEntries().map((r) => r.stage)
    const expected = RESEARCH_STAGES.join()
    return order.join() === expected ? null : `${order.join()} !== ${expected}`
  })

  check('every gate entry follows every stage entry', () => {
    const kinds = clean.journal.entries.map((e) => e.kind).join()
    return /^(STAGE,)*STAGE(,GATE)*$/.test(kinds) ? null : `entry order: ${kinds}`
  })

  check('artifact revision advances exactly once per successful stage', () => {
    const stages = clean.journal.stageEntries()
    for (const [i, r] of stages.entries()) {
      if (r.inputArtifactVersion !== i) return `${r.stage} read revision ${r.inputArtifactVersion}`
      if (r.outputArtifactVersion !== i + 1) return `${r.stage} produced ${r.outputArtifactVersion}`
    }
    return clean.artifactVersion === RESEARCH_STAGES.length
      ? null
      : `final revision ${clean.artifactVersion}`
  })

  check('the run never touched the investigation version', () => {
    return clean.graph.investigation.currentVersion === investigation.currentVersion
      ? null
      : 'currentVersion moved; in-run revisions leaked into published history'
  })

  // -------------------------------------------------------------------------
  // 7. Gates claim nothing
  // -------------------------------------------------------------------------

  check('no gate record carries an artifact output revision', () => {
    const offending = clean.journal
      .gateEntries()
      .filter((g) => 'outputArtifactVersion' in (g as object))
    return offending.length ? `${offending.map((g) => g.gate).join(', ')} claimed one` : null
  })

  check('gate records reference their durable result rather than copying it', () => {
    const review = clean.journal.gateEntries().find((g) => g.gate === 'REVIEW')
    if (review?.result?.kind !== 'REVIEW_HISTORY') return 'the REVIEW gate holds no reference'
    const round = clean.reviewHistory?.rounds[review.result.roundIndex]
    return round !== undefined && round.result.graphFingerprint === review.result.graphFingerprint
      ? null
      : 'the reference does not resolve to the recorded round'
  })

  check('gate record identifiers are all in the GR namespace', () => {
    const wrong = clean.journal.gateEntries().filter((g) => !g.id.startsWith('GR-'))
    return wrong.length ? `${wrong.map((g) => g.id).join(', ')}` : null
  })

  check('stage record identifiers are all in the SR namespace', () => {
    const wrong = clean.journal.stageEntries().filter((r) => !r.id.startsWith('SR-'))
    return wrong.length ? `${wrong.map((r) => r.id).join(', ')}` : null
  })

  // -------------------------------------------------------------------------
  // 8. Retry
  // -------------------------------------------------------------------------

  const retried = await replay({ maxAttempts: 3, failing: { stage: 'TRACE', until: 3 } })

  await checkAsync('a stage that fails twice and then succeeds still completes', async () =>
    retried.status === 'COMPLETED' ? null : `status ${retried.status}`,
  )

  check('retry produces byte-identical canonical state', () => {
    const strip = (g: unknown): string =>
      JSON.stringify(g, (k, v) => (k === 'index' ? undefined : v))
    return strip(retried.graph) === strip(clean.graph)
      ? null
      : 'the retried run produced different canonical state'
  })

  check('retry does not renumber another stage’s artifacts', () => {
    const a = clean.graph.evidence.map((e) => e.id).join()
    const b = retried.graph.evidence.map((e) => e.id).join()
    const c = clean.graph.gaps.map((g) => g.id).join()
    const d = retried.graph.gaps.map((g) => g.id).join()
    return a === b && c === d ? null : 'identifiers shifted after a retry'
  })

  check('the failed attempts remain in the journal beside the successful one', () => {
    const traceRuns = retried.journal.stageEntries().filter((r) => r.stage === 'TRACE')
    const failed = traceRuns.filter((r) => r.status === 'FAILED').length
    const ok = traceRuns.filter((r) => r.status === 'SUCCEEDED').length
    return failed === 2 && ok === 1 ? null : `${failed} failed, ${ok} succeeded`
  })

  check('a failed attempt records no artifact output revision', () => {
    const bad = retried.journal
      .stageEntries()
      .filter((r) => r.status === 'FAILED' && r.outputArtifactVersion !== undefined)
    return bad.length ? `${bad[0].stage} claimed a revision it did not produce` : null
  })

  check('a failed attempt does not advance the artifact revision', () => {
    const succeeded = retried.journal.stageEntries().filter((r) => r.status === 'SUCCEEDED')
    const wrong = succeeded.filter((r, i) => r.inputArtifactVersion !== i)
    return wrong.length ? `${wrong[0].stage} read revision ${wrong[0].inputArtifactVersion}` : null
  })

  const exhausted = await replay({ maxAttempts: 2, failing: { stage: 'GRADE', until: 99 } })

  await checkAsync('exhausting attempts fails the run at that stage', async () =>
    exhausted.status === 'STAGE_FAILED' && exhausted.failedStage === 'GRADE'
      ? null
      : `status ${exhausted.status}, failed at ${exhausted.failedStage}`,
  )

  check('a failed stage blocks every downstream stage', () => {
    const ran = exhausted.journal.stageEntries().map((r) => r.stage)
    return ran.includes('GAPS') ? 'GAPS ran after GRADE failed' : null
  })

  check('a failed run runs no control gate', () => {
    return exhausted.journal.gateEntries().length === 0
      ? null
      : 'a gate ran over state no stage vouched for'
  })

  check('a failed stage rolls its contribution back', () => {
    return exhausted.graph.findings.length === 0
      ? null
      : `${exhausted.graph.findings.length} findings survived a failed GRADE`
  })

  // -------------------------------------------------------------------------
  // 9. Staged validation owns stage legality (D9)
  // -------------------------------------------------------------------------

  await checkAsync('a stage that introduces a validation error fails there', async () => {
    const stages = replayStages().map((s) =>
      s.stage === 'GRADE'
        ? ({
            stage: 'GRADE' as const,
            run: () => {
              const broken = clone(findings)
              broken[0].claimId = 'C999'
              return { findings: broken }
            },
          } satisfies StageDefinition)
        : s,
    )
    const run = await runPipeline({
      investigation: clone(investigation),
      stages,
      clock: () => AT,
    })
    if (run.status !== 'STAGE_FAILED') return `status ${run.status}`
    if (run.failedStage !== 'GRADE') return `attributed to ${run.failedStage}`
    const entry = run.journal.stageEntries().find((r) => r.stage === 'GRADE')
    return entry?.error?.includes('validation error') ? null : `error: ${entry?.error}`
  })

  // -------------------------------------------------------------------------
  // 10. Gate ordering
  // -------------------------------------------------------------------------

  await checkAsync('a blocking VALIDATE gate skips REVIEW rather than running it', async () => {
    // GAPS contributes an orphaned gap: legal under STAGED, illegal under FULL.
    const stages = replayStages().map((s) =>
      s.stage === 'GAPS'
        ? ({
            stage: 'GAPS' as const,
            run: () => ({ gaps: [] }),
          } satisfies StageDefinition)
        : s,
    )
    const run = await runPipeline({
      investigation: clone(investigation),
      stages,
      clock: () => AT,
    })
    if (run.status !== 'GATE_BLOCKED') return `status ${run.status}`
    const gates = run.journal.gateEntries()
    const validate = gates.find((g) => g.gate === 'VALIDATE')
    const review = gates.find((g) => g.gate === 'REVIEW')
    if (validate?.outcome !== 'BLOCKED') return `VALIDATE outcome ${validate?.outcome}`
    if (review?.outcome !== 'SKIPPED') return `REVIEW outcome ${review?.outcome}`
    return run.review === undefined ? null : 'a review result was produced anyway'
  })

  // -------------------------------------------------------------------------
  // 11. Resume
  // -------------------------------------------------------------------------

  await checkAsync('a resumed run skips stages already recorded as succeeded', async () => {
    const first = await replay({ maxAttempts: 2, failing: { stage: 'GAPS', until: 99 } })
    if (first.status !== 'STAGE_FAILED') return `first run ended ${first.status}`

    const before = first.journal.length
    const resumed = await runPipeline({
      investigation: clone(investigation),
      stages: replayStages(),
      resume: { journal: first.journal, accumulator: first.accumulator },
      startArtifactVersion: first.artifactVersion,
      clock: () => AT,
    })

    const rerun = resumed.journal
      .stageEntries()
      .slice(before)
      .map((r) => r.stage)
    if (rerun.join() !== 'GAPS') return `resume re-ran ${rerun.join() || 'nothing'}`
    return resumed.status === 'COMPLETED' ? null : `resumed run ended ${resumed.status}`
  })

  // -------------------------------------------------------------------------
  // 12. Meta-proof — the ownership guard is load-bearing
  // -------------------------------------------------------------------------

  check('disabling the ownership guard makes this harness fail', () => {
    const acc = new GraphAccumulator(clone(investigation))
    const unguarded = new Proxy(acc, {
      get(target, prop) {
        if (prop === 'merge') {
          return (_stage: ResearchStage, contribution: StageContribution) =>
            Reflect.get(target, 'merge').call(target, 'GAPS', contribution)
        }
        return Reflect.get(target, prop)
      },
    }) as GraphAccumulator
    // With ownership routed away, GRADE's illegal write to gaps now succeeds.
    unguarded.merge('GRADE', { gaps: clone(gaps) })
    return acc.size('gaps') === gaps.length
      ? null
      : 'the guard was not what stopped the illegal write'
  })

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  const failed = results.filter((r) => !r.ok)
  const width = Math.max(...results.map((r) => r.name.length))

  console.log('\nX-Ray pipeline — 6a stage contracts and run state\n' + '='.repeat(width + 8))
  for (const r of results) {
    console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
  }
  console.log('='.repeat(width + 8))
  console.log(`${results.length - failed.length}/${results.length} passed`)
  console.log(
    `\nReplay: ${clean.journal.stageEntries().length} stage run(s), ` +
      `${clean.journal.gateEntries().length} gate run(s), ` +
      `final artifact revision ${clean.artifactVersion}, ` +
      `investigation version ${clean.graph.investigation.currentVersion} (untouched)\n`,
  )

  if (failed.length) process.exit(1)
}
