/**
 * Existence, decided before the response is committed (#11 slice 11b).
 *
 * WHY A PROXY AND NOT `notFound()`
 * ================================
 * 11a found unknown investigation and gap ids returning HTTP **200** with the
 * 404 only inside the streamed payload. That is not a bug in the pages: under
 * `cacheComponents`, a page's static shell is flushed before its dynamic holes
 * resolve, so by the time a loader answers "no such id" the status line is
 * already sent. `notFound()` from the component *or* from `generateMetadata`
 * cannot change it, and `dynamic = 'force-dynamic'` is rejected outright as
 * incompatible with `cacheComponents`.
 *
 * The proxy runs before anything is committed, so this is where a real status
 * can still be chosen. It answers one question — does this id exist — and
 * rewrites to the not-found route when it does not.
 *
 * KEPT DELIBERATELY CHEAP
 * =======================
 * One `SELECT` for an investigation, an in-memory lookup for a gap, and only
 * on the two dynamic routes that need it. Nothing else is intercepted, no
 * projection is built, and a storage failure is **not** treated as absence: if
 * the probe cannot answer, the request proceeds and the page reports
 * unavailability itself. Turning an outage into a 404 would tell a reader the
 * investigation does not exist.
 */

import { NextResponse, type NextRequest } from 'next/server'

/*
 * No route segment config: a proxy always runs on the Node.js runtime, and
 * Next rejects `config` here. The path filter is the first thing the handler
 * does instead.
 */

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const investigation = /^\/investigations\/([^/]+)$/.exec(pathname)
  const gap = /^\/gap\/([^/]+)$/.exec(pathname)
  if (!investigation && !gap) return NextResponse.next()

  const id = decodeURIComponent((investigation ?? gap)![1])
  let exists: boolean
  try {
    exists = investigation ? await investigationExists(id) : await gapExists(id)
  } catch {
    // Could not answer. Absence is not the same as unreachable, so let the
    // page render and say so itself.
    return NextResponse.next()
  }

  return exists ? NextResponse.next() : notFoundResponse(request)
}

async function investigationExists(id: string): Promise<boolean> {
  const { getInvestigationGraph } = await import('@/lib/xray/investigations')
  return (await getInvestigationGraph(id)) !== null
}

async function gapExists(id: string): Promise<boolean> {
  const { getGapPayload } = await import('@/lib/xray/investigations')
  return getGapPayload(id) !== null
}

/**
 * Rewrite to the not-found route with a 404 status.
 *
 * A rewrite rather than a bare 404 body, so the reader gets the application's
 * own not-found page instead of a blank response — with the status line that
 * was missing.
 */
function notFoundResponse(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/_not-found'
  return NextResponse.rewrite(url, { status: 404 })
}
