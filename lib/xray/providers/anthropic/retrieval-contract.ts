/**
 * The Anthropic server-tool contract this adapter implements (#20 slice 20c).
 *
 * WHICH CONTRACT, AND WHEN IT WAS READ
 * ====================================
 * Verified against the official documentation on 2026-09-21:
 *
 *   https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 *   https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
 *
 * Implemented:  `web_search_20250305`  and  `web_fetch_20250910`
 *
 * WHY THE BASIC VERSIONS, DELIBERATELY
 * ====================================
 * Newer versions exist — `web_search_20260209` / `web_search_20260318` and
 * `web_fetch_20260209` / `web_fetch_20260318` — and their headline feature is
 * *dynamic filtering*: the model writes and runs code that filters results
 * before they reach the context window.
 *
 * That is precisely what X-Ray must not have. Filtering search results by
 * relevance, before anything crosses the retrieval boundary, is a provider
 * making an evidentiary judgement about what matters — and doing it where no
 * invariant can see it. XR-INV-006 turns on the extent of the search, and 6c's
 * stop assessment turns on "we stopped looking" versus "there was nothing
 * left"; neither question can be answered about a result set that was already
 * pruned by the provider.
 *
 * On those versions `allowed_callers` defaults to `["code_execution_20260120"]`,
 * so filtering is the default behaviour rather than an opt-in. This adapter
 * therefore pins the basic versions and sets `allowed_callers: ["direct"]`
 * explicitly on search, so that bumping a version string can never silently
 * move filtering into code execution. The basic versions are also the only
 * ones available on every platform the documentation lists.
 *
 * WHAT THE DOCUMENTATION SAYS THAT SHAPES THE CODE
 * ================================================
 * - A server tool executes *during* the request; there is no `tool_result` to
 *   return, and the results arrive as content blocks.
 * - A search or fetch error does **not** produce an HTTP error. The API returns
 *   200 and the failure appears as a `*_tool_result_error` block with an
 *   `error_code`. So retrieval outcomes are decided from block content, while
 *   HTTP status keeps its 20b meaning.
 * - A search that matches nothing returns an **empty `content` list, not an
 *   error**. That distinction is load-bearing: it is the difference between
 *   "nothing was found" and "the search did not run".
 * - `page_age` is documented as *"When the site was last updated"*. It is not a
 *   publication date and is not ISO 8601 (the documented example is
 *   `"April 30, 2025"`). It therefore never becomes `publishedAt`.
 * - web fetch can only reach a URL that already appeared in the conversation,
 *   so `retrieve` must place the locator in the user message.
 * - web fetch does not render JavaScript.
 * - The API can return `stop_reason: "pause_turn"`, continued by sending the
 *   assistant message back unchanged.
 *
 * PURITY: constants and types. No I/O, no SDK.
 */

/** The exact tool version strings this adapter implements. */
export const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305'
export const WEB_FETCH_TOOL_TYPE = 'web_fetch_20250910'

/** Documented block type names. Read verbatim; never guessed at. */
export const BLOCK = {
  serverToolUse: 'server_tool_use',
  searchResultBlock: 'web_search_tool_result',
  searchResult: 'web_search_result',
  searchError: 'web_search_tool_result_error',
  fetchResultBlock: 'web_fetch_tool_result',
  fetchResult: 'web_fetch_result',
  fetchError: 'web_fetch_tool_result_error',
  text: 'text',
} as const

/** Documented web-search error codes. */
export type SearchErrorCode =
  | 'too_many_requests'
  | 'invalid_tool_input'
  | 'max_uses_exceeded'
  | 'query_too_long'
  | 'request_too_large'
  | 'unavailable'

export const SEARCH_ERROR_CODES = [
  'too_many_requests', 'invalid_tool_input', 'max_uses_exceeded',
  'query_too_long', 'request_too_large', 'unavailable',
] as const satisfies readonly SearchErrorCode[]

/** Documented web-fetch error codes. */
export type FetchErrorCode =
  | 'invalid_tool_input'
  | 'url_too_long'
  | 'url_not_allowed'
  | 'url_not_in_prior_context'
  | 'url_not_accessible'
  | 'too_many_requests'
  | 'unsupported_content_type'
  | 'max_uses_exceeded'
  | 'unavailable'

export const FETCH_ERROR_CODES = [
  'invalid_tool_input', 'url_too_long', 'url_not_allowed', 'url_not_in_prior_context',
  'url_not_accessible', 'too_many_requests', 'unsupported_content_type',
  'max_uses_exceeded', 'unavailable',
] as const satisfies readonly FetchErrorCode[]

type UncoveredSearchCode = Exclude<SearchErrorCode, (typeof SEARCH_ERROR_CODES)[number]>
type UncoveredFetchCode = Exclude<FetchErrorCode, (typeof FETCH_ERROR_CODES)[number]>
const _codesExhaustive: UncoveredSearchCode | UncoveredFetchCode extends never ? true : never = true
void _codesExhaustive

/**
 * The search tool definition.
 *
 * `allowed_callers: ["direct"]` is stated rather than left to default. On the
 * pinned version it already is the default; stating it means a later version
 * bump cannot quietly hand result filtering to code execution.
 */
export function searchTool(maxUses: number): Readonly<Record<string, unknown>> {
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: 'web_search',
    max_uses: maxUses,
    allowed_callers: ['direct'],
  }
}

/**
 * The fetch tool definition.
 *
 * `citations` stays disabled. Citations are how the *model* attributes its
 * prose, and this adapter does not read the model's prose — it reads the fetch
 * result. Enabling them would pay tokens for something no code path consumes.
 *
 * `max_content_tokens` bounds what the API puts in context. It is not the
 * boundary limit: `MAX_EXTRACT_LENGTH` is, and `bound()` applies it to what
 * actually crosses.
 */
export function fetchTool(maxUses: number, maxContentTokens: number):
Readonly<Record<string, unknown>> {
  return {
    type: WEB_FETCH_TOOL_TYPE,
    name: 'web_fetch',
    max_uses: maxUses,
    citations: { enabled: false },
    max_content_tokens: maxContentTokens,
  }
}
