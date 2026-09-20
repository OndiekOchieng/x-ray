/**
 * GET /xray/{slug} — the public alias.
 *
 * A convenience address for whatever a principal currently presents. The
 * citation-grade address is the exact version, so a published alias redirects
 * there rather than serving a second copy of the same version under a moving
 * URL.
 *
 * **307, never 308.** A permanent redirect is cached by clients and
 * intermediaries and would outlive a withdrawal — the same failure as caching
 * the response itself.
 *
 * Presentation state is resolved fresh on every request. Only the immutable
 * projection underneath is cached (ADR-0016).
 */

import { tombstoneDocument } from '@/lib/xray/publication/public-html'
import { gone, notFound, publicFailure } from '@/lib/xray/publication/public-response'
import { resolvePublicAddress } from '@/lib/xray/publication/public-page'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params
  let presentation
  try {
    presentation = await resolvePublicAddress(slug)
  } catch {
    // An outage is not an absence. It must never become "not public".
    return publicFailure()
  }

  // Unknown slug, draft lineage, never-published version: one outcome, and
  // nothing in the response distinguishes them.
  if (presentation.kind === 'NOT_PUBLIC') return notFound()

  // Rendered at the alias, not redirected to a predecessor: falling back would
  // resurrect a version the principal may also not stand behind.
  if (presentation.kind === 'WITHDRAWN') {
    return gone(tombstoneDocument({
      slug: presentation.slug,
      version: presentation.version,
      reason: presentation.reason,
      withdrawnAt: presentation.withdrawnAt,
      ...(presentation.note === undefined ? {} : { note: presentation.note }),
    }))
  }

  return new Response(null, {
    status: 307,
    headers: {
      location: `/xray/${slug}/v${presentation.version}`,
      'cache-control': 'no-store',
    },
  })
}
