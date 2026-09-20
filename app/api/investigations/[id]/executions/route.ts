/**
 * POST /api/investigations/{id}/executions — start an inline execution.
 *
 * Returns the run's real identifier and its durable status. With no adapter
 * configured the run is `CAPABILITY_BLOCKED` with its gaps journalled, which
 * is the honest answer rather than a fabricated success.
 */
import { InlineExecutionService } from '@/lib/xray/application/inline-execution'
import { getDatabase, getExecutionRuntime } from '@/lib/xray/application/runtime'
import { created, handle } from '@/lib/xray/application/http'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params
    const service = new InlineExecutionService(await getDatabase(), await getExecutionRuntime())
    return created(await service.startExecution(id))
  })
}
