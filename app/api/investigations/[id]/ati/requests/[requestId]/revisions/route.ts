/**
 * POST /api/investigations/{id}/ati/requests/{requestId}/revisions
 *
 * Add a revision. An edit never rewrites what was already exported.
 */
import { reviseDraft } from '@/lib/xray/application/ati-routes'
import { created, handle } from '@/lib/xray/application/http'

export async function POST(
  request: Request, context: { params: Promise<{ id: string; requestId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, requestId } = await context.params
    return created(await reviseDraft(request, id, requestId))
  })
}
