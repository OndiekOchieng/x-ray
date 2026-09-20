/**
 * GET /api/investigations/{id}/versions/{version}
 *
 * An explicit version number, reconstructed from the immutable version tables.
 * The response stays labelled `COMMITTED_VERSION`, and an unknown version is a
 * 404 rather than the nearest one that exists.
 */
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { getDatabase } from '@/lib/xray/application/runtime'
import { handle, ok, versionNumber } from '@/lib/xray/application/http'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; version: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, version } = await context.params
    const service = new InvestigationService(await getDatabase())
    return ok(await service.getCommittedVersion(id, versionNumber(version)))
  })
}
