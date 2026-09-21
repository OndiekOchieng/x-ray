/**
 * Where the unnamed "Schema is too complex." limit sits, in X-Ray's own shape.
 *
 * Two limits were observed. One states itself: "too many optional parameters
 * (43) … limit: 24", and the count matches ours exactly — properties absent
 * from `required`, summed over every object. The other does not: DECOMPOSE has
 * 17 optional parameters, well under 24, and is refused as "too complex".
 *
 * So this finds the boundary a validator can be calibrated against, in the
 * shape X-Ray actually authors — an array of items, each with two nested
 * optional sub-objects — and tests whether `$defs`/`$ref` sharing reduces the
 * cost of a sub-object used several times.
 *
 * Cheap: `max_tokens: 16`, one synthetic sentence, no civic material.
 *
 * Run:  node --import ./scripts/register-ts-resolve.mjs --env-file=.env \
 *         verification/issue-20-20k/budget-probe.ts
 */

const key = process.env['ANTHROPIC_API_KEY'] ?? ''
const model = process.env['XRAY_RESEARCH_MODEL_ID'] ?? ''
if (key === '' || model === '') {
  throw new Error('ANTHROPIC_API_KEY and XRAY_RESEARCH_MODEL_ID are required')
}
const apiKey: string = key
const modelId: string = model

const sanitize = (value: string): string =>
  value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 160)

async function ask(tool: unknown, attempt = 1): Promise<string> {
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
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
  } catch (err) {
    // A timeout says nothing about the schema. One more attempt, then report it.
    if (attempt < 3) return ask(tool, attempt + 1)
    return `no response: ${String((err as Error).name)}`
  }
  if (response.ok) return 'ACCEPTED'
  const text = await response.text()
  let parsed: { error?: { type?: unknown; message?: unknown } } = {}
  try { parsed = JSON.parse(text) as typeof parsed } catch { /* not JSON */ }
  return sanitize(String(parsed.error?.message ?? `HTTP ${response.status}`))
}

const props = (count: number, prefix = 'f') =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${prefix}${i}`, { type: 'string' }]))

/** Count optional parameters the way the provider's own message counts them. */
function optionalCount(schema: unknown): number {
  let total = 0
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    const s = node as Record<string, unknown>
    if (s['type'] === 'object') {
      const names = Object.keys((s['properties'] ?? {}) as object)
      const required = new Set((s['required'] ?? []) as string[])
      total += names.filter((name) => !required.has(name)).length
    }
    for (const container of ['properties', '$defs', 'definitions'] as const) {
      const value = s[container]
      if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk)
    }
    walk(s['items'])
    for (const combinator of ['anyOf', 'allOf'] as const) walk(s[combinator])
  }
  walk(schema)
  return total
}

/**
 * X-Ray's own shape: `{ items: [ { …fields, sub1?, sub2? } ] }`, where each
 * sub-object is an all-optional object of `subWidth` properties.
 */
const xrayShaped = (
  itemProps: number, itemRequired: number, subs: number, subWidth: number,
) => {
  const sub = {
    type: 'object', additionalProperties: false, properties: props(subWidth, 's'),
  }
  return {
    name: 'probe', description: 'A synthetic probe schema.',
    input_schema: {
      type: 'object', additionalProperties: false,
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              ...props(itemProps),
              ...Object.fromEntries(Array.from({ length: subs }, (_, i) => [`sub${i}`, sub])),
            },
            required: Array.from({ length: itemRequired }, (_, i) => `f${i}`),
          },
        },
      },
      required: ['items'],
    },
  }
}

/** The same, with the sub-object shared through `$defs`/`$ref`. */
const shared = (itemProps: number, itemRequired: number, subs: number, subWidth: number) => ({
  name: 'probe', description: 'A synthetic probe schema.',
  input_schema: {
    type: 'object', additionalProperties: false,
    $defs: {
      sub: { type: 'object', additionalProperties: false, properties: props(subWidth, 's') },
    },
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            ...props(itemProps),
            ...Object.fromEntries(Array.from({ length: subs }, (_, i) =>
              [`sub${i}`, { $ref: '#/$defs/sub' }])),
          },
          required: Array.from({ length: itemRequired }, (_, i) => `f${i}`),
        },
      },
    },
    required: ['items'],
  },
})

async function main(): Promise<void> {
  const report = async (label: string, tool: { input_schema: unknown }): Promise<void> => {
    const verdict = await ask(tool)
    console.log(`  ${label.padEnd(44)} optional=${
      String(optionalCount(tool.input_schema)).padStart(2)}  ${verdict}`)
  }

  console.log('=== X-Ray shape: an array item with two nested optional sub-objects ===')
  for (const itemProps of [5, 7, 8, 9]) {
    await report(`item props=${itemProps} required=1 subs=2x4`, xrayShaped(itemProps, 1, 2, 4))
  }

  console.log('\n=== without the nested sub-objects ===')
  for (const itemProps of [9, 13, 15]) {
    await report(`item props=${itemProps} required=1 subs=0`, xrayShaped(itemProps, 1, 0, 4))
  }

  console.log('\n=== does $defs/$ref sharing reduce the cost? ===')
  for (const subs of [2, 3]) {
    await report(`inlined   subs=${subs}x5`, xrayShaped(9, 1, subs, 5))
    await report(`$ref      subs=${subs}x5`, shared(9, 1, subs, 5))
  }

  console.log('\n=== the real DECOMPOSE shape, and two ways to trim it ===')
  await report('9 props, 1 required, measurement+timeScope', xrayShaped(9, 1, 2, 5))
  await report('7 props, 1 required, no sub-objects', xrayShaped(7, 1, 0, 0))
  await report('9 props, 9 required, measurement+timeScope', xrayShaped(9, 9, 2, 5))
}

main().catch((err: unknown) => {
  console.error(`\nPROBE FAILED: ${String(err)}`)
  process.exitCode = 1
})

export {}
