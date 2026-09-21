/**
 * The Anthropic Messages API transport (#20 slice 20b).
 *
 * THE ONLY FILE IN THE PROVIDER LAYER THAT PERFORMS HTTP
 * ======================================================
 * Everything else — prompts, decoding, the two adapters — is pure. The 20b
 * gate holds that line, because a second place that can reach the network is a
 * second place a secret or a raw envelope can escape from.
 *
 * WHAT IT KNOWS AND WHAT IT DOES NOT
 * ==================================
 * It knows how to send a request and how to classify what came back. It knows
 * nothing about claims, evidence, proposals or review: no domain type is
 * imported here, and the structured result leaves as `unknown` for `decode.ts`
 * to validate. A transport that understood proposals could shape them, which
 * is precisely what must not happen between the provider and the stage.
 *
 * WHY STRUCTURED OUTPUT IS A FORCED TOOL CALL
 * ===========================================
 * `tool_choice: { type: 'tool' }` makes the model answer in a declared JSON
 * shape rather than prose that happens to contain JSON. Prose-wrapped JSON
 * fails in the interesting cases — a hedge before the object, a trailing
 * explanation — and every one of those failures would land as a decode error
 * on material that was actually fine. This is still validated afterwards: a
 * declared schema is a request, not a guarantee.
 *
 * CLASSIFICATION READS TYPES AND HEADERS, NOT PROSE
 * ================================================
 * `classifyHttpFailure` prefers the HTTP status, the documented `error.type`,
 * and documented headers. A message is prose that can quote the request, and
 * the request carries the material under investigation — so exactly one
 * condition reads one, under two guards. See `isSpendLimit`.
 *
 * NO RETRY HERE
 * =============
 * `runPipeline` already retries `TRANSIENT` adapter failures and refuses to
 * retry `PERMANENT` ones (`pipeline/run.ts`). A retry loop here would multiply
 * with that one and hide how transient a provider actually is. So this
 * classifies and throws; the pipeline decides.
 *
 * SECRETS
 * =======
 * The key reaches exactly one place: a request header. It is never logged,
 * never placed in a thrown message, never put in diagnostics, and never
 * returned. The gate asserts all four against a sentinel.
 */

import { AdapterFailure, unavailable, type CapabilityUnavailable } from '@/lib/xray/capability'

/** The stable Messages API version. Not configurable: it is a contract, not a preference. */
const ANTHROPIC_VERSION = '2023-06-01'

const DEFAULT_BASE_URL = 'https://api.anthropic.com'

/** A declared JSON shape the model must answer in. */
export interface ToolSchema {
  readonly name: string
  readonly description: string
  readonly input_schema: Readonly<Record<string, unknown>>
}

export interface MessagesRequest {
  /** For failure attribution, e.g. `research-model:grade`. */
  readonly operation: string
  readonly modelId: string
  readonly apiKey: string
  readonly baseUrl?: string
  readonly system: string
  readonly userContent: string
  readonly tool: ToolSchema
  readonly maxTokens: number
  readonly timeoutMs?: number
}

/**
 * Execution detail about one call.
 *
 * Non-canonical by construction and by contract (#20 boundary 7): token counts
 * and request ids describe the call, not the investigation, and nothing here
 * may reach graph state. It is returned alongside the structured value so a
 * caller can record it outside the graph — which is 17e's job, not 20b's.
 */
export interface CallDiagnostics {
  readonly provider: 'anthropic'
  readonly modelId: string
  readonly operation: string
  readonly requestId?: string
  readonly stopReason?: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly latencyMs: number
}

export interface MessagesSuccess {
  /** The forced tool call's input, unvalidated. `decode.ts` is the validator. */
  readonly structured: unknown
  readonly diagnostics: CallDiagnostics
}

/**
 * A call that produced no structured answer but is not a failure.
 *
 * Two cases reach it: the provider refused the input, and the provider has no
 * budget left. Both are capability facts an operator can act on, so they are
 * values rather than exceptions (`capability.ts`).
 */
export type MessagesOutcome =
  | { readonly kind: 'STRUCTURED'; readonly value: MessagesSuccess }
  | { readonly kind: 'CAPABILITY'; readonly value: CapabilityUnavailable }

/** What the operator would change to resolve a configuration fault. */
const RESOLVE_CONFIG =
  'Check XRAY_RESEARCH_MODEL_ID / XRAY_REVIEWER_MODEL_ID and ANTHROPIC_API_KEY for this deployment.'

