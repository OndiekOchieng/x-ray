/**
 * GET  /api/investigations/{id}/versions — committed version history.
 * POST /api/investigations/{id}/versions — graduate a finished run.
 *
 * `latestCommittedVersion` is reported as storage records it: the latest
 * committed version, not "the published one" and not "current truth". What is
 * public is #9's question, and answering it here would put a publication
 * decision in a retrieval route.
 */
import { InvestigationService } from '@/lib/xray/application/investigation-service'
import { GraduationService } from '@/lib/xray/application/graduation-service'
import { graduateRun } from '@/lib/xray/application/assessment'
import { getDatabase } from '@/lib/xray/application/runtime'
import { created, handle, jsonBody, ok, requiredString } from '@/lib/xray/application/http'

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

/**
 * Graduate a finished execution run into an immutable version.
 *
 * The step a first investigation had no route for. `expectedPredecessor` comes
 * from storage rather than the caller: the caller may say which run to
 * graduate, but not what it supersedes — that is a fact about the
 * investigation, and letting a request assert it would be letting a request
 * choose which version it overwrites.
 *
 * A candidate that is not eligible is reported as such, with the assessment's
 * reasons. It is a normal outcome, not an error: a live run whose PROVENANCE
 * reported a capability gap is exactly this case.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id } = await context.params
    const body = await jsonBody(request)
    const executionRunId = requiredString(body, 'executionRunId')

    const db = await getDatabase()
    const service = new InvestigationService(db)
    const identity = await service.getInvestigation(id)

    const outcome = await graduateRun(new GraduationService(db), id, executionRunId, {
      expectedPredecessor: identity.latestCommittedVersion,
      createdAt: new Date().toISOString(),
    })
    return outcome.result === 'COMMITTED' ? created(outcome) : ok(outcome)
  })
}
