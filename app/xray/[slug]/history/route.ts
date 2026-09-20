/**
 * GET /xray/{slug}/history — public version lineage.
 *
 * Deliberately a **separate, mutable** surface. Folding lineage into the exact
 * version document would make `/xray/{slug}/v2` change the day v3 is
 * published, and "creating version N+1 cannot change version N" would stop
 * being true.
 *
 * Only versions with at least one publication event appear. A committed but
 * never-published version is invisible here and costs no canonical read, so
 * its existence cannot be inferred from what is missing.
 *
 * Never cached: a publication or withdrawal must show on the next request.
 */

import { lineageDocument } from '@/lib/xray/publication/public-html'
import { notFound, ok, publicFailure } from '@/lib/xray/publication/public-response'
import { publicLineage } from '@/lib/xray/publication/version-lineage'

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await context.params
  try {
    const lineage = await publicLineage(slug)
    // Unknown slug and a lineage with no public history are the same answer.
    if (lineage === undefined) return notFound()
    return ok(lineageDocument(lineage))
  } catch {
    return publicFailure()
  }
}