export async function callMessages(request: MessagesRequest): Promise<MessagesOutcome> {
  const url = `${(request.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/v1/messages`
  const startedAt = performance.now()

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        'x-api-key': request.apiKey,
      },
      body: JSON.stringify({
        model: request.modelId,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.userContent }],
        tools: [request.tool],
        tool_choice: { type: 'tool', name: request.tool.name },
      }),
      signal: AbortSignal.timeout(request.timeoutMs ?? 120_000),
    })
  } catch (err) {
    // A transport-level failure is always worth one more attempt: a socket
    // reset and a timeout both plausibly succeed on retry, and neither tells
    // us anything about the investigation.
    throw new AdapterFailure(
      request.operation, 'TRANSIENT',
      `The Anthropic request did not complete: ${transportReason(err)}.`,
    )
  }

  const latencyMs = Math.round(performance.now() - startedAt)
  const requestId = response.headers.get('request-id') ?? undefined

  if (!response.ok) {
    return classifyHttpFailure(request, response, await bodyText(response), requestId)
  }

  let envelope: unknown
  try {
    envelope = await response.json()
  } catch {
    // A 200 whose body is not JSON will not become JSON on a second attempt.
    throw new AdapterFailure(
      request.operation, 'PERMANENT',
      'The Anthropic response was not JSON. The structured answer could not be read.',
    )
  }

  return readEnvelope(request, envelope, requestId, latencyMs)
}

// ---------------------------------------------------------------------------
// Reading a successful envelope
// ---------------------------------------------------------------------------

function readEnvelope(
  request: MessagesRequest, envelope: unknown,
  requestId: string | undefined, latencyMs: number,
): MessagesOutcome {
  const message = envelope as {
    content?: unknown
    stop_reason?: unknown
    usage?: { input_tokens?: unknown; output_tokens?: unknown }
    id?: unknown
  }

  const stopReason = typeof message.stop_reason === 'string' ? message.stop_reason : undefined
  const diagnostics: CallDiagnostics = {
    provider: 'anthropic',
    modelId: request.modelId,
    operation: request.operation,
    ...(requestId === undefined ? {} : { requestId }),
    ...(stopReason === undefined ? {} : { stopReason }),
    ...(typeof message.usage?.input_tokens === 'number'
      ? { inputTokens: message.usage.input_tokens } : {}),
    ...(typeof message.usage?.output_tokens === 'number'
      ? { outputTokens: message.usage.output_tokens } : {}),
    latencyMs,
  }

  // A refusal is a capability fact about this input, not a defect in the
  // graph and not an outage. `REFUSED_FOR_INPUT` is the reason that exists
  // for exactly this.
  if (stopReason === 'refusal') {
    return {
      kind: 'CAPABILITY',
      value: unavailable(
        request.operation, 'REFUSED_FOR_INPUT',
        'The model declined to answer for this input.',
        'Inspect the material for this stage; a refusal is not evidence about the claim.',
      ),
    }
  }

  const blocks = Array.isArray(message.content) ? message.content : []
  const toolUse = blocks.find((block): block is { type: string; name?: unknown; input?: unknown } =>
    typeof block === 'object' && block !== null
    && (block as { type?: unknown }).type === 'tool_use')

  if (toolUse === undefined) {
    // `max_tokens` is the one case worth another attempt — the same request
    // can complete. Anything else means the model answered in a shape the
    // declared schema forbade, and repeating it repeats the shape.
    if (stopReason === 'max_tokens') {
      throw new AdapterFailure(
        request.operation, 'TRANSIENT',
        'The Anthropic response was cut off before the structured answer completed.',
      )
    }
    throw new AdapterFailure(
      request.operation, 'PERMANENT',
      `The Anthropic response contained no ${request.tool.name} answer`
      + `${stopReason === undefined ? '' : ` (stop reason: ${stopReason})`}.`,
    )
  }

  if (toolUse.name !== request.tool.name) {
    throw new AdapterFailure(
      request.operation, 'PERMANENT',
      `The Anthropic response answered "${String(toolUse.name)}" rather than `
      + `"${request.tool.name}".`,
    )
  }

  return { kind: 'STRUCTURED', value: { structured: toolUse.input, diagnostics } }
}

// ---------------------------------------------------------------------------
// Classifying a failure
// ---------------------------------------------------------------------------

/**
 * The documented error types. Classification reads these first.
 *
 * Preferring the type over the message is not a style choice: a message is
 * prose that can quote the request, and the request carries the material under
 * investigation. A type is a short closed-vocabulary token the provider chose.
 */
type AnthropicErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'billing_error'
  | 'not_found_error'
  | 'request_too_large'
  | 'rate_limit_error'
  | 'timeout_error'
  | 'api_error'
  | 'overloaded_error'

const ERROR_TYPES = [
  'invalid_request_error', 'authentication_error', 'permission_error', 'billing_error',
  'not_found_error', 'request_too_large', 'rate_limit_error', 'timeout_error',
  'api_error', 'overloaded_error',
] as const satisfies readonly AnthropicErrorType[]

