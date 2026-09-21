/**
 * POST /api/investigations/{id}/ati/requests/{requestId}/submission
 *
 * Record that a person filed one exact export. Never inferred.
 */
import { confirmSubmission } from '@/lib/xray/application/ati-routes'
import { created, handle } from '@/lib/xray/application/http'

export async function POST(
  request: Request, context: { params: Promise<{ id: string; requestId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, requestId } = await context.params
    return created(await confirmSubmission(request, id, requestId))
  })
}
