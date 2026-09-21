/**
 * The 20b gate: Anthropic model and reviewer adapters.
 *
 * NO NETWORK LEAVES THIS MACHINE
 * ==============================
 * Every call goes to a stub on 127.0.0.1, reached through the
 * `ANTHROPIC_BASE_URL` the registry entry declares. That is the whole reason
 * the variable is declared rather than hidden in the transport: a test-only
 * escape hatch would be a second door into the same room, and this way the
 * gate uses the same configuration boundary an operator would.
 *
 * The stub also records what it received, which is what makes two negatives
 * provable rather than asserted: that no canonical id reaches the provider,
 * and that the key appears in a header and nowhere else.
 *
 * Run:  pnpm check:anthropic-adapters
 *
 * Named `adapter-checks.ts`, not `checks.ts`: the source scans below — and
 * 20a's — skip check harnesses by a `-checks.ts` suffix, and a file called
 * `checks.ts` slipped past that and failed its own DOES_NOT_EXIST scan.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { AdapterFailure, isAvailable, isUnavailable } from '@/lib/xray/capability'
import type { CapabilityResult, CapabilityUnavailable, UnavailableReason } from '@/lib/xray/capability'
import type {
  Claim, Evidence, Finding, Gap, Source, SourcePosition,
} from '@/lib/xray/domain'
import type { Offered } from '@/lib/xray/pipeline/model-port'
import type { RetrievedDocument } from '@/lib/xray/pipeline/retrieval-port'
import type { ReviewerModelQuery } from '@/lib/xray/review'
import { composeProviders, DEFAULT_REGISTRY } from '../registry'
import { PROVIDER_ENV } from '../config'
import { AnthropicResearchModel, AnthropicReviewerModel } from './index'

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []
const check = (name: string, run: Check['run']) => { checks.push({ name, run }) }

process.on('unhandledRejection', (reason) => {
  console.error(`\nFAIL  an unhandled rejection escaped a check: ${String(reason)}`)
  process.exit(1)
})

/** A stand-in for a real key. Deliberately not key-shaped; see 20a check 14. */
const SECRET = 'XRAY-SENTINEL-standing-in-for-a-secret-value'

// ---------------------------------------------------------------------------
// The stub
// ---------------------------------------------------------------------------

interface Recorded {
  readonly headers: Record<string, string | string[] | undefined>
  readonly body: string
  readonly parsed: {
    model?: string
    system?: string
    messages?: { role: string; content: string }[]
    tools?: { name: string }[]
    tool_choice?: { type: string; name?: string }
    max_tokens?: number
  }
}

type Reply = { status: number; body: unknown; headers?: Record<string, string> }

class Stub {
  private server?: Server
  private port = 0
  readonly received: Recorded[] = []
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

  /** Queue what the next call(s) get back, and forget earlier traffic. */
  script(...replies: Reply[]): void {
    this.replies = [...replies]
    this.received.length = 0
  }

  get last(): Recorded {
    const entry = this.received.at(-1)
    if (entry === undefined) throw new Error('the stub received no request')
    return entry
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const body = Buffer.concat(chunks).toString('utf8')
    let parsed: Recorded['parsed'] = {}
    try { parsed = JSON.parse(body) as Recorded['parsed'] } catch { /* recorded raw */ }
    this.received.push({ headers: request.headers, body, parsed })

    const reply = this.replies.shift() ?? { status: 500, body: { error: { type: 'no_script' } } }
    response.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers })
    response.end(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body))
  }
}

const stub = new Stub()

/** A well-formed Messages response carrying one forced tool call. */
const toolReply = (name: string, input: unknown, extra: Record<string, unknown> = {}): Reply => ({
  status: 200,
  headers: { 'request-id': 'req_stub_0001' },
  body: {
    id: 'msg_stub', type: 'message', role: 'assistant', model: 'stub-model',
    stop_reason: 'tool_use',
    usage: { input_tokens: 1234, output_tokens: 567 },
    content: [{ type: 'tool_use', id: 'tu_1', name, input }],
    ...extra,
  },
})

// ---------------------------------------------------------------------------
// Fixtures — the smallest artifacts that satisfy the domain
// ---------------------------------------------------------------------------

const CANONICAL_ID_SENTINEL = 'C-CANONICAL-ID-THAT-MUST-NOT-TRAVEL' as const

const claim = (id: `C${string}`, text: string): Claim => ({
  id,
  origin: 'SURFACE',
  investigationId: 'XRAY-INVESTIGATION-ID-THAT-MUST-NOT-TRAVEL',
  text,
  layer: 'OBSERVATION',
  type: 'QUANTITATIVE',
  priority: 'HIGH',
  entities: ['Kisumu County'],
  ambiguities: [],
})

const source: Source = {
  id: 'S-CANONICAL-ID-THAT-MUST-NOT-TRAVEL',
  title: 'County road resurfacing progress report',
  publisher: 'The Standard',
  url: 'https://example.invalid/report',
  publishedAt: '2026-04-02',
  retrievedAt: '2026-04-03T09:00:00Z',
  sourceType: 'NEWS_REPORT' as Source['sourceType'],
  evidenceClass: 'SECONDARY',
  originStatus: 'REPEATING',
  accessibility: 'RETRIEVED',
}

const document: RetrievedDocument = {
  ref: 'ref:d1',
  locator: 'https://example.invalid/report',
  outcome: 'RETRIEVED',
  observed: { title: 'County road resurfacing progress report', publisher: 'The Standard' },
  extract: { text: 'The county resurfaced 42 kilometres of road in the period.', truncated: false },
}

const notLocated: RetrievedDocument = {
  ref: 'ref:d2',
  outcome: 'NOT_LOCATED',
  observed: { title: 'County tender award notice' },
}