type UncoveredErrorType = Exclude<AnthropicErrorType, (typeof ERROR_TYPES)[number]>
const _errorTypesExhaustive: UncoveredErrorType extends never ? true : never = true
void _errorTypesExhaustive

/** What the operator would change to resolve a billing or spend condition. */
const RESOLVE_BILLING =
  'Add credit to the Anthropic account, or raise the organization/workspace spend limit,'
  + ' then re-run the stage.'

/**
 * Map a failure onto the vocabulary that already exists.
 *
 * Three outcomes, in the order the signals are trustworthy:
 *
 *   1. HTTP status, where the status alone is decisive (401, 402, 403, 404, 413).
 *   2. The documented `error.type`.
 *   3. Documented headers — `retry-after` is what separates ordinary rate
 *      limiting from a spend cap, because both carry `rate_limit_error`.
 *   4. The `error.message`, and only when it is demonstrably the provider
 *      speaking rather than our own request echoed back.
 *
 * And the three destinations:
 *
 *   CapabilityUnavailable  the operator must change configuration or budget.
 *                          The run reports CAPABILITY_BLOCKED, which is
 *                          #20 boundary 6 and #6's amendment working as built.
 *   TRANSIENT              worth another attempt; `runPipeline` makes it.
 *   PERMANENT              not worth another attempt; `runPipeline` stops.
 */
function classifyHttpFailure(
  request: MessagesRequest, response: Response, body: string,
  requestId: string | undefined,
): MessagesOutcome {
  const status = response.status
  const error = readError(body)
  const where = requestId === undefined ? '' : ` (request ${requestId})`
  const label = error.type === undefined ? `HTTP ${status}` : `HTTP ${status} (${error.type})`

  const capability = (
    reason: 'NOT_CONFIGURED' | 'EXHAUSTED' | 'REFUSED_FOR_INPUT',
    detail: string, resolvedBy: string,
  ): MessagesOutcome => ({
    kind: 'CAPABILITY',
    value: unavailable(request.operation, reason, detail, resolvedBy),
  })

  // --- 1. statuses that decide on their own ------------------------------

  // An invalid credential and an absent one are the same fault with different
  // spellings, so authentication is configuration rather than failure.
  if (status === 401 || status === 403 || error.type === 'authentication_error'
    || error.type === 'permission_error') {
    return capability('NOT_CONFIGURED',
      `Anthropic rejected the credential or its permissions for this deployment (${label})${where}.`,
      RESOLVE_CONFIG)
  }

  // 402 billing_error is the documented payment condition. No amount of
  // waiting inside this run resolves it, so it is a capability gap.
  if (status === 402 || error.type === 'billing_error') {
    return capability('EXHAUSTED',
      `The Anthropic account cannot be billed for this call (${label})${where}.`,
      RESOLVE_BILLING)
  }

  if (status === 404 || error.type === 'not_found_error') {
    return capability('NOT_CONFIGURED',
      `Anthropic has no model "${request.modelId}" for this deployment (${label})${where}.`,
      RESOLVE_CONFIG)
  }

  if (status === 413 || error.type === 'request_too_large') {
    return capability('REFUSED_FOR_INPUT',
      `Anthropic refused this input as too large (${label})${where}.`,
      'Reduce the material offered to this stage, or split the work.')
  }

  // --- 2. rate limiting, split on the documented header ------------------

  /*
   * Both forms carry `rate_limit_error`, so the type cannot separate them.
   * Ordinary rate limiting is documented as carrying `retry-after`; the
   * usage-tier / monthly spend-cap form is documented as lacking it and as
   * continuing to fail until access resumes.
   *
   * So a 429 without `retry-after` is treated as a spend cap. The tradeoff is
   * stated in the report: a proxy that strips the header downgrades a
   * retryable limit to a disclosed capability gap, which is recoverable and
   * visible. The opposite mistake — retrying a spend cap until the stage
   * exhausts its attempts — reports a billing state as a broken investigation.
   */
  if (status === 429 || error.type === 'rate_limit_error') {
    const retryAfter = response.headers.get('retry-after')
    if (retryAfter !== null && retryAfter.trim() !== '') {
      throw new AdapterFailure(request.operation, 'TRANSIENT',
        `Anthropic rate-limited this request (${label})${where}.`
        + ` It may succeed after ${retryAfter.trim()} seconds.`)
    }
    return capability('EXHAUSTED',
      `Anthropic returned a rate limit with no retry-after (${label})${where},`
      + ' which is the documented shape of a usage-tier or spend cap rather than'
      + ' ordinary rate limiting.',
      RESOLVE_BILLING)
  }

  // --- 3. retryable service failures -------------------------------------

  // 500, 504 and 529 are documented as retryable; the rest of 5xx behaves the
  // same way, and 408/409 are transport-shaped rather than request-shaped.
  if (status >= 500 || status === 408 || status === 409
    || error.type === 'api_error' || error.type === 'overloaded_error'
    || error.type === 'timeout_error') {
    throw new AdapterFailure(request.operation, 'TRANSIENT',
      `Anthropic returned ${label}${where}. The request may succeed on another attempt.`)
  }

  // --- 4. a 400 that is really a spend limit -----------------------------

  /*
   * An organization or workspace spend limit arrives as a 400
   * `invalid_request_error`, and the message is the only signal. That makes
   * this the one place a message is read at all — and it is read under two
   * conditions, because the alternative is letting investigated material
   * decide how a failure is classified.
   */
  if (status === 400 && isSpendLimit(error, request)) {
    return capability('EXHAUSTED',
      `Anthropic reported a spend limit for this organization or workspace (${label})${where}.`,
      RESOLVE_BILLING)
  }

  throw new AdapterFailure(request.operation, 'PERMANENT',
    `Anthropic returned ${label}${where}. The request will not succeed unchanged.`)
}

