/**
 * The Anthropic `ResearchAdapter` (#20 slice 20c).
 *
 * WHAT IT DOES
 * ============
 * `search` discovers records; `retrieve` obtains one. Both return material and
 * honest metadata about reaching it, and nothing else. It implements the
 * existing port exactly — no method added, none widened — so a stage cannot
 * tell which provider it has, and swapping `XRAY_RETRIEVAL_PROVIDER` changes
 * composition rather than pipeline logic.
 *
 * WHAT IT REFUSES TO DO
 * =====================
 * It never mints `Evidence`. It never decides `evidenceClass`, `originStatus`,
 * source independence or provenance. It never reports that a record does not
 * exist. And it never reads the model's prose — see `retrieval-decode.ts`,
 * where that boundary lives.
 *
 * THE INSTRUCTION IS NARROW BY DESIGN
 * ===================================
 * The model here is a search executor, not a researcher. It is asked to run a
 * query or fetch a URL and told explicitly not to analyse, summarise or
 * conclude, because anything it writes is discarded — and an instruction that
 * invited analysis would spend tokens producing text no code path reads, while
 * making it look as though X-Ray had asked a provider for judgement.
 */

import { available, AdapterFailure, type CapabilityResult } from '@/lib/xray/capability'
import type {
  ResearchAdapter, ResearchAdapterOperation, RetrievalQuery, RetrievalResult,
  RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import {
  decodeFetch, decodeSearch, fetchOutcomeFor, fetchOutcomeNote, normalizeLocator,
  retrievalCapability, unobtained,
} from './retrieval-decode'
import { fetchTool, searchTool } from './retrieval-contract'
import { callServerTools, type CallDiagnostics } from './transport'

export interface AnthropicRetrievalOptions {
  readonly modelId: string
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
  /** Searches the provider may run for one `search` call. */
  readonly maxSearchUses?: number
}

const OPERATIONS = ['search', 'retrieve'] as const satisfies readonly ResearchAdapterOperation[]

/**
 * How much content the API may put in context for one fetch.
 *
 * Distinct from `MAX_EXTRACT_LENGTH`, which is the boundary limit in
 * characters. This is a token budget on the provider's side; `bound()` still
 * applies the real limit to what crosses.
 */
const MAX_CONTENT_TOKENS = 100_000

/** Enough tokens for the tool traffic. The model's prose is discarded. */
const SEARCH_MAX_TOKENS = 4_096
const FETCH_MAX_TOKENS = 4_096

const SEARCH_SYSTEM = `
You are a retrieval executor inside X-Ray, a civic evidence engine. Your only
job is to run searches with the web_search tool.

- Run the search you are given. Use the tool; do not answer from memory.
- Do not analyse, summarise, rank, filter or draw conclusions from the results.
- Do not state what the results establish, whether they agree, or which is more
  reliable. Those are not your decisions and nothing you write is read.

X-Ray reads the search results themselves. Your prose is discarded.
`.trim()

const FETCH_SYSTEM = `
You are a retrieval executor inside X-Ray, a civic evidence engine. Your only
job is to fetch the exact URL you are given with the web_fetch tool.

- Fetch the URL as given. Use the tool; do not answer from memory.
- Fetch only that URL. Do not follow links, and do not substitute another
  source if it fails.
- Do not analyse, summarise or draw conclusions from the content.

X-Ray reads the fetched document itself. Your prose is discarded.
`.trim()

export class AnthropicResearchAdapter implements ResearchAdapter {
  readonly name: string
  readonly capabilities = OPERATIONS

  private readonly options: AnthropicRetrievalOptions
  private readonly calls: CallDiagnostics[] = []

  constructor(options: AnthropicRetrievalOptions) {
    this.options = options
    this.name = `anthropic:web:${options.modelId}`
  }

  /** Execution detail, off the port and off the graph (#20 boundary 7). */
  diagnostics(): readonly CallDiagnostics[] { return [...this.calls] }

  async search(query: RetrievalQuery): Promise<CapabilityResult<RetrievalResult>> {
    const operation = 'research-adapter:search'
    const maxUses = this.options.maxSearchUses ?? 3

    const outcome = await callServerTools({
      operation,
      modelId: this.options.modelId,
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl === undefined ? {} : { baseUrl: this.options.baseUrl }),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      system: SEARCH_SYSTEM,
      userContent: searchRequest(query),
      tools: [searchTool(maxUses)],
      maxTokens: SEARCH_MAX_TOKENS,
    })
    if (outcome.kind === 'CAPABILITY') return outcome.value
    this.calls.push(outcome.value.diagnostics)

    if (outcome.value.stopReason === 'pause_turn') {
      /*
       * A placeholder, and honest about being one. Continuation is not retry:
       * the correct handling resends this paused assistant message unchanged
       * to resume the same turn, and belongs at this provider's transport /
       * session boundary rather than in pipeline retry logic. See
       * `retrieval-contract.ts`, which records the decision for 20d.
       *
       * Until then `TRANSIENT` re-drives the stage, which discards searches
       * the provider already ran. Wasteful and visible, rather than wrong and
       * quiet.
       */
      throw new AdapterFailure(operation, 'TRANSIENT',
        'Anthropic paused the search turn before it completed. Continuing a paused'
        + ' turn is not implemented in 20c, so the stage will be re-driven; the'
        + ' searches already run are discarded.')
    }

    const decoded = decodeSearch(operation, outcome.value.blocks)

    if ('unknownError' in decoded) {
      throw new AdapterFailure(operation, 'PERMANENT',
        'The Anthropic search returned an error code this adapter does not recognise.')
    }

    if ('errorCode' in decoded) {
      switch (decoded.errorCode) {
        case 'too_many_requests':
        case 'unavailable':
          throw new AdapterFailure(operation, 'TRANSIENT',
            `The Anthropic search reported "${decoded.errorCode}".`
            + ' It may succeed on another attempt.')
        case 'max_uses_exceeded':
          /*
           * Not a failure and not an empty result: the cap we set stopped the
           * search. "We stopped looking" is a real research fact and the port
           * has a field for it, so it is reported as zero documents with
           * `moreAvailable`, never as "nothing was found".
           */
          return available({
            query,
            documents: [],
            moreAvailable: true,
            diagnostics: {
              provider: 'anthropic',
              note: `the search stopped after ${maxUses} use(s); more material may exist`,
            },
          })
        case 'query_too_long':
        case 'invalid_tool_input':
        case 'request_too_large':
          return retrievalCapability(operation, 'REFUSED_FOR_INPUT',
            `The Anthropic search refused this query ("${decoded.errorCode}").`,
            'Shorten or simplify the search terms for this stage.')
      }
    }

    const note = [
      decoded.queriesRun.length === 0
        ? 'the provider ran no search' : `queries run: ${decoded.queriesRun.length}`,
      decoded.duplicatesDropped > 0
        ? `${decoded.duplicatesDropped} duplicate result(s) dropped` : undefined,
      decoded.resultsRejected > 0
        ? `${decoded.resultsRejected} unusable result(s) rejected` : undefined,
    ].filter((entry): entry is string => entry !== undefined).join('; ')

    /*
     * A provider that ran no search at all is not a search that found nothing.
     * Zero documents with no search run would look, to a stage, exactly like
     * an exhaustive search of an empty web — so it is refused rather than
     * reported.
     */
    if (decoded.queriesRun.length === 0 && decoded.documents.length === 0) {
      throw new AdapterFailure(operation, 'PERMANENT',
        'The Anthropic search returned no search at all: the provider answered'
        + ' without using the search tool, so nothing was actually looked for.')
    }

    return available({
      query,
      documents: decoded.documents,
      // Absent means unknown. Only `max_uses_exceeded` positively reports a cap.
      diagnostics: { provider: 'anthropic', note },
    })
  }

  async retrieve(locator: string): Promise<CapabilityResult<RetrievedDocument>> {
    const operation = 'research-adapter:retrieve'

    const normalized = normalizeLocator(locator)
    if (normalized === undefined) {
      return retrievalCapability(operation, 'REFUSED_FOR_INPUT',
        'The locator is not an http(s) URL this adapter can fetch.',
        'Supply an http or https locator for this record.')
    }

    const outcome = await callServerTools({
      operation,
      modelId: this.options.modelId,
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl === undefined ? {} : { baseUrl: this.options.baseUrl }),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      system: FETCH_SYSTEM,
      // The URL must appear in the conversation: web fetch is documented as
      // unable to reach a URL that appears only in the model's own output.
      userContent: `Fetch this URL and nothing else:\n${normalized}`,
      tools: [fetchTool(1, MAX_CONTENT_TOKENS)],
      maxTokens: FETCH_MAX_TOKENS,
    })
    if (outcome.kind === 'CAPABILITY') return outcome.value
    this.calls.push(outcome.value.diagnostics)

    if (outcome.value.stopReason === 'pause_turn') {
      // Same placeholder, same reasoning as `search`.
      throw new AdapterFailure(operation, 'TRANSIENT',
        'Anthropic paused the fetch turn before it completed. Continuing a paused'
        + ' turn is not implemented in 20c, so the stage will be re-driven.')
    }

    const decoded = decodeFetch(operation, outcome.value.blocks, normalized)

    if ('notAttempted' in decoded) {
      // The provider answered without fetching. Whatever it said came from
      // memory, and memory is not retrieval — so there is no document, and
      // certainly no content to offer a stage.
      throw new AdapterFailure(operation, 'PERMANENT',
        'The provider answered without fetching the URL, so nothing was retrieved.')
    }

    if ('unknownError' in decoded) {
      throw new AdapterFailure(operation, 'PERMANENT',
        'The Anthropic fetch returned an error code this adapter does not recognise.')
    }

    if ('errorCode' in decoded) {
      const code = decoded.errorCode
      const outcomeForRecord = fetchOutcomeFor(code)
      if (outcomeForRecord !== undefined) {
        // A fact about the record: reached for, not obtained. `DEAD_LINK` for
        // a location that did not resolve — never a claim of non-existence.
        return available(unobtained(normalized, outcomeForRecord, fetchOutcomeNote(code)))
      }
      switch (code) {
        case 'too_many_requests':
        case 'max_uses_exceeded':
        case 'unavailable':
          throw new AdapterFailure(operation, 'TRANSIENT',
            `The Anthropic fetch reported "${code}". It may succeed on another attempt.`)
        case 'invalid_tool_input':
        case 'url_too_long':
          return retrievalCapability(operation, 'REFUSED_FOR_INPUT',
            `The Anthropic fetch refused this locator ("${code}").`,
            'Supply a shorter, well-formed http(s) locator for this record.')
        case 'url_not_in_prior_context':
          // Our defect, not a fact about the record: the locator must be in
          // the user message and this adapter puts it there.
          throw new AdapterFailure(operation, 'PERMANENT',
            'Anthropic rejected the fetch because the URL was not in prior context,'
            + ' which means this adapter built the request wrongly.')
        case 'url_not_accessible':
        case 'url_not_allowed':
        case 'unsupported_content_type':
        case 'content_too_large':
          throw new AdapterFailure(operation, 'PERMANENT',
            `Unreachable: "${code}" is a fact about the record and is handled above.`)
      }
    }

    return available(decoded.document)
  }
}

/**
 * What the provider is asked to search for.
 *
 * The cutoff is stated in words as well as carried, for the same reason the
 * model adapters state it: FM-005 is the failure a silently ignored date
 * produces, and a provider that never sees it cannot respect it.
 */
function searchRequest(query: RetrievalQuery): string {
  const parts = [`Search for: ${query.terms}`]
  if (query.constraints !== undefined && query.constraints.length > 0) {
    parts.push(`Restrict to: ${query.constraints.join('; ')}`)
  }
  if (query.researchCutoffAt !== undefined) {
    parts.push(
      `Material published after ${query.researchCutoffAt} is out of scope for this`
      + ' investigation. Do not search for anything later than that date.',
    )
  }
  if (query.maxResults !== undefined) {
    parts.push(`At most ${query.maxResults} results are wanted.`)
  }
  return parts.join('\n')
}
