/**
 * POST /api/investigations/{id}/ati/requests/{requestId}/closure
 *
 * Close the request thread. Administrative, and says nothing about the gap.
 */
import { closeRequest } from '@/lib/xray/application/ati-routes'
import { created, handle } from '@/lib/xray/application/http'

export async function POST(
  request: Request, context: { params: Promise<{ id: string; requestId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, requestId } = await context.params
    return created(await closeRequest(request, id, requestId))
  })
}
