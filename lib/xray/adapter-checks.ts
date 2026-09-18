/**
 * Adapter boundary checks (6b).
 *
 * Four things must hold, and the last two are the ones a future provider will
 * try hardest to break:
 *
 * 1. Nothing provider-specific has leaked into the pipeline layer.
 * 2. A proposal may carry judgment (#6 D16) but never identity.
 * 3. A capability gap is disclosed, journalled, and never mistaken for a
 *    failure or for success (D19).
 * 4. Identity follows proposal content, not provider ordering or retry
 *    behaviour (D20).
 *
 * The stubs here are fixtures, not providers: no network, no model, no
 * inference. They exist to prove the interfaces are writable against and that
 * the seam carries what it claims to.
 *
 * Run:  pnpm check:adapters
 */

import { readFileSync } from 'node:fs'

import {
  AdapterFailure,
  available,
  notConfigured,
  unavailable,
  type CapabilityResult,
} from './capability'
import {
  CorrelationLedger,
  MAX_EXTRACT_LENGTH,
  RESEARCH_MODEL_OPERATIONS,
  RESEARCH_MODEL_RESOLVED_BY,
  bound,
  correlate,
  correlateAndAssign,
  correlationKey,
  hashExtract,
  isInspectable,
  isProposalRef,
  isQuotable,
  runPipeline,
  type CorrelationContext,
  type EvidenceProposal,
  type RetrievalOutcome,
  type RetrievedDocument,
  type StageDefinition,
} from './pipeline'
import { createXRayGraph, type XRayGraphInput } from './selectors'
import { validateXRayGraph } from './validation'
import {
  PORT_DEPENDENT_CHECKS,
  collectModelJudgments,
  judgmentRequests,
  reviewXRayGraph,
  reviewXRayGraphWithModel,
  type ModelJudgment,
  type ReviewerModel,
  type ReviewerModelQuery,
} from './review'
import { assessGraduation } from './acceptance'
import type { ResearchStage, SourceAccessibility } from './domain'

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

const canonicalGraph = createXRayGraph(canonicalInput())

