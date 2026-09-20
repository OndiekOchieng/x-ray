/**
 * GET /api/investigations/{id}/versions — committed version history.
 *
 * `latestCommittedVersion` is reported as storage records it: the latest
 * committed version, not "the published one" and not "current truth". What is
 * public is #9's question, and answering it here would put a publication
 * decision in a retrieval route.
 */
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { getDatabase } from '@/lib/xray/application/runtime'
import { handle, ok } from '@/lib/xray/application/http'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params
    const service = new InvestigationService(await getDatabase())
    return ok(await service.listVersions(id))
  })
}
