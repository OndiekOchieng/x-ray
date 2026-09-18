/**
 * The research / retrieval adapter boundary (ADR-0010, #6 D18).
 *
 * WHAT CROSSES
 * ============
 * Material and honest metadata about reaching it. A provider reports **what it
 * reached**; the stage decides **what that means**. The adapter never mints
 * `Evidence`, never decides `evidenceClass` or `originStatus`, and never
 * declares two publications independent — all of those are stage decisions,
 * because XR-INV-004 and XR-INV-006 exist to check exactly those claims and a
 * provider asserting them would put them outside the trust boundary.
 *
 * WHAT DOES NOT CROSS
 * ===================
 * Raw provider response envelopes, SDK objects, prompts and transport metadata
 * (D18). `ProviderDiagnostics` is the one channel for execution detail, and it
 * is explicitly non-canonical: nothing in it may reach graph state.
 *
 * LIFETIME
 * ========
 * Retrieved content is in-memory execution material for the duration of a run.
 * 6b invents no storage and no retention period; persistence is #7 (D18).
 *
 * PURITY: types only, plus one hash helper. No SDK, no `fetch`, no prompt.
 */

import type { IsoDateOrDateTime, IsoDateTime, SourceAccessibility } from '@/lib/xray/domain'
import type { CapabilityResult } from '@/lib/xray/capability'
import type { ProposalRef } from './proposals'

/**
 * What happened when the adapter tried to reach a record.
 *
 * Deliberately identical to `SourceAccessibility`, which already enumerates
 * exactly the five outcomes ADR-0010 requires and already forbids a
 * `DOES_NOT_EXIST` member. Aliasing rather than redeclaring means the two
 * cannot drift, and a stage mapping one to the other cannot silently lose a
 * state.
 *
 * The adapter reports the outcome. The stage checks it — that is what keeps
 * XR-INV-006 enforceable against a provider with an incentive to look
 * productive.
 */
export type RetrievalOutcome = SourceAccessibility

/** Cap on inspected content crossing the boundary, in UTF-16 code units. */
export const MAX_EXTRACT_LENGTH = 200_000

/**
 * Bounded inspected content.
 *
 * Bounded because the stage needs enough passage to decide quotability and to
 * anchor `locationInSource`, not an entire document. `truncated` is not
 * cosmetic: a stage that quotes from a truncated extract must know it was
 * reading part of a record.
 */
export interface BoundedExtract {
  text: string
  truncated: boolean
  /** Length of the full content the provider held, where it knows it. */
  fullLength?: number
  /** Where in the document the extract begins, e.g. a page or section. */
  locator?: string
}

/** Observable facts about a document. No classification, no judgment. */
export interface ObservedDocumentMetadata {
  title?: string
  publisher?: string
  institution?: string
  author?: string
  publishedAt?: IsoDateOrDateTime
  mediaType?: string
  /**
   * Records this document names as its own source.
   *
   * Raw attribution as printed, not a lineage decision. `PROVENANCE` reads it
   * and decides `SourceDependency` and `EvidenceProvenance`; the adapter is
   * only reporting what the page says.
   */
  attributedTo?: readonly string[]
}

/**
 * Non-canonical execution detail.
 *
 * For journals, cost accounting and debugging. Nothing here may enter graph
 * state, which is why it is a separate field rather than loose properties on
 * the document.
 */
export interface ProviderDiagnostics {
  provider?: string
  /** Opaque provider-side request identifier, for support conversations. */
  requestId?: string
  latencyMs?: number
  note?: string
}

