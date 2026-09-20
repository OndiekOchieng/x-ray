/**
 * POST /api/investigations — submit a source URL for investigation.
 *
 * Thin by contract: parse, call the service, serialize, map errors. The id is
 * minted by the service and is never resolved from a fixture — two submissions
 * of two URLs are two investigations, and neither is the benchmark.
 */
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { getDatabase } from '@/lib/xray/application/runtime'
import { created, handle, jsonBody, optionalString, requiredString } from '@/lib/xray/application/http'

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = await jsonBody(request)
    const sourceUrl = requiredString(body, 'sourceUrl')
    const focus = optionalString(body, 'focus')
    const service = new InvestigationService(await getDatabase())
    return created(await service.createInvestigation({ sourceUrl, ...(focus ? { focus } : {}) }))
  })
}
