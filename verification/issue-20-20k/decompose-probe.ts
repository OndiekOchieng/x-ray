/**
 * Why the live DECOMPOSE request came back 400 (#20, Eastleigh Voice run).
 *
 * A LOCAL DIAGNOSTIC HARNESS, NOT PRODUCTION CODE
 * ===============================================
 * The transport deliberately does not surface provider error prose: a message
 * can quote the request, and the request carries the material under
 * investigation. That rule stands. This file is the sanctioned exception —
 * run by hand, printing the provider's `error.type` and a **truncated,
 * redacted** `error.message`, and never printing the request body, the
 * headers, the key, or anything derived from them.
 *
 * WHAT IT SEPARATES
 * =================
 * The live failure had two candidate causes and the run cannot tell them
 * apart: an invalid *request/schema*, or an article too large for the model.
 * So every variant here uses a **tiny synthetic document**. If a tiny
 * document still 400s, the article's size is not the cause.
 *
 *   1. the real DECOMPOSE schema, strict — what production sends
 *   2. the same schema, strict removed — was strict the trigger?
 *   3. the same schema plus `required` on every object, strict
 *   4. the real RECONCILE schema, strict — the tool 20g verified live
 *
 * Run:  node --import ./scripts/register-ts-resolve.mjs --env-file=.env \
 *         verification/issue-20-20k/decompose-probe.ts
 */

import { DECOMPOSE, RECONCILE } from '@/lib/xray/providers/anthropic/prompts'
import { requestBody } from '@/lib/xray/providers/anthropic/present'
import { strictSchemaProblems } from '@/lib/xray/providers/anthropic/strict-schema'

const key = process.env['ANTHROPIC_API_KEY'] ?? ''
const model = process.env['XRAY_RESEARCH_MODEL_ID'] ?? ''
if (key === '' || model === '') {
  throw new Error('ANTHROPIC_API_KEY and XRAY_RESEARCH_MODEL_ID are required')
}
const apiKey: string = key
const modelId: string = model

/** A three-sentence synthetic record. Nothing civic, nothing retrieved. */
const TINY = requestBody({
  record: { ref: 'ref:s1', title: 'Synthetic notice', sourceType: 'OTHER' },
  inspectedContent: {
    ref: 'ref:s1',
    outcome: 'RETRIEVED',
    content: {
      text: 'The office reported two cases in March. It asked residents to be careful.',
      truncated: false,
    },
  },
})

const TINY_RECONCILE = requestBody({
  claims: [{ ref: 'ref:c1', text: 'Two cases were reported in March.' }],
  evidence: [
    { ref: 'ref:e1', proposition: 'Two cases in March.', relationship: 'SUPPORTS' },
    { ref: 'ref:e2', proposition: 'Three cases in March.', relationship: 'CHALLENGES' },
  ],
})

/** Add `required` wherever an object omits it, recursively. */
function withRequired(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withRequired)
  if (typeof node !== 'object' || node === null) return node
  const schema = { ...node as Record<string, unknown> }
  for (const key of ['properties', 'items', '$defs', 'definitions', 'anyOf', 'allOf']) {
    if (key in schema) {
      const value = schema[key]
      schema[key] = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
          .map(([name, child]) => [name, withRequired(child)]))
        : withRequired(value)
    }
  }
  if (schema['type'] === 'object' && !('required' in schema)) schema['required'] = []
  return schema
}

/** Never print a credential, and never print more than a statement's worth. */
const REDACT = /sk-[A-Za-z0-9_-]{8,}/g
const sanitize = (value: string): string =>
  value.replace(REDACT, '[redacted]').replace(/\s+/g, ' ').slice(0, 300)

interface Variant {
  readonly label: string
  readonly tool: Record<string, unknown>
  readonly strict: boolean
  readonly system: string
  readonly userContent: string
  readonly maxTokens: number
}

const variants: readonly Variant[] = [
  {
    label: '1 · DECOMPOSE as production sends it, strict',
    tool: DECOMPOSE.tool as unknown as Record<string, unknown>,
    strict: true, system: DECOMPOSE.system, userContent: TINY, maxTokens: DECOMPOSE.maxTokens,
  },
  {
    label: '2 · the same schema with strict removed',
    tool: DECOMPOSE.tool as unknown as Record<string, unknown>,
    strict: false, system: DECOMPOSE.system, userContent: TINY, maxTokens: DECOMPOSE.maxTokens,
  },
  {
    label: '3 · the same schema, required stated on every object, strict',
    tool: {
      ...DECOMPOSE.tool,
      input_schema: withRequired(DECOMPOSE.tool.input_schema),
    } as unknown as Record<string, unknown>,
    strict: true, system: DECOMPOSE.system, userContent: TINY, maxTokens: DECOMPOSE.maxTokens,
  },
  {
    label: '4 · RECONCILE, strict — the tool 20g verified live',
    tool: RECONCILE.tool as unknown as Record<string, unknown>,
    strict: true, system: RECONCILE.system, userContent: TINY_RECONCILE,
    maxTokens: RECONCILE.maxTokens,
  },
]

async function main(): Promise<void> {
  console.log('=== what our own strict validator says about each schema ===')
  for (const [name, schema] of [
    ['DECOMPOSE', DECOMPOSE.tool.input_schema],
    ['DECOMPOSE + required', withRequired(DECOMPOSE.tool.input_schema)],
    ['RECONCILE', RECONCILE.tool.input_schema],
  ] as const) {
    const problems = strictSchemaProblems(schema)
    console.log(`  ${String(name).padEnd(22)} ${
      problems.length === 0 ? 'compliant' : problems.map((p) => `${p.path}: ${p.problem}`).join('; ')}`)
  }

  console.log('\n=== live requests, tiny synthetic document ===')
  for (const variant of variants) {
    const body = {
      model: modelId,
      max_tokens: variant.maxTokens,
      system: variant.system,
      messages: [{ role: 'user', content: variant.userContent }],
      tools: [variant.strict ? { ...variant.tool, strict: true } : variant.tool],
      tool_choice: { type: 'tool', name: variant.tool['name'] },
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const text = await response.text()
    const requestId = response.headers.get('request-id') ?? '(none)'
    console.log(`\n${variant.label}`)
    console.log(`  request body ${JSON.stringify(body).length} chars`)
    console.log(`  HTTP ${response.status}  request ${requestId}`)

    if (!response.ok) {
      let parsed: { error?: { type?: unknown; message?: unknown } } = {}
      try { parsed = JSON.parse(text) as typeof parsed } catch { /* not JSON */ }
      console.log(`  error.type     ${String(parsed.error?.type)}`)
      console.log(`  error.message  ${sanitize(String(parsed.error?.message ?? text))}`)
      continue
    }

    const envelope = JSON.parse(text) as {
      stop_reason?: string
      content?: { type?: string; name?: string; input?: unknown }[]
      usage?: Record<string, unknown>
    }
    const toolUse = (envelope.content ?? []).find((block) => block.type === 'tool_use')
    console.log(`  stop_reason    ${String(envelope.stop_reason)}`)
    console.log(`  tool answered  ${String(toolUse?.name)}`)
    const keys = Object.keys((toolUse?.input ?? {}) as Record<string, unknown>)
    console.log(`  input keys     ${JSON.stringify(keys)}`)
    console.log(`  tokens         in ${String(envelope.usage?.['input_tokens'])}, out ${
      String(envelope.usage?.['output_tokens'])}`)
  }
}

main().catch((err: unknown) => {
  console.error(`\nPROBE FAILED: ${String(err)}`)
  process.exitCode = 1
})