const evidence = (id: string): Evidence => ({
  id,
  sourceId: source.id,
  proposition: '42 kilometres were resurfaced.',
  relationship: 'SUPPORTS',
  claimIds: [CANONICAL_ID_SENTINEL as Claim['id']],
  strength: 'DIRECT',
})

const finding = (id: string, claimId: Claim['id']): Finding => ({
  id,
  claimId,
  status: 'SUPPORTED',
  confidence: 'MEDIUM',
  rationale: 'One direct record supports the figure.',
  supportingEvidenceIds: [],
  challengingEvidenceIds: [],
  contextualEvidenceIds: [],
  discrepancyIds: [],
  gapIds: [],
  wouldChangeFinding: ['An audit stating a different length.'],
  gradedAt: '2026-04-04T09:00:00Z',
})

const gap: Gap = {
  id: 'G-CANONICAL-ID-THAT-MUST-NOT-TRAVEL',
  claimIds: [CANONICAL_ID_SENTINEL],
  missingEvidence: 'The signed completion certificate.',
  whyItMatters: 'Only the certificate establishes completion.',
  resolvingEvidence: ['The certificate itself.'],
  searchAlreadyAttempted: ['County portal'],
  status: 'OPEN',
  effectOnFinding: 'The finding cannot exceed SUPPORTED.',
  resolutionPath: 'PUBLIC_RECORD_REQUEST',
  atiEligible: true,
}

const offer = <T>(ref: string, value: T): Offered<T> => ({ ref: `ref:${ref}`, value } as Offered<T>)

const model = () => new AnthropicResearchModel({
  modelId: 'a-model-id', apiKey: SECRET, baseUrl: stub.baseUrl,
})
const reviewer = () => new AnthropicReviewerModel({
  modelId: 'a-model-id', apiKey: SECRET, baseUrl: stub.baseUrl,
})

const DECOMPOSE_INPUT = {
  surfaceSource: offer('s1', source),
  document,
  researchCutoffAt: '2026-05-01',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run something expected to throw an AdapterFailure, and describe it. */
async function failure(
  act: () => Promise<unknown>,
): Promise<{ disposition: string; message: string } | undefined> {
  try { await act() } catch (err) {
    if (err instanceof AdapterFailure) return { disposition: err.disposition, message: err.message }
    return { disposition: `threw ${String(err)}`, message: String(err) }
  }
  return undefined
}

const gapOf = (result: CapabilityResult<unknown>): CapabilityUnavailable | undefined =>
  isUnavailable(result) ? result : undefined

/**
 * Whatever a call produced, as one string to scan.
 *
 * A call can end three ways — a value, a capability gap, or a thrown
 * `AdapterFailure` — and a leak check has to cover all three without assuming
 * which one a given reply triggers.
 */
async function outcomeOf(act: () => Promise<CapabilityResult<unknown>>): Promise<string> {
  try {
    const result = await act()
    return JSON.stringify(result)
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  }
}

const read = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8')

function sources(directory: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (/\.tsx?$/.test(entry)) out.push(full)
    }
  }
  walk(new URL(`../../../../${directory}`, import.meta.url).pathname)
  return out
}

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ---------------------------------------------------------------------------
// 1 — the ports
// ---------------------------------------------------------------------------

check('1 · both adapters implement their ports and nothing wider', async () => {
  const research = model()
  for (const operation of ['decompose', 'classify', 'trace', 'disconfirm', 'reconcile',
    'grade', 'identifyGaps']) {
    if (typeof (research as unknown as Record<string, unknown>)[operation] !== 'function')
      return `the research model has no ${operation}`
    if (!research.capabilities.includes(operation as never))
      return `the research model does not declare ${operation}`
  }
  if (typeof reviewer().judge !== 'function') return 'the reviewer model has no judge'
  if (reviewer().capabilities.length !== 6)
    return `the reviewer declares ${reviewer().capabilities.length} query kinds, expected 6`

  // The name carries the model id, so a journal entry says which model ran —
  // "anthropic" alone would not distinguish two deployments.
  if (research.name !== 'anthropic:a-model-id') return `name is ${research.name}`
  return null
})

check('2 · the registry composes both adapters from configuration alone', async () => {
  const composed = composeProviders({
    ANTHROPIC_API_KEY: SECRET,
    ANTHROPIC_BASE_URL: stub.baseUrl,
    [PROVIDER_ENV.researchModel]: 'anthropic',
    [PROVIDER_ENV.researchModelId]: 'composed-research-model',
    [PROVIDER_ENV.reviewerModel]: 'anthropic',
    [PROVIDER_ENV.reviewerModelId]: 'composed-reviewer-model',
    [PROVIDER_ENV.retrieval]: 'anthropic',
  }, DEFAULT_REGISTRY)

  if (composed.research.status !== 'AVAILABLE') return `research ${composed.research.status}`
  if (composed.reviewer.status !== 'AVAILABLE') return `reviewer ${composed.reviewer.status}`
  // Retrieval is 20c's. A live model with no retrieval is exactly the state
  // 20b should produce, and claiming otherwise would fake the live journey.
  if (composed.retrieval.status !== 'NOT_IMPLEMENTED')
    return `retrieval ${composed.retrieval.status}, expected NOT_IMPLEMENTED`

  const research = await composed.research.create()
  const reviewerModel = await composed.reviewer.create()
  if (research.name !== 'anthropic:composed-research-model')
    return `composed research name ${research.name}`
  // The two names differ, so each slot carried its own model id. The compiler
  // proves that for these literals, which is why there is no runtime compare.
  return reviewerModel.name === 'anthropic:composed-reviewer-model'
    ? null : `composed reviewer name ${reviewerModel.name}`
})

// ---------------------------------------------------------------------------
// 3 — validation before proposals
// ---------------------------------------------------------------------------

