/**
 * POST /api/investigations/{id}/ati/requests/{requestId}/exports
 *
 * Freeze one exact revision for a person to file. Not a filing.
 */
import { exportRevision } from '@/lib/xray/application/ati-routes'
import { created, handle } from '@/lib/xray/application/http'

export async function POST(
  request: Request, context: { params: Promise<{ id: string; requestId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, requestId } = await context.params
    return created(await exportRevision(request, id, requestId))
  })
}
