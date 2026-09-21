/**
 * The 20d gate: the composed live runtime, driven end to end.
 *
 * TWO KINDS OF STUB, DELIBERATELY
 * ===============================
 * 1. **Port stubs.** Hand-written `ResearchModel` / `ReviewerModel` /
 *    `ResearchAdapter` objects. They exercise `liveStages`, `gatherMaterial`
 *    and `liveRuntime` — the provider-neutral composition — and prove that
 *    swapping a provider changes only which object arrives.
 * 2. **An HTTP stub on 127.0.0.1.** The real Anthropic adapters against a
 *    scripted endpoint, which is the only way to exercise `pause_turn`
 *    continuation: a paused turn is a property of the transport, not of a
 *    hand-written port.
 *
 * NO REQUEST LEAVES THIS MACHINE, and no real civic URL is used.
 *
 * Run:  pnpm check:live-runtime
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'

import { available, unavailable, isAvailable, isUnavailable } from '@/lib/xray/capability'
import type { CapabilityResult } from '@/lib/xray/capability'
import type { Claim, Evidence, Finding, Gap, Source, SourcePosition } from '@/lib/xray/domain'
import { runPipeline } from '@/lib/xray/pipeline/run'
import type { ResearchModel } from '@/lib/xray/pipeline/model-port'
import type { ReviewerModel, ReviewerModelQuery, ModelJudgment } from '@/lib/xray/review'
import type {
  ResearchAdapter, RetrievalQuery, RetrievalResult, RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import { isInspectable } from '@/lib/xray/pipeline/retrieval-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'
import type { GraduationResult } from '@/lib/xray/acceptance'
import { activePortChecks } from '@/lib/xray/review'
import { GraduationService } from '@/lib/xray/application/graduation-service'
import { checkpointCandidate } from '@/lib/xray/persistence/graduation-check-support'
import { xrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import {
  composeLiveRuntime, liveRuntime, registerLiveProviders, REQUIRED_SLOTS,
} from './live-runtime'
import { gatherMaterial } from './material'
import { newRunMaterial } from './live-stages'
import { PROVIDER_ENV } from './config'
import { AnthropicResearchAdapter } from './anthropic'

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []
const check = (name: string, run: Check['run']) => { checks.push({ name, run }) }

process.on('unhandledRejection', (reason) => {
  console.error(`\nFAIL  an unhandled rejection escaped a check: ${String(reason)}`)
  process.exit(1)
})

const SECRET = 'XRAY-SENTINEL-standing-in-for-a-secret-value'
const URL_UNDER_INVESTIGATION = 'https://example.invalid/kisumu-roads'

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------------------
// Port stubs
// ---------------------------------------------------------------------------

const ARTICLE = 'The county government said it resurfaced 42 kilometres of road between'
  + ' January and March 2026, at a cost of 310 million shillings.'
const CORROBORATION = 'The audit records 31 kilometres of resurfacing in the same period.'

const document = (
  ref: string, locator: string, text: string | undefined,
  outcome: RetrievedDocument['outcome'] = 'RETRIEVED',
): RetrievedDocument => ({
  ref: `ref:${ref}` as ProposalRef,
  locator,
  outcome,
  retrievedAt: '2026-04-03T09:00:00Z',
  observed: { title: `Record at ${locator}` },
  ...(text === undefined ? {} : { extract: { text, truncated: false } }),
})

interface StubAdapterOptions {
  /** Locators discovery returns, all as NOT_RETRIEVED search results. */
  readonly found?: readonly string[]
  /** Locators `retrieve` can actually obtain. Others stay unobtained. */
  readonly obtainable?: readonly string[]
  readonly searchUnavailable?: boolean
  readonly calls?: string[]
}

/**
 * A retrieval adapter shaped exactly like the real one.
 *
 * `search` returns `NOT_RETRIEVED` results with no extract — the documented
 * shape — so the sequencing under test is the real sequencing.
 */
function stubAdapter(options: StubAdapterOptions = {}): ResearchAdapter {
  const found = options.found ?? ['https://example.invalid/audit']
  const obtainable = new Set(options.obtainable ?? found)
  return {
    name: 'stub:retrieval',
    capabilities: ['search', 'retrieve'],
    async search(query: RetrievalQuery): Promise<CapabilityResult<RetrievalResult>> {
      options.calls?.push('search')
      if (options.searchUnavailable) {
        return unavailable('research-adapter:search', 'EXHAUSTED',
          'the stub has no search budget', 'add budget')
      }
      return available({
        query,
        documents: found.map((locator, index) =>
          document(`s${index + 1}`, locator, undefined, 'NOT_RETRIEVED')),
      })
    },
    async retrieve(locator: string): Promise<CapabilityResult<RetrievedDocument>> {
      options.calls?.push(`retrieve:${locator}`)
      if (locator === URL_UNDER_INVESTIGATION) {
        return available(document('d1', locator, ARTICLE))
      }
      if (!obtainable.has(locator)) {
        return available(document('d1', locator, undefined, 'DEAD_LINK'))
      }
      return available(document('d1', locator, CORROBORATION))
    },
  }
}

interface StubModelOptions {
  /** Propose a proposition from a handle the stage did not offer. */
  readonly inventHandle?: boolean
  /** Propose a proposition from a record that was never obtained. */
  readonly citeUnobtained?: boolean
  readonly calls?: string[]
}

