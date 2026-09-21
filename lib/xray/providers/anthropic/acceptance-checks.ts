/**
 * Does Anthropic actually accept the schemas we ship? (#20, 20k.)
 *
 * WHY THIS EXISTS
 * ===============
 * `strict-schema.ts` validates the documented subset plus the one budget the
 * provider states. It passed DECOMPOSE and TRACE, and the API refused both:
 *
 *   DECOMPOSE  400 invalid_request_error  "Schema is too complex."
 *   TRACE      400 invalid_request_error  "…too many optional parameters (43)
 *                                          … (limit: 24)."
 *
 * Neither limit is documented. No local validator could have known them, and
 * the next one will not be documented either. So acceptance is established the
 * only way it can be: by asking.
 *
 * WHAT IT COSTS, AND WHY THAT IS SMALL
 * ====================================
 * `max_tokens: 16`. Schema compilation happens before sampling, so a refusal
 * returns immediately and an acceptance costs sixteen tokens. The message is
 * one synthetic sentence — no civic material, no fixture, no retrieval.
 *
 * WHAT IT ASSERTS
 * ===============
 * Every tool this codebase ships is sent under `strict: true` and accepted.
 * The two that first light broke on are named explicitly, so a regression that
 * quietly re-inflated either schema fails here rather than on a live run.
 *
 * It needs ANTHROPIC_API_KEY. Without one it reports that and stops — an
 * absent key is not a failing schema, and pretending otherwise would make the
 * gate lie in both directions.
 *
 * Run:  pnpm check:schema-acceptance
 */

import { strictSchemaProblems, optionalParameters } from './strict-schema'
import * as PROMPTS from './prompts'

const apiKey = process.env['ANTHROPIC_API_KEY'] ?? ''
const modelId = process.env['XRAY_RESEARCH_MODEL_ID'] ?? ''

interface Tool { readonly name: string; readonly input_schema: unknown }

/** Every tool the adapters can send, enumerated from the module. */
function shippedTools(): readonly [string, Tool][] {
  const prompts = Object.entries(PROMPTS)
    .filter((entry): entry is [string, PROMPTS.OperationPrompt] =>
      typeof entry[1] === 'object' && entry[1] !== null && 'tool' in entry[1])
    .map(([name, prompt]) => [name, prompt.tool as Tool] as [string, Tool])
  return [...prompts, ['REVIEW', PROMPTS.REVIEW_TOOL as Tool]]
}

const sanitize = (value: string): string =>
  value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 200)

/** Ask the API to compile one schema. Accepted, or the provider's own reason. */
async function acceptance(tool: Tool, attempt = 1): Promise<string | null> {
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
        tools: [{ ...tool, strict: true }],
        tool_choice: { type: 'tool', name: tool.name },
      }),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (err) {
    // A timeout says nothing about the schema, so it is retried rather than
    // reported as a refusal — and reported honestly if it persists.
    if (attempt < 3) return acceptance(tool, attempt + 1)
    return `no response after ${attempt} attempts (${(err as Error).name})`
  }

  if (response.ok) return null
  const text = await response.text()
  let parsed: { error?: { type?: unknown; message?: unknown } } = {}
  try { parsed = JSON.parse(text) as typeof parsed } catch { /* not JSON */ }
  return `HTTP ${response.status} ${String(parsed.error?.type)}: ${
    sanitize(String(parsed.error?.message ?? ''))}`
}

async function main(): Promise<void> {
  const tools = shippedTools()
  console.log(`${tools.length} shipped tool schemas\n`)

  // The local audit first: it is free, and a schema that fails it has no
  // business costing a request.
  let failures = 0
  for (const [label, tool] of tools) {
    const problems = strictSchemaProblems(tool.input_schema)
    if (problems.length === 0) continue
    failures += 1
    console.log(`FAIL  ${label} · local audit — ${problems[0]!.path}: ${problems[0]!.problem}`)
  }

  if (apiKey === '' || modelId === '') {
    console.log('\nNOT RUN: ANTHROPIC_API_KEY and XRAY_RESEARCH_MODEL_ID are required for'
      + ' the acceptance half. The local audit above is all that ran.')
    process.exitCode = failures > 0 ? 1 : 0
    return
  }

  for (const [label, tool] of tools) {
    const refusal = await acceptance(tool)
    const optional = optionalParameters(tool.input_schema)
    if (refusal === null) {
      console.log(`ok    ${label.padEnd(16)} ${tool.name.padEnd(26)} optional=${
        String(optional).padStart(2)}  accepted under strict`)
      continue
    }
    failures += 1
    console.log(`FAIL  ${label.padEnd(16)} ${tool.name.padEnd(26)} optional=${
      String(optional).padStart(2)}  ${refusal}`)
  }

  // The two first light broke on, named so a regression cannot hide in a total.
  for (const name of ['DECOMPOSE', 'TRACE_EVIDENCE', 'TRACE_DISCOVERED', 'TRACE_POSITIONS']) {
    if (!tools.some(([label]) => label === name)) {
      failures += 1
      console.log(`FAIL  ${name} is not among the shipped tools`)
    }
  }

  console.log(`\n${tools.length - failures}/${tools.length} production schemas accepted`)
  if (failures > 0) process.exitCode = 1
}

main().catch((err: unknown) => {
  console.error(`\nFAIL  the gate itself failed: ${String(err)}`)
  process.exit(1)
})
