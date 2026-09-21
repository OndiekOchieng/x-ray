/**
 * GET  /api/investigations/{id}/ati/intakes/{intakeId}/processing — what research did.
 * POST /api/investigations/{id}/ati/intakes/{intakeId}/processing — process it.
 *
 * The POST requires the material: 10c retained no document body, so research
 * cannot begin from the receipt alone. There is deliberately no endpoint that
 * turns a receipt into a Source — that link is a result of research committing
 * a version, not an operator's declaration.
 */
import { processIntake, readIntakeProcessing } from '@/lib/xray/application/ati-routes'
import { created, handle, ok } from '@/lib/xray/application/http'

export async function GET(
  _request: Request, context: { params: Promise<{ id: string; intakeId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, intakeId } = await context.params
    return ok(await readIntakeProcessing(id, intakeId))
  })
}

export async function POST(
  request: Request, context: { params: Promise<{ id: string; intakeId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, intakeId } = await context.params
    return created(await processIntake(request, id, intakeId))
  })
}
