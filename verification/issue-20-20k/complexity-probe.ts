/**
 * What "Schema is too complex" actually measures.
 *
 * `decompose-probe.ts` established the cause: the real DECOMPOSE schema with
 * `strict: true` is refused with `400 invalid_request_error: "Schema is too
 * complex."`, and the identical schema without `strict` is accepted. The limit
 * is undocumented, so this measures it.
 *
 * CHEAP BY CONSTRUCTION: `max_tokens: 16`. Schema compilation happens before
 * sampling, so a refusal still returns immediately and an acceptance costs
 * sixteen tokens. Nothing here is a research call and no civic material is
 * sent — every request carries the same one-line synthetic record.
 *
 * Run:  node --import ./scripts/register-ts-resolve.mjs --env-file=.env \
 *         verification/issue-20-20k/complexity-probe.ts
 */

import * as PROMPTS from '@/lib/xray/providers/anthropic/prompts'

const key = process.env['ANTHROPIC_API_KEY'] ?? ''
const model = process.env['XRAY_RESEARCH_MODEL_ID'] ?? ''
if (key === '' || model === '') {
  throw new Error('ANTHROPIC_API_KEY and XRAY_RESEARCH_MODEL_ID are required')
}
const apiKey: string = key
const modelId: string = model

const sanitize = (value: string): string =>
  value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 200)

/** 400 or not, and the provider's own words when not. */
async function ask(tool: Record<string, unknown>): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'The office reported two cases in March.' }],
      tools: [{ ...tool, strict: true }],
      tool_choice: { type: 'tool', name: tool['name'] },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (response.ok) return 'ACCEPTED'
  const text = await response.text()
  let parsed: { error?: { type?: unknown; message?: unknown } } = {}
  try { parsed = JSON.parse(text) as typeof parsed } catch { /* not JSON */ }
  return `HTTP ${response.status} ${String(parsed.error?.type)}: ${
    sanitize(String(parsed.error?.message ?? ''))}`
}

/** Count the object schemas, their properties, and how many are optional. */
function shape(schema: unknown): { objects: number; properties: number; optional: number } {
  let objects = 0, properties = 0, optional = 0
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    const s = node as Record<string, unknown>
    if (s['type'] === 'object') {
      const props = Object.keys((s['properties'] ?? {}) as object)
      const required = new Set((s['required'] ?? []) as string[])
      objects += 1
      properties += props.length
      optional += props.filter((name) => !required.has(name)).length
    }
    for (const key of ['properties', '$defs', 'definitions']) {
      const value = s[key]
      if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk)
    }
    walk(s['items'])
    for (const key of ['anyOf', 'allOf']) walk(s[key])
  }
  walk(schema)
  return { objects, properties, optional }
}

// --- 1. every authored tool, exactly as production sends it -----------------

async function main(): Promise<void> {
  console.log('=== every X-Ray tool, strict, as authored ===')
  for (const [name, value] of Object.entries(PROMPTS)) {
    const prompt = value as { tool?: { name: string; input_schema: unknown } }
    if (prompt.tool === undefined) continue
    const { objects, properties, optional } = shape(prompt.tool.input_schema)
    const verdict = await ask(prompt.tool as unknown as Record<string, unknown>)
    console.log(`  ${name.padEnd(14)} objects=${String(objects).padStart(2)} props=${
      String(properties).padStart(2)} optional=${String(optional).padStart(2)}  ${verdict}`)
  }

  // --- 2. what the limit responds to -----------------------------------------

  const field = (index: number) => [`f${index}`, { type: 'string' }] as const

  /** One flat object with `count` properties, `required` of them required. */
  const flat = (count: number, required: number) => ({
    name: 'probe',
    description: 'A synthetic probe schema.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(Array.from({ length: count }, (_, i) => field(i))),
      required: Array.from({ length: required }, (_, i) => `f${i}`),
    },
  })

  console.log('\n=== one flat object: properties against optionality ===')
  for (const count of [8, 16, 24, 32, 48, 64]) {
    for (const required of [count, 0]) {
      const verdict = await ask(flat(count, required) as unknown as Record<string, unknown>)
      console.log(`  props=${String(count).padStart(2)} optional=${
        String(count - required).padStart(2)}  ${verdict}`)
    }
  }

  /** `depth` nested objects, each with `width` optional properties. */
  const nested = (depth: number, width: number) => {
    let schema: Record<string, unknown> = {
      type: 'object', additionalProperties: false,
      properties: Object.fromEntries(Array.from({ length: width }, (_, i) => field(i))),
      required: [],
    }
    for (let level = 1; level < depth; level += 1) {
      schema = {
        type: 'object', additionalProperties: false,
        properties: {
          ...Object.fromEntries(Array.from({ length: width }, (_, i) => field(i))),
          child: schema,
        },
        required: [],
      }
    }
    return { name: 'probe', description: 'A synthetic probe schema.', input_schema: schema }
  }

  console.log('\n=== nesting, all properties optional ===')
  for (const depth of [2, 3, 4]) {
    for (const width of [4, 6, 9]) {
      const verdict = await ask(nested(depth, width) as unknown as Record<string, unknown>)
      console.log(`  depth=${depth} width=${width}  ${verdict}`)
    }
  }
}

main().catch((err: unknown) => {
  console.error(`\nPROBE FAILED: ${String(err)}`)
  process.exitCode = 1
})
