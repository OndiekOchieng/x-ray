/**
 * GET  /api/investigations/{id}/ati/requests?version=N&gapId=G — requests for one exact gap.
 * POST /api/investigations/{id}/ati/requests                   — create a draft.
 *
 * The query parameters are required, not defaulted: a request is anchored to an
 * exact version and an exact gap, and guessing either would serve one gap's
 * requests under another's name.
 */
import { createDraft, listRequestsForGap } from '@/lib/xray/application/ati-routes'
import { created, handle, ok } from '@/lib/xray/application/http'

export async function GET(
  request: Request, context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params
    return ok(await listRequestsForGap(request, id))
  })
}

export async function POST(
  request: Request, context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params
    return created(await createDraft(request, id))
  })
}
