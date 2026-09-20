/**
 * POST /api/investigations/{id}/executions/{runId}/resume
 *
 * Two shapes, both built in 8b:
 *
 *   {}                          continue unfinished work
 *   { "revision": { ... } }     reopen a completed run and route it back
 *
 * Only the public fields of a revision are parsed. `RevisionRequest` is the
 * Reviewer's internal object, and accepting it wholesale would let a caller
 * assert review findings it never made.
 */
import { RESEARCH_STAGES } from '@/lib/xray/pipeline/stages'
import type { ResearchStage } from '@/lib/xray/domain'
import type { RevisionRequest, ReviewTarget, ReviewTargetKind } from '@/lib/xray/review'
import { InlineExecutionService } from '@/lib/xray/application/inline-execution'
import { getDatabase, getExecutionRuntime } from '@/lib/xray/application/runtime'
import {
  BadRequest, handle, jsonBody, ok, optionalString, requiredString,
} from '@/lib/xray/application/http'

const TARGET_KINDS: readonly ReviewTargetKind[] = [
  'Claim', 'Source', 'Evidence', 'EvidenceProvenance',
  'Discrepancy', 'Disconfirmation', 'Finding', 'Gap',
]

function parseTargets(raw: unknown): ReviewTarget[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new BadRequest('revision.targets', 'targets must be an array')
  return raw.map((entry) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry))
      throw new BadRequest('revision.targets', 'each target must be an object')
    const target = entry as Record<string, unknown>
    const kind = target.kind
    if (typeof kind !== 'string' || !(TARGET_KINDS as readonly string[]).includes(kind))
      throw new BadRequest('revision.targets', 'each target needs a known kind')
    if (typeof target.id !== 'string' || !target.id.trim())
      throw new BadRequest('revision.targets', 'each target needs an id')
    return { kind: kind as ReviewTargetKind, id: target.id }
  })
}

function parseRevision(body: Record<string, unknown>): RevisionRequest | undefined {
  const raw = body.revision
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new BadRequest('revision', 'revision must be an object')
  const revision = raw as Record<string, unknown>

  const stage = requiredString(revision, 'stage')
  // A revision routes to a research stage. `VALIDATE` and `REVIEW` are control
  // gates: the Reviewer is the inspector, not the repair step (ADR-0011).
  if (!(RESEARCH_STAGES as readonly string[]).includes(stage))
    throw new BadRequest('revision.stage', 'stage must be a research stage')

  return {
    id: optionalString(revision, 'id') ?? `RR-${stage}`,
    findingId: requiredString(revision, 'findingId'),
    stage: stage as ResearchStage,
    action: requiredString(revision, 'action'),
    targets: parseTargets(revision.targets),
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
): Promise<Response> {
  return handle(async () => {
    const { id, runId } = await context.params
    // An absent body means a bare resume; it is not a malformed request.
    const text = await request.text()
    const body = text.trim()
      ? await jsonBody(new Request(request.url, { method: 'POST', body: text }))
      : {}
    const revision = parseRevision(body)

    const service = new InlineExecutionService(await getDatabase(), await getExecutionRuntime())
    return ok(await service.resumeExecution(id, runId, revision ? { revision } : {}))
  })
}
