/**
 * HTTP mapping for the investigation API.
 *
 * WHAT ROUTES ARE ALLOWED TO DO
 * =============================
 * Parse input, call a service, serialize a DTO, map a typed error. Nothing
 * else. No SQL, no fixture registry, no provider SDK, no prompt, no pipeline
 * logic — a route that interpreted the graph would become a second, divergent
 * reading of it beside the projection layer.
 *
 * WHAT NEVER CROSSES THE BOUNDARY
 * ===============================
 * Internal exception text. Every response body is built from an authored
 * message or from values the caller itself supplied. An unrecognised error
 * becomes a fixed sentence and a 500, because the alternative is leaking a SQL
 * fragment, a provider prompt, a correlation binding or a connection string to
 * whoever can reach the endpoint.
 *
 * PURITY: no database, no driver, no fixture.
 */

import { VersionConflict } from '@/lib/xray/persistence/version-commit'
import { InvalidSubmissionInput, InvestigationResourceNotFound } from './investigation-service'
import { ExecutionNotRetryable } from './inline-execution'
import { HostNotConfigured } from './runtime'

export interface ApiErrorBody {
  error: {
    /** Stable machine-readable code. Safe to branch on. */
    code: string
    /** Authored, caller-safe explanation. Never an internal exception string. */
    message: string
    /** The resource kind, for 404s. */
    resource?: string
    /** The offending input, for 400s. */
    field?: string
  }
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export const ok = (body: unknown): Response => json(body, 200)
export const created = (body: unknown): Response => json(body, 201)

export function failure(code: string, message: string, status: number,
  extra: Omit<ApiErrorBody['error'], 'code' | 'message'> = {}): Response {
  return json({ error: { code, message, ...extra } } satisfies ApiErrorBody, status)
}

/** Raised by the parsing helpers below; carries an authored message only. */
export class BadRequest extends Error {
  readonly field: string
  constructor(field: string, message: string) {
    super(message)
    this.name = 'BadRequest'
    this.field = field
  }
}

/**
 * Map a typed application error to a response.
 *
 * Every branch is a type this codebase defines. The default is deliberately
 * uninformative: an error we did not anticipate is, by definition, one whose
 * message we have not reviewed for what it might contain.
 */
export function toResponse(error: unknown): Response {
  if (error instanceof BadRequest)
    return failure('INVALID_INPUT', error.message, 400, { field: error.field })

  if (error instanceof InvalidSubmissionInput)
    return failure('INVALID_INPUT', error.message, 400, { field: error.field })

  if (error instanceof InvestigationResourceNotFound)
    return failure('NOT_FOUND', error.message, 404, { resource: error.resource })

  // Not 500: the request was well formed and the state is knowable. The caller
  // asked for something this run's state does not permit.
  if (error instanceof ExecutionNotRetryable)
    return failure('EXECUTION_NOT_RETRYABLE', error.message, 409)

  if (error instanceof VersionConflict)
    return failure('VERSION_CONFLICT', error.message, 409)

  // The deployment is missing a seam. Report it as unavailable rather than as
  // a defect in the request, and say nothing about what is missing internally.
  if (error instanceof HostNotConfigured)
    return failure('SERVICE_UNAVAILABLE', 'This deployment cannot serve investigation data.', 503)

  return failure('INTERNAL_ERROR', 'The request could not be completed.', 500)
}

/** Run a handler, mapping any typed error it raises. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (error) {
    return toResponse(error)
  }
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/** Parse a JSON body. A malformed body is the caller's error, not a crash. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new BadRequest('body', 'Request body must be valid JSON')
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new BadRequest('body', 'Request body must be a JSON object')
  return raw as Record<string, unknown>
}

export function requiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field]
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequest(field, `${field} must be a nonempty string`)
  return value
}

export function optionalString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequest(field, `${field} must be a nonempty string when supplied`)
  return value
}

/** A required query parameter. Absence is a 400, never a silent default. */
export function requiredQuery(request: Request, name: string): string {
  const value = new URL(request.url).searchParams.get(name)
  if (value === null || !value.trim())
    throw new BadRequest(name, `${name} query parameter is required`)
  return value
}

/** A 1-based version number from a path segment. */
export function versionNumber(raw: string): number {
  if (!/^[1-9]\d*$/.test(raw))
    throw new BadRequest('version', 'version must be a positive integer')
  return Number(raw)
}
