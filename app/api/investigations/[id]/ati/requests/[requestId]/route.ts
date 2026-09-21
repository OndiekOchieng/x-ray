/** GET /api/investigations/{id}/ati/requests/{requestId} — one request's action surface. */
import { readRequest } from '@/lib/xray/application/ati-routes'
import { handle, ok } from '@/lib/xray/application/http'

export async function GET(
  _request: Request, context: { params: Promise<{ id: string; requestId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, requestId } = await context.params
    return ok(await readRequest(id, requestId))
  })
}