interface ProviderError {
  readonly type?: AnthropicErrorType
  /** Present only when it is short enough to be a statement rather than an echo. */
  readonly message?: string
}

/**
 * The provider's error, read conservatively.
 *
 * The type is kept only when it is one of the documented values: an
 * unrecognised type is treated as absent rather than as something to branch
 * on. The message is kept only when it is short — a billing statement is a
 * sentence, and anything longer is far more likely to be our own request
 * quoted back.
 */
function readError(body: string): ProviderError {
  let parsed: { error?: { type?: unknown; message?: unknown } }
  try {
    parsed = JSON.parse(body) as typeof parsed
  } catch {
    return {}
  }

  const rawType = parsed.error?.type
  const type = typeof rawType === 'string'
    && (ERROR_TYPES as readonly string[]).includes(rawType)
    ? rawType as AnthropicErrorType
    : undefined

  const rawMessage = parsed.error?.message
  const message = typeof rawMessage === 'string' && rawMessage.length <= MAX_MESSAGE_LENGTH
    ? rawMessage
    : undefined

  return { ...(type === undefined ? {} : { type }), ...(message === undefined ? {} : { message }) }
}

/** Longer than any documented billing statement, shorter than an echoed request. */
const MAX_MESSAGE_LENGTH = 400

const SPEND_LIMIT_PHRASES = [
  /credit balance is too low/i,
  /(?:organization|workspace|monthly)[^.]{0,40}spend limit/i,
  /spend limit[^.]{0,40}(?:reached|exceeded)/i,
  /insufficient (?:credit|credits|funds|quota)/i,
] as const

/**
 * Whether a 400 is a spend limit, decided without letting the material decide.
 *
 * Two guards, because a phrase match alone is exploitable: a provider error
 * message can quote the request, and an investigation into a utility's billing
 * would put "credit balance is too low" straight into the material. Treating
 * that as a spend limit would let the subject of an investigation control how
 * its own research run is classified.
 *
 *   1. The message must be short enough to be a statement (`readError`).
 *   2. The message must not contain anything we sent. If any run of
 *      `ECHO_WINDOW` characters from the message also appears in the request,
 *      the message is an echo and is not read at all.
 */
function isSpendLimit(error: ProviderError, request: MessagesRequest): boolean {
  const message = error.message
  if (message === undefined) return false
  if (error.type !== undefined && error.type !== 'invalid_request_error') return false
  if (echoesRequest(message, request)) return false
  return SPEND_LIMIT_PHRASES.some((phrase) => phrase.test(message))
}

const ECHO_WINDOW = 24

/**
 * Whether a message contains a run of characters we sent.
 *
 * Deliberately cheap and deliberately eager: a false positive here only means
 * a genuine billing message is classified `PERMANENT` instead of `EXHAUSTED` —
 * disclosed either way — while a false negative would let echoed material
 * steer classification.
 */
function echoesRequest(message: string, request: MessagesRequest): boolean {
  const sent = `${request.userContent}\n${request.system}`
  for (let start = 0; start + ECHO_WINDOW <= message.length; start += 8) {
    if (sent.includes(message.slice(start, start + ECHO_WINDOW))) return true
  }
  return false
}

async function bodyText(response: Response): Promise<string> {
  try { return (await response.text()).slice(0, 2_000) } catch { return '' }
}

/**
 * Why a transport attempt did not complete.
 *
 * `err.name` only. A fetch error message can contain the request URL, and on
 * some runtimes the failing request's headers — which is where the key is.
 */
function transportReason(err: unknown): string {
  if (err instanceof Error) {
    return err.name === 'TimeoutError' || err.name === 'AbortError'
      ? 'the request timed out'
      : `transport error ${err.name}`
  }
  return 'an unknown transport error'
}