/** One record the adapter reached, or tried to. */
export interface RetrievedDocument {
  /** Stage-issued handle. Not a canonical id, and cannot become one. */
  ref: ProposalRef
  /** Canonical location, where one exists. */
  locator?: string
  outcome: RetrievalOutcome
  retrievedAt?: IsoDateTime
  observed: ObservedDocumentMetadata
  /**
   * Inspected content, when any was obtained.
   *
   * Absent for `NOT_LOCATED` and `DEAD_LINK`, and normally absent for
   * `NOT_RETRIEVED` — a record identified but not obtained has no content to
   * carry, which is the distinction XR-INV-006 turns on.
   */
  extract?: BoundedExtract
  /**
   * Content digest as the provider computed it.
   *
   * Advisory. The stage may recompute it from the extract with `hashExtract`,
   * and the stage's own value is authoritative where both exist — a digest is
   * only worth anything if whoever relies on it computed it.
   */
  contentHash?: string
  diagnostics?: ProviderDiagnostics
}

/** What the stage asked for. Echoed back so the request is auditable. */
export interface RetrievalQuery {
  /** Plain search terms or a direct locator. */
  terms: string
  /** Narrowing the stage applied, e.g. a jurisdiction or publisher. */
  constraints?: readonly string[]
  /**
   * Evidence after this date is out of scope for the investigation.
   *
   * Carried so a provider cannot return post-cutoff material the stage then
   * has to notice and discard — and so that a provider ignoring it is visible.
   */
  researchCutoffAt?: string
  maxResults?: number
}

export interface RetrievalResult {
  query: RetrievalQuery
  documents: readonly RetrievedDocument[]
  /**
   * True when the provider believes more material exists beyond `maxResults`.
   *
   * Feeds 6c's stop assessment: "we stopped looking" and "there was nothing
   * left" are different research results.
   */
  moreAvailable?: boolean
  diagnostics?: ProviderDiagnostics
}

export type ResearchAdapterOperation = 'search' | 'retrieve'

/**
 * The retrieval port. No implementation ships in 6b.
 *
 * Note what it does NOT expose: no free-form provider call, no way to ask for
 * "evidence". Every operation returns material and metadata, and every
 * operation may report that it cannot run.
 */
export interface ResearchAdapter {
  readonly name: string
  /**
   * Operations this adapter claims to support.
   *
   * Advisory. A caller must still handle `UNAVAILABLE` at runtime, because
   * capability depends on quota, content type and execution context, not only
   * on what the adapter was built to do.
   */
  readonly capabilities?: readonly ResearchAdapterOperation[]

  /** Discover records matching a query. */
  search(query: RetrievalQuery): Promise<CapabilityResult<RetrievalResult>>

  /** Obtain one known record. */
  retrieve(locator: string): Promise<CapabilityResult<RetrievedDocument>>
}

// ---------------------------------------------------------------------------
// Stage-side helpers
// ---------------------------------------------------------------------------

/** FNV-1a over the extract. The stage's own digest, computed from what it got. */
export function hashExtract(extract: BoundedExtract): string {
  let h = 0x811c9dc5
  for (let i = 0; i < extract.text.length; i += 1) {
    h ^= extract.text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `sha_fnv_${h.toString(16).padStart(8, '0')}_${extract.text.length.toString(36)}${extract.truncated ? '_t' : ''}`
}

/**
 * Whether a proposition may be drawn from this document at all.
 *
 * The stage-side half of XR-INV-006. A record that was never obtained has no
 * content to read, so evidence cannot come from it — and its absence is not
 * evidence of anything, which is why `NOT_LOCATED` yields a `Gap` rather than
 * a negative fact.
 */
export function isInspectable(document: RetrievedDocument): boolean {
  return (
    (document.outcome === 'RETRIEVED' || document.outcome === 'PARTIAL') &&
    document.extract !== undefined
  )
}

/** Whether a passage from this document may be quoted into canonical state. */
export function isQuotable(document: RetrievedDocument): boolean {
  return isInspectable(document)
}

/** Clamp content to the boundary limit, marking it truncated when clamped. */
export function bound(text: string, locator?: string): BoundedExtract {
  const truncated = text.length > MAX_EXTRACT_LENGTH
  return {
    text: truncated ? text.slice(0, MAX_EXTRACT_LENGTH) : text,
    truncated,
    fullLength: text.length,
    ...(locator !== undefined ? { locator } : {}),
  }
}