/** Source text with comments stripped, so a check cannot match its own prose. */
function codeOf(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const PIPELINE_MODULES = [
  'accumulator.ts',
  'correlation.ts',
  'identity.ts',
  'index.ts',
  'journal.ts',
  'model-port.ts',
  'proposals.ts',
  'retrieval-port.ts',
  'run.ts',
  'stages.ts',
]

// ---------------------------------------------------------------------------
// Deterministic stubs. Fixtures, not providers.
// ---------------------------------------------------------------------------

/** A reviewer model whose answers are fixed. */
const stubReviewer = (
  answer: (query: ReviewerModelQuery) => CapabilityResult<ModelJudgment>,
  capabilities?: readonly ReviewerModelQuery['kind'][],
): ReviewerModel => ({
  name: 'stub',
  ...(capabilities ? { capabilities } : {}),
  judge: (query) => Promise.resolve(answer(query)),
})

const clearJudgment: ModelJudgment = {
  flagged: false,
  severity: 'ADVISORY',
  rationale: 'stub: nothing to report',
  requiredAction: 'none',
  targets: [],
}

/**
 * INGEST, replaying the surface source.
 *
 * Present in every run scenario below because `Investigation.surfaceSourceId`
 * references it: without it, staged validation fails for a reason that has
 * nothing to do with what the scenario is testing.
 */
const ingestStage: StageDefinition = {
  stage: 'INGEST',
  run: () => ({ sources: clone(sources.filter((s) => s.id === investigation.surfaceSourceId)) }),
}

const doc = (outcome: RetrievalOutcome, withExtract: boolean): RetrievedDocument => ({
  ref: 'ref:d1',
  outcome,
  observed: { title: 'stub document' },
  ...(withExtract ? { extract: bound('a passage worth quoting') } : {}),
})

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Boundary purity — the 6b verification gate
  // -------------------------------------------------------------------------

  check('no provider SDK, network call or prompt string in the pipeline layer', () => {
    const forbidden: [RegExp, string][] = [
      [/\bfetch\s*\(/, 'a network call'],
      [/\bXMLHttpRequest\b|\bWebSocket\b/, 'a transport API'],
      [/from\s+['"](openai|@anthropic-ai|@google|cohere|groq)/, 'a provider SDK import'],
      [/https?:\/\/(?!localhost)/, 'a remote URL'],
      [/\bprocess\.env\b/, 'environment configuration'],
      [/\b(systemPrompt|userPrompt|promptTemplate)\b/, 'a prompt string'],
    ]
    const hits: string[] = []
    for (const file of PIPELINE_MODULES) {
      const src = codeOf(`./pipeline/${file}`)
      for (const [pattern, what] of forbidden) {
        if (pattern.test(src)) hits.push(`${file}: ${what}`)
      }
    }
    return hits.length ? hits.join('; ') : null
  })

  check('the pipeline layer imports no fixture', () => {
    const hits = PIPELINE_MODULES.filter((f) => /fixtures\//.test(codeOf(`./pipeline/${f}`)))
    return hits.length ? `${hits.join(', ')} import fixture data` : null
  })

  check('no proposal type carries a canonical identifier or cross-reference', () => {
    const src = codeOf('./pipeline/proposals.ts')
    const forbidden = [
      /^\s+id\??:/m,
      /^\s+investigationId\??:/m,
      /^\s+claimId\??:/m,
      /^\s+claimIds\??:/m,
      /^\s+sourceId\??:/m,
      /^\s+evidenceId\??:/m,
      /^\s+evidenceIds\??:/m,
      /^\s+discrepancyIds\??:/m,
      /^\s+gapIds\??:/m,
    ]
    const hit = forbidden.find((p) => p.test(src))
    return hit ? `proposals.ts declares ${String(hit)}` : null
  })

  check('a ProposalRef cannot be confused with a canonical identifier', () => {
    const canonical = ['C001', 'DC001', 'SRC-001', 'EV-001', 'FND-C001', 'GAP-001']
    const wrong = canonical.filter(isProposalRef)
    if (wrong.length) return `${wrong.join(', ')} passed as proposal refs`
    return isProposalRef('ref:anything') ? null : 'a genuine ref was rejected'
  })

  // -------------------------------------------------------------------------
  // 2. What a proposal may carry (D16)
  // -------------------------------------------------------------------------

  check('D16 · proposals may carry judgment the stage cannot derive', () => {
    const src = codeOf('./pipeline/proposals.ts')
    const required = ['status: FindingStatus', 'confidence: Confidence', 'layer: ClaimLayer']
    const missing = required.filter((r) => !src.includes(r))
    return missing.length
      ? `FindingProposal/ClaimClassificationProposal no longer carry ${missing.join(', ')}`
      : null
  })

  check('D16 · a proposal cannot assert ATI eligibility', () => {
    return codeOf('./pipeline/proposals.ts').includes('atiEligible')
      ? 'GapProposal carries atiEligible; XR-INV-009 binds it to resolutionPath'
      : null
  })

  check('D16 · no proposal type exists for evidence provenance', () => {
    const src = codeOf('./pipeline/proposals.ts')
    return /ProvenanceProposal|EvidenceProvenanceProposal|originStatus|evidenceClass|accessibility/.test(
      src,
    )
      ? 'a provider could propose lineage or accessibility; ADR-0010 assigns both to the stage'
      : null
  })

  // -------------------------------------------------------------------------
  // 3. Model method set (D17)
  // -------------------------------------------------------------------------

  check('D17 · the model port has no plan, provenance or ingest method', () => {
    const forbidden = ['plan', 'provenance', 'ingest']
    const present = forbidden.filter((op) =>
      (RESEARCH_MODEL_OPERATIONS as readonly string[]).includes(op),
    )
    return present.length ? `${present.join(', ')} exist as model operations` : null
  })

  check('D17 · the stages without a model method are exactly INGEST, PLAN, PROVENANCE', () => {
    const covered = new Set<string>(
      RESEARCH_MODEL_OPERATIONS.map((op) => (op === 'identifyGaps' ? 'GAPS' : op.toUpperCase())),
    )
    const stages: ResearchStage[] = [
      'INGEST',
      'DECOMPOSE',
      'CLASSIFY',
      'PLAN',
      'TRACE',
      'PROVENANCE',
      'DISCONFIRM',
      'RECONCILE',
      'GRADE',
      'GAPS',
    ]
    const uncovered = stages.filter((s) => !covered.has(s)).join(',')
    return uncovered === 'INGEST,PLAN,PROVENANCE' ? null : `uncovered: ${uncovered}`
  })

  // -------------------------------------------------------------------------
  // 4. Retrieval payload (D18, ADR-0010)
  // -------------------------------------------------------------------------

  check('D18 · retrieval outcomes are the SourceAccessibility states, not a parallel set', () => {
    const states: SourceAccessibility[] = [
      'RETRIEVED',
      'PARTIAL',
      'NOT_LOCATED',
      'NOT_RETRIEVED',
      'DEAD_LINK',
    ]
    // Assignable in both directions: the alias cannot drift from the domain.
    const asOutcomes: RetrievalOutcome[] = states
    const backAgain: SourceAccessibility[] = asOutcomes
    return backAgain.length === 5 ? null : 'the outcome vocabulary diverged'
  })

  check('D18 · content crossing the boundary is bounded and says so when clamped', () => {
    const big = bound('x'.repeat(MAX_EXTRACT_LENGTH + 500))
    if (!big.truncated) return 'over-long content crossed unmarked'
    if (big.text.length !== MAX_EXTRACT_LENGTH) return `clamped to ${big.text.length}`
    if (big.fullLength !== MAX_EXTRACT_LENGTH + 500) return 'the true length was not reported'
    return bound('short').truncated ? 'short content marked truncated' : null
  })

  check('XR-INV-006 · nothing may be read from a record that was not obtained', () => {
    const unobtained: RetrievalOutcome[] = ['NOT_LOCATED', 'NOT_RETRIEVED', 'DEAD_LINK']
    const leaked = unobtained.filter((o) => isInspectable(doc(o, true)) || isQuotable(doc(o, true)))
    if (leaked.length) return `${leaked.join(', ')} were treated as readable`
    return isInspectable(doc('RETRIEVED', true)) && isInspectable(doc('PARTIAL', true))
      ? null
      : 'an obtained record was treated as unreadable'
  })

  check('a document with no extract is not inspectable whatever its outcome', () => {
    return isInspectable(doc('RETRIEVED', false)) ? 'an empty document was inspectable' : null
  })

  check('the stage can compute its own content digest, and truncation changes it', () => {
    const a = hashExtract(bound('the same passage'))
    const b = hashExtract(bound('the same passage'))
    if (a !== b) return 'the digest is unstable'
    const truncated = hashExtract({ text: 'the same passage', truncated: true })
    return truncated === a ? 'a truncated extract hashes identically to a whole one' : null
  })

  // -------------------------------------------------------------------------
  // 5. Correlation (D20)
  // -------------------------------------------------------------------------

  const ctx: CorrelationContext = {
    investigationId: 'I1',
    stage: 'TRACE',
    inputArtifactVersion: 4,
  }

  const proposal = (proposition: string, refs: string[] = ['ref:a', 'ref:b']): EvidenceProposal => ({
    sourceRef: 'ref:s1',
    proposition,
    relationship: 'SUPPORTS',
    strength: 'DIRECT',
    claimRefs: refs as EvidenceProposal['claimRefs'],
  })

  check('D20 · formatting differences do not change the correlation key', () => {
    const a = correlationKey(ctx, proposal('The road is  28% complete'))
    const b = correlationKey(ctx, proposal('the road is 28% COMPLETE '))
    return a === b ? null : 'whitespace or case changed identity'
  })

  check('D20 · the order of a reference set does not change the key', () => {
    const a = correlationKey(ctx, proposal('same', ['ref:a', 'ref:b']))
    const b = correlationKey(ctx, proposal('same', ['ref:b', 'ref:a']))
    return a === b ? null : 'reference ordering changed identity'
  })

  check('D20 · different content produces a different key', () => {
    const a = correlationKey(ctx, proposal('the road is 28% complete'))
    const b = correlationKey(ctx, proposal('the road is 82% complete'))
    return a !== b ? null : 'two different propositions correlate as one'
  })

  check('D20 · a different input artifact revision produces a different key', () => {
    const a = correlationKey(ctx, proposal('same'))
    const b = correlationKey({ ...ctx, inputArtifactVersion: 5 }, proposal('same'))
    return a !== b ? null : 'a stale proposal could claim a current artifact identity'
  })

  check('D20 · provider ordering does not determine canonical identity', () => {
    const items = [proposal('alpha'), proposal('beta'), proposal('gamma')]
    const mint = () => {
      let n = 0
      return () => `EV-${String(++n).padStart(3, '0')}`
    }
    const forward = correlateAndAssign(ctx, items, new CorrelationLedger(), mint())
    const reversed = correlateAndAssign(ctx, [...items].reverse(), new CorrelationLedger(), mint())
    const idOf = (r: typeof forward, text: string) =>
      r.assignments.find((a) => a.proposal.proposition === text)?.id
    const mismatched = ['alpha', 'beta', 'gamma'].filter(
      (t) => idOf(forward, t) !== idOf(reversed, t),
    )
    return mismatched.length ? `${mismatched.join(', ')} changed identity when reordered` : null
  })

  check('D20 · duplicate proposals in one response are collapsed', () => {
    const items = [proposal('alpha'), proposal('ALPHA '), proposal('beta')]
    const { ordered, collapsed } = correlate(ctx, items)
    if (collapsed !== 1) return `collapsed ${collapsed}`
    if (ordered.length !== 2) return `${ordered.length} distinct proposals`
    const dup = ordered.find((o) => o.arrivals > 1)
    return dup?.arrivals === 2 ? null : 'the duplicate arrival was not recorded'
  })

  check('D20 · a re-run reusing the ledger keeps the identifiers it already issued', () => {
    const ledger = new CorrelationLedger()
    let n = 0
    const mint = () => `EV-${String(++n).padStart(3, '0')}`

    const first = correlateAndAssign(ctx, [proposal('alpha'), proposal('beta')], ledger, mint)
    // The retry returns one proposal it did not return before, and drops none.
    const second = correlateAndAssign(
      ctx,
      [proposal('beta'), proposal('gamma'), proposal('alpha')],
      ledger,
      mint,
    )

    const idIn = (r: typeof first, text: string) =>
      r.assignments.find((a) => a.proposal.proposition === text)?.id

    if (idIn(first, 'alpha') !== idIn(second, 'alpha')) return 'alpha was renumbered'
    if (idIn(first, 'beta') !== idIn(second, 'beta')) return 'beta was renumbered'
    return idIn(second, 'gamma') !== undefined ? null : 'the new proposal got no identity'
  })

  check('D20 · an existing artifact keeps its identity when a neighbour disappears', () => {
    const ledger = new CorrelationLedger()
    let n = 0
    const mint = () => `EV-${String(++n).padStart(3, '0')}`
    const before = correlateAndAssign(ctx, [proposal('alpha'), proposal('beta')], ledger, mint)
    const after = correlateAndAssign(ctx, [proposal('beta')], ledger, mint)
    const betaBefore = before.assignments.find((a) => a.proposal.proposition === 'beta')?.id
    return after.assignments[0]?.id === betaBefore ? null : 'beta was renumbered'
  })

  // -------------------------------------------------------------------------
  // 6. Capability semantics in a run (D19)
  // -------------------------------------------------------------------------

  const gapStage = (stage: ResearchStage): StageDefinition => ({
    stage,
    run: (ctx2) =>
      ctx2.adapters.model === undefined
        ? notConfigured(`research-model:${stage}`, RESEARCH_MODEL_RESOLVED_BY)
        : {},
  })

  const capabilityRun = (maxAttempts = 1) =>
    runPipeline({
      investigation: clone(investigation),
      stages: [
        ingestStage,
        gapStage('DECOMPOSE'),
        { stage: 'RECONCILE', run: () => ({ discrepancies: [] }) },
        gapStage('GRADE'),
      ],
      maxAttempts,
      clock: () => AT,
    })

  const blocked = await capabilityRun()

  await checkAsync('D19 · an unconfigured adapter blocks the run, it does not fail it', async () => {
    if (blocked.status !== 'CAPABILITY_BLOCKED') return `status ${blocked.status}`
    return blocked.failedStage === undefined ? null : `blamed ${blocked.failedStage}`
  })

  check('D19 · the capability gap is journalled with its own record kind', () => {
    const entries = blocked.journal.capabilityEntries()
    if (entries.length !== 2) return `${entries.length} capability record(s)`
    const wrong = entries.filter((e) => !e.id.startsWith('CR-'))
    if (wrong.length) return `${wrong.map((e) => e.id).join(', ')} outside the CR namespace`
    const stages = entries.map((e) => e.stage).join()
    return stages === 'DECOMPOSE,GRADE' ? null : `recorded against ${stages}`
  })

  check('D19 · a capability record claims no artifact revision and reports no error', () => {
    const bad = blocked.journal
      .capabilityEntries()
      .filter((e) => 'outputArtifactVersion' in (e as object) || 'error' in (e as object))
    return bad.length ? 'a capability gap was recorded as work or as a failure' : null
  })

  check('D19 · the skipped stage is PENDING, not FAILED', () => {
    const run = blocked.journal.stageEntries().find((r) => r.stage === 'DECOMPOSE')
    if (run?.status !== 'PENDING') return `status ${run?.status}`
    return run.outputArtifactVersion === undefined ? null : 'it claimed an artifact revision'
  })

  check('D19 · a stage that cannot run does not block the stages after it', () => {
    const ran = blocked.journal
      .stageEntries()
      .filter((r) => r.status === 'SUCCEEDED')
      .map((r) => r.stage)
    return ran.includes('RECONCILE') ? null : 'a later stage was skipped for an unrelated gap'
  })

  check('D19 · the gates still run over what was produced', () => {
    const gates = blocked.journal.gateEntries().map((g) => g.gate).join()
    return gates === 'VALIDATE,REVIEW' ? null : `gates ran: ${gates || 'none'}`
  })

  check('D19 · capability gaps reach the result for 6c to convert into blockers', () => {
    const ops = blocked.capabilityGaps.map((g) => g.operation).sort().join()
    if (ops !== 'research-model:DECOMPOSE,research-model:GRADE') return `gaps: ${ops}`
    const unresolvable = blocked.capabilityGaps.filter((g) => !g.resolvedBy)
    return unresolvable.length ? 'a gap named no remedy' : null
  })

  await checkAsync('D19 · a capability gap is not retried', async () => {
    const run = await capabilityRun(3)
    const attempts = run.journal.stageEntries().filter((r) => r.stage === 'GRADE').length
    return attempts === 1 ? null : `${attempts} attempts at an unconfigured adapter`
  })

  await checkAsync('D19 · a permanent adapter failure is not retried', async () => {
    let calls = 0
    const run = await runPipeline({
      investigation: clone(investigation),
      stages: [
        ingestStage,
        {
          stage: 'DECOMPOSE',
          run: () => {
            calls += 1
            throw new AdapterFailure('research-model:decompose', 'PERMANENT', 'malformed response')
          },
        },
      ],
      maxAttempts: 4,
      clock: () => AT,
    })
    if (run.status !== 'STAGE_FAILED') return `status ${run.status}`
    return calls === 1 ? null : `${calls} attempts at a permanent failure`
  })

  await checkAsync('D19 · a transient adapter failure is retried', async () => {
    let calls = 0
    const run = await runPipeline({
      investigation: clone(investigation),
      stages: [
        ingestStage,
        {
          stage: 'DECOMPOSE',
          run: () => {
            calls += 1
            if (calls < 3) {
              throw new AdapterFailure('research-model:decompose', 'TRANSIENT', 'timeout')
            }
            return {}
          },
        },
      ],
      maxAttempts: 4,
      clock: () => AT,
    })
    return calls === 3 && run.status === 'COMPLETED' ? null : `${calls} attempts, ${run.status}`
  })

  await checkAsync('D19 · a run with every adapter present is COMPLETED, not blocked', async () => {
    const run = await runPipeline({
      investigation: clone(investigation),
      stages: [ingestStage, { stage: 'RECONCILE', run: () => ({ discrepancies: [] }) }],
      clock: () => AT,
    })
    return run.status === 'COMPLETED' && run.capabilityGaps.length === 0
      ? null
      : `status ${run.status}, ${run.capabilityGaps.length} gap(s)`
  })

  // -------------------------------------------------------------------------
  // 7. The reviewer seam (D21)
  // -------------------------------------------------------------------------

  /** Checks this graph actually raises a subject for. */
  const withSubjects = [
    ...new Set(judgmentRequests(canonicalGraph).map((r) => r.checkId)),
  ]

  check('D21 · with no model configured, model-assisted checks stay unevaluated', () => {
    const r = reviewXRayGraph(canonicalGraph)
    const notEvaluated = r.checks.filter((c) => c.outcome === 'NOT_EVALUATED')
    return notEvaluated.length === PORT_DEPENDENT_CHECKS.length
      ? null
      : `${notEvaluated.length} unevaluated, expected ${PORT_DEPENDENT_CHECKS.length}`
  })

  check('D21 · passing a model without collecting judgments changes no verdict', () => {
    const model = stubReviewer(() => available(clearJudgment))
    const r = reviewXRayGraph(canonicalGraph, { model })
    const evaluated = r.checks.filter(
      (c) => c.capability === 'MODEL_ASSISTED' && c.outcome === 'EVALUATED',
    )
    if (evaluated.length) return `${evaluated.length} checks ran without their judgments`
    return r.summary.fullCapability ? 'full capability was claimed' : null
  })

  await checkAsync('D21 · a supplied model is actually asked, and its checks then run', async () => {
    let asked = 0
    const model = stubReviewer(() => {
      asked += 1
      return available(clearJudgment)
    })
    const r = await reviewXRayGraphWithModel(canonicalGraph, { model, reviewedAt: AT })
    if (asked === 0) return 'the model was never asked'
    if (asked !== judgmentRequests(canonicalGraph).length) return `asked ${asked} times`
    const stillUnevaluated = r.checks.filter((c) => c.outcome === 'NOT_EVALUATED')
    if (stillUnevaluated.length) {
      return `${stillUnevaluated.length} check(s) unevaluated despite answers`
    }
    return r.summary.fullCapability ? null : 'full capability was not reported'
  })

  await checkAsync('D21 · a flagged judgment becomes a finding and routes to a stage', async () => {
    const model = stubReviewer((query) =>
      available(
        query.kind === 'CLAIM_ATOMICITY' && query.claim.id === 'C001'
          ? {
              flagged: true,
              severity: 'BLOCKING',
              rationale: 'stub: this claim bundles two assertions',
              requiredAction: 'Split the claim',
              targets: [{ kind: 'Claim', id: 'C001' }],
            }
          : clearJudgment,
      ),
    )
    const r = await reviewXRayGraphWithModel(canonicalGraph, { model, reviewedAt: AT })
    const raised = r.findings.filter((f) => f.checkId === 'XR-INV-002/CLAIM_ATOMICITY')
    if (raised.length !== 1) return `${raised.length} findings raised`
    if (r.summary.blockingFindings !== 1) return `${r.summary.blockingFindings} blocking`
    const request = r.revisionRequests.find((x) => x.findingId === raised[0].id)
    return request !== undefined ? null : 'a blocking model finding produced no revision request'
  })

  await checkAsync('D21 · a model that refuses leaves the check unevaluated, never passed', async () => {
    const model = stubReviewer(() =>
      unavailable('reviewer-model:any', 'EXHAUSTED', 'quota exhausted', 'Raise the quota.'),
    )
    const r = await reviewXRayGraphWithModel(canonicalGraph, { model, reviewedAt: AT })
    // Scoped to checks this graph actually raises a subject for. A check with
    // nothing to judge completes vacuously, and calling that a capability gap
    // would create one that no model could ever close.
    const wrong = withSubjects.filter(
      (id) => r.checks.find((c) => c.checkId === id)?.outcome === 'EVALUATED',
    )
    if (wrong.length) return `${wrong.join(', ')} reported as evaluated despite refusal`
    const reasons = r.checks.filter((c) => c.notEvaluatedReason?.includes('quota exhausted'))
    return reasons.length === withSubjects.length
      ? null
      : 'the refusal reason was not carried through'
  })

  check('D21 · a check the graph raises no subject for completes vacuously', () => {
    const vacuous = PORT_DEPENDENT_CHECKS.map((c) => c.checkId).filter(
      (id) => !withSubjects.includes(id),
    )
    return vacuous.length > 0
      ? null
      : 'no vacuous check in this fixture, so the rule above is untested'
  })

  check('D21 · with no model, even a vacuous check stays unevaluated', () => {
    const r = reviewXRayGraph(canonicalGraph)
    const evaluated = r.checks.filter(
      (c) => c.capability === 'MODEL_ASSISTED' && c.outcome === 'EVALUATED',
    )
    return evaluated.length ? `${evaluated.length} evaluated with no model configured` : null
  })

  await checkAsync('D21 · declared capability is per query kind, not one flag', async () => {
    const model = stubReviewer(() => available(clearJudgment), ['CLAIM_ATOMICITY'])
    const judgments = await collectModelJudgments(canonicalGraph, model)
    const r = reviewXRayGraph(canonicalGraph, { model, judgments, reviewedAt: AT })
    const atomicity = r.checks.find((c) => c.checkId === 'XR-INV-002/CLAIM_ATOMICITY')
    if (atomicity?.outcome !== 'EVALUATED') return `atomicity ${atomicity?.outcome}`
    const wrong = withSubjects
      .filter((id) => id !== 'XR-INV-002/CLAIM_ATOMICITY')
      .filter((id) => r.checks.find((c) => c.checkId === id)?.outcome !== 'NOT_EVALUATED')
    return wrong.length ? `${wrong.join(', ')} evaluated despite being undeclared` : null
  })

  check('D21 · the default assurance claim is unchanged: the benchmark stays BLOCKED', () => {
    const g = assessGraduation(canonicalGraph, {
      behaviors: [],
      assessedAt: AT,
    })
    if (g.verdict !== 'BLOCKED') return `verdict ${g.verdict}`
    return g.blockers.length >= PORT_DEPENDENT_CHECKS.length
      ? null
      : `${g.blockers.length} blocker(s)`
  })

  check('D21 · review stays a pure function of a graph and its judgments', () => {
    const src = codeOf('./review/index.ts')
    return /await |Promise\.all|\.then\(/.test(src.split('export async function')[0])
      ? 'the synchronous review core acquired an asynchronous dependency'
      : null
  })

  // -------------------------------------------------------------------------
  // 8. Meta-proof — key ordering is what holds identity stable
  // -------------------------------------------------------------------------

  check('ordering identity by arrival instead of by key makes this harness fail', () => {
    const items = [proposal('alpha'), proposal('beta'), proposal('gamma')]
    const byArrival = (list: readonly EvidenceProposal[]) => {
      let n = 0
      return new Map(list.map((p) => [p.proposition, `EV-${String(++n).padStart(3, '0')}`]))
    }
    const forward = byArrival(items)
    const reversed = byArrival([...items].reverse())
    const changed = ['alpha', 'beta', 'gamma'].filter((t) => forward.get(t) !== reversed.get(t))
    return changed.length > 0
      ? null
      : 'arrival-ordered identity survived reordering, so key ordering proves nothing'
  })

  check('the canonical fixture is untouched by any of this', () => {
    const v = validateXRayGraph(canonicalGraph, { mode: 'FULL' })
    return v.valid ? null : `${v.summary.errorCount} error(s)`
  })

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------

  const failed = results.filter((r) => !r.ok)
  const width = Math.max(...results.map((r) => r.name.length))

  console.log('\nX-Ray adapter boundaries — 6b\n' + '='.repeat(width + 8))
  for (const r of results) {
    console.log(`${r.ok ? ' ok ' : 'FAIL'}  ${r.name.padEnd(width)}${r.ok ? '' : '  -> ' + r.detail}`)
  }
  console.log('='.repeat(width + 8))
  console.log(`${results.length - failed.length}/${results.length} passed`)
  console.log(
    `\nSeam: ${judgmentRequests(canonicalGraph).length} model queries raised by the canonical graph, ` +
      `${PORT_DEPENDENT_CHECKS.length} port-dependent checks, ` +
      `${blocked.capabilityGaps.length} capability gap(s) journalled in the blocked run\n`,
  )

  if (failed.length) process.exit(1)
}