function stubModel(options: StubModelOptions = {}): ResearchModel {
  const note = (name: string) => options.calls?.push(name)
  return {
    name: 'stub:model',
    async decompose(input) {
      note('decompose')
      return available([{
        text: 'The county resurfaced 42 kilometres of road in the period.',
        sourcePassage: input.document.extract?.text.slice(0, 60) ?? '',
        layer: 'OBSERVATION', type: 'QUANTITATIVE', priority: 'HIGH',
        entities: ['Kisumu County'],
        measurement: { metric: 'resurfaced_length', value: 42, unit: 'km' },
      }])
    },
    async classify(input) {
      note('classify')
      return available(input.claims.map((claim) => ({
        claimRef: claim.ref,
        layer: 'OBSERVATION' as const,
        type: 'QUANTITATIVE' as const,
        priority: 'HIGH' as const,
        entities: ['Kisumu County'],
      })))
    },
    async trace(input) {
      note('trace')
      const readable = input.documents.find((entry) => isInspectable(entry))
      const unobtained = input.documents.find((entry) => !isInspectable(entry))
      const sourceRef = options.inventHandle
        ? ('ref:invented' as ProposalRef)
        : options.citeUnobtained
          ? (unobtained?.ref ?? readable?.ref)
          : readable?.ref
      if (sourceRef === undefined) return available({ evidence: [], discoveredClaims: [] })
      return available({
        evidence: [{
          sourceRef,
          proposition: 'An audit records 31 kilometres for the same period.',
          relationship: 'CHALLENGES' as const,
          strength: 'DIRECT' as const,
          knowledgeBasis: 'ADMINISTRATIVE_RECORD' as const,
          claimRefs: [input.claim.ref],
          quotedPassage: CORROBORATION,
        }],
        discoveredClaims: [],
      })
    },
    async disconfirm(input) {
      note('disconfirm')
      return available([{
        claimRef: input.claim.ref,
        preliminaryHypothesis: 'The figure is as stated.',
        counterHypothesis: 'The figure counts planned rather than completed length.',
        searchStrategy: ['completion certificates'],
        strongestSupportingEvidenceRefs: [],
        strongestOpposingEvidenceRefs: input.evidence.map((entry) => entry.ref),
        result: 'SURVIVED_WEAKENED' as const,
        effectOnFinding: 'The finding cannot exceed SUPPORTED.',
      }])
    },
    async reconcile(input) {
      note('reconcile')
      if (input.evidence.length === 0) return available([])
      return available([{
        claimRefs: input.claims.map((claim) => claim.ref),
        evidenceRefs: input.evidence.map((entry) => entry.ref),
        description: '42 km against 31 km for the same period.',
        classification: 'DIFFERENT_SCOPE' as const,
        reconciliation: 'The audit may count only completed sections.',
        resolvedCandidate: false,
      }])
    },
    async grade(input) {
      note('grade')
      return available([{
        claimRef: input.claim.ref,
        status: 'PARTIALLY_SUPPORTED' as const,
        confidence: 'MEDIUM' as const,
        rationale: 'One audit record challenges the stated figure.',
        supportingEvidenceRefs: [],
        challengingEvidenceRefs: input.evidence.map((entry) => entry.ref),
        contextualEvidenceRefs: [],
        discrepancyRefs: [...input.discrepancyRefs],
        wouldChangeFinding: ['A signed completion certificate stating the length.'],
      }])
    },
    async identifyGaps(input) {
      note('identifyGaps')
      return available([{
        claimRefs: input.claims.map((claim) => claim.ref),
        missingEvidence: 'The signed completion certificate.',
        whyItMatters: 'Only the certificate establishes completed length.',
        resolvingEvidence: ['The certificate itself.'],
        likelyHolder: { institution: 'County Government of Kisumu', basis: 'INFERRED' as const },
        searchAlreadyAttempted: ['county portal'],
        status: 'OPEN' as const,
        effectOnFinding: 'The finding cannot exceed SUPPORTED.',
        // The stage derives atiEligible from this; the provider cannot set it.
        resolutionPath: 'PUBLIC_RECORD_REQUEST' as const,
      }])
    },
  }
}

const stubReviewer = (): ReviewerModel => ({
  name: 'stub:reviewer',
  async judge(query: ReviewerModelQuery): Promise<CapabilityResult<ModelJudgment>> {
    void query
    return available({
      flagged: false, severity: 'ADVISORY', rationale: 'No concern.',
      requiredAction: 'None.', targets: [],
    })
  },
})

// ---------------------------------------------------------------------------
// The HTTP stub, for pause_turn
// ---------------------------------------------------------------------------

type Reply = { status: number; body: unknown }

class Stub {
  private server?: Server
  private port = 0
  readonly received: { body: string; parsed: { messages?: { role: string; content: unknown }[] } }[] = []
  private replies: Reply[] = []

  async start(): Promise<void> {
    this.server = createServer((request, response) => { void this.handle(request, response) })
    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address()
        this.port = typeof address === 'object' && address !== null ? address.port : 0
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (this.server === undefined) return
    await new Promise<void>((resolve) => { this.server!.close(() => resolve()) })
  }

  get baseUrl(): string { return `http://127.0.0.1:${this.port}` }

  script(...replies: Reply[]): void {
    this.replies = [...replies]
    this.received.length = 0
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('utf8')
    let parsed: { messages?: { role: string; content: unknown }[] } = {}
    try { parsed = JSON.parse(body) as typeof parsed } catch { /* raw */ }
    this.received.push({ body, parsed })
    const reply = this.replies.shift() ?? { status: 500, body: { error: { type: 'no_script' } } }
    response.writeHead(reply.status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(reply.body))
  }
}

const stub = new Stub()

const envelope = (content: unknown[], stopReason = 'end_turn'): Reply => ({
  status: 200,
  body: {
    id: 'msg_stub', type: 'message', role: 'assistant', model: 'stub',
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } },
    content,
  },
})

const searchTurn = (query: string, locator: string) => [
  { type: 'server_tool_use', id: `srvtoolu_${query}`, name: 'web_search', input: { query } },
  {
    type: 'web_search_tool_result',
    tool_use_id: `srvtoolu_${query}`,
    content: [{
      type: 'web_search_result', url: locator, title: `Record at ${locator}`,
      encrypted_content: `ENCRYPTED-${query}`, page_age: 'March 1, 2026',
    }],
  },
]

// ---------------------------------------------------------------------------
// 1 — composition and truthful configuration
// ---------------------------------------------------------------------------

check('1 · an unconfigured environment composes nothing and says which slots', async () => {
  const composition = await composeLiveRuntime({ environment: {} })
  if (composition.status !== 'INCOMPLETE') return `status ${composition.status}`
  const slots = composition.missing.map(({ slot }) => slot).sort()
  if (JSON.stringify(slots) !== JSON.stringify(['RESEARCH_MODEL', 'RETRIEVAL', 'REVIEWER_MODEL']))
    return `missing ${JSON.stringify(slots)}`
  // Each carries an actionable reason, and no value.
  for (const { reason } of composition.missing) {
    if (reason.trim() === '') return 'a missing slot carried no reason'
    if (reason.includes(SECRET)) return 'a reason leaked a secret'
  }
  return /not configured/i.test(composition.summary) ? null : `summary "${composition.summary}"`
})

check('2 · a partial configuration composes nothing — no silent fallback', async () => {
  /*
   * The case that matters. A deployment with a model and no retrieval could
   * decompose a record and then find nothing, which looks exactly like an
   * exhaustive search that came up empty. Refusing to compose keeps them apart.
   */
  const partial = await composeLiveRuntime({
    environment: {
      ANTHROPIC_API_KEY: SECRET,
      [PROVIDER_ENV.researchModel]: 'anthropic',
      [PROVIDER_ENV.researchModelId]: 'a-model',
      [PROVIDER_ENV.reviewerModel]: 'anthropic',
      [PROVIDER_ENV.reviewerModelId]: 'a-model',
      // No retrieval selected.
    },
  })
  if (partial.status !== 'INCOMPLETE') return `a partial configuration ${partial.status}`
  if (partial.missing.length !== 1 || partial.missing[0]?.slot !== 'RETRIEVAL')
    return `missing ${JSON.stringify(partial.missing.map((entry) => entry.slot))}`

  // And a selected-but-unconfigured provider is not substituted for.
  const wrongKey = await composeLiveRuntime({
    environment: {
      OPENAI_API_KEY: SECRET,
      [PROVIDER_ENV.researchModel]: 'anthropic',
      [PROVIDER_ENV.researchModelId]: 'a-model',
      [PROVIDER_ENV.reviewerModel]: 'anthropic',
      [PROVIDER_ENV.reviewerModelId]: 'a-model',
      [PROVIDER_ENV.retrieval]: 'anthropic',
      XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'a-model',
    },
  })
  if (wrongKey.status !== 'INCOMPLETE') return 'a missing key still composed a runtime'
  return wrongKey.missing.every(({ reason }) => /ANTHROPIC_API_KEY/.test(reason))
    ? null : `reasons ${JSON.stringify(wrongKey.missing)}`
})

