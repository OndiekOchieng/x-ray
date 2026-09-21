/**
 * The 20c gate: Anthropic retrieval adapter.
 *
 * NO NETWORK LEAVES THIS MACHINE
 * ==============================
 * Every call goes to a stub on 127.0.0.1 through the `ANTHROPIC_BASE_URL` the
 * registry entry declares — the same configuration boundary an operator would
 * use. The stub records what it received, which is what makes the negatives
 * provable rather than asserted.
 *
 * The stub is duplicated from the 20b gate rather than shared. A shared module
 * would be an implementation file in `lib/xray/providers/`, where the layer
 * rules forbid importing a transport; a self-contained harness keeps the rule
 * honest.
 *
 * Run:  pnpm check:anthropic-retrieval
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { AdapterFailure, isAvailable, isUnavailable } from '@/lib/xray/capability'
import type { CapabilityResult, CapabilityUnavailable } from '@/lib/xray/capability'
import type { SourceAccessibility } from '@/lib/xray/domain'
import {
  hashExtract, isInspectable, isQuotable, MAX_EXTRACT_LENGTH,
  type RetrievalOutcome, type RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import { composeProviders, DEFAULT_REGISTRY } from '../registry'
import { PROVIDER_ENV } from '../config'
import { AnthropicResearchAdapter } from './index'
import { duplicateKey, normalizeLocator } from './retrieval-decode'
import { WEB_FETCH_TOOL_TYPE, WEB_SEARCH_TOOL_TYPE } from './retrieval-contract'

type Check = { name: string; run: () => string | null | Promise<string | null> }
const checks: Check[] = []
const check = (name: string, run: Check['run']) => { checks.push({ name, run }) }

process.on('unhandledRejection', (reason) => {
  console.error(`\nFAIL  an unhandled rejection escaped a check: ${String(reason)}`)
  process.exit(1)
})

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
    tools?: Record<string, unknown>[]
    tool_choice?: unknown
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

// ---------------------------------------------------------------------------
// Documented response shapes, built exactly as the API documents them
// ---------------------------------------------------------------------------

const envelope = (content: unknown[], extra: Record<string, unknown> = {}): Reply => ({
  status: 200,
  headers: { 'request-id': 'req_stub_20c' },
  body: {
    id: 'msg_stub', type: 'message', role: 'assistant', model: 'stub-model',
    stop_reason: 'end_turn',
    usage: { input_tokens: 4321, output_tokens: 99, server_tool_use: { web_search_requests: 1 } },
    content,
    ...extra,
  },
})

const searchUse = (query: string) => ({
  type: 'server_tool_use', id: 'srvtoolu_01', name: 'web_search', input: { query },
})

const searchResults = (results: unknown[]) => ({
  type: 'web_search_tool_result', tool_use_id: 'srvtoolu_01', content: results,
})

const searchError = (code: string) => ({
  type: 'web_search_tool_result',
  tool_use_id: 'srvtoolu_01',
  content: { type: 'web_search_tool_result_error', error_code: code },
})

const result = (url: string, extra: Record<string, unknown> = {}) => ({
  type: 'web_search_result',
  url,
  title: 'County road resurfacing progress report',
  encrypted_content: 'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
  page_age: 'April 30, 2026',
  ...extra,
})

const fetchUse = (url: string) => ({
  type: 'server_tool_use', id: 'srvtoolu_02', name: 'web_fetch', input: { url },
})

const fetchResult = (
  url: string, data: string,
  extra: Record<string, unknown> = {}, sourceExtra: Record<string, unknown> = {},
) => ({
  type: 'web_fetch_tool_result',
  tool_use_id: 'srvtoolu_02',
  content: {
    type: 'web_fetch_result',
    url,
    content: {
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data, ...sourceExtra },
      title: 'County road resurfacing progress report',
      citations: { enabled: false },
    },
    retrieved_at: '2026-04-03T09:00:00Z',
    ...extra,
  },
})

const fetchError = (code: string) => ({
  type: 'web_fetch_tool_result',
  tool_use_id: 'srvtoolu_02',
  content: { type: 'web_fetch_tool_result_error', error_code: code },
})

/** The model's narration. Nothing in it may ever be read. */
const narration = (text: string, citations?: unknown[]) => ({
  type: 'text', text, ...(citations === undefined ? {} : { citations }),
})

const ARTICLE = 'The county government said it resurfaced 42 kilometres of road between'
  + ' January and March 2026, at a cost of 310 million shillings.'

