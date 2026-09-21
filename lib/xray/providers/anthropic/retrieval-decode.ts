/**
 * Normalising server-tool results into material (#20 slice 20c).
 *
 * THE BOUNDARY THIS FILE IS
 * =========================
 *     a search result  →  RetrievedDocument
 * not
 *     Claude searched  →  Evidence
 *
 * Three properties carry that distinction, and each is a rule about what this
 * file refuses to do:
 *
 * 1. **The model's prose is never read.** A server-tool response contains both
 *    tool-result blocks and the model's narration of what it found. The
 *    narration is where an evidentiary conclusion would live — "this confirms
 *    the county's figure" — and where a smuggled identifier would travel. Only
 *    `web_search_tool_result` and `web_fetch_tool_result` blocks are read;
 *    `text` blocks are ignored entirely, citations included.
 *
 * 2. **A search result is `NOT_RETRIEVED`.** The documented search result
 *    carries `url`, `title`, `page_age` and an opaque `encrypted_content` that
 *    no client can read. So a search identifies a record without obtaining it,
 *    which is exactly what `NOT_RETRIEVED` means and exactly the distinction
 *    XR-INV-006 turns on. Only a fetch can produce `RETRIEVED`.
 *
 * 3. **No field the architecture assigns to a stage is written.** There is no
 *    code path that sets `evidenceClass`, `originStatus`, independence or
 *    provenance, because `RetrievedDocument` has no such field and nothing here
 *    invents one. `attributedTo` — raw attribution as printed — is only ever
 *    populated from something a document states, and neither documented API
 *    supplies it, so it stays absent rather than being inferred.
 *
 * `DOES_NOT_EXIST` IS UNREACHABLE
 * ==============================
 * `RetrievalOutcome` aliases `SourceAccessibility`, which has no such member,
 * so the type forbids it. Beyond that, no failure maps to a claim of
 * non-existence: a fetch that 404s is a `DEAD_LINK`, a search that matches
 * nothing yields **no document at all** rather than a document asserting
 * absence. Absence of a record is a `Gap` for the stage to raise, never a
 * negative fact this adapter reports.
 *
 * PURITY: pure functions over decoded JSON. No I/O, no SDK, no prompt text.
 */

import { AdapterFailure, unavailable, type CapabilityUnavailable } from '@/lib/xray/capability'
import {
  bound, hashExtract,
  type BoundedExtract, type ObservedDocumentMetadata, type ProviderDiagnostics,
  type RetrievalOutcome, type RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'
import { BLOCK, FETCH_ERROR_CODES, SEARCH_ERROR_CODES } from './retrieval-contract'
import type { FetchErrorCode, SearchErrorCode } from './retrieval-contract'

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/** Schemes a civic record can live behind. Anything else is not a locator. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:'])

/**
 * Normalise a URL into a locator, or reject it.
 *
 * Normalisation is deliberately conservative. Case and default ports are
 * noise; a fragment addresses a position within a document rather than a
 * document. Everything else — path, query, trailing slash — is left exactly as
 * it came, because in civic records a query string routinely *is* the record
 * identity (`?documentId=…`) and "tidying" it would silently address a
 * different document.
 *
 * Returns `undefined` rather than throwing: a provider offering one unusable
 * URL among ten should cost that one result, not the search.
 */
export function normalizeLocator(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  let parsed: URL
  try { parsed = new URL(trimmed) } catch { return undefined }

  // `javascript:`, `data:`, `file:` and friends are not records. A `data:` URL
  // in particular would let provider text masquerade as a retrieved location.
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) return undefined
  if (parsed.hostname === '') return undefined

  parsed.hash = ''
  // `URL` already lowercases scheme and host and drops the default port.
  return parsed.toString()
}

/**
 * The key two results are the same record under.
 *
 * Only for de-duplication, never as the locator: a trailing slash is not worth
 * treating as a different record, but neither is it worth rewriting the
 * locator the provider actually returned.
 */
