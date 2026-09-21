/**
 * POST /api/investigations/{id}/ati/requests/{requestId}/responses
 *
 * Record a response and whatever arrived with it.
 */
import { recordResponse } from '@/lib/xray/application/ati-routes'
import { created, handle } from '@/lib/xray/application/http'

export async function POST(
  request: Request, context: { params: Promise<{ id: string; requestId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, requestId } = await context.params
    return created(await recordResponse(request, id, requestId))
  })
}