check('3 · a complete configuration composes, and registration is conditional', async () => {
  const environment = {
    ANTHROPIC_API_KEY: SECRET,
    ANTHROPIC_BASE_URL: stub.baseUrl,
    XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'search-model',
    [PROVIDER_ENV.researchModel]: 'anthropic',
    [PROVIDER_ENV.researchModelId]: 'research-model',
    [PROVIDER_ENV.reviewerModel]: 'anthropic',
    [PROVIDER_ENV.reviewerModelId]: 'reviewer-model',
    [PROVIDER_ENV.retrieval]: 'anthropic',
  }
  const composition = await composeLiveRuntime({ environment })
  if (composition.status !== 'COMPOSED') return `status ${composition.status}`
  if (typeof composition.runtime.initial !== 'function') return 'no initial()'
  if (typeof composition.runtime.resume !== 'function') return 'no resume()'
  if (composition.reviewer.name !== 'anthropic:reviewer-model')
    return `reviewer ${composition.reviewer.name}`
  if (composition.summary.includes(SECRET)) return 'the summary leaked the key'

  // Registered only when complete, and both seams are installed.
  const installed: string[] = []
  const seams = {
    setExecutionRuntime: () => { installed.push('EXECUTION_RUNTIME') },
    setReviewerModel: () => { installed.push('REVIEWER_MODEL') },
  }

  const incomplete = await registerLiveProviders(seams, { environment: {} })
  if (incomplete.composition.status !== 'INCOMPLETE') return 'an empty environment composed'
  if (installed.length !== 0)
    return `an incomplete composition installed ${installed.join(', ')}`

  const complete = await registerLiveProviders(seams, { environment })
  if (complete.composition.status !== 'COMPOSED')
    return 'a complete environment did not compose'
  if (JSON.stringify([...installed].sort())
    !== JSON.stringify(['EXECUTION_RUNTIME', 'REVIEWER_MODEL']))
    return `installed ${JSON.stringify(installed)}`
  return JSON.stringify([...complete.registered].sort())
    === JSON.stringify(['EXECUTION_RUNTIME', 'REVIEWER_MODEL'])
    ? null : `reported ${JSON.stringify(complete.registered)}`
})

check('3b · every required slot corresponds to a registered capability', async () => {
  /*
   * The amendment's rule, as a check. A slot that is required but never
   * installed anywhere is a dead composition token: it makes a deployment look
   * configured, forces an operator to supply a key, and changes nothing about
   * what runs. That is what the reviewer was before this amendment — composed,
   * returned, and never consumed by any production path.
   *
   * So: three required slots, and each one reaches a consumer. The research
   * model and the retrieval adapter arrive through the runtime's
   * `StageAdapters`; the reviewer arrives through its own seam.
   */
  if (JSON.stringify([...REQUIRED_SLOTS]) !== JSON.stringify([
    'RESEARCH_MODEL', 'REVIEWER_MODEL', 'RETRIEVAL',
  ])) return `required slots are ${JSON.stringify(REQUIRED_SLOTS)}`

  const installed: string[] = []
  const complete = await registerLiveProviders({
    setExecutionRuntime: () => { installed.push('EXECUTION_RUNTIME') },
    setReviewerModel: () => { installed.push('REVIEWER_MODEL') },
  }, {
    environment: {
      ANTHROPIC_API_KEY: SECRET,
      ANTHROPIC_BASE_URL: stub.baseUrl,
      XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'search-model',
      [PROVIDER_ENV.researchModel]: 'anthropic',
      [PROVIDER_ENV.researchModelId]: 'research-model',
      [PROVIDER_ENV.reviewerModel]: 'anthropic',
      [PROVIDER_ENV.reviewerModelId]: 'reviewer-model',
      [PROVIDER_ENV.retrieval]: 'anthropic',
    },
  })
  if (complete.composition.status !== 'COMPOSED') return 'the environment did not compose'

  // The reviewer slot is registered, so requiring it is not a dead token.
  if (!installed.includes('REVIEWER_MODEL'))
    return 'REVIEWER_MODEL is required but never installed'
  // And the research/retrieval slots reach the pipeline through the runtime.
  const plan = await complete.composition.runtime.initial('XRAY-LIVE-005', {
    sourceUrl: URL_UNDER_INVESTIGATION, createdAt: '2026-04-01T00:00:00Z',
  })
  if (plan.adapters?.model === undefined) return 'the plan carries no research model'
  return plan.adapters.research === undefined
    ? 'the plan carries no retrieval adapter' : null
})