const adapter = () => new AnthropicResearchAdapter({
  modelId: 'a-search-model', apiKey: SECRET, baseUrl: stub.baseUrl,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function failure(
  act: () => Promise<unknown>,
): Promise<{ disposition: string; message: string } | undefined> {
  try { await act() } catch (err) {
    if (err instanceof AdapterFailure) return { disposition: err.disposition, message: err.message }
    return { disposition: `threw ${String(err)}`, message: String(err) }
  }
  return undefined
}

const gapOf = (value: CapabilityResult<unknown>): CapabilityUnavailable | undefined =>
  isUnavailable(value) ? value : undefined

async function outcomeOf(act: () => Promise<CapabilityResult<unknown>>): Promise<string> {
  try { return JSON.stringify(await act()) } catch (err) {
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

const QUERY = { terms: 'Kisumu county road resurfacing 2026', researchCutoffAt: '2026-05-01' }

// ---------------------------------------------------------------------------
// 1 — the port and the composition
// ---------------------------------------------------------------------------

check('1 · the adapter implements the retrieval port and nothing wider', () => {
  const instance = adapter()
  for (const operation of ['search', 'retrieve']) {
    if (typeof (instance as unknown as Record<string, unknown>)[operation] !== 'function')
      return `no ${operation}`
    if (!instance.capabilities.includes(operation as never))
      return `${operation} is not declared`
  }
  if (instance.capabilities.length !== 2)
    return `declares ${instance.capabilities.length} operations, expected 2`
  // No method for "get evidence", and none for anything the stage owns.
  const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(instance) as object)
  const extra = surface.filter((name) =>
    !['constructor', 'search', 'retrieve', 'diagnostics'].includes(name))
  return extra.length === 0 ? null : `the adapter exposes ${extra.join(', ')}`
})

check('2 · the registry composes it from configuration alone', async () => {
  const composed = composeProviders({
    ANTHROPIC_API_KEY: SECRET,
    ANTHROPIC_BASE_URL: stub.baseUrl,
    XRAY_ANTHROPIC_SEARCH_MODEL_ID: 'composed-search-model',
    [PROVIDER_ENV.retrieval]: 'anthropic',
  }, DEFAULT_REGISTRY)

  if (composed.retrieval.status !== 'AVAILABLE') return `retrieval ${composed.retrieval.status}`
  const instance = await composed.retrieval.create()
  if (instance.name !== 'anthropic:web:composed-search-model')
    return `composed name ${instance.name}`

  // Selecting retrieval says nothing about the model slots.
  if (composed.research.status !== 'NOT_SELECTED') return `research ${composed.research.status}`
  return composed.reviewer.status === 'NOT_SELECTED'
    ? null : `reviewer ${composed.reviewer.status}`
})

check('3 · the pinned tool contract is the basic, unfiltered one', () => {
  /*
   * Dynamic filtering would have the *model* filter search results before they
   * reach X-Ray — a provider making an evidentiary judgement where no
   * invariant can see it. On the newer versions it is the default, so the
   * pinned versions and the explicit `allowed_callers` are the guard.
   */
  if (WEB_SEARCH_TOOL_TYPE !== 'web_search_20250305')
    return `search tool is ${WEB_SEARCH_TOOL_TYPE}`
  if (WEB_FETCH_TOOL_TYPE !== 'web_fetch_20250910')
    return `fetch tool is ${WEB_FETCH_TOOL_TYPE}`

  const contract = read('lib/xray/providers/anthropic/retrieval-contract.ts')
  if (!/allowed_callers: \['direct'\]/.test(contract))
    return 'search does not state allowed_callers: direct'
  if (/code_execution/.test(stripComments(contract).replace(/'[^']*'/g, '')))
    return 'the contract wires code execution'
  // The documentation URLs and the date they were read are recorded.
  if (!/platform\.claude\.com\/docs/.test(contract))
    return 'the contract does not record which documentation it was verified against'
  return /2026-09-21/.test(contract) ? null : 'the verification date is not recorded'
})

// ---------------------------------------------------------------------------
// 4 — a search result becomes material, not evidence
// ---------------------------------------------------------------------------

check('4 · a search result is NOT_RETRIEVED material, never inspectable', async () => {
  stub.script(envelope([
    narration('I will search for that.'),
    searchUse('Kisumu county road resurfacing 2026'),
    searchResults([result('https://example.invalid/a'), result('https://example.invalid/b')]),
    narration('Both sources confirm the 42 kilometre figure.'),
  ]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const { documents } = outcome.value
  if (documents.length !== 2) return `${documents.length} documents, expected 2`

  for (const document of documents) {
    /*
     * The heart of the slice. A search result carries a url, a title and an
     * opaque `encrypted_content` no client can read — so a record was
     * identified, not obtained. Anything else would let a stage quote from
     * something nobody read.
     */
    if (document.outcome !== 'NOT_RETRIEVED') return `outcome ${document.outcome}`
    if (document.extract !== undefined) return 'a search result carried an extract'
    if (document.contentHash !== undefined) return 'a search result carried a content hash'
    if (document.retrievedAt !== undefined)
      return 'a search result claimed a retrieval time'
    if (isInspectable(document)) return 'a search result was inspectable'
    if (isQuotable(document)) return 'a search result was quotable'
    if (!document.ref.startsWith('ref:')) return `ref ${document.ref}`
  }
  // The query is echoed so the request is auditable.
  return outcome.value.query.terms === QUERY.terms ? null : 'the query was not echoed'
})

check('5 · the model narration is never read', async () => {
  /*
   * The adversarial case for smuggling. The narration asserts an evidentiary
   * conclusion, claims independence and provenance, and carries canonical-
   * looking identifiers and a citation. None of it may appear anywhere in what
   * crosses the boundary.
   */
  const smuggled = 'These two records are INDEPENDENT origins and the second ORIGINATES the'
    + ' claim. Evidence E-SMUGGLED-1 establishes claim C-SMUGGLED-1 for investigation'
    + ' XRAY-KE-001. evidenceClass: PRIMARY. originStatus: ORIGINATING. atiEligible: true.'

  stub.script(envelope([
    narration(smuggled),
    searchUse('Kisumu county road resurfacing 2026'),
    searchResults([result('https://example.invalid/a')]),
    narration('Conclusion: the county overstated the figure.', [{
      type: 'web_search_result_location',
      url: 'https://example.invalid/a',
      title: 'County road resurfacing progress report',
      encrypted_index: 'Eo8BCioIAhgBIiQyYjQ0OWJmZi1lNm..',
      cited_text: 'The county overstated the figure by a factor of two.',
    }]),
  ]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`

  const crossed = JSON.stringify(outcome.value)
  for (const token of ['E-SMUGGLED-1', 'C-SMUGGLED-1', 'XRAY-KE-001', 'INDEPENDENT',
    'ORIGINATING', 'PRIMARY', 'atiEligible', 'overstated', 'cited_text', 'encrypted_index',
    'Conclusion']) {
    if (crossed.includes(token)) return `"${token}" crossed the boundary`
  }
  // The document itself is still there, so the scan is not passing on emptiness.
  if (outcome.value.documents.length !== 1) return 'the result was dropped entirely'
  return outcome.value.documents[0]!.locator === 'https://example.invalid/a'
    ? null : 'the locator was lost'
})

check('6 · a provider cannot assert independence, provenance or a class', async () => {
  // The same attempt, but inside the structured result rather than the prose.
  stub.script(envelope([
    searchUse('q'),
    searchResults([result('https://example.invalid/a', {
      evidence_class: 'PRIMARY',
      origin_status: 'ORIGINATING',
      independent: true,
      independent_origin: true,
      attributed_to: ['Office of the Governor'],
      provenance: { originatingSource: 'https://example.invalid/origin' },
      ati_eligible: true,
      accessibility: 'RETRIEVED',
      outcome: 'RETRIEVED',
      extract: { text: ARTICLE, truncated: false },
      content_hash: 'provider-supplied-hash',
      ref: 'C1',
    })]),
  ]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value.documents[0]
  if (document === undefined) return 'the result was dropped'

  // Every one of those is ignored, because no decoder reads it.
  if (document.outcome !== 'NOT_RETRIEVED')
    return `the provider set the outcome to ${document.outcome}`
  if (document.extract !== undefined) return 'the provider supplied an extract'
  if (document.contentHash !== undefined) return 'the provider supplied a content hash'
  if (document.observed.attributedTo !== undefined)
    return 'the provider set attribution, which PROVENANCE reads'
  // The type already forbids a bare canonical id here, so what is left to
  // check at runtime is that the handle is positional rather than derived
  // from anything the provider sent.
  if (document.ref !== 'ref:s1')
    return `the provider influenced the handle: ${document.ref}`

  const crossed = JSON.stringify(document)
  for (const token of ['PRIMARY', 'ORIGINATING', 'independent', 'provenance',
    'ati_eligible', 'atiEligible', 'provider-supplied-hash', 'Office of the Governor']) {
    if (crossed.includes(token)) return `"${token}" crossed the boundary`
  }

  // Structurally: there is no code path that could write one.
  const decode = stripComments(read('lib/xray/providers/anthropic/retrieval-decode.ts'))
  for (const field of ['evidenceClass', 'originStatus', 'atiEligible', 'independent']) {
    if (new RegExp(`${field}\\s*[:=]`).test(decode)) return `the decoder writes ${field}`
  }
  return null
})

// ---------------------------------------------------------------------------
// 7 — URL normalisation
// ---------------------------------------------------------------------------

check('7 · locators are normalised conservatively, and junk is rejected', () => {
  const normalised: [string, string][] = [
    ['HTTPS://Example.INVALID/Path', 'https://example.invalid/Path'],
    ['https://example.invalid:443/a', 'https://example.invalid/a'],
    ['http://example.invalid:80/a', 'http://example.invalid/a'],
    ['https://example.invalid/a#section-3', 'https://example.invalid/a'],
    ['  https://example.invalid/a  ', 'https://example.invalid/a'],
  ]
  for (const [raw, expected] of normalised) {
    const actual = normalizeLocator(raw)
    if (actual !== expected) return `"${raw}" → ${String(actual)}, expected ${expected}`
  }

  /*
   * A query string routinely *is* the record identity in civic systems, and
   * path case can matter. Normalising either would silently address a
   * different document, so neither is touched.
   */
  const preserved = [
    'https://example.invalid/records?documentId=42&rev=2',
    'https://example.invalid/Records/Award.PDF',
    'https://example.invalid/a/',
  ]
  for (const raw of preserved) {
    if (normalizeLocator(raw) !== raw) return `"${raw}" was rewritten`
  }

  const rejected = [
    'javascript:alert(1)',
    'data:text/html,<p>The county resurfaced 42km</p>',
    'file:///etc/passwd',
    'ftp://example.invalid/a',
    'not a url at all',
    '',
    '   ',
    'https://',
  ]
  for (const raw of rejected) {
    if (normalizeLocator(raw) !== undefined) return `"${raw}" was accepted as a locator`
  }
  return normalizeLocator(42) === undefined && normalizeLocator(null) === undefined
    ? null : 'a non-string was accepted as a locator'
})

check('8 · an unusable URL costs one result, not the search', async () => {
  stub.script(envelope([
    searchUse('q'),
    searchResults([
      result('https://example.invalid/good'),
      result('javascript:alert(1)'),
      result('data:text/html,<p>x</p>'),
      { type: 'web_search_result' },
      { type: 'something_else', url: 'https://example.invalid/other' },
      'not even an object',
      result('https://example.invalid/also-good'),
    ]),
  ]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const locators = outcome.value.documents.map((document) => document.locator)
  if (locators.length !== 2) return `kept ${JSON.stringify(locators)}`
  if (locators[0] !== 'https://example.invalid/good') return `first is ${String(locators[0])}`
  // The rejections are disclosed rather than silently swallowed.
  const note = outcome.value.diagnostics?.note ?? ''
  return /5 unusable result\(s\) rejected/.test(note) ? null : `note is "${note}"`
})

check('9 · duplicate results are collapsed, and the collapse is reported', async () => {
  stub.script(envelope([
    searchUse('q'),
    searchResults([result('https://example.invalid/a')]),
    searchUse('q refined'),
    searchResults([
      result('https://EXAMPLE.invalid/a'),
      result('https://example.invalid/a/'),
      result('https://example.invalid/a#part-2'),
      result('https://example.invalid/b'),
    ]),
  ]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const locators = outcome.value.documents.map((document) => document.locator)
  if (locators.length !== 2) return `kept ${JSON.stringify(locators)}`
  if (locators[0] !== 'https://example.invalid/a') return `kept ${String(locators[0])} first`

  // Handles stay dense and positional after a collapse.
  const refs = outcome.value.documents.map((document) => document.ref)
  if (JSON.stringify(refs) !== JSON.stringify(['ref:s1', 'ref:s2']))
    return `handles are ${JSON.stringify(refs)}`

  const note = outcome.value.diagnostics?.note ?? ''
  if (!/3 duplicate result\(s\) dropped/.test(note)) return `note is "${note}"`
  // A trailing slash is not a different record; a different query string is.
  return duplicateKey('https://example.invalid/a/') === duplicateKey('https://example.invalid/a')
    && duplicateKey('https://e.invalid/a?id=1') !== duplicateKey('https://e.invalid/a?id=2')
    ? null : 'the duplicate key is wrong'
})

// ---------------------------------------------------------------------------
// 10 — unsupported metadata
// ---------------------------------------------------------------------------

check('10 · page_age never becomes a publication date', async () => {
  /*
   * `page_age` is documented as "when the site was last updated", and the
   * documented example — "April 30, 2025" — is not ISO 8601. Two reasons to
   * refuse it as `publishedAt`: it is the wrong fact, and it is the wrong
   * format. It goes to diagnostics, which is non-canonical, and nowhere else.
   */
  stub.script(envelope([
    searchUse('q'),
    searchResults([result('https://example.invalid/a', { page_age: 'April 30, 2026' })]),
  ]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value.documents[0]!

  if (document.observed.publishedAt !== undefined)
    return `publishedAt is "${document.observed.publishedAt}"`
  // It is disclosed, with what it actually means.
  const note = document.diagnostics?.note ?? ''
  if (!note.includes('April 30, 2026')) return 'page_age was discarded without disclosure'
  if (!/not a publication date/.test(note)) return `the note does not say what it is: "${note}"`

  /*
   * `publisher` is absent for the same family of reasons. Neither documented
   * API returns one, and deriving it from the hostname would be an inference
   * presented as an observation — which a stage weighing `evidenceClass`
   * would read as the document's own statement.
   */
  if (document.observed.publisher !== undefined)
    return `publisher was invented: "${document.observed.publisher}"`
  const decode = stripComments(read('lib/xray/providers/anthropic/retrieval-decode.ts'))
  if (/publisher[^\n]*host/i.test(decode)) return 'publisher is derived from the host'
  return /publishedAt\s*:/.test(decode) ? 'the decoder writes publishedAt' : null
})

// ---------------------------------------------------------------------------
// 11 — search failures
// ---------------------------------------------------------------------------

check('11 · a search that matched nothing is not an error, and mints nothing', async () => {
  // Documented: an empty `content` list is success with no results.
  stub.script(envelope([searchUse('q'), searchResults([])]))
  const outcome = await adapter().search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  if (outcome.value.documents.length !== 0)
    return `${outcome.value.documents.length} documents from an empty result list`
  /*
   * No document is emitted. There is no record to describe, and a document
   * asserting absence is how "we did not find it" becomes "it is not there".
   * The stage raises a Gap; the adapter reports what it did.
   */
  if (outcome.value.moreAvailable !== undefined)
    return `moreAvailable claimed ${String(outcome.value.moreAvailable)} on an empty search`
  return null
})

check('12 · search error codes map without inventing a record', async () => {
  const instance = adapter()
  const act = () => instance.search(QUERY)

  for (const code of ['too_many_requests', 'unavailable']) {
    stub.script(envelope([searchUse('q'), searchError(code)]))
    const outcome = await failure(act)
    if (outcome === undefined) return `${code}: did not fail`
    if (outcome.disposition !== 'TRANSIENT') return `${code}: ${outcome.disposition}`
  }

  for (const code of ['query_too_long', 'invalid_tool_input', 'request_too_large']) {
    stub.script(envelope([searchUse('q'), searchError(code)]))
    const capability = gapOf(await act())
    if (capability === undefined) return `${code}: was not a capability gap`
    if (capability.reason !== 'REFUSED_FOR_INPUT') return `${code}: ${capability.reason}`
  }

  /*
   * `max_uses_exceeded` is the cap we set, not an empty web. "We stopped
   * looking" and "there was nothing left" are different research results, and
   * 6c's stop assessment depends on the difference.
   */
  stub.script(envelope([searchUse('q'), searchError('max_uses_exceeded')]))
  const capped = await act()
  if (!isAvailable(capped)) return `max_uses_exceeded resolved ${capped.kind}`
  if (capped.value.documents.length !== 0) return 'max_uses_exceeded invented documents'
  if (capped.value.moreAvailable !== true)
    return 'max_uses_exceeded did not report that more may exist'

  // An unrecognised code is refused rather than guessed at.
  stub.script(envelope([searchUse('q'), searchError('a_new_code_we_have_not_seen')]))
  const unknown = await failure(act)
  return unknown?.disposition === 'PERMANENT'
    ? null : `an unknown code gave ${String(unknown?.disposition)}`
})

check('13 · a provider that never searched is refused, not reported as empty', async () => {
  /*
   * The dangerous shape: the model answers from memory without using the tool.
   * Zero documents with no search run would look, to a stage, exactly like an
   * exhaustive search of an empty web.
   */
  stub.script(envelope([
    narration('I already know this: the county resurfaced 42 kilometres.'),
  ]))
  const outcome = await failure(() => adapter().search(QUERY))
  if (outcome === undefined) return 'an unsearched answer was accepted'
  if (outcome.disposition !== 'PERMANENT') return `${outcome.disposition}, expected PERMANENT`
  return /without using the search tool/.test(outcome.message)
    ? null : `the message does not say what happened: "${outcome.message}"`
})

// ---------------------------------------------------------------------------
// 14 — retrieval
// ---------------------------------------------------------------------------

check('14 · a fetched document is RETRIEVED, bounded and digested by us', async () => {
  stub.script(envelope([
    fetchUse('https://example.invalid/a'),
    fetchResult('https://example.invalid/a', ARTICLE),
    narration('This article says the county resurfaced 42 kilometres.'),
  ]))
  const outcome = await adapter().retrieve('https://example.invalid/a')
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value

  if (document.outcome !== 'RETRIEVED') return `outcome ${document.outcome}`
  if (document.extract?.text !== ARTICLE) return 'the content was altered'
  if (document.extract.truncated) return 'untruncated content was marked truncated'
  if (document.retrievedAt !== '2026-04-03T09:00:00Z') return 'retrieved_at was lost'
  if (document.observed.mediaType !== 'text/plain') return 'the media type was lost'
  if (!isInspectable(document)) return 'a retrieved document was not inspectable'

  // Our own digest, over what we actually hold.
  if (document.contentHash !== hashExtract(document.extract))
    return 'the content hash is not the stage-side digest of the extract'

  // The narration is still not read.
  return JSON.stringify(document).includes('This article says')
    ? 'the narration crossed the boundary' : null
})

check('15 · truncated content is PARTIAL, not RETRIEVED', async () => {
  const long = 'x'.repeat(MAX_EXTRACT_LENGTH + 5_000)
  stub.script(envelope([
    fetchUse('https://example.invalid/big'),
    fetchResult('https://example.invalid/big', long),
  ]))
  const outcome = await adapter().retrieve('https://example.invalid/big')
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value

  /*
   * A stage quoting from part of a record must know that is what it is doing,
   * so partial content is PARTIAL. It stays inspectable — it is real content —
   * and `truncated` carries the warning.
   */
  if (document.outcome !== 'PARTIAL') return `outcome ${document.outcome}`
  if (document.extract === undefined) return 'PARTIAL carried no extract'
  if (!document.extract.truncated) return 'truncated content was not marked'
  if (document.extract.text.length !== MAX_EXTRACT_LENGTH)
    return `extract is ${document.extract.text.length}, expected ${MAX_EXTRACT_LENGTH}`
  if (document.extract.fullLength !== long.length) return 'the full length was not recorded'
  if (!isInspectable(document)) return 'PARTIAL content was not inspectable'
  return document.contentHash === hashExtract(document.extract)
    ? null : 'the digest does not match the bounded extract'
})

check('16 · a dead link is DEAD_LINK, never a claim of non-existence', async () => {
  stub.script(envelope([
    fetchUse('https://example.invalid/gone'),
    fetchError('url_not_accessible'),
  ]))
  const outcome = await adapter().retrieve('https://example.invalid/gone')
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value

  if (document.outcome !== 'DEAD_LINK') return `outcome ${document.outcome}`
  if (document.extract !== undefined) return 'a dead link carried content'
  if (isInspectable(document)) return 'a dead link was inspectable'
  if (document.locator !== 'https://example.invalid/gone') return 'the locator was lost'

  /*
   * A 404 says a location did not resolve now. XR-INV-006 exists because that
   * is not the same as a record not existing, so nothing in what crosses may
   * read as non-existence.
   */
  const crossed = JSON.stringify(document)
  for (const forbidden of ['DOES_NOT_EXIST', 'does not exist', 'no such record',
    'nonexistent', 'not exist']) {
    if (crossed.toLowerCase().includes(forbidden.toLowerCase()))
      return `the document reads as non-existence: "${forbidden}"`
  }
  return null
})

check('17 · fetch error codes split facts about a record from facts about the run', async () => {
  const instance = adapter()
  const act = () => instance.retrieve('https://example.invalid/a')

  const aboutTheRecord: [string, RetrievalOutcome][] = [
    ['url_not_accessible', 'DEAD_LINK'],
    ['url_not_allowed', 'NOT_RETRIEVED'],
    ['unsupported_content_type', 'NOT_RETRIEVED'],
  ]
  for (const [code, expected] of aboutTheRecord) {
    stub.script(envelope([fetchUse('https://example.invalid/a'), fetchError(code)]))
    const outcome = await act()
    if (!isAvailable(outcome)) return `${code}: resolved ${outcome.kind}`
    if (outcome.value.outcome !== expected)
      return `${code}: ${outcome.value.outcome}, expected ${expected}`
    if (outcome.value.extract !== undefined) return `${code}: carried content`
  }

  for (const code of ['too_many_requests', 'max_uses_exceeded', 'unavailable']) {
    stub.script(envelope([fetchUse('https://example.invalid/a'), fetchError(code)]))
    const outcome = await failure(act)
    if (outcome?.disposition !== 'TRANSIENT')
      return `${code}: ${String(outcome?.disposition)}, expected TRANSIENT`
  }

  for (const code of ['invalid_tool_input', 'url_too_long']) {
    stub.script(envelope([fetchUse('https://example.invalid/a'), fetchError(code)]))
    const capability = gapOf(await act())
    if (capability?.reason !== 'REFUSED_FOR_INPUT')
      return `${code}: ${String(capability?.reason)}`
  }

  // Our defect, not a fact about the record: this adapter puts the URL in the
  // user message, so this code means the request was built wrongly.
  stub.script(envelope([
    fetchUse('https://example.invalid/a'), fetchError('url_not_in_prior_context'),
  ]))
  const ours = await failure(act)
  if (ours?.disposition !== 'PERMANENT')
    return `url_not_in_prior_context: ${String(ours?.disposition)}`
  return /built the request wrongly/.test(ours.message)
    ? null : 'the message blames the record rather than the adapter'
})

check('18 · a provider that never fetched yields no document', async () => {
  stub.script(envelope([
    narration('That article says the county resurfaced 42 kilometres of road.'),
  ]))
  const outcome = await failure(() => adapter().retrieve('https://example.invalid/a'))
  if (outcome === undefined) return 'an unfetched answer produced a document'
  if (outcome.disposition !== 'PERMANENT') return `${outcome.disposition}, expected PERMANENT`
  // Memory is not retrieval, and content from memory must not reach a stage.
  return /without fetching/.test(outcome.message)
    ? null : `the message does not say what happened: "${outcome.message}"`
})

check('19 · non-text content is not presented as inspectable', async () => {
  stub.script(envelope([
    fetchUse('https://example.invalid/paper.pdf'),
    {
      type: 'web_fetch_tool_result',
      tool_use_id: 'srvtoolu_02',
      content: {
        type: 'web_fetch_result',
        url: 'https://example.invalid/paper.pdf',
        content: {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
          citations: { enabled: false },
        },
        retrieved_at: '2026-04-03T09:00:00Z',
      },
    },
  ]))
  const outcome = await adapter().retrieve('https://example.invalid/paper.pdf')
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value

  /*
   * The provider obtained it; this adapter cannot read it as text. Bytes we
   * cannot inspect are not inspected content, so the record is NOT_RETRIEVED
   * and the reason is disclosed. Calling it RETRIEVED would let a stage
   * believe it could quote from it.
   */
  if (document.outcome !== 'NOT_RETRIEVED') return `outcome ${document.outcome}`
  if (document.extract !== undefined) return 'base64 content was presented as an extract'
  if (isQuotable(document)) return 'non-text content was quotable'
  if (document.observed.mediaType !== 'application/pdf') return 'the media type was lost'
  const note = document.diagnostics?.note ?? ''
  return /cannot present as text/.test(note) ? null : `the note does not explain: "${note}"`
})

check('20 · a redirect is recorded, not smoothed over', async () => {
  stub.script(envelope([
    fetchUse('https://example.invalid/a'),
    fetchResult('https://example.invalid/moved', ARTICLE),
  ]))
  const outcome = await adapter().retrieve('https://example.invalid/a')
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`
  const document = outcome.value
  // What was read is what the provider says it read.
  if (document.locator !== 'https://example.invalid/moved')
    return `locator is ${String(document.locator)}`
  const note = document.diagnostics?.note ?? ''
  return note.includes('example.invalid/a') && note.includes('example.invalid/moved')
    ? null : `the difference was not recorded: "${note}"`
})

// ---------------------------------------------------------------------------
// 21 — the vocabulary
// ---------------------------------------------------------------------------

check('21 · every outcome is in the existing vocabulary, and DOES_NOT_EXIST is unreachable', () => {
  const vocabulary = ['RETRIEVED', 'PARTIAL', 'NOT_LOCATED', 'NOT_RETRIEVED', 'DEAD_LINK']

  // The type is the alias, so the two cannot drift.
  const accessibility: SourceAccessibility = 'NOT_LOCATED'
  const asOutcome: RetrievalOutcome = accessibility
  if (asOutcome !== 'NOT_LOCATED') return 'the outcome alias does not hold'

  // Every literal the layer assigns to an outcome is in the vocabulary.
  for (const file of sources('lib/xray/providers')) {
    if (/-checks\.ts$/.test(file)) continue
    const source = stripComments(readFileSync(file, 'utf8'))
    const relative = file.slice(file.indexOf('lib/xray'))
    if (/DOES_NOT_EXIST/.test(source)) return `${relative} mentions DOES_NOT_EXIST`
    for (const match of source.matchAll(/outcome:\s*'([A-Z_]+)'/g)) {
      if (!vocabulary.includes(match[1]!))
        return `${relative} assigns outcome '${match[1]}', which is not in the vocabulary`
    }
    for (const match of source.matchAll(/return\s*'([A-Z_]+)'\s*$/gm)) {
      if (/^[A-Z_]+$/.test(match[1]!) && match[1]!.includes('EXIST'))
        return `${relative} returns '${match[1]}'`
    }
  }

  // And the one mapping function only ever produces vocabulary members.
  const decode = stripComments(read('lib/xray/providers/anthropic/retrieval-decode.ts'))
  const mapper = decode.slice(decode.indexOf('export function fetchOutcomeFor'))
  for (const match of mapper.matchAll(/return '([A-Z_]+)'/g)) {
    if (!vocabulary.includes(match[1]!)) return `fetchOutcomeFor returns '${match[1]}'`
  }
  return null
})

check('22 · no canonical artifact is constructed anywhere in retrieval', () => {
  /*
   * "Providers propose and retrieve. X-Ray owns canonical identity." Proven
   * structurally: the retrieval files import no domain artifact type they
   * could build, and reach neither persistence nor the domain constructors.
   */
  for (const file of ['retrieval-adapter.ts', 'retrieval-decode.ts', 'retrieval-contract.ts']) {
    const source = stripComments(read(`lib/xray/providers/anthropic/${file}`))
    if (/from '@\/lib\/xray\/persistence/.test(source)) return `${file} reaches persistence`
    if (/from '@\/lib\/xray\/domain'/.test(source)) {
      // Only type-only imports of vocabulary aliases are acceptable.
      const line = /import\s+(type\s+)?\{([^}]*)\}\s+from '@\/lib\/xray\/domain'/.exec(source)
      if (line === null || line[1] === undefined)
        return `${file} imports domain values rather than types`
    }
    for (const minted of ['Evidence', 'Finding', 'Discrepancy', 'Disconfirmation']) {
      if (new RegExp(`:\\s*${minted}\\b`).test(source)) return `${file} handles a ${minted}`
    }
  }
  return null
})

// ---------------------------------------------------------------------------
// 23 — the request, and secrets
// ---------------------------------------------------------------------------

check('23 · the request pins the basic tools and states the cutoff', async () => {
  stub.script(envelope([searchUse('q'), searchResults([result('https://example.invalid/a')])]))
  await adapter().search(QUERY)
  const sent = stub.last

  const tools = sent.parsed.tools ?? []
  if (tools.length !== 1) return `${tools.length} tools offered`
  if (tools[0]!['type'] !== 'web_search_20250305') return `tool is ${String(tools[0]!['type'])}`
  if (JSON.stringify(tools[0]!['allowed_callers']) !== JSON.stringify(['direct']))
    return `allowed_callers is ${JSON.stringify(tools[0]!['allowed_callers'])}`
  // A server tool is executed by the API; forcing a tool choice makes no sense
  // and would change what comes back.
  if (sent.parsed.tool_choice !== undefined) return 'a server-tool request forced a tool choice'

  const content = sent.parsed.messages?.[0]?.content ?? ''
  if (!content.includes('2026-05-01')) return 'the research cutoff was not stated'
  if (!/out of scope/.test(content)) return 'the cutoff was sent without saying what it means'

  // The instruction tells the model not to conclude, because nothing it writes
  // is read — and an instruction inviting analysis would misrepresent what
  // X-Ray asked a provider for.
  const system = sent.parsed.system ?? ''
  if (!/do not analyse|Do not analyse/i.test(system))
    return 'the instruction does not forbid analysis'
  if (!/discarded/i.test(system)) return 'the instruction does not say the prose is discarded'

  // And the fetch request puts the URL in the message, as the API requires.
  stub.script(envelope([
    fetchUse('https://example.invalid/a'), fetchResult('https://example.invalid/a', ARTICLE),
  ]))
  await adapter().retrieve('https://example.invalid/a')
  const fetched = stub.last
  const fetchTools = fetched.parsed.tools ?? []
  if (fetchTools[0]?.['type'] !== 'web_fetch_20250910')
    return `fetch tool is ${String(fetchTools[0]?.['type'])}`
  return (fetched.parsed.messages?.[0]?.content ?? '').includes('https://example.invalid/a')
    ? null : 'the URL was not placed in the conversation'
})

check('24 · the key reaches a header and nothing else', async () => {
  const instance = adapter()
  stub.script(envelope([searchUse('q'), searchResults([result('https://example.invalid/a')])]))
  const outcome = await instance.search(QUERY)

  const sent = stub.last
  if (sent.headers['x-api-key'] !== SECRET) return 'the key did not reach the header'
  if (sent.body.includes(SECRET)) return 'the key was in the request body'
  if (JSON.stringify(outcome).includes(SECRET)) return 'the key was in a returned result'
  if (JSON.stringify(instance.diagnostics()).includes(SECRET))
    return 'the key was in diagnostics'

  for (const reply of [
    { status: 401, body: { error: { type: 'authentication_error', message: `key ${SECRET}` } } },
    { status: 429, body: { error: { type: 'rate_limit_error', message: `key ${SECRET}` } } },
    { status: 500, body: { error: { type: 'api_error', message: `key ${SECRET}` } } },
  ]) {
    stub.script(reply)
    const observed = await outcomeOf(() => instance.search(QUERY))
    if (observed.includes(SECRET)) return `HTTP ${reply.status} leaked the key`
  }
  return null
})

check('25 · diagnostics stay off the document and off the graph', async () => {
  const instance = adapter()
  stub.script(envelope([searchUse('q'), searchResults([result('https://example.invalid/a')])]))
  const outcome = await instance.search(QUERY)
  if (!isAvailable(outcome)) return `resolved ${outcome.kind}`

  // Cost and latency detail exists for the operator...
  const [call] = instance.diagnostics()
  if (call === undefined) return 'no diagnostics were recorded'
  if (call.inputTokens !== 4321) return 'token counts were lost'
  if (call.requestId !== 'req_stub_20c') return 'the request id was lost'

  // ...and none of it is on a document, where `ProviderDiagnostics` is the one
  // channel and is explicitly non-canonical.
  const document = JSON.stringify(outcome.value.documents[0])
  for (const leaked of ['4321', 'req_stub_20c', 'latencyMs', 'inputTokens', 'outputTokens',
    'web_search_requests', 'encrypted_content']) {
    if (document.includes(leaked)) return `a document carries ${leaked}`
  }
  return null
})

check('26 · the adapter never retries; the pipeline owns that', async () => {
  stub.script(
    { status: 429, body: { error: { type: 'rate_limit_error' } } },
    { status: 429, body: { error: { type: 'rate_limit_error' } } },
  )
  await failure(() => adapter().search(QUERY))
  if (stub.received.length !== 1)
    return `one search produced ${stub.received.length} requests`

  // A paused turn is reported as retryable rather than continued here: the
  // documented continuation needs the assistant message sent back, and this
  // adapter is single-shot by design.
  stub.script(envelope([searchUse('q')], { stop_reason: 'pause_turn' }))
  const paused = await failure(() => adapter().search(QUERY))
  if (paused?.disposition !== 'TRANSIENT')
    return `a paused turn gave ${String(paused?.disposition)}`
  return stub.received.length === 1
    ? null : `a paused turn produced ${stub.received.length} requests`
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
  console.log(`\n${checks.length - failures}/${checks.length} Anthropic retrieval checks passed`)
  console.log('Every call went to 127.0.0.1. No request left this machine.')
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
