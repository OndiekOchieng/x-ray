/**
 * GET /xray/{slug}/v{n} — the citation-grade address.
 *
 * An exact version never means "whatever is current now". Its availability
 * follows that version's own publication history, so publishing v2 changes
 * nothing about what this address serves for v1.
 *
 * The route is not a cache boundary. Publication state is resolved fresh on
 * every request and only the immutable projection beneath it is cached, which
 * is why a withdrawal shows on the next request with no invalidation call.
 */

import { getDatabase } from '@/lib/xray/application/runtime'
import { resolveSlug } from '@/lib/xray/persistence/publication'
import { publishedDocument, tombstoneDocument } from '@/lib/xray/publication/public-html'
import { gone, notFound, ok, publicFailure } from '@/lib/xray/publication/public-response'
import {
  parseVersionSegment, publicProjections, resolvePublicAddress,
} from '@/lib/xray/publication/public-page'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; version: string }> },
): Promise<Response> {
  const { slug, version: segment } = await context.params
  const version = parseVersionSegment(segment)
  if (version === undefined) return notFound()

  try {
    const presentation = await resolvePublicAddress(slug, version)
    if (presentation.kind === 'NOT_PUBLIC') return notFound()

    if (presentation.kind === 'WITHDRAWN') {
      return gone(tombstoneDocument({
        slug: presentation.slug,
        version: presentation.version,
        reason: presentation.reason,
        withdrawnAt: presentation.withdrawnAt,
        ...(presentation.note === undefined ? {} : { note: presentation.note }),
      }))
    }

    const owner = await resolveSlug(await getDatabase(), slug)
    if (owner === undefined) return notFound()

    const projections = await publicProjections()
    const [view, assurance] = await Promise.all([
      projections.versionProjection(owner.investigationId, presentation.version),
      projections.assurance(
        presentation.authorizingExecutionRunId, presentation.authorizingGraduationIndex),
    ])
    return ok(publishedDocument(slug, view, assurance))
  } catch {
    return publicFailure()
  }
}