check('3 · a well-formed answer becomes typed proposals', async () => {
  stub.script(toolReply('propose_claims', {
    claims: [{
      text: '42 kilometres of road were resurfaced.',
      sourcePassage: 'The county resurfaced 42 kilometres of road in the period.',
      layer: 'OBSERVATION', type: 'QUANTITATIVE', priority: 'HIGH',
      entities: ['Kisumu County'],
      measurement: { metric: 'resurfaced_length', value: 42, unit: 'km' },
      timeScope: { from: '2026-01-01', to: '2026-03-31' },
    }],
  }))
  const result = await model().decompose(DECOMPOSE_INPUT)
  if (!isAvailable(result)) return `resolved ${result.kind}`
  const [proposal] = result.value
  if (proposal === undefined) return 'no proposal was produced'
  if (proposal.layer !== 'OBSERVATION') return `layer ${String(proposal.layer)}`
  if (proposal.measurement?.value !== 42) return 'the measurement was lost'
  if (proposal.timeScope?.from !== '2026-01-01') return 'the time scope was lost'
  // A proposal carries no identity: nothing that could become a canonical id.
  const keys = Object.keys(proposal)
  const identity = keys.filter((key) => /^id$|Id$|Ids$/.test(key))
  return identity.length === 0 ? null : `a proposal carries ${identity.join(', ')}`
})

check('4 · an empty answer is accepted, not treated as a failure', async () => {
  stub.script(toolReply('propose_claims', { claims: [] }))
  const result = await model().decompose(DECOMPOSE_INPUT)
  if (!isAvailable(result)) return `resolved ${result.kind}`
  if (result.value.length !== 0) return `produced ${result.value.length} proposals`
  // "Nothing here" is a correct answer, and forcing a provider to invent
  // something is how a fabricated claim gets into a graph.
  return null
})

check('5 · every malformed shape is rejected before it becomes a proposal', async () => {
  const cases: [string, unknown][] = [
    ['no claims list', { something: [] }],
    ['claims is not a list', { claims: {} }],
    ['an entry is not an object', { claims: ['text'] }],
    ['text is missing', { claims: [{ layer: 'OBSERVATION' }] }],
    ['text is empty', { claims: [{ text: '   ' }] }],
    ['text is a number', { claims: [{ text: 42 }] }],
    ['layer is outside the vocabulary', { claims: [{ text: 'x', layer: 'VIBES' }] }],
    ['type is outside the vocabulary', { claims: [{ text: 'x', type: 'SPORTS' }] }],
    ['a measurement value is a string', { claims: [{ text: 'x', measurement: { value: 'many' } }] }],
    ['a date is prose', { claims: [{ text: 'x', timeScope: { from: 'last Tuesday' } }] }],
    ['entities is not a list', { claims: [{ text: 'x', entities: 'Kisumu' }] }],
  ]
  for (const [label, input] of cases) {
    stub.script(toolReply('propose_claims', input))
    const outcome = await failure(() => model().decompose(DECOMPOSE_INPUT))
    if (outcome === undefined) return `${label}: was accepted`
    if (outcome.disposition !== 'PERMANENT')
      return `${label}: ${outcome.disposition}, expected PERMANENT`
  }
  // A rejection quotes at most a clipped token, never the material.
  stub.script(toolReply('propose_claims', {
    claims: [{ text: 'x', layer: 'A'.repeat(400) }],
  }))
  const clipped = await failure(() => model().decompose(DECOMPOSE_INPUT))
  return clipped !== undefined && clipped.message.length < 600
    ? null : `a rejection message was ${String(clipped?.message.length)} characters long`
})

check('6 · a required vocabulary is checked in every slot that has one', async () => {
  const research = model()
  const claimOffer = offer('c1', claim('C1', '42 kilometres were resurfaced.'))
  const evidenceOffer = offer('e1', evidence('E1'))

  const cases: [string, unknown, () => Promise<unknown>][] = [
    ['classify layer', { classifications: [{ claimRef: 'ref:c1', layer: 'X', type: 'LEGAL', priority: 'HIGH' }] },
      () => research.classify({ claims: [claimOffer] })],
    ['grade status', { findings: [{ claimRef: 'ref:c1', status: 'PROBABLY', confidence: 'LOW', rationale: 'r', wouldChangeFinding: ['w'] }] },
      () => research.grade({ claim: claimOffer, evidence: [evidenceOffer], discrepancyRefs: [] })],
    ['grade confidence', { findings: [{ claimRef: 'ref:c1', status: 'SUPPORTED', confidence: 'VERY_HIGH', rationale: 'r', wouldChangeFinding: ['w'] }] },
      () => research.grade({ claim: claimOffer, evidence: [evidenceOffer], discrepancyRefs: [] })],
    ['reconcile classification', { discrepancies: [{ claimRefs: ['ref:c1'], evidenceRefs: ['ref:e1'], description: 'd', classification: 'JUST_DIFFERENT', resolvedCandidate: false }] },
      () => research.reconcile({ claims: [claimOffer], evidence: [evidenceOffer] })],
    ['disconfirm result', { disconfirmations: [{ claimRef: 'ref:c1', preliminaryHypothesis: 'a', counterHypothesis: 'b', result: 'MAYBE', effectOnFinding: 'e' }] },
      () => research.disconfirm({ claim: claimOffer, evidence: [evidenceOffer] })],
    ['gap resolution path', { gaps: [{ claimRefs: ['ref:c1'], missingEvidence: 'm', whyItMatters: 'w', status: 'OPEN', effectOnFinding: 'e', resolutionPath: 'ASK_NICELY' }] },
      () => research.identifyGaps({ claims: [claimOffer], findings: [], existingGaps: [] })],
    ['gap custody basis', { gaps: [{ claimRefs: ['ref:c1'], missingEvidence: 'm', whyItMatters: 'w', status: 'OPEN', effectOnFinding: 'e', resolutionPath: 'OTHER', likelyHolder: { institution: 'County', basis: 'PROBABLY' } }] },
      () => research.identifyGaps({ claims: [claimOffer], findings: [], existingGaps: [] })],
    ['evidence relationship', { evidence: [{ sourceRef: 'ref:d1', proposition: 'p', relationship: 'AGREES', strength: 'DIRECT', claimRefs: ['ref:c1'] }], discoveredClaims: [] },
      () => research.trace({ claim: claimOffer, documents: [document] })],
    ['evidence strength', { evidence: [{ sourceRef: 'ref:d1', proposition: 'p', relationship: 'SUPPORTS', strength: 'VERY_STRONG', claimRefs: ['ref:c1'] }], discoveredClaims: [] },
      () => research.trace({ claim: claimOffer, documents: [document] })],
  ]

  const toolFor: Record<string, string> = {
    classifications: 'propose_classifications', findings: 'propose_findings',
    discrepancies: 'propose_discrepancies', disconfirmations: 'propose_disconfirmation',
    gaps: 'propose_gaps', evidence: 'propose_trace',
  }
  for (const [label, payload, act] of cases) {
    const key = Object.keys(payload as Record<string, unknown>)[0]!
    stub.script(toolReply(toolFor[key]!, payload))
    const outcome = await failure(act)
    if (outcome === undefined) return `${label}: an invalid value was accepted`
    if (outcome.disposition !== 'PERMANENT')
      return `${label}: ${outcome.disposition}, expected PERMANENT`
  }
  return null
})

