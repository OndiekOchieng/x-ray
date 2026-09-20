/**
 * Public responses, with their statuses and cache posture.
 *
 * **No response declares itself permanently immutable.** The same exact URL can
 * become a tombstone the moment a principal withdraws it, so an `immutable` or
 * year-long directive on the route response would keep serving a withdrawn
 * X-Ray (ADR-0016, section J). The long-lived cache is the internal projection
 * function, not the response.
 *
 * Nothing here carries an internal message. A public caller sees a status and
 * a document; storage detail, query text and exception messages stay inside.
 */

const HTML = 'text/html; charset=utf-8'

/** Presentation state changes must be visible on the next request. */
const FRESH = 'no-store'

export const ok = (html: string): Response =>
  new Response(html, { status: 200, headers: { 'content-type': HTML, 'cache-control': FRESH } })

/**
 * A withdrawn address answers 410, never 404.
 *
 * 404 would pretend the statement never existed and leave a reader holding a
 * citation to conclude whatever they like.
 */
export const gone = (html: string): Response =>
  new Response(html, { status: 410, headers: { 'content-type': HTML, 'cache-control': FRESH } })

/**
 * One outcome for every not-public case.
 *
 * Unknown slug, draft lineage, committed-but-unpublished version and
 * never-published exact version are indistinguishable here by design.
 */
export const notFound = (): Response =>
  new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': FRESH },
  })

/** An outage is not an absence, and it says nothing about what failed. */
export const publicFailure = (): Response =>
  new Response('This page is temporarily unavailable.', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': FRESH },
  })