check('4 · re-evaluation is not planned by the live runtime', () => {
  /*
   * A live plan for a successor version needs material bound to the *reason*
   * for re-evaluating — #10's bridge supplies that — not a fresh web search of
   * the original URL. Leaving `reevaluation` undefined makes
   * `startReevaluation` say it cannot be planned, rather than re-researching
   * from scratch and calling the result a successor.
   */
  const runtime = liveRuntime({ model: stubModel(), research: stubAdapter() })
  if (runtime.reevaluation !== undefined)
    return 'the live runtime claims it can plan a re-evaluation'
  const source = stripComments(read('lib/xray/providers/live-runtime.ts'))
  return /reevaluation\s*[(:]/.test(source)
    ? 'the live runtime implements reevaluation' : null
})

// ---------------------------------------------------------------------------
// 5 — search → retrieve sequencing
// ---------------------------------------------------------------------------

check('5 · discovery is followed by retrieval, in that order', async () => {
  const calls: string[] = []
  const adapter = stubAdapter({
    found: ['https://example.invalid/a', 'https://example.invalid/b'],
    obtainable: ['https://example.invalid/a', 'https://example.invalid/b'],
    calls,
  })
  const gathered = await gatherMaterial(adapter, { terms: 'kisumu roads' })
  if ('unavailable' in gathered) return 'the gather reported unavailable'

  if (JSON.stringify(calls) !== JSON.stringify([
    'search', 'retrieve:https://example.invalid/a', 'retrieve:https://example.invalid/b',
  ])) return `calls were ${JSON.stringify(calls)}`

  // Both are readable now, and each kept the handle discovery issued.
  for (const entry of gathered.documents) {
    if (!isInspectable(entry)) return `${String(entry.locator)} is not inspectable`
    if (!/^ref:s\d+$/.test(entry.ref)) return `handle is ${entry.ref}`
  }
  return gathered.stats.obtained === 2 ? null : `obtained ${gathered.stats.obtained}`
})

check('6 · a record that could not be obtained stays unreadable, and stays', async () => {
  const adapter = stubAdapter({
    found: ['https://example.invalid/good', 'https://example.invalid/gone'],
    obtainable: ['https://example.invalid/good'],
  })
  const gathered = await gatherMaterial(adapter, { terms: 'q' })
  if ('unavailable' in gathered) return 'the gather reported unavailable'

  /*
   * Kept, not dropped. A record that was found and could not be read is a
   * research fact — dropping it would make the search look narrower than it
   * was, and XR-INV-006 turns on the extent of the search.
   */
  if (gathered.documents.length !== 2)
    return `${gathered.documents.length} documents, expected 2`
  const gone = gathered.documents.find((entry) =>
    entry.locator === 'https://example.invalid/gone')
  if (gone === undefined) return 'the unobtainable record was dropped'
  if (isInspectable(gone)) return `the unobtainable record is inspectable (${gone.outcome})`
  if (gone.extract !== undefined) return 'an unobtained record carried an extract'
  // And it says nothing about existence.
  const serialized = JSON.stringify(gone).toLowerCase()
  for (const forbidden of ['does_not_exist', 'does not exist', 'no such record']) {
    if (serialized.includes(forbidden)) return `it reads as non-existence: ${forbidden}`
  }
  return gathered.stats.unobtained === 1 ? null : `unobtained ${gathered.stats.unobtained}`
})

check('7 · search-only material is never readable to TRACE', async () => {
  /*
   * The invariant the slice is named for. An adapter whose `retrieve` obtains
   * nothing leaves every discovered record `NOT_RETRIEVED`, and `TRACE` must
   * not be able to draw a proposition from one.
   */
  const adapter = stubAdapter({
    found: ['https://example.invalid/only-found'], obtainable: [],
  })
  const gathered = await gatherMaterial(adapter, { terms: 'q' })
  if ('unavailable' in gathered) return 'the gather reported unavailable'
  if (gathered.documents.some((entry) => isInspectable(entry)))
    return 'a search-only record became readable'

  /*
   * Driven through the pipeline: the model cites the unobtained record, and
   * TRACE refuses. The refusal must be *visible* — an earlier version of the
   * stage dropped the proposition and returned its other work, which silently
   * discarded the fact that a provider had drawn evidence from a record nobody
   * read. `StageOutcome` cannot carry a contribution and a gap at once, so the
   * only non-silent option is to fail the stage.
   */
  const result = await drive({
    model: stubModel({ citeUnobtained: true }),
    research: adapter,
  })
  if (result.graph.evidence.length !== 0)
    return `${result.graph.evidence.length} evidence minted from an unobtained record`
  if (result.status !== 'STAGE_FAILED') return `the run reported ${result.status}`
  if (result.failedStage !== 'TRACE') return `the failed stage was ${String(result.failedStage)}`

  const attempts = result.journal.entries
    .filter((entry) => entry.kind === 'STAGE')
    .map((entry) => entry.run as { stage: string; status: string; failure?: { message?: string } })
    .filter((run) => run.stage === 'TRACE')
  if (attempts.length === 0) return 'TRACE recorded no attempt'
  const recorded = JSON.stringify(attempts)
  if (!/not obtained/.test(recorded))
    return `the journal does not record why TRACE failed: ${recorded.slice(0, 200)}`
  // PERMANENT: the same request produces the same answer, so it is not retried.
  return attempts.length === 1
    ? null : `TRACE was attempted ${attempts.length} times for a permanent failure`
})

// ---------------------------------------------------------------------------
// 8 — end to end
// ---------------------------------------------------------------------------

/** Drive the composed runtime through the real pipeline. */
async function drive(adapters: {
  model?: ResearchModel; research?: ResearchAdapter
}, calls?: string[]) {
  const runtime = liveRuntime(adapters, { retrieveLimit: 3 })
  const plan = await runtime.initial('XRAY-LIVE-001', {
    sourceUrl: URL_UNDER_INVESTIGATION, createdAt: '2026-04-01T00:00:00Z',
  })
  void calls
  return runPipeline({
    investigation: plan.investigation,
    stages: plan.stages,
    ...(plan.adapters === undefined ? {} : { adapters: plan.adapters }),
    maxAttempts: plan.maxAttempts ?? 1,
  })
}

check('8 · the composed runtime drives every stage end to end', async () => {
  const calls: string[] = []
  const result = await drive({
    model: stubModel({ calls }), research: stubAdapter({ calls }),
  })

  // Every research stage ran — none silently skipped.
  const ran = result.journal.entries
    .filter((entry) => entry.kind === 'STAGE')
    .map((entry) => (entry.run as { stage: string }).stage)
  for (const stage of ['INGEST', 'DECOMPOSE', 'CLASSIFY', 'PLAN', 'TRACE', 'PROVENANCE',
    'DISCONFIRM', 'RECONCILE', 'GRADE', 'GAPS']) {
    if (!ran.includes(stage)) return `${stage} did not run (ran: ${ran.join(', ')})`
  }

  // And produced canonical state.
  const graph = result.graph
  if (graph.sources.length < 2)
    return `${graph.sources.length} sources, expected the surface record and at least one more`
  if (graph.claims.length === 0) return 'no claims'
  if (graph.evidence.length === 0) return 'no evidence'
  if (graph.findings.length === 0) return 'no findings'
  if (graph.gaps.length === 0) return 'no gaps'

  // The ports were actually exercised, in protocol order.
  const modelCalls = calls.filter((entry) => !entry.startsWith('search')
    && !entry.startsWith('retrieve'))
  if (JSON.stringify(modelCalls) !== JSON.stringify([
    'decompose', 'classify', 'trace', 'disconfirm', 'reconcile', 'grade', 'identifyGaps',
  ])) return `model calls were ${JSON.stringify(modelCalls)}`
  return null
})

check('9 · the stage owns every canonical decision', async () => {
  const result = await drive({ model: stubModel(), research: stubAdapter() })
  const graph = result.graph

  // Identity is the allocator's. Namespaces are XR-INV-012's.
  for (const claim of graph.claims) {
    if (!/^(C|DC)\d+$/.test(claim.id)) return `claim id ${claim.id} is not allocator-shaped`
  }
  for (const source of graph.sources) {
    if (source.id.includes('example.invalid')) return 'a source id came from a locator'
  }
  for (const finding of graph.findings) {
    if (!finding.id.startsWith('FND-')) return `finding id ${finding.id}`
  }

  // Retrieval material is not evidence, and the stage decided the classes.
  for (const source of graph.sources) {
    if (source.originStatus !== 'UNKNOWN')
      return `${source.id} claims originStatus ${source.originStatus} before PROVENANCE ran`
    if (!['SECONDARY'].includes(source.evidenceClass))
      return `${source.id} claims evidenceClass ${source.evidenceClass}`
  }

  // `accessibility` mirrors what retrieval reported reaching.
  const surface = graph.sources[0]!
  if (surface.accessibility !== 'RETRIEVED')
    return `the surface record claims ${surface.accessibility}`

  // ATI eligibility is derived from the resolution path, never proposed.
  for (const gap of graph.gaps) {
    const eligible = gap.resolutionPath === 'PUBLIC_RECORD_REQUEST'
    if (gap.atiEligible !== eligible)
      return `gap ${gap.id} eligibility ${String(gap.atiEligible)} for path ${gap.resolutionPath}`
  }
  return null
})

check('10 · a handle the stage never issued is ignored', async () => {
  const result = await drive({
    model: stubModel({ inventHandle: true }), research: stubAdapter(),
  })
  // The proposal cited `ref:invented`. No source, no evidence, and nothing
  // minted under a provider-chosen identifier.
  if (result.graph.evidence.length !== 0)
    return `${result.graph.evidence.length} evidence minted from an invented handle`
  return JSON.stringify(result.graph).includes('invented')
    ? 'an invented handle reached canonical state' : null
})

check('11 · PROVENANCE reports a gap rather than deciding lineage', async () => {
  const result = await drive({ model: stubModel(), research: stubAdapter() })

  /*
   * ADR-0010 assigns lineage to this stage so a provider cannot assert it, and
   * 20c established that neither documented server tool supplies printed
   * attribution. So the stage has nothing to decide from, and says so.
   */
  const gap = result.capabilityGaps.find((entry) => entry.operation === 'provenance:lineage')
  if (gap === undefined) return 'PROVENANCE reported no capability gap'
  if (!/independence cannot be decided/.test(gap.detail))
    return `the gap does not name what is missing: "${gap.detail}"`
  if (!/attributedTo/.test(gap.resolvedBy))
    return `the gap is not actionable: "${gap.resolvedBy}"`

  // And it decided nothing: no dependency, no provenance record.
  if (result.graph.sourceDependencies.length !== 0)
    return `${result.graph.sourceDependencies.length} source dependencies were invented`
  return result.graph.evidenceProvenance.length === 0
    ? null : `${result.graph.evidenceProvenance.length} provenance records were invented`
})

check('12 · a blocked stage is a gap, not a failure, and not an empty success', async () => {
  // No retrieval at all: every stage that needs it says so.
  const result = await drive({ model: stubModel() })
  if (result.graph.sources.length !== 0) return 'a source appeared with no retrieval'
  if (result.capabilityGaps.length === 0) return 'no capability gap was reported'
  const ingest = result.capabilityGaps.find((entry) =>
    entry.operation === 'research-adapter:INGEST')
  if (ingest === undefined) return 'INGEST reported no gap'
  if (ingest.reason !== 'NOT_CONFIGURED') return `INGEST reason ${ingest.reason}`
  if (!/XRAY_RETRIEVAL_PROVIDER/.test(ingest.resolvedBy))
    return `the gap does not name the variable: "${ingest.resolvedBy}"`

  // Search that is unavailable is a gap too, never an empty result set.
  const noSearch = await drive({
    model: stubModel(), research: stubAdapter({ searchUnavailable: true }),
  })
  const traceGap = noSearch.capabilityGaps.find((entry) =>
    entry.operation === 'research-adapter:search')
  return traceGap !== undefined
    ? null : 'an unavailable search produced no gap'
})

check('13 · no submitted URL blocks every stage with a reason', async () => {
  const runtime = liveRuntime({ model: stubModel(), research: stubAdapter() })
  const plan = await runtime.initial('XRAY-LIVE-002', null)
  if (plan.stages.length !== 10) return `${plan.stages.length} stages planned`
  const result = await runPipeline({
    investigation: plan.investigation, stages: plan.stages, maxAttempts: 1,
  })
  if (result.capabilityGaps.length !== 10)
    return `${result.capabilityGaps.length} gaps, expected one per stage`
  return result.capabilityGaps.every((gap) => /nothing to research/.test(gap.detail))
    ? null : 'a gap did not say why'
})

// ---------------------------------------------------------------------------
// 14 — pause_turn continuation through the composed adapter
// ---------------------------------------------------------------------------

check('14 · a paused search turn continues and completes, without restarting', async () => {
  /*
   * The real path, through the real transport. Two paused turns then a
   * completion: three requests, one user turn, and every earlier result still
   * present.
   */
  stub.script(
    envelope(searchTurn('first', 'https://example.invalid/r1'), 'pause_turn'),
    envelope(searchTurn('second', 'https://example.invalid/r2'), 'pause_turn'),
    envelope(searchTurn('third', 'https://example.invalid/r3')),
  )
  const adapter = new AnthropicResearchAdapter({
    modelId: 'search-model', apiKey: SECRET, baseUrl: stub.baseUrl,
  })
  const found = await adapter.search({ terms: 'kisumu roads' })
  if (!isAvailable(found)) return `resolved ${found.kind}`

  if (stub.received.length !== 3)
    return `${stub.received.length} requests, expected 3 (one turn plus two continuations)`

  /*
   * Nothing was restarted. Each request carries the one original user message
   * plus one appended assistant message per continuation so far — so request
   * n has exactly n messages. A restart would have sent a fresh single-message
   * request each time, and a second user turn would mean a new question.
   */
  for (const [index, sent] of stub.received.entries()) {
    const messages = sent.parsed.messages ?? []
    const users = messages.filter((message) => message.role === 'user')
    if (users.length !== 1)
      return `request ${index + 1} carried ${users.length} user messages`
    if (messages.length !== index + 1)
      return `request ${index + 1} carried ${messages.length} messages, expected ${index + 1}`
  }

  // The results from all three turns survived, in order.
  const locators = found.value.documents.map((entry) => entry.locator)
  if (JSON.stringify(locators) !== JSON.stringify([
    'https://example.invalid/r1', 'https://example.invalid/r2', 'https://example.invalid/r3',
  ])) return `kept ${JSON.stringify(locators)}`

  // The opaque content the API needs to restore them was sent back unchanged.
  const last = JSON.parse(stub.received[2]!.body) as {
    messages: { role: string; content: unknown }[]
  }
  const resent = JSON.stringify(last.messages.slice(1))
  if (!resent.includes('ENCRYPTED-first') || !resent.includes('ENCRYPTED-second'))
    return 'an earlier turn\'s encrypted_content was not sent back'

  // A completed continuation is not "we stopped early".
  if (found.value.moreAvailable !== undefined) return 'a completed turn claimed more available'
  const note = found.value.diagnostics?.note ?? ''
  return /turn continued 2 time\(s\)/.test(note) ? null : `note is "${note}"`
})

check('15 · a continued search feeds the composed runtime as material', async () => {
  /*
   * End to end with the real adapter: a paused search, continued, then the
   * discovered records fetched, and the pipeline driven over the result. This
   * is the path a live run takes, with the network replaced.
   */
  stub.script(
    // INGEST fetches the submitted URL.
    envelope([
      { type: 'server_tool_use', id: 'srv_i', name: 'web_fetch', input: { url: URL_UNDER_INVESTIGATION } },
      {
        type: 'web_fetch_tool_result', tool_use_id: 'srv_i',
        content: {
          type: 'web_fetch_result', url: URL_UNDER_INVESTIGATION,
          content: {
            type: 'document',
            source: { type: 'text', media_type: 'text/plain', data: ARTICLE },
            title: 'County road resurfacing progress report',
          },
          retrieved_at: '2026-04-03T09:00:00Z',
        },
      },
    ]),
    // TRACE's search pauses once, then completes.
    envelope(searchTurn('audit', 'https://example.invalid/audit'), 'pause_turn'),
    envelope(searchTurn('auditb', 'https://example.invalid/audit2')),
    // Then each discovered record is fetched.
    envelope([
      { type: 'server_tool_use', id: 'srv_a', name: 'web_fetch', input: { url: 'https://example.invalid/audit' } },
      {
        type: 'web_fetch_tool_result', tool_use_id: 'srv_a',
        content: {
          type: 'web_fetch_result', url: 'https://example.invalid/audit',
          content: {
            type: 'document',
            source: { type: 'text', media_type: 'text/plain', data: CORROBORATION },
            title: 'County audit',
          },
          retrieved_at: '2026-04-03T10:00:00Z',
        },
      },
    ]),
    envelope([
      { type: 'server_tool_use', id: 'srv_b', name: 'web_fetch', input: { url: 'https://example.invalid/audit2' } },
      {
        type: 'web_fetch_tool_result', tool_use_id: 'srv_b',
        content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' },
      },
    ]),
  )

  const research = new AnthropicResearchAdapter({
    modelId: 'search-model', apiKey: SECRET, baseUrl: stub.baseUrl,
  })
  const runtime = liveRuntime({ model: stubModel(), research }, { retrieveLimit: 3 })
  const plan = await runtime.initial('XRAY-LIVE-003', {
    sourceUrl: URL_UNDER_INVESTIGATION, createdAt: '2026-04-01T00:00:00Z',
  })
  const result = await runPipeline({
    investigation: plan.investigation,
    stages: plan.stages,
    ...(plan.adapters === undefined ? {} : { adapters: plan.adapters }),
    maxAttempts: 1,
  })

  // The surface record was ingested from the real fetch path.
  if (result.graph.sources.length === 0) return 'no source was minted'
  const surface = result.graph.sources[0]!
  if (surface.accessibility !== 'RETRIEVED')
    return `the surface record is ${surface.accessibility}`

  // The continued search's records both reached TRACE as material, and only
  // the one that was actually fetched became readable.
  const evidence = result.graph.evidence
  if (evidence.length === 0) return 'no evidence was drawn from the continued search'
  const sourceById = new Map(result.graph.sources.map((entry) => [entry.id, entry]))
  for (const item of evidence) {
    const source = sourceById.get(item.sourceId)
    if (source === undefined) return `evidence ${item.id} references no source`
    if (source.accessibility === 'DEAD_LINK')
      return 'evidence was drawn from a dead link'
  }
  return null
})

check('16 · the continuation bound stops the turn and says so', async () => {
  stub.script(...Array.from({ length: 8 }, (unused, index) => {
    void unused
    return envelope(searchTurn(`q${index}`, `https://example.invalid/p${index}`), 'pause_turn')
  }))
  const adapter = new AnthropicResearchAdapter({
    modelId: 'search-model', apiKey: SECRET, baseUrl: stub.baseUrl,
  })
  const found = await adapter.search({ terms: 'q' })
  if (!isAvailable(found)) return `resolved ${found.kind}`
  if (stub.received.length !== 5)
    return `${stub.received.length} requests, expected 5 (one turn plus a bound of four)`
  if (found.value.documents.length !== 5)
    return `${found.value.documents.length} documents kept`
  // "We stopped continuing" is not "the search finished".
  if (found.value.moreAvailable !== true) return 'the bound did not report more may exist'
  return /still paused at the continuation limit/.test(found.value.diagnostics?.note ?? '')
    ? null : 'the bound was not disclosed'
})

// ---------------------------------------------------------------------------
// 20 — the reviewer is live capability, not a composition token
// ---------------------------------------------------------------------------

async function migrate(db: PGlite): Promise<void> {
  for (const name of ['0001_version_ownership', '0002_source_retrieval_precision',
    '0003_reevaluation_audit', '0004_source_position_knowledge_basis',
    '0005_execution_audit', '0006_graduation_audit']) {
    await db.exec(readFileSync(
      new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
  }
}

/** A reviewer that records what it was asked, and can refuse or break. */
function countingReviewer(behaviour: {
  readonly refuse?: boolean
  readonly throwOn?: ReviewerModelQuery['kind']
  readonly flag?: boolean
} = {}): ReviewerModel & { asked: ReviewerModelQuery['kind'][] } {
  const asked: ReviewerModelQuery['kind'][] = []
  return {
    name: 'stub:reviewer',
    asked,
    async judge(query) {
      asked.push(query.kind)
      if (behaviour.throwOn === query.kind) {
        throw new Error('synthetic reviewer outage')
      }
      if (behaviour.refuse) {
        return unavailable(`reviewer-model:${query.kind}`, 'REFUSED_FOR_INPUT',
          'the stub declined this query', 'configure a reviewer that answers it')
      }
      return available({
        flagged: behaviour.flag === true,
        severity: 'ADVISORY' as const,
        rationale: 'stub judgment',
        requiredAction: 'none',
        targets: [],
      })
    },
  }
}

/** Assess the canonical graph through the real service, with a reviewer. */
async function assessWith(reviewer: ReviewerModel | undefined): Promise<GraduationResult> {
  const db = new PGlite()
  try {
    await migrate(db)
    const graph = xrayKe001Graph
    await checkpointCandidate(db, 'RUN-20D-REVIEW', graph, '2026-04-01T00:00:00Z')
    const service = new GraduationService(db, () => '2026-04-01T00:00:00Z')
    const audit = await service.assess(graph.investigation.id, 'RUN-20D-REVIEW', {
      behaviors: [],
      ...(reviewer === undefined ? {} : { model: reviewer }),
    })
    return audit.result
  } finally {
    await db.close()
  }
}

/** The model-assisted checks, from the full review the assessment recorded. */
const modelAssisted = (result: GraduationResult) =>
  result.detail.review.checks.filter((check) => check.capability === 'MODEL_ASSISTED')

check('20 · a live reviewer is actually asked, and its checks become EVALUATED', async () => {
  /*
   * The amendment's blocker. `composeLiveRuntime` constructed a reviewer and
   * nothing consumed it, and `GraduationService.assess` passed a model into
   * the *synchronous* `reviewXRayGraph` — which does not collect judgments. So
   * a fully configured deployment reported the capability and left every
   * model-assisted check NOT_EVALUATED.
   *
   * This asserts the chain end to end through the real service:
   *   ReviewerModel -> collectModelJudgments -> judgments as data -> pure review
   */
  const reviewer = countingReviewer()
  const withModel = await assessWith(reviewer)

  // It was asked. Not "an object was constructed".
  if (reviewer.asked.length === 0) return 'judge() was never called'
  const kinds = [...new Set(reviewer.asked)].sort()
  if (!kinds.includes('CLAIM_ATOMICITY'))
    return `asked ${JSON.stringify(kinds)}, expected CLAIM_ATOMICITY among them`

  // And the answers landed: model-assisted checks are EVALUATED.
  const checks = modelAssisted(withModel)
  if (checks.length === 0) return 'no model-assisted checks were reported'
  const evaluated = checks.filter((check) => check.outcome !== 'NOT_EVALUATED')
  if (evaluated.length === 0)
    return `all ${checks.length} model-assisted checks are still NOT_EVALUATED`

  /*
   * The same assessment without a reviewer leaves them unevaluated — so the
   * difference above is the reviewer being asked, not something else. This is
   * the comparison that would have caught the original defect: before the
   * amendment both sides of it were identical.
   */
  const withoutModel = await assessWith(undefined)
  const unreviewed = modelAssisted(withoutModel)
  if (!unreviewed.every((check) => check.outcome === 'NOT_EVALUATED'))
    return 'model-assisted checks were EVALUATED with no reviewer configured'
  if (withModel.review.checksEvaluated <= withoutModel.review.checksEvaluated)
    return `checksEvaluated did not increase (${withoutModel.review.checksEvaluated}`
      + ` -> ${withModel.review.checksEvaluated})`
  return null
})

check('21 · an unconfigured reviewer is a truthful blocker, never a silent pass', async () => {
  const withoutModel = await assessWith(undefined)
  const checks = modelAssisted(withoutModel)

  /*
   * `ReviewOutcome` is `EVALUATED | NOT_EVALUATED` — there is no PASS to
   * collapse into, which is #4's design. So the silent-pass failure mode here
   * is a check reported EVALUATED without anyone having judged it, and that is
   * what this asserts against.
   */
  for (const check of checks) {
    if (check.outcome !== 'NOT_EVALUATED')
      return `${check.checkId} is ${check.outcome} with no reviewer configured`
    if ((check.notEvaluatedReason ?? '').trim() === '')
      return `${check.checkId} gives no reason for not being evaluated`
    if (check.findingCount !== 0)
      return `${check.checkId} raised ${check.findingCount} findings without being evaluated`
  }

  // Graduation says BLOCKED, and names the capability.
  if (withoutModel.verdict !== 'BLOCKED')
    return `verdict ${withoutModel.verdict} with no reviewer`
  if (withoutModel.review.fullCapability)
    return 'full review capability was claimed with no reviewer'
  return withoutModel.blockers.some((blocker) => /Reviewer/i.test(blocker.resolvedBy))
    ? null : 'no blocker names the missing reviewer'
})

check('22 · a refusing reviewer leaves the check unevaluated, not flagged', async () => {
  /*
   * A refusal is a capability fact about one query, not a finding about the
   * graph. `collectModelJudgments` returns it as `UNAVAILABLE`, the check stays
   * NOT_EVALUATED with a reason, and nothing is written into the review as
   * though the graph were at fault.
   */
  const reviewer = countingReviewer({ refuse: true })
  const refused = await assessWith(reviewer)
  if (reviewer.asked.length === 0) return 'judge() was never called'

  /*
   * Scoped to the checks that actually had something to judge.
   *
   * A model-assisted check the graph raises no subject for is legitimately
   * EVALUATED — "the graph raised no subject" is a completed check, and
   * reporting it unevaluated would leave a permanent capability gap on graphs
   * that simply have no findings yet. An earlier version of this check
   * asserted *every* model-assisted check went unevaluated and failed on
   * exactly that case.
   *
   * So the subjects are identified by what the reviewer was asked, and only
   * those must be unevaluated under refusal.
   */
  const askedKinds = new Set(reviewer.asked)
  const refusedCheckIds = new Set(
    activePortChecks(xrayKe001Graph.investigation.protocolVersion)
      .filter((portCheck) => askedKinds.has(portCheck.queryKind))
      .map((portCheck) => portCheck.checkId))
  if (refusedCheckIds.size === 0) return 'no port check corresponds to what was asked'

  const checks = modelAssisted(refused).filter((check) => refusedCheckIds.has(check.checkId))
  if (checks.length === 0) return 'the refused checks were not reported'
  for (const check of checks) {
    if (check.outcome !== 'NOT_EVALUATED')
      return `${check.checkId} was ${check.outcome} after its query was refused`
    if ((check.notEvaluatedReason ?? '') === '')
      return `${check.checkId} gave no reason after a refusal`
  }

  // No finding was raised from a refusal.
  const findings = refused.detail.review.findings
  if (findings.length !== 0)
    return `${findings.length} review finding(s) came out of a refusal`
  // A refusal is our capability gap, not a claim about the graph.
  return refused.reasons.some((reason) => /reviewer|judgment/i.test(reason.message))
    ? 'a refusal became a graduation reason about the graph' : null
})

check('23 · a broken reviewer is an outage, and blocks rather than committing', async () => {
  /*
   * A throw is not a capability gap. `collectModelJudgments` documents that
   * swallowing it would report an outage as something an operator cannot act
   * on, so it propagates — and the consequence is what matters: no assessment
   * is appended, so nothing can be committed on the strength of a review that
   * never happened.
   */
  const reviewer = countingReviewer({ throwOn: 'CLAIM_ATOMICITY' })
  let threw = false
  try { await assessWith(reviewer) } catch { threw = true }
  if (!threw) return 'a broken reviewer produced an assessment anyway'

  // And no assessment was recorded, so a commit has nothing to stand on.
  const db = new PGlite()
  try {
    await migrate(db)
    await checkpointCandidate(db, 'RUN-20D-OUTAGE', xrayKe001Graph, '2026-04-01T00:00:00Z')
    const service = new GraduationService(db, () => '2026-04-01T00:00:00Z')
    try {
      await service.assess(xrayKe001Graph.investigation.id, 'RUN-20D-OUTAGE', {
        behaviors: [], model: reviewer,
      })
    } catch { /* expected */ }
    const assessment = await service.latestAssessment('RUN-20D-OUTAGE')
    return assessment === undefined
      ? null : 'an assessment was recorded despite the reviewer outage'
  } finally {
    await db.close()
  }
})

check('24 · no provider-specific reviewer type leaves composition', () => {
  /*
   * The seam is typed `ReviewerModel` — the port — so a consumer cannot come
   * to depend on an Anthropic type. Asserted structurally, because a leak here
   * would be invisible until someone tried to swap providers.
   */
  const runtime = stripComments(read('lib/xray/application/runtime.ts'))
  if (!/setReviewerModelProvider/.test(runtime)) return 'the reviewer seam is gone'
  if (/anthropic/i.test(runtime)) return 'the application runtime names a provider'
  if (!/provider: \(\(\) => Promise<ReviewerModel>\) \| null/.test(runtime))
    return 'the reviewer seam is not typed against the port'

  const graduation = stripComments(read('lib/xray/application/graduation-service.ts'))
  if (/anthropic/i.test(graduation)) return 'graduation names a provider'
  if (!/collectModelJudgments/.test(graduation))
    return 'graduation does not collect judgments'

  const acceptance = stripComments(read('lib/xray/acceptance/runner.ts'))
  if (/anthropic/i.test(acceptance)) return 'the acceptance runner names a provider'

  // And no Anthropic reviewer type is imported outside the provider layer.
  const live = stripComments(read('lib/xray/providers/live-runtime.ts'))
  return /AnthropicReviewerModel/.test(live)
    ? 'composition exposes the Anthropic reviewer type' : null
})

// ---------------------------------------------------------------------------
// 25 — the retrieval timestamp
// ---------------------------------------------------------------------------

check('25 · a record with no retrievedAt gets X-Ray\'s own observation time', async () => {
  /*
   * The second blocker, and a bug the gate had no right to miss: this fell
   * back to `ctx.correlation.investigationId` — an investigation id where a
   * timestamp belongs. It typechecked because both are strings, and every
   * fixture happened to supply a `retrievedAt`, so nothing ever exercised the
   * fallback.
   */
  const OBSERVED = '2026-09-21T12:34:56Z'
  const noTimestamp: ResearchAdapter = {
    name: 'stub:no-timestamp',
    capabilities: ['search', 'retrieve'],
    async search(query) { return available({ query, documents: [] }) },
    async retrieve(locator) {
      // Readable, and deliberately silent about when it was obtained.
      return available({
        ref: 'ref:d1' as ProposalRef,
        locator,
        outcome: 'RETRIEVED',
        observed: { title: 'A record that does not say when it was read' },
        extract: { text: ARTICLE, truncated: false },
      })
    },
  }

  const runtime = liveRuntime(
    { model: stubModel(), research: noTimestamp }, { now: () => OBSERVED })
  const plan = await runtime.initial('XRAY-LIVE-006', {
    sourceUrl: URL_UNDER_INVESTIGATION, createdAt: '2026-04-01T00:00:00Z',
  })
  const result = await runPipeline({
    investigation: plan.investigation,
    stages: plan.stages,
    ...(plan.adapters === undefined ? {} : { adapters: plan.adapters }),
    maxAttempts: 1,
  })

  const surface = result.graph.sources[0]
  if (surface === undefined) return 'no source was minted'
  if (surface.retrievedAt !== OBSERVED)
    return `retrievedAt is "${surface.retrievedAt}", expected the injected clock`
  // Never an id, never a placeholder epoch.
  if (surface.retrievedAt.includes('XRAY')) return 'retrievedAt carries an investigation id'
  if (surface.retrievedAt.startsWith('1970')) return 'retrievedAt is a placeholder epoch'

  // A provider value that is not an instant is not trusted either.
  const nonsense: ResearchAdapter = {
    ...noTimestamp,
    async retrieve(locator) {
      return available({
        ref: 'ref:d1' as ProposalRef, locator, outcome: 'RETRIEVED',
        retrievedAt: 'last Tuesday' as never,
        observed: {}, extract: { text: ARTICLE, truncated: false },
      })
    },
  }
  const second = liveRuntime(
    { model: stubModel(), research: nonsense }, { now: () => OBSERVED })
  const secondPlan = await second.initial('XRAY-LIVE-007', {
    sourceUrl: URL_UNDER_INVESTIGATION, createdAt: '2026-04-01T00:00:00Z',
  })
  const secondResult = await runPipeline({
    investigation: secondPlan.investigation,
    stages: secondPlan.stages,
    ...(secondPlan.adapters === undefined ? {} : { adapters: secondPlan.adapters }),
    maxAttempts: 1,
  })
  const secondSurface = secondResult.graph.sources[0]
  if (secondSurface === undefined) return 'no source was minted for the nonsense timestamp'
  return secondSurface.retrievedAt === OBSERVED
    ? null : `an unparseable provider timestamp survived: "${secondSurface.retrievedAt}"`
})

// ---------------------------------------------------------------------------
// 17 — layering
// ---------------------------------------------------------------------------

check('17 · the stage layer is provider-neutral and the pipeline is untouched', () => {
  for (const file of ['live-stages.ts', 'material.ts']) {
    const source = stripComments(read(`lib/xray/providers/${file}`))
    if (/anthropic|openai/i.test(source)) return `${file} names a provider`
    if (/\bfetch\s*\(/.test(source)) return `${file} performs HTTP`
    if (/api\.anthropic|web_search_|web_fetch_/.test(source))
      return `${file} knows a provider protocol`
  }
  // The pipeline learned nothing. Its files import no provider and no
  // composition module.
  for (const file of ['run.ts', 'stages.ts', 'model-port.ts', 'retrieval-port.ts']) {
    const source = stripComments(read(`lib/xray/pipeline/${file}`))
    if (/providers\//.test(source)) return `pipeline/${file} imports the provider layer`
    if (/pause_turn|continuation/i.test(source))
      return `pipeline/${file} knows about a provider turn`
  }
  return null
})

check('18 · review stays out of the pipeline adapters', () => {
  /*
   * `reviewXRayGraph` takes a `ReviewerModel` directly and the REVIEW gate is
   * not a research stage, so the reviewer must not appear in `StageAdapters` —
   * smuggling it there would give a research stage a reviewer.
   */
  const stages = stripComments(read('lib/xray/pipeline/stages.ts'))
  const adapters = stages.slice(stages.indexOf('export interface StageAdapters'))
    .slice(0, 300)
  if (/Reviewer/.test(adapters)) return 'StageAdapters carries a reviewer'
  const live = stripComments(read('lib/xray/providers/live-runtime.ts'))
  if (/adapters[^\n]*reviewer|reviewer[^\n]*adapters/i.test(live))
    return 'the composition puts the reviewer in the adapters'
  return /readonly reviewer: ReviewerModel/.test(live)
    ? null : 'the composition does not expose the reviewer separately'
})

check('19 · no secret reaches a composed runtime, a plan, or a graph', async () => {
  const environment = {
    ANTHROPIC_API_KEY: SECRET,
    ANTHROPIC_BASE_URL: stub.baseUrl,
    XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'search-model',
    [PROVIDER_ENV.researchModel]: 'anthropic',
    [PROVIDER_ENV.researchModelId]: 'research-model',
    [PROVIDER_ENV.reviewerModel]: 'anthropic',
    [PROVIDER_ENV.reviewerModelId]: 'reviewer-model',
    [PROVIDER_ENV.retrieval]: 'anthropic',
  }
  const composition = await composeLiveRuntime({ environment })
  if (composition.status !== 'COMPOSED') return `status ${composition.status}`
  if (JSON.stringify(composition.summary).includes(SECRET))
    return 'the summary carried the key'

  const plan = await composition.runtime.initial('XRAY-LIVE-004', {
    sourceUrl: URL_UNDER_INVESTIGATION, createdAt: '2026-04-01T00:00:00Z',
  })
  // The plan carries stage closures; serialising it must not reveal a key.
  const serialized = JSON.stringify({
    investigation: plan.investigation, maxAttempts: plan.maxAttempts,
    stages: plan.stages.map((stage) => stage.stage),
  })
  if (serialized.includes(SECRET)) return 'the plan carried the key'

  const result = await drive({ model: stubModel(), research: stubAdapter() })
  return JSON.stringify(result.graph).includes(SECRET)
    ? 'the graph carried the key' : null
})

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

let failures = 0

async function main(): Promise<void> {
  await stub.start()
  try {
    for (const { name, run } of checks) {
      let detail: string | null
      try { detail = await run() } catch (err) { detail = `threw: ${(err as Error).message}` }
      console.log(`${detail === null ? 'ok  ' : 'FAIL'}  ${name}${detail === null ? '' : ` — ${detail}`}`)
      if (detail !== null) failures += 1
    }
  } finally {
    await stub.stop()
  }
  console.log(`\n${checks.length - failures}/${checks.length} live runtime checks passed`)
  console.log('Every call went to 127.0.0.1. No civic URL was used.')
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