check('7 · XR-INV-007 is enforced at the boundary: a finding must be reversible', async () => {
  const research = model()
  const claimOffer = offer('c1', claim('C1', 'x'))
  for (const [label, wouldChange] of [
    ['absent', undefined], ['empty', []],
  ] as [string, unknown][]) {
    stub.script(toolReply('propose_findings', {
      findings: [{
        claimRef: 'ref:c1', status: 'ESTABLISHED', confidence: 'HIGH', rationale: 'r',
        ...(wouldChange === undefined ? {} : { wouldChangeFinding: wouldChange }),
      }],
    }))
    const outcome = await failure(() => research.grade({
      claim: claimOffer, evidence: [], discrepancyRefs: [],
    }))
    if (outcome === undefined) return `wouldChangeFinding ${label}: accepted`
  }
  return null
})

// ---------------------------------------------------------------------------
// 8 — identity: the provider proposes, X-Ray owns
// ---------------------------------------------------------------------------

check('8 · a handle the stage did not offer is rejected', async () => {
  const research = model()
  const claimOffer = offer('c1', claim('C1', 'x'))

  const cases: [string, unknown, () => Promise<unknown>][] = [
    ['an invented claim handle',
      { classifications: [{ claimRef: 'ref:c99', layer: 'OBSERVATION', type: 'LEGAL', priority: 'LOW' }] },
      () => research.classify({ claims: [claimOffer] })],
    ['a canonical id in place of a handle',
      { classifications: [{ claimRef: CANONICAL_ID_SENTINEL, layer: 'OBSERVATION', type: 'LEGAL', priority: 'LOW' }] },
      () => research.classify({ claims: [claimOffer] })],
    ['a document handle that was not retrieved for this claim',
      { evidence: [{ sourceRef: 'ref:d9', proposition: 'p', relationship: 'SUPPORTS', strength: 'DIRECT', claimRefs: ['ref:c1'] }], discoveredClaims: [] },
      () => research.trace({ claim: claimOffer, documents: [document] })],
    ['an evidence handle the grade was not offered',
      { findings: [{ claimRef: 'ref:c1', status: 'SUPPORTED', confidence: 'LOW', rationale: 'r', wouldChangeFinding: ['w'], supportingEvidenceRefs: ['ref:e404'] }] },
      () => research.grade({ claim: claimOffer, evidence: [], discrepancyRefs: [] })],
    ['a discrepancy handle the grade was not offered',
      { findings: [{ claimRef: 'ref:c1', status: 'SUPPORTED', confidence: 'LOW', rationale: 'r', wouldChangeFinding: ['w'], discrepancyRefs: ['ref:x1'] }] },
      () => research.grade({ claim: claimOffer, evidence: [], discrepancyRefs: [] })],
  ]

  const toolFor: Record<string, string> = {
    classifications: 'propose_classifications', evidence: 'propose_trace',
    findings: 'propose_findings',
  }
  for (const [label, payload, act] of cases) {
    const key = Object.keys(payload as Record<string, unknown>)[0]!
    stub.script(toolReply(toolFor[key]!, payload))
    const outcome = await failure(act)
    if (outcome === undefined) return `${label}: was accepted`
    if (!/was not offered|not a stage-issued handle/.test(outcome.message))
      return `${label}: rejected for the wrong reason — ${outcome.message}`
  }

  // And an offered handle of the wrong *kind* is still rejected: a claim
  // handle cannot stand in for a document.
  stub.script(toolReply('propose_trace', {
    evidence: [{ sourceRef: 'ref:c1', proposition: 'p', relationship: 'SUPPORTS', strength: 'DIRECT', claimRefs: ['ref:c1'] }],
    discoveredClaims: [],
  }))
  const crossed = await failure(() => research.trace({ claim: claimOffer, documents: [document] }))
  return crossed === undefined ? 'a claim handle was accepted as a document' : null
})

