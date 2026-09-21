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
 * Map an HTTP failure onto the vocabulary that already exists.
 *
 * The three-way split is the substance of this file:
 *
 *   CapabilityUnavailable  the operator must change configuration or budget.
 *                          The run reports CAPABILITY_BLOCKED, which is
 *                          #20 boundary 6 and #6's amendment working as built.
 *   TRANSIENT              worth another attempt; `runPipeline` makes it.
 *   PERMANENT              not worth another attempt; `runPipeline` stops.
 *
 * An invalid key and an absent key are the same fault with different
 * spellings, so 401/403 is configuration rather than failure. A model id that
 * does not exist is configuration too — not a broken provider.
 */
function classifyHttpFailure(
  request: MessagesRequest, response: Response, body: string,
  requestId: string | undefined,
): MessagesOutcome {
  const status = response.status
  const errorType = readErrorType(body)
  const where = requestId === undefined ? '' : ` (request ${requestId})`

  // Configuration the operator must fix. Never the key's value, and never the
  // provider's message, which may quote the request.
  if (status === 401 || status === 403) {
    return {
      kind: 'CAPABILITY',
      value: unavailable(
        request.operation, 'NOT_CONFIGURED',
        `Anthropic rejected the credential for this deployment (HTTP ${status})${where}.`,
        RESOLVE_CONFIG,
      ),
    }
  }

  if (status === 404) {
    return {
      kind: 'CAPABILITY',
      value: unavailable(
        request.operation, 'NOT_CONFIGURED',
        `Anthropic has no model "${request.modelId}" for this deployment (HTTP 404)${where}.`,
        RESOLVE_CONFIG,
      ),
    }
  }

  // Spent budget is not a rate limit: no amount of waiting inside this run
  // restores it, so it is a capability gap rather than a transient failure.
  if (isBudgetExhausted(status, errorType, body)) {
    return {
      kind: 'CAPABILITY',
      value: unavailable(
        request.operation, 'EXHAUSTED',
        `The Anthropic account has no remaining budget for this call (HTTP ${status})${where}.`,
        'Add credit to the Anthropic account, or raise its limit, and re-run the stage.',
      ),
    }
  }

  // A rate limit *is* transient, and the pipeline's retry is the right place
  // for it — so it stays a failure rather than becoming a capability gap.
  if (status === 429 || status === 408 || status === 409 || status >= 500) {
    throw new AdapterFailure(
      request.operation, 'TRANSIENT',
      `Anthropic returned HTTP ${status}${errorType === undefined ? '' : ` (${errorType})`}`
      + `${where}. The request may succeed on another attempt.`,
    )
  }

  if (status === 413 || status === 422) {
    return {
      kind: 'CAPABILITY',
      value: unavailable(
        request.operation, 'REFUSED_FOR_INPUT',
        `Anthropic refused this input (HTTP ${status})${where}.`,
        'Reduce the material offered to this stage, or split the work.',
      ),
    }
  }

  throw new AdapterFailure(
    request.operation, 'PERMANENT',
    `Anthropic returned HTTP ${status}${errorType === undefined ? '' : ` (${errorType})`}`
    + `${where}. The request will not succeed unchanged.`,
  )
}

/**
 * The provider's error *type*, never its message.
 *
 * A provider message can echo the request, and the request carries the
 * material under investigation. Reading only the type keeps a journal entry
 * from quoting a claim back at the operator — or worse, back into a diagnostic
 * that outlives the run.
 */
function readErrorType(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { type?: unknown } }
    const type = parsed.error?.type
    return typeof type === 'string' ? type : undefined
  } catch { return undefined }
}

/** Whether the body says the account is out of budget rather than too fast. */
function isBudgetExhausted(status: number, errorType: string | undefined, body: string): boolean {
  if (status !== 400 && status !== 402 && status !== 429) return false
  if (errorType === 'insufficient_quota') return true
  // Anthropic reports a spent balance as a 400 invalid_request_error. The
  // phrase is the only signal available, so it is matched narrowly.
  return /credit balance is too low|insufficient (?:credit|funds|quota)/i.test(body)
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
