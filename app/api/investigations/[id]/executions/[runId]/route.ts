/**
 * GET /api/investigations/{id}/executions/{runId} — persisted run status.
 *
 * The run must belong to the investigation in the path. A run addressed under
 * the wrong owner is not found, not redirected.
 */
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { getDatabase } from '@/lib/xray/application/runtime'
import { handle, ok } from '@/lib/xray/application/http'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, runId } = await context.params
    const service = new InvestigationService(await getDatabase())
    return ok(await service.getExecutionStatus(id, runId))
  })
}