check('9 · no canonical id ever reaches the provider', async () => {
  /*
   * The adversarial case for #20 boundary 2. Every fixture carries a
   * recognisable canonical id, and the stub records the exact bytes sent. If
   * any id is on the wire, a provider could assert it back — which is what
   * `Offered<T>` exists to prevent.
   */
  const research = model()
  const claimOffer = offer('c1', claim(CANONICAL_ID_SENTINEL, '42 kilometres were resurfaced.'))
  const evidenceOffer = offer('e1', evidence(CANONICAL_ID_SENTINEL))
  const findingOffer = offer('f1', finding(CANONICAL_ID_SENTINEL, CANONICAL_ID_SENTINEL))
  const gapOffer = offer('g1', gap)
  const sourceOffer = offer('s1', source)

  const calls: [string, string, unknown, () => Promise<unknown>][] = [
    ['decompose', 'propose_claims', { claims: [] },
      () => research.decompose({ surfaceSource: sourceOffer, document })],
    ['classify', 'propose_classifications', { classifications: [] },
      () => research.classify({ claims: [claimOffer] })],
    ['trace', 'propose_trace', { evidence: [], discoveredClaims: [] },
      () => research.trace({ claim: claimOffer, documents: [document, notLocated] })],
    ['disconfirm', 'propose_disconfirmation', { disconfirmations: [] },
      () => research.disconfirm({ claim: claimOffer, evidence: [evidenceOffer] })],
    ['reconcile', 'propose_discrepancies', { discrepancies: [] },
      () => research.reconcile({ claims: [claimOffer], evidence: [evidenceOffer] })],
    ['grade', 'propose_findings', { findings: [] },
      () => research.grade({ claim: claimOffer, evidence: [evidenceOffer], discrepancyRefs: [] })],
    ['identifyGaps', 'propose_gaps', { gaps: [] },
      () => research.identifyGaps({
        claims: [claimOffer], findings: [findingOffer], existingGaps: [gapOffer],
      })],
  ]

  for (const [label, tool, payload, act] of calls) {
    stub.script(toolReply(tool, payload))
    await act()
    const sent = stub.last.body
    if (sent.includes(CANONICAL_ID_SENTINEL))
      return `${label}: a canonical id was sent to the provider`
    if (sent.includes('XRAY-INVESTIGATION-ID-THAT-MUST-NOT-TRAVEL'))
      return `${label}: the investigation id was sent to the provider`
    if (sent.includes('S-CANONICAL-ID') || sent.includes('G-CANONICAL-ID'))
      return `${label}: a canonical id was sent to the provider`
    // The handles, by contrast, must be there — otherwise the scan above
    // would pass because nothing was sent at all.
    if (!sent.includes('ref:'))
      return `${label}: no handle was sent, so the scan proves nothing`
  }

  // The stage's own decisions are withheld too: a provider that saw
  // `atiEligible` could learn to hand the XR-INV-009 answer back.
  stub.script(toolReply('propose_gaps', { gaps: [] }))
  await research.identifyGaps({ claims: [claimOffer], findings: [], existingGaps: [gapOffer] })
  const body = stub.last.body
  for (const withheld of ['atiEligible', 'originStatus', 'evidenceClass']) {
    if (body.includes(withheld)) return `the provider was shown ${withheld}`
  }
  return null
})

check('10 · a provider cannot assert what a stage owns', () => {
  /*
   * Provenance, independence and ATI eligibility have no decoder, so there is
   * no path for a provider to assert one. Proven structurally: the field names
   * appear nowhere in the decoder, and the tool schemas never request them.
   */
  const decoder = stripComments(read('lib/xray/providers/anthropic/decode.ts'))
  const prompts = stripComments(read('lib/xray/providers/anthropic/prompts.ts'))
  for (const forbidden of ['atiEligible', 'originStatus', 'evidenceClass',
    'independentOrigin', 'provenance', 'originatingSource']) {
    if (new RegExp(`\\b${forbidden}\\b`).test(decoder))
      return `the decoder reads ${forbidden}`
    if (new RegExp(`${forbidden}\\s*:`).test(prompts))
      return `a tool schema requests ${forbidden}`
  }
  // And nothing in the layer can spell the state XR-INV-006 forbids.
  for (const file of sources('lib/xray/providers')) {
    if (/-checks\.ts$/.test(file)) continue
    if (/DOES_NOT_EXIST/.test(readFileSync(file, 'utf8')))
      return `${file.slice(file.indexOf('lib/xray'))} mentions DOES_NOT_EXIST`
  }
  return null
})

// ---------------------------------------------------------------------------
// 11 — failure mapping
// ---------------------------------------------------------------------------

check('11 · HTTP failures map onto the existing vocabulary', async () => {
  const research = model()
  const act = () => research.decompose(DECOMPOSE_INPUT)

  const capabilityCases: [number, unknown, UnavailableReason][] = [
    [401, { error: { type: 'authentication_error' } }, 'NOT_CONFIGURED'],
    [403, { error: { type: 'permission_error' } }, 'NOT_CONFIGURED'],
    [404, { error: { type: 'not_found_error' } }, 'NOT_CONFIGURED'],
    [400, { error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } },
      'EXHAUSTED'],
    [413, { error: { type: 'request_too_large' } }, 'REFUSED_FOR_INPUT'],
  ]
  for (const [status, body, reason] of capabilityCases) {
    stub.script({ status, body })
    const result = await act()
    const capability = gapOf(result)
    if (capability === undefined) return `HTTP ${status}: was not a capability gap`
    if (capability.reason !== reason)
      return `HTTP ${status}: ${capability.reason}, expected ${reason}`
    if (capability.resolvedBy.trim() === '')
      return `HTTP ${status}: no resolvedBy, so an operator cannot act on it`
  }

  const failureCases: [number, unknown, string][] = [
    [429, { error: { type: 'rate_limit_error' } }, 'TRANSIENT'],
    [500, { error: { type: 'api_error' } }, 'TRANSIENT'],
    [529, { error: { type: 'overloaded_error' } }, 'TRANSIENT'],
    [418, { error: { type: 'teapot' } }, 'PERMANENT'],
  ]
  for (const [status, body, disposition] of failureCases) {
    stub.script({ status, body })
    const outcome = await failure(act)
    if (outcome === undefined) return `HTTP ${status}: did not fail`
    if (outcome.disposition !== disposition)
      return `HTTP ${status}: ${outcome.disposition}, expected ${disposition}`
  }

  // A rate limit stays a failure rather than becoming a capability gap: it is
  // retryable, and `runPipeline` is what retries it.
  stub.script({ status: 429, body: { error: { type: 'rate_limit_error' } } })
  const rateLimited = await failure(act)
  return rateLimited?.disposition === 'TRANSIENT' ? null : 'a rate limit was not transient'
})

