/**
 * Search → retrieve sequencing (#20 slice 20d).
 *
 * WHY THIS EXISTS
 * ===============
 * A search result is not material. The documented `web_search_result` carries
 * a url, a title and an opaque `encrypted_content` no client can read, so 20c
 * maps it to `NOT_RETRIEVED` — a record identified, not obtained. Handing that
 * to `TRACE` as though it were readable would let a stage draw a proposition
 * from a record nobody read, which is exactly the state XR-INV-006 exists to
 * catch.
 *
 * So discovery and obtaining are two steps, in that order, and this is the
 * only place they are joined.
 *
 * WHAT IT GUARANTEES
 * ==================
 * Every document that leaves here is either
 *
 *   - inspectable — `RETRIEVED` or `PARTIAL` with an extract, because it was
 *     actually fetched; or
 *   - honestly unobtained — carrying its locator and its outcome, with **no
 *     extract**, so `isInspectable` is false and the gap is visible.
 *
 * The second kind is deliberately kept rather than dropped. A record that was
 * found and could not be read is a research fact: dropping it would make the
 * search look narrower than it was, and XR-INV-006 turns on the extent of the
 * search. Missing evidence is not negative evidence, and an unreadable record
 * is neither.
 *
 * WHAT IT DOES NOT DO
 * ===================
 * It mints nothing canonical, decides no `evidenceClass`, and reads no
 * provider prose. Handles stay exactly as the search issued them, so a
 * retrieved document is the same record the search found — not a new one.
 *
 * PURITY: depends on the retrieval port only. No SDK, no prompt, no domain
 * artifact.
 */

import { isAvailable, isUnavailable, AdapterFailure } from '@/lib/xray/capability'
import type { CapabilityUnavailable } from '@/lib/xray/capability'
import type {
  ResearchAdapter, RetrievalQuery, RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import { isInspectable } from '@/lib/xray/pipeline/retrieval-port'

/** How many discovered records one query will try to obtain. */
export const DEFAULT_RETRIEVE_LIMIT = 5

export interface GatheredMaterial {
  /** Every record the query reached for, readable and not. */
  readonly documents: readonly RetrievedDocument[]
  /** The queries actually run, for `TraceInput.queriesAttempted`. */
  readonly queries: readonly RetrievalQuery[]
  /** True when discovery reported it stopped early. Never `false`. */
  readonly moreAvailable?: boolean
  /** Counts for the journal. Non-canonical. */
  readonly stats: {
    readonly discovered: number
    readonly obtained: number
    readonly unobtained: number
    /** Records discovery found but the retrieve budget did not reach. */
    readonly notAttempted: number
  }
}

/**
 * Discover records for a query, then obtain what can be obtained.
 *
 * A retrieval failure for one record is not a failure of the gather: the
 * record stays in the result as unobtained. A `search` failure *is* propagated
 * — if discovery did not run, there is nothing to be honest about yet.
 */
export async function gatherMaterial(
  adapter: ResearchAdapter,
  query: RetrievalQuery,
  limit: number = DEFAULT_RETRIEVE_LIMIT,
): Promise<GatheredMaterial | { readonly unavailable: CapabilityUnavailable }> {
  const found = await adapter.search(query)
  if (isUnavailable(found)) return { unavailable: found }

  const discovered = found.value.documents
  const documents: RetrievedDocument[] = []
  let obtained = 0
  let unobtained = 0
  let notAttempted = 0

  for (const document of discovered) {
    // Already readable: a provider that obtained content during discovery has
    // nothing left to fetch.
    if (isInspectable(document)) {
      documents.push(document)
      obtained += 1
      continue
    }

    if (document.locator === undefined || obtained + unobtained >= limit) {
      // No locator to fetch, or the budget is spent. Kept as unobtained: the
      // record was found, and that is true whether or not we read it.
      documents.push(document)
      if (document.locator === undefined) unobtained += 1
      else notAttempted += 1
      continue
    }

    documents.push(await obtain(adapter, document))
    if (isInspectable(documents[documents.length - 1]!)) obtained += 1
    else unobtained += 1
  }

  return {
    documents,
    queries: [query],
    ...(found.value.moreAvailable === true ? { moreAvailable: true } : {}),
    stats: { discovered: discovered.length, obtained, unobtained, notAttempted },
  }
}

/**
 * Obtain one discovered record, keeping the handle discovery issued.
 *
 * The handle is the search's, not the retrieve's. `retrieve` mints its own
 * because it can be called on its own, but here the two calls are about the
 * *same* record — and a proposal citing `ref:s3` must mean the third thing the
 * search found, before and after it was fetched.
 */
async function obtain(
  adapter: ResearchAdapter, discovered: RetrievedDocument,
): Promise<RetrievedDocument> {
  const locator = discovered.locator!

  let fetched
  try {
    fetched = await adapter.retrieve(locator)
  } catch (err) {
    /*
     * A transport failure on one record must not lose the other nine. The
     * record stays unobtained with the reason recorded — and a `PERMANENT`
     * failure is not swallowed silently, it is what the note says.
     */
    return unreadable(discovered, err instanceof AdapterFailure
      ? `retrieval failed (${err.disposition.toLowerCase()}): ${err.message}`
      : 'retrieval failed')
  }

  if (isUnavailable(fetched)) {
    return unreadable(discovered, `retrieval was unavailable: ${fetched.detail}`)
  }

  const document = fetched.value
  return {
    ...document,
    // Discovery's handle, and discovery's locator where the fetch reported
    // none — never a handle the provider influenced.
    ref: discovered.ref,
    locator: document.locator ?? locator,
    observed: {
      // Discovery and retrieval may each know part of the metadata. Retrieval
      // wins where both have a value: it read the document.
      ...discovered.observed,
      ...document.observed,
    },
    diagnostics: {
      ...discovered.diagnostics,
      ...document.diagnostics,
      note: [discovered.diagnostics?.note, document.diagnostics?.note]
        .filter((entry): entry is string => entry !== undefined && entry !== '')
        .join('; ') || undefined,
    },
  }
}

/** The discovered record, still unobtained, with the reason recorded. */
function unreadable(discovered: RetrievedDocument, why: string): RetrievedDocument {
  const note = [discovered.diagnostics?.note, why]
    .filter((entry): entry is string => entry !== undefined && entry !== '').join('; ')
  return {
    ...discovered,
    // Whatever went wrong, the record was not obtained. Never an outcome that
    // implies content, and never one that implies the record does not exist.
    outcome: discovered.outcome === 'DEAD_LINK' ? 'DEAD_LINK' : 'NOT_RETRIEVED',
    diagnostics: { ...discovered.diagnostics, note },
  }
}
