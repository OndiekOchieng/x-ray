/**
 * Transport for the ATI action lifecycle (#10 slice 10e §B).
 *
 * WHAT THESE HANDLERS DO
 * ======================
 * Parse input, call `ATIActionService` or `ATIResearchBridge`, serialize the
 * surface projection, map a typed error. Nothing else.
 *
 * WHAT NO ROUTE EXPOSES
 * =====================
 * `recordExport`, `recordResponse` and `acceptIntakeSource` as persistence
 * primitives; arbitrary version commit; arbitrary re-evaluation audit
 * insertion. There is no endpoint that writes an intake→Source link, because
 * that link is a *result* of research committing a version — an operator
 * cannot declare an intake to be `SRC-123`, and the absence of a route is how
 * that is enforced rather than a validation somewhere.
 *
 * Every semantic decision stays in the services and in the database's own
 * constraints. A route that decided anything would become a second, divergent
 * reading of the same rules.
 */

import type { CustodyBasis } from '@/lib/xray/domain'
import { readSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import { readRunsForIntake } from '@/lib/xray/persistence/execution-cause'
import {
  atiProcessingSurface, atiRequestSurface,
  type ATIProcessingSurface, type ATIRequestSurface,
} from '@/lib/xray/projections/ati-surface'
import {
  ATIActionRejected, ATIActionService,
  type ClosureAssertion, type IntakeAssertion, type ResponseAssertion,
  type SubmissionAssertion, type SuppliedHolderContext,
} from './ati-service'
import {
  ATIResearchBridge, IntakeProcessingRejected, type ATIIntakeMaterial,
} from './ati-research-bridge'
import { InlineExecutionService } from './inline-execution'
import { InvestigationResourceNotFound } from './investigation-service'
import { getDatabase, getExecutionRuntime } from './runtime'
import {
  BadRequest, jsonBody, optionalString, requiredQuery, requiredString, versionNumber,
} from './http'

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

interface ATIHost {
  db: SnapshotDatabase
  action: ATIActionService
  bridge: ATIResearchBridge
}

async function host(): Promise<ATIHost> {
  const db = await getDatabase()
  const action = new ATIActionService(db)
  const bridge = new ATIResearchBridge(
    db, new InlineExecutionService(db, await getExecutionRuntime()))
  return { db, action, bridge }
}

/**
 * Build the surface for one request, refusing to serve it under the wrong
 * investigation.
 *
 * A request belongs to exactly one investigation, so `{id}` in the path is a
 * claim the route checks rather than decoration.
 */
async function surfaceFor(
  { db, action }: ATIHost, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const lifecycle = await action.readLifecycle(requestId)
  if (lifecycle === undefined || lifecycle.investigationId !== investigationId)
    throw new InvestigationResourceNotFound('ATI_REQUEST', requestId)

  const latest = (await db.query(
    'SELECT latest_committed_version FROM investigations WHERE id=$1',
    [investigationId])).rows
  const latestCommittedVersion = latest.length === 1
    ? latest[0].latest_committed_version as number | null : null

  // The gap as the ORIGIN version recorded it, never the latest.
  const snapshot = await readSnapshot(db, investigationId, lifecycle.originVersion)
  const gap = snapshot.index.gap.get(lifecycle.gapId)
  if (gap === undefined)
    throw new InvestigationResourceNotFound('GAP', lifecycle.gapId)

  return atiRequestSurface(lifecycle, {
    originGap: {
      gapId: gap.id, resolutionPath: gap.resolutionPath,
      atiEligible: gap.atiEligible, status: gap.status,
    },
    latestCommittedVersion,
  })
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every request anchored to one exact gap at one exact version. */
export async function listRequestsForGap(
  request: Request, investigationId: string,
): Promise<{ requests: readonly ATIRequestSurface[] }> {
  const context = await host()
  const originVersion = versionNumber(requiredQuery(request, 'version'))
  const gapId = requiredQuery(request, 'gapId')
  const ids = await context.action.listRequestsForGap(
    { investigationId, originVersion, gapId })
  const requests: ATIRequestSurface[] = []
  for (const id of ids) requests.push(await surfaceFor(context, investigationId, id))
  return { requests }
}

export async function readRequest(
  investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  return surfaceFor(await host(), investigationId, requestId)
}

/**
 * What research has done with one received record.
 *
 * Reads the durable execution cause, so a run that added nothing is still
 * reported as a run rather than as an absence.
 */
export async function readIntakeProcessing(
  investigationId: string, intakeId: string,
): Promise<{
  intakeId: string
  runs: readonly { executionRunId: string; status: string; committedVersion: number | null }[]
  outcome?: ATIProcessingSurface
}> {
  const context = await host()
  const owner = (await context.db.query(
    `SELECT r.investigation_id FROM ati_response_intakes i
       JOIN ati_requests r ON r.id = i.request_id WHERE i.intake_id=$1`, [intakeId])).rows
  if (owner.length !== 1 || owner[0].investigation_id !== investigationId)
    throw new InvestigationResourceNotFound('ATI_INTAKE', intakeId)

  const runs = await readRunsForIntake(context.db, intakeId)
  const committed = runs.find((run) => run.committedVersion !== null)
  if (committed === undefined) return { intakeId, runs }

  const accepted = (await context.db.query(
    `SELECT source_id FROM ati_intake_source_acceptances
      WHERE intake_id=$1 ORDER BY ordinal`, [intakeId])).rows
    .map((row) => row.source_id as string)
  return {
    intakeId, runs,
    outcome: atiProcessingSurface({
      result: 'COMMITTED', investigationId,
      version: committed.committedVersion as number, addedSourceIds: accepted,
    }),
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const holderFrom = (body: Record<string, unknown>): SuppliedHolderContext | undefined => {
  const raw = body.holder
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw new BadRequest('holder', 'holder must be a JSON object when supplied')
  const holder = raw as Record<string, unknown>
  const basis = requiredString(holder, 'basis')
  if (basis !== 'CONFIRMED' && basis !== 'INFERRED')
    throw new BadRequest('holder.basis', 'holder.basis must be CONFIRMED or INFERRED')
  return {
    institution: requiredString(holder, 'institution'),
    ...(optionalString(holder, 'office') === undefined
      ? {} : { office: optionalString(holder, 'office')! }),
    basis: basis as CustodyBasis,
    ...(optionalString(holder, 'rationale') === undefined
      ? {} : { rationale: optionalString(holder, 'rationale')! }),
  }
}

function stringArray(body: Record<string, unknown>, field: string): readonly string[] {
  const value = body[field]
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new BadRequest(field, `${field} must be an array of strings`)
  return value as string[]
}

/** Require an explicit human affirmation, not a truthy flag. */
function humanConfirmed(body: Record<string, unknown>): true {
  if (body.humanConfirmed !== true)
    throw new BadRequest('humanConfirmed',
      'humanConfirmed must be true: only a person can state that a request was filed or closed')
  return true
}

export async function createDraft(
  request: Request, investigationId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  const body = await jsonBody(request)
  const created = await context.action.createDraft({
    investigationId,
    originVersion: versionNumber(String(body.originVersion ?? '')),
    gapId: requiredString(body, 'gapId'),
    requestedRecords: stringArray(body, 'requestedRecords'),
    publicInterestContext: requiredString(body, 'publicInterestContext'),
    ...(optionalString(body, 'investigationUrl') === undefined
      ? {} : { investigationUrl: optionalString(body, 'investigationUrl')! }),
    ...(holderFrom(body) === undefined ? {} : { holder: holderFrom(body)! }),
  })
  return surfaceFor(context, investigationId, created.requestId)
}

export async function reviseDraft(
  request: Request, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  await surfaceFor(context, investigationId, requestId)
  const body = await jsonBody(request)
  await context.action.reviseDraft(requestId, {
    requestedRecords: stringArray(body, 'requestedRecords'),
    publicInterestContext: requiredString(body, 'publicInterestContext'),
    ...(optionalString(body, 'investigationUrl') === undefined
      ? {} : { investigationUrl: optionalString(body, 'investigationUrl')! }),
    ...(holderFrom(body) === undefined ? {} : { holder: holderFrom(body)! }),
  })
  return surfaceFor(context, investigationId, requestId)
}

/** Freeze one exact revision. Emphatically not a filing. */
export async function exportRevision(
  request: Request, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  await surfaceFor(context, investigationId, requestId)
  const body = await jsonBody(request)
  await context.action.exportRevision(requestId, versionNumber(String(body.revision ?? '')))
  return surfaceFor(context, investigationId, requestId)
}

export async function confirmSubmission(
  request: Request, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  await surfaceFor(context, investigationId, requestId)
  const body = await jsonBody(request)
  const assertion: SubmissionAssertion = {
    humanConfirmed: humanConfirmed(body),
    ...(optionalString(body, 'method') === undefined
      ? {} : { method: optionalString(body, 'method')! }),
    ...(optionalString(body, 'externalReference') === undefined
      ? {} : { externalReference: optionalString(body, 'externalReference')! }),
    ...(optionalString(body, 'destination') === undefined
      ? {} : { destination: optionalString(body, 'destination')! }),
    ...(optionalString(body, 'note') === undefined
      ? {} : { note: optionalString(body, 'note')! }),
  }
  await context.action.confirmSubmitted(
    requestId, versionNumber(String(body.exportSequence ?? '')), assertion)
  return surfaceFor(context, investigationId, requestId)
}

export async function recordAcknowledgement(
  request: Request, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  await surfaceFor(context, investigationId, requestId)
  const body = await jsonBody(request)
  await context.action.acknowledge(requestId, undefined, optionalString(body, 'note'))
  return surfaceFor(context, investigationId, requestId)
}

export async function closeRequest(
  request: Request, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  await surfaceFor(context, investigationId, requestId)
  const body = await jsonBody(request)
  const assertion: ClosureAssertion = {
    humanConfirmed: humanConfirmed(body),
    reason: requiredString(body, 'reason'),
  }
  await context.action.close(requestId, assertion)
  return surfaceFor(context, investigationId, requestId)
}

/**
 * Record a response and whatever arrived with it.
 *
 * Intake ids are not accepted from the caller: `ATIActionService` allocates
 * them under the request lock, because a filename is not identity.
 */
export async function recordResponse(
  request: Request, investigationId: string, requestId: string,
): Promise<ATIRequestSurface> {
  const context = await host()
  await surfaceFor(context, investigationId, requestId)
  const body = await jsonBody(request)
  const completeness = requiredString(body, 'completeness')
  if (completeness !== 'PARTIAL' && completeness !== 'FINAL' && completeness !== 'UNSTATED')
    throw new BadRequest('completeness', 'completeness must be PARTIAL, FINAL or UNSTATED')

  const rawRecords = body.records === undefined ? [] : body.records
  if (!Array.isArray(rawRecords))
    throw new BadRequest('records', 'records must be an array when supplied')
  const intakes: IntakeAssertion[] = rawRecords.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
      throw new BadRequest(`records[${index}]`, 'each record must be a JSON object')
    const record = raw as Record<string, unknown>
    if ('intakeId' in record)
      throw new BadRequest(`records[${index}].intakeId`,
        'intake identity is allocated by X-Ray and cannot be supplied')
    return {
      describedAs: requiredString(record, 'describedAs'),
      ...(optionalString(record, 'mediaType') === undefined
        ? {} : { mediaType: optionalString(record, 'mediaType')! }),
      ...(optionalString(record, 'material') === undefined
        ? {} : { material: optionalString(record, 'material')! }),
      ...(optionalString(record, 'suppliedDigest') === undefined
        ? {} : { suppliedDigest: optionalString(record, 'suppliedDigest')! }),
    }
  })

  const assertion: ResponseAssertion = {
    receivedAt: requiredString(body, 'receivedAt'),
    completeness,
    ...(optionalString(body, 'summary') === undefined
      ? {} : { summary: optionalString(body, 'summary')! }),
    intakes,
  }
  await context.action.recordResponseReceived(requestId, assertion)
  return surfaceFor(context, investigationId, requestId)
}

/**
 * Process one received record through research.
 *
 * The material has to be supplied again, because 10c retained no document
 * body. A route that could start research from the receipt alone would be
 * pretending X-Ray still has a record it does not have.
 */
export async function processIntake(
  request: Request, investigationId: string, intakeId: string,
): Promise<ATIProcessingSurface> {
  const context = await host()
  const body = await jsonBody(request)
  const content = body.material
  if (typeof content !== 'string' || content === '')
    throw new BadRequest('material',
      'material must be supplied: X-Ray keeps a receipt for this record, not the record, so research cannot begin from the receipt alone')

  const material: ATIIntakeMaterial = {
    intakeId,
    boundedContent: content,
    truncated: body.truncated === true,
    ...(optionalString(body, 'mediaType') === undefined
      ? {} : { mediaType: optionalString(body, 'mediaType')! }),
    ...(optionalString(body, 'contentDigest') === undefined
      ? {} : { contentDigest: optionalString(body, 'contentDigest')! }),
    ...(optionalString(body, 'locator') === undefined
      ? {} : { locator: optionalString(body, 'locator')! }),
  }

  const owner = (await context.db.query(
    `SELECT r.investigation_id FROM ati_response_intakes i
       JOIN ati_requests r ON r.id = i.request_id WHERE i.intake_id=$1`, [intakeId])).rows
  if (owner.length !== 1 || owner[0].investigation_id !== investigationId)
    throw new InvestigationResourceNotFound('ATI_INTAKE', intakeId)

  const outcome = await context.bridge.processIntake({ intakeId, material })
  return atiProcessingSurface({
    result: outcome.result, investigationId,
    ...(outcome.result === 'COMMITTED' ? {
      version: outcome.version,
      addedSourceIds: outcome.addedSourceIds,
      reEvaluatedClaimIds: outcome.reEvaluatedClaimIds,
    } : {}),
  })
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * Map the ATI services' typed refusals to caller-safe responses.
 *
 * Both error types carry authored messages and a stable code, so the code is
 * safe to branch on and the message is safe to show. Nothing internal crosses.
 */
export function atiErrorStatus(error: unknown): { code: string; message: string; status: number } | null {
  if (error instanceof ATIActionRejected) {
    const status = error.code === 'ATI/REQUEST_NOT_FOUND' ? 404
      : error.code === 'ATI/REQUEST_CLOSED' ? 409 : 422
    return { code: error.code, message: error.message, status }
  }
  if (error instanceof IntakeProcessingRejected) {
    const status = error.code === 'ATI/INTAKE_NOT_FOUND' ? 404
      : error.code === 'ATI/INTAKE_ALREADY_ACCEPTED' ? 409 : 422
    return { code: error.code, message: error.message, status }
  }
  return null
}