check('12 · a refusal is a capability fact, not evidence about the claim', async () => {
  stub.script({
    status: 200,
    body: {
      id: 'msg_stub', type: 'message', role: 'assistant', stop_reason: 'refusal',
      content: [], usage: { input_tokens: 10, output_tokens: 0 },
    },
  })
  const result = await model().decompose(DECOMPOSE_INPUT)
  const capability = gapOf(result)
  if (capability === undefined) return 'a refusal was not a capability gap'
  if (capability.reason !== 'REFUSED_FOR_INPUT') return `reason ${capability.reason}`
  // The detail must not read as a finding about the material.
  return /not evidence about the claim/.test(capability.resolvedBy)
    ? null : `resolvedBy is "${capability.resolvedBy}"`
})

check('13 · a truncated answer is transient; a wrong-shaped one is not', async () => {
  stub.script({
    status: 200,
    body: {
      id: 'm', type: 'message', role: 'assistant', stop_reason: 'max_tokens',
      content: [{ type: 'text', text: 'partial' }], usage: {},
    },
  })
  const truncated = await failure(() => model().decompose(DECOMPOSE_INPUT))
  if (truncated?.disposition !== 'TRANSIENT')
    return `max_tokens gave ${String(truncated?.disposition)}`

  stub.script({
    status: 200,
    body: {
      id: 'm', type: 'message', role: 'assistant', stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"claims":[]}' }], usage: {},
    },
  })
  const prose = await failure(() => model().decompose(DECOMPOSE_INPUT))
  if (prose?.disposition !== 'PERMANENT') return `prose gave ${String(prose?.disposition)}`

  // A tool call answering a different tool is also permanent.
  stub.script(toolReply('some_other_tool', { claims: [] }))
  const wrongTool = await failure(() => model().decompose(DECOMPOSE_INPUT))
  if (wrongTool?.disposition !== 'PERMANENT')
    return `a wrong tool name gave ${String(wrongTool?.disposition)}`

  stub.script({ status: 200, body: 'not json at all' })
  const notJson = await failure(() => model().decompose(DECOMPOSE_INPUT))
  return notJson?.disposition === 'PERMANENT'
    ? null : `a non-JSON 200 gave ${String(notJson?.disposition)}`
})

