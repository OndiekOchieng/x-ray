/**
 * The two strict-schema limits, measured precisely.
 *
 * `complexity-probe.ts` found two distinct refusals: a named limit on optional
 * parameters (24, stated in the error) and an unnamed "Schema is too complex."
 * This narrows the second one — it fired on a flat object of sixteen
 * properties with *none* optional, so it is not the optional limit.
 *
 * Cheap: `max_tokens: 16`, one synthetic sentence, no civic material.
 *
 * Run:  node --import ./scripts/register-ts-resolve.mjs --env-file=.env \
 *         verification/issue-20-20k/limit-probe.ts
 */

const key = process.env['ANTHROPIC_API_KEY'] ?? ''
const model = process.env['XRAY_RESEARCH_MODEL_ID'] ?? ''
if (key === '' || model === '') {
  throw new Error('ANTHROPIC_API_KEY and XRAY_RESEARCH_MODEL_ID are required')
}
const apiKey: string = key
const modelId: string = model

const sanitize = (value: string): string =>
  value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 200)

async function ask(tool: unknown): Promise<string> {
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
      tools: [{ ...(tool as object), strict: true }],
      tool_choice: { type: 'tool', name: (tool as { name: string }).name },
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (response.ok) return 'ACCEPTED'
  const text = await response.text()
  let parsed: { error?: { type?: unknown; message?: unknown } } = {}
  try { parsed = JSON.parse(text) as typeof parsed } catch { /* not JSON */ }
  return sanitize(String(parsed.error?.message ?? `HTTP ${response.status}`))
}

const field = (index: number) => [`f${index}`, { type: 'string' }] as const
const props = (count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => field(i)))

/** One object, `count` properties, `required` of them required. */
const flat = (count: number, required: number) => ({
  name: 'probe', description: 'A synthetic probe schema.',
  input_schema: {
    type: 'object', additionalProperties: false, properties: props(count),
    required: Array.from({ length: required }, (_, i) => `f${i}`),
  },
})

/** The same properties, but held inside an array of items — X-Ray's real shape. */
const wrapped = (count: number, required: number) => ({
  name: 'probe', description: 'A synthetic probe schema.',
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, properties: props(count),
          required: Array.from({ length: required }, (_, i) => `f${i}`),
        },
      },
    },
    required: ['items'],
  },
})

const report = async (label: string, tool: unknown): Promise<void> => {
  const verdict = await ask(tool)
  console.log(`  ${label.padEnd(30)} ${verdict}`)
}

async function main(): Promise<void> {
  console.log('=== a flat top-level object ===')
  for (let count = 8; count <= 16; count += 1) {
    await report(`props=${count} all required`, flat(count, count))
  }
  console.log()
  for (let count = 8; count <= 16; count += 1) {
    await report(`props=${count} all optional`, flat(count, 0))
  }

  console.log('\n=== the same properties inside an array item ===')
  for (const count of [8, 9, 10, 12, 16, 20]) {
    await report(`item props=${count} all required`, wrapped(count, count))
  }
  console.log()
  for (const count of [8, 9, 10, 12, 16, 20]) {
    await report(`item props=${count} all optional`, wrapped(count, 0))
  }
}

main().catch((err: unknown) => {
  console.error(`\nPROBE FAILED: ${String(err)}`)
  process.exitCode = 1
})

export {}
