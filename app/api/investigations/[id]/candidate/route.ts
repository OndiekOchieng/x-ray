/**
 * GET /api/investigations/{id}/candidate?executionRunId=...
 *
 * `executionRunId` is required. There is deliberately no "latest run": working
 * state belongs to one execution, and guessing which would serve one run's
 * evidence under another's name.
 *
 * The response stays labelled `CANDIDATE`. It is never substituted by a
 * committed version when the workspace is missing — a missing candidate is a
 * 404, because published state is not an answer to a question about working
 * state.
 */
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { getDatabase } from '@/lib/xray/application/runtime'
import { handle, ok, requiredQuery } from '@/lib/xray/application/http'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params
    const executionRunId = requiredQuery(request, 'executionRunId')
    const service = new InvestigationService(await getDatabase())
    return ok(await service.getCandidate(id, executionRunId))
  })
}