check('14 · the adapter never retries; the pipeline owns that', async () => {
  stub.script(
    { status: 429, body: { error: { type: 'rate_limit_error' } } },
    { status: 429, body: { error: { type: 'rate_limit_error' } } },
  )
  await failure(() => model().decompose(DECOMPOSE_INPUT))
  if (stub.received.length !== 1)
    return `one call produced ${stub.received.length} requests`

  // `runPipeline` re-attempts TRANSIENT and stops on PERMANENT. A retry loop
  // here would multiply with that one and hide how transient a provider is.
  const transport = stripComments(read('lib/xray/providers/anthropic/transport.ts'))
  return /for\s*\(|while\s*\(|setTimeout|backoff/i.test(transport)
    ? 'the transport contains a loop or a backoff' : null
})

// ---------------------------------------------------------------------------
// 15 — secrets and diagnostics
// ---------------------------------------------------------------------------

check('15 · the key reaches a header and nothing else', async () => {
  stub.script(toolReply('propose_claims', { claims: [] }))
  const research = model()
  await research.decompose(DECOMPOSE_INPUT)

  const sent = stub.last
  if (sent.headers['x-api-key'] !== SECRET) return 'the key did not reach the header'
  if (sent.body.includes(SECRET)) return 'the key was in the request body'
  if (sent.parsed.system?.includes(SECRET)) return 'the key was in the system prompt'

  // Not in a returned value, and not in diagnostics.
  const result = await (async () => {
    stub.script(toolReply('propose_claims', { claims: [{ text: 'x' }] }))
    return research.decompose(DECOMPOSE_INPUT)
  })()
  if (JSON.stringify(result).includes(SECRET)) return 'the key was in a returned proposal'
  if (JSON.stringify(research.diagnostics()).includes(SECRET))
    return 'the key was in diagnostics'

  /*
   * Not in anything any failure path produces. Each reply is driven once and
   * whichever of the two outcomes occurs — a thrown AdapterFailure or a
   * returned capability gap — is scanned. An earlier version called the same
   * path twice and assumed the second call returned rather than threw, which
   * made the check itself fail on the transient replies.
   */
  for (const reply of [
    { status: 401, body: { error: { type: 'authentication_error', message: `key ${SECRET}` } } },
    { status: 400, body: { error: { type: 'invalid_request_error', message: `credit balance is too low for ${SECRET}` } } },
    { status: 429, body: { error: { type: 'rate_limit_error', message: `key ${SECRET}` } } },
    { status: 500, body: { error: { type: 'api_error', message: `key ${SECRET}` } } },
    { status: 418, body: { error: { type: 'x', message: `key ${SECRET}` } } },
    { status: 200, body: `{"content":[{"type":"text","text":"${SECRET}"}],"stop_reason":"end_turn"}` },
  ]) {
    stub.script(reply)
    const observed = await outcomeOf(() => research.decompose(DECOMPOSE_INPUT))
    if (observed.includes(SECRET)) return `HTTP ${reply.status} leaked the key: ${observed}`
  }
  return null
})

check('16 · a provider message is never echoed back, only its type', async () => {
  /*
   * A provider error message can quote the request, and the request carries
   * the material under investigation. So a failure names the error *type* and
   * the status, never the message — otherwise a journal entry could end up
   * holding a claim's text.
   */
  const material = 'THE-MATERIAL-UNDER-INVESTIGATION-MUST-NOT-COME-BACK'
  for (const status of [401, 400, 429, 500, 418]) {
    stub.script({
      status,
      body: { error: { type: 'invalid_request_error', message: `rejected: ${material}` } },
    })
    const observed = await outcomeOf(() => model().decompose(DECOMPOSE_INPUT))
    if (observed.includes(material)) return `HTTP ${status} echoed the provider's message`
  }
  return null
})

check('17 · diagnostics are recorded off the graph and never in a proposal', async () => {
  stub.script(toolReply('propose_claims', { claims: [{ text: 'x' }] }))
  const research = model()
  const result = await research.decompose(DECOMPOSE_INPUT)
  if (!isAvailable(result)) return `resolved ${result.kind}`

  // They exist — the operator gets the cost and latency detail...
  const [call] = research.diagnostics()
  if (call === undefined) return 'no diagnostics were recorded'
  if (call.inputTokens !== 1234 || call.outputTokens !== 567) return 'token counts were lost'
  if (call.requestId !== 'req_stub_0001') return 'the request id was lost'

  // ...and none of it is on the proposal, which is what reaches the graph.
  const serialized = JSON.stringify(result.value)
  for (const leaked of ['1234', '567', 'req_stub_0001', 'latencyMs', 'stopReason', 'usage']) {
    if (serialized.includes(leaked)) return `a proposal carries ${leaked}`
  }
  // And `ResearchModel` has no diagnostics channel, so a stage cannot reach
  // them even by accident.
  const port = stripComments(read('lib/xray/pipeline/model-port.ts'))
  return /diagnostic/i.test(port) ? 'the model port gained a diagnostics channel' : null
})

// ---------------------------------------------------------------------------
// 18 — the reviewer
// ---------------------------------------------------------------------------

const REVIEW_CLAIM = claim('C1', 'The county resurfaced 42 kilometres and completed the project.')
const REVIEW_QUERY: ReviewerModelQuery = { kind: 'CLAIM_ATOMICITY', claim: REVIEW_CLAIM }

const judgmentReply = (input: unknown) => toolReply('answer_review_question', input)

check('18 · a reviewer judgment is validated and keeps its targets', async () => {
  stub.script(judgmentReply({
    flagged: true, severity: 'BLOCKING',
    rationale: 'It asserts a length and a completion; either could be true without the other.',
    requiredAction: 'Split into two claims.',
    targets: [{ kind: 'Claim', id: REVIEW_CLAIM.id }],
  }))
  const result = await reviewer().judge(REVIEW_QUERY)
  if (!isAvailable(result)) return `resolved ${result.kind}`
  if (!result.value.flagged) return 'the judgment lost its flag'
  if (result.value.severity !== 'BLOCKING') return `severity ${result.value.severity}`
  if (result.value.targets[0]?.id !== REVIEW_CLAIM.id) return 'the target was lost'
  return null
})

check('19 · a reviewer cannot flag an artifact it was not shown', async () => {
  const cases: [string, unknown][] = [
    ['an id that was not in the query', [{ kind: 'Claim', id: 'C-NEVER-SHOWN' }]],
    ['a kind that does not match the id', [{ kind: 'Finding', id: REVIEW_CLAIM.id }]],
    ['a kind outside the vocabulary', [{ kind: 'Vibe', id: REVIEW_CLAIM.id }]],
  ]
  for (const [label, targets] of cases) {
    stub.script(judgmentReply({
      flagged: true, severity: 'ADVISORY', rationale: 'r', requiredAction: 'a', targets,
    }))
    const outcome = await failure(() => reviewer().judge(REVIEW_QUERY))
    if (outcome === undefined) return `${label}: was accepted`
    if (outcome.disposition !== 'PERMANENT') return `${label}: ${outcome.disposition}`
  }

  // A wider query legitimately offers more, and those targets are accepted —
  // so the rule is "was it in front of you", not "only ever the claim".
  const relatedFinding = finding('F1', REVIEW_CLAIM.id)
  const wide: ReviewerModelQuery = {
    kind: 'EVIDENTIARY_REACH', checkId: 'XR-INV-004/REACH',
    claim: REVIEW_CLAIM, finding: relatedFinding,
    evidence: [evidence('E1')], sources: [source],
    sourcePositions: [] as SourcePosition[], relatedClaims: [], relatedFindings: [],
  }
  stub.script(judgmentReply({
    flagged: false, severity: 'ADVISORY', rationale: 'r', requiredAction: 'none',
    targets: [{ kind: 'Finding', id: 'F1' }, { kind: 'Evidence', id: 'E1' },
      { kind: 'Source', id: source.id }],
  }))
  const accepted = await reviewer().judge(wide)
  return isAvailable(accepted) && accepted.value.targets.length === 3
    ? null : 'a legitimately offered target was rejected'
})

check('20 · an unanswered check stays unanswered', async () => {
  // `collectModelJudgments` turns UNAVAILABLE into NOT_EVALUATED with a
  // reason, never a pass. So the reviewer must report capability gaps rather
  // than inventing an unflagged judgment when the provider will not answer.
  stub.script({ status: 401, body: { error: { type: 'authentication_error' } } })
  const result = await reviewer().judge(REVIEW_QUERY)
  const capability = gapOf(result)
  if (capability === undefined) return 'a rejected credential produced a judgment'
  if (capability.operation !== 'reviewer-model:CLAIM_ATOMICITY')
    return `operation ${capability.operation}`

  // A malformed judgment is a failure, not a silent pass.
  stub.script(judgmentReply({ severity: 'ADVISORY', rationale: 'r', requiredAction: 'a' }))
  const outcome = await failure(() => reviewer().judge(REVIEW_QUERY))
  if (outcome === undefined) return 'a judgment with no `flagged` was accepted'

  // And `flagged: false` is a real answer that must survive.
  stub.script(judgmentReply({
    flagged: false, severity: 'ADVISORY', rationale: 'It states one thing.',
    requiredAction: 'None.', targets: [],
  }))
  const unflagged = await reviewer().judge(REVIEW_QUERY)
  return isAvailable(unflagged) && !unflagged.value.flagged
    ? null : 'an honest "not flagged" answer did not survive'
})

check('21 · every reviewer query kind has an authored question', async () => {
  const reviewerModel = reviewer()
  const queries: ReviewerModelQuery[] = [
    { kind: 'CLAIM_ATOMICITY', claim: REVIEW_CLAIM },
    { kind: 'CROSS_LAYER_INFERENCE', claim: REVIEW_CLAIM, finding: finding('F1', REVIEW_CLAIM.id), evidence: [evidence('E1')] },
    { kind: 'SEMANTIC_MEASUREMENT_COMPATIBILITY', claim: REVIEW_CLAIM, evidence: evidence('E1') },
    { kind: 'REVERSIBILITY_ADEQUACY', claim: REVIEW_CLAIM, finding: finding('F1', REVIEW_CLAIM.id) },
    { kind: 'RHETORICAL_OVERCLAIM', claim: REVIEW_CLAIM, finding: finding('F1', REVIEW_CLAIM.id) },
    {
      kind: 'EVIDENTIARY_REACH', checkId: 'XR-INV-004/REACH', claim: REVIEW_CLAIM,
      finding: finding('F1', REVIEW_CLAIM.id), evidence: [evidence('E1')], sources: [source],
      sourcePositions: [], relatedClaims: [], relatedFindings: [],
    },
  ]
  for (const query of queries) {
    stub.script(judgmentReply({
      flagged: false, severity: 'ADVISORY', rationale: 'r', requiredAction: 'n', targets: [],
    }))
    const result = await reviewerModel.judge(query)
    if (!isAvailable(result)) return `${query.kind}: ${result.kind}`
    const system = stub.last.parsed.system ?? ''
    if (system.includes('undefined')) return `${query.kind}: the instruction says "undefined"`
    if (system.length < 200) return `${query.kind}: the instruction is suspiciously short`
    // The question asked must be specific to the kind, not one generic
    // invitation to critique.
    if (!/Flag/i.test(system)) return `${query.kind}: no question was asked`
  }
  return null
})

// ---------------------------------------------------------------------------
// 22 — the request itself
// ---------------------------------------------------------------------------

check('22 · the request is a forced tool call carrying the cutoff', async () => {
  stub.script(toolReply('propose_claims', { claims: [] }))
  await model().decompose(DECOMPOSE_INPUT)
  const sent = stub.last

  if (sent.headers['anthropic-version'] !== '2023-06-01')
    return `api version ${String(sent.headers['anthropic-version'])}`
  if (sent.parsed.model !== 'a-model-id') return `model ${String(sent.parsed.model)}`
  if (sent.parsed.tool_choice?.type !== 'tool')
    return `tool_choice ${JSON.stringify(sent.parsed.tool_choice)}`
  if (sent.parsed.tool_choice.name !== 'propose_claims')
    return `forced tool ${String(sent.parsed.tool_choice.name)}`
  if ((sent.parsed.tools ?? []).length !== 1)
    return `${(sent.parsed.tools ?? []).length} tools offered; one is the point of forcing`
  if ((sent.parsed.max_tokens ?? 0) <= 0) return 'no max_tokens was set'

  // FM-005 is the failure a silently ignored cutoff produces, so it must be
  // stated, not merely carried in a field the provider may not read.
  const content = sent.parsed.messages?.[0]?.content ?? ''
  if (!content.includes('2026-05-01')) return 'the research cutoff was not stated'
  return /out of scope/.test(content) ? null : 'the cutoff was sent without saying what it means'
})

check('23 · an unobtained document is presented as unobtained', async () => {
  // XR-INV-006 turns on the difference between a record that was read and one
  // that was only identified. A provider that cannot see the difference cannot
  // respect it, so the outcome travels and absent content stays absent.
  stub.script(toolReply('propose_trace', { evidence: [], discoveredClaims: [] }))
  await model().trace({
    claim: offer('c1', claim('C1', 'x')), documents: [document, notLocated],
  })
  const body = stub.last.body
  if (!body.includes('NOT_LOCATED')) return 'the retrieval outcome was not presented'
  if (!body.includes('RETRIEVED')) return 'the obtained document lost its outcome'
  const parsed = JSON.parse(stub.last.parsed.messages?.[0]?.content?.split('\n\n').at(-1) ?? '{}') as {
    retrievedDocuments?: { handle: string; outcome: string; content?: unknown }[]
  }
  const unobtained = parsed.retrievedDocuments?.find((entry) => entry.outcome === 'NOT_LOCATED')
  if (unobtained === undefined) return 'the unobtained document was not presented'
  return unobtained.content === undefined
    ? null : 'an unobtained document was presented with content'
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
  console.log(`\n${checks.length - failures}/${checks.length} Anthropic adapter checks passed`)
  console.log('Every call went to 127.0.0.1. No request left this machine.')
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