export function duplicateKey(locator: string): string {
  return locator.replace(/\/+$/, '').toLowerCase()
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

/**
 * A handle for one document in one result set.
 *
 * Derived from position only. A handle derived from provider content — a URL
 * hash, a title slug — would let a provider influence, or collide with, the
 * identifiers the run uses, and the whole point of a handle is that it is
 * ours. It is also deterministic, so a replayed search produces the same
 * handles in the same order.
 */
export const handleFor = (prefix: string, index: number): ProposalRef =>
  `ref:${prefix}${index + 1}` as ProposalRef

// ---------------------------------------------------------------------------
// Reading blocks
// ---------------------------------------------------------------------------

type Block = Record<string, unknown>

const asBlock = (value: unknown): Block | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Block : undefined

const blocksOfType = (blocks: readonly unknown[], type: string): Block[] =>
  blocks.map(asBlock).filter((block): block is Block => block?.['type'] === type)

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Keep a key only when it has a value. */
const some = <T>(key: string, value: T | undefined): Record<string, T> =>
  value === undefined ? {} as Record<string, T> : { [key]: value }

/** A documented error code, or undefined for anything unrecognised. */
function errorCode<T extends string>(
  content: unknown, errorType: string, known: readonly T[],
): T | undefined {
  const block = asBlock(content)
  if (block?.['type'] !== errorType) return undefined
  const code = block['error_code']
  return typeof code === 'string' && (known as readonly string[]).includes(code)
    ? code as T : undefined
}

/** Whether a result block carries an error rather than results. */
const isErrorContent = (content: unknown, errorType: string): boolean =>
  asBlock(content)?.['type'] === errorType

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface DecodedSearch {
  readonly documents: readonly RetrievedDocument[]
  /**
   * True only when the provider said it stopped early.
   *
   * Never `false`. "We stopped looking" and "there was nothing left" are
   * different research results, and a search result list cannot tell us which
   * — so absence means unknown, and `true` is claimed only on
   * `max_uses_exceeded`, which is the provider positively reporting a cap.
   */
  readonly moreAvailable?: boolean
  /** Queries the provider actually ran, for the journal. Never canonical. */
  readonly queriesRun: readonly string[]
  readonly duplicatesDropped: number
  readonly resultsRejected: number
}

/**
 * Harvest search results from the content blocks.
 *
 * A search error is not a failure of the run and not a fact about any record,
 * so it is raised for the caller to classify rather than being folded into a
 * document.
 */
export function decodeSearch(
  operation: string, blocks: readonly unknown[],
): DecodedSearch | { readonly errorCode: SearchErrorCode } | { readonly unknownError: true } {
  const resultBlocks = blocksOfType(blocks, BLOCK.searchResultBlock)

  for (const block of resultBlocks) {
    if (!isErrorContent(block['content'], BLOCK.searchError)) continue
    const code = errorCode(block['content'], BLOCK.searchError, SEARCH_ERROR_CODES)
    return code === undefined ? { unknownError: true } : { errorCode: code }
  }

  const queriesRun = blocksOfType(blocks, BLOCK.serverToolUse)
    .map((block) => {
      const input = asBlock(block['input'])
      return input === undefined ? undefined : text(input['query'])
    })
    .filter((query): query is string => query !== undefined)

  const documents: RetrievedDocument[] = []
  const seen = new Set<string>()
  let duplicatesDropped = 0
  let resultsRejected = 0

  for (const block of resultBlocks) {
    const content = block['content']
    // Documented: a search that matched nothing returns an empty list.
    if (!Array.isArray(content)) continue

    for (const entry of content) {
      const result = asBlock(entry)
      if (result === undefined || result['type'] !== BLOCK.searchResult) {
        resultsRejected += 1
        continue
      }
      const locator = normalizeLocator(result['url'])
      if (locator === undefined) { resultsRejected += 1; continue }

      const key = duplicateKey(locator)
      if (seen.has(key)) { duplicatesDropped += 1; continue }
      seen.add(key)

      documents.push(searchDocument(handleFor('s', documents.length), locator, result))
    }
  }

  void operation
  return {
    documents,
    queriesRun,
    duplicatesDropped,
    resultsRejected,
  }
}

/**
 * One search result as material.
 *
 * `NOT_RETRIEVED`, with no extract and no `retrievedAt`: nothing was obtained,
 * so there is nothing to have obtained it at. `encrypted_content` is not read
 * — it is opaque by design, and a value this layer cannot inspect is not
 * content it can offer a stage.
 */
function searchDocument(
  ref: ProposalRef, locator: string, result: Block,
): RetrievedDocument {
  const observed: ObservedDocumentMetadata = {
    ...some('title', text(result['title'])),
    /*
     * `publisher` is absent on purpose. Neither documented API returns one,
     * and deriving it from the hostname would be an inference dressed as an
     * observation — `nation.africa` is not the name of a publisher, and a
     * stage weighing `evidenceClass` would be reading our guess as the
     * document's own statement.
     *
     * `publishedAt` is absent for the same family of reasons, and a sharper
     * one: the only date the API offers is `page_age`, documented as when the
     * site was last *updated*. That is not a publication date, and the
     * documented example ("April 30, 2025") is not ISO 8601 either. It goes to
     * diagnostics, which is non-canonical, and nowhere else.
     */
  }

  const pageAge = text(result['page_age'])
  const diagnostics: ProviderDiagnostics = {
    provider: 'anthropic',
    ...some('note', pageAge === undefined ? undefined
      : `provider reported page_age "${clip(pageAge)}" (site last updated, not a publication date)`),
  }

  return {
    ref,
    locator,
    outcome: 'NOT_RETRIEVED',
    observed,
    diagnostics,
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export interface DecodedFetch {
  readonly document: RetrievedDocument
}

/**
 * Harvest one fetch result.
 *
 * The outcome is decided from what actually arrived, not from what was asked
 * for. A document with truncated content is `PARTIAL` rather than `RETRIEVED`,
 * because a stage quoting from part of a record must know that is what it is
 * doing.
 */
export function decodeFetch(
  operation: string, blocks: readonly unknown[], requestedLocator: string,
): DecodedFetch | { readonly errorCode: FetchErrorCode } | { readonly unknownError: true }
  | { readonly notAttempted: true } {
  const resultBlocks = blocksOfType(blocks, BLOCK.fetchResultBlock)
  if (resultBlocks.length === 0) return { notAttempted: true }

  const block = resultBlocks[0]!
  const content = block['content']

  if (isErrorContent(content, BLOCK.fetchError)) {
    const code = errorCode(content, BLOCK.fetchError, FETCH_ERROR_CODES)
    return code === undefined ? { unknownError: true } : { errorCode: code }
  }

  const result = asBlock(content)
  if (result === undefined || result['type'] !== BLOCK.fetchResult) {
    throw new AdapterFailure(operation, 'PERMANENT',
      'The Anthropic fetch result was neither a result nor a documented error.')
  }

  // The URL the provider says it fetched, normalised the same way ours was.
  // Where they differ the provider's is authoritative for what was read, and
  // the difference is recorded rather than smoothed over.
  const returned = normalizeLocator(result['url'])
  const locator = returned ?? requestedLocator
  const redirected = returned !== undefined
    && duplicateKey(returned) !== duplicateKey(requestedLocator)

  const document = asBlock(result['content'])
  const source = document === undefined ? undefined : asBlock(document['source'])
  const mediaType = source === undefined ? undefined : text(source['media_type'])
  const retrievedAt = isoDateTime(result['retrieved_at'])

  const observed: ObservedDocumentMetadata = {
    ...some('title', document === undefined ? undefined : text(document['title'])),
    ...some('mediaType', mediaType),
  }

  const note = [
    redirected ? `provider fetched ${clip(locator)} for requested ${clip(requestedLocator)}` : undefined,
  ].filter((entry): entry is string => entry !== undefined).join('; ')

  const diagnostics: ProviderDiagnostics = {
    provider: 'anthropic',
    ...some('note', note === '' ? undefined : note),
  }

  const base = {
    ref: handleFor('d', 0),
    locator,
    observed,
    ...some('retrievedAt', retrievedAt),
    diagnostics,
  }

  /*
   * Text is the only content this adapter can present as an extract. A PDF
   * arrives base64-encoded, and bytes this layer cannot read are not inspected
   * content — so the record is `NOT_RETRIEVED`: identified, obtained by the
   * provider, but not inspectable here. Calling it RETRIEVED would let a stage
   * believe it could quote from it.
   */
  if (source?.['type'] !== 'text') {
    return {
      document: {
        ...base,
        outcome: 'NOT_RETRIEVED',
        diagnostics: {
          ...diagnostics,
          note: [diagnostics.note, mediaType === undefined
            ? 'the provider returned non-text content'
            : `the provider returned ${mediaType}, which this adapter cannot present as text`]
            .filter(Boolean).join('; '),
        },
      },
    }
  }

  const data = source['data']
  if (typeof data !== 'string' || data.trim() === '') {
    // Content was promised and is not there. Not a fact about the record.
    throw new AdapterFailure(operation, 'PERMANENT',
      'The Anthropic fetch result carried a text document with no content.')
  }

  const extract: BoundedExtract = bound(data)
  return {
    document: {
      ...base,
      outcome: extract.truncated ? 'PARTIAL' : 'RETRIEVED',
      extract,
      // Our own digest, over what we actually hold. A provider-supplied digest
      // would be worth nothing here, and the API supplies none.
      contentHash: hashExtract(extract),
    },
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * What a documented fetch error says about the record.
 *
 * The split is between facts about a record and facts about the run:
 *
 *   DEAD_LINK      the location resolved to nothing usable
 *   NOT_RETRIEVED  the record exists and was not obtained — blocked by policy,
 *                  or a content type this adapter cannot read
 *   capability     the request itself was refused or the provider is rate-limited
 *   failure        this adapter asked wrongly, which is our defect not a fact
 *
 * Nothing maps to non-existence, because none of these codes establishes it.
 * A 404 says a location did not resolve *now*; XR-INV-006 exists because that
 * is not the same as a record not existing.
 */
export function fetchOutcomeFor(code: FetchErrorCode): RetrievalOutcome | undefined {
  switch (code) {
    case 'url_not_accessible':
      return 'DEAD_LINK'
    case 'url_not_allowed':
    case 'unsupported_content_type':
      return 'NOT_RETRIEVED'
    case 'invalid_tool_input':
    case 'url_too_long':
    case 'url_not_in_prior_context':
    case 'too_many_requests':
    case 'max_uses_exceeded':
    case 'unavailable':
      return undefined
  }
}

/** A document describing a record that was reached for and not obtained. */
export function unobtained(
  locator: string, outcome: RetrievalOutcome, note: string,
): RetrievedDocument {
  return {
    ref: handleFor('d', 0),
    locator,
    outcome,
    observed: {},
    diagnostics: { provider: 'anthropic', note },
  }
}

/** A capability gap for a provider-side condition, with no provider prose. */
export function retrievalCapability(
  operation: string,
  reason: 'NOT_SUPPORTED' | 'EXHAUSTED' | 'REFUSED_FOR_INPUT',
  detail: string, resolvedBy: string,
): CapabilityUnavailable {
  return unavailable(operation, reason, detail, resolvedBy)
}

/** An ISO 8601 instant, checked rather than trusted. */
function isoDateTime(value: unknown): string | undefined {
  const raw = text(value)
  if (raw === undefined) return undefined
  return /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : undefined
}

/** A provider can put anything in a string; a note quotes only a little. */
const clip = (value: string): string =>
  value.length <= 120 ? value : `${value.slice(0, 117)}…`
