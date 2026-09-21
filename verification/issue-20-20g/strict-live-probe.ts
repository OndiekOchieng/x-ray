/**
 * One minimal live call, to verify the strict schema is accepted (#20 Finding 1).
 *
 * Synthetic material only — two invented figures about nothing. No civic URL,
 * no search, no retrieval, no first-light rerun. The question is narrow:
 *
 *   1. does the API accept `strict: true` with these schemas, or 400?
 *   2. does the returned tool `input` satisfy the declared shape — in
 *      particular, is `discrepancies` an array?
 *
 * RECONCILE because that is the operation first light failed on.
 */
import { isAvailable, isUnavailable } from '@/lib/xray/capability'
import { AnthropicResearchModel } from '@/lib/xray/providers/anthropic'
import { RECONCILE } from '@/lib/xray/providers/anthropic/prompts'
import { strictSchemaProblems } from '@/lib/xray/providers/anthropic/strict-schema'
import type { Claim, Evidence } from '@/lib/xray/domain'
import type { Offered } from '@/lib/xray/pipeline/model-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'

const key: string | undefined = process.env['ANTHROPIC_API_KEY']
const modelId: string | undefined = process.env['XRAY_RESEARCH_MODEL_ID']
if (key === undefined || modelId === undefined) {
  throw new Error('ANTHROPIC_API_KEY and XRAY_RESEARCH_MODEL_ID are required')
}
const apiKey: string = key
const model: string = modelId

const claim = (id: `C${string}`, text: string): Claim => ({
  id, origin: 'SURFACE', investigationId: 'XRAY-STRICT-PROBE',
  text, layer: 'OBSERVATION', type: 'QUANTITATIVE', priority: 'HIGH',
  entities: ['Testville'], ambiguities: [],
})
const evidence = (id: string, proposition: string): Evidence => ({
  id, sourceId: 'S-PROBE', proposition, relationship: 'SUPPORTS',
  claimIds: ['C001'], strength: 'DIRECT',
})
const offer = <T>(ref: string, value: T): Offered<T> =>
  ({ ref: `ref:${ref}` as ProposalRef, value })

async function main(): Promise<void> {
  console.log('=== schema audit, before the call ===')
  const problems = strictSchemaProblems(RECONCILE.tool.input_schema)
  console.log(`  propose_discrepancies: ${problems.length} problem(s)`)
  if (problems.length > 0) throw new Error('refusing to send a non-strict schema')
  console.log(`  additionalProperties count in the sent schema: ${
    (JSON.stringify(RECONCILE.tool.input_schema).match(/"additionalProperties":false/g) ?? []).length}`)

  const research = new AnthropicResearchModel({ modelId: model, apiKey })
  console.log(`\n=== one live reconcile call (${model}) ===`)

  const started = Date.now()
  const result = await research.reconcile({
    claims: [
      offer('c1', claim('C001', 'The depot recorded 42 units in the first quarter.')),
      offer('c2', claim('C002', 'The depot recorded 31 units in the first quarter.')),
    ],
    evidence: [
      offer('e1', evidence('E001', 'The register lists 42 units for January to March.')),
      offer('e2', evidence('E002', 'The audit lists 31 units for the same three months.')),
    ],
  })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  console.log(`  elapsed: ${elapsed}s`)
  if (isUnavailable(result)) {
    console.log(`  CAPABILITY ${result.reason}: ${result.detail}`)
    console.log(`  resolvedBy: ${result.resolvedBy}`)
    return
  }
  if (!isAvailable(result)) return

  console.log(`  HTTP accepted the strict schema: yes (no 400)`)
  console.log(`  decoded discrepancies: ${result.value.length}`)
  for (const proposal of result.value) {
    console.log(`    classification=${proposal.classification} resolved=${proposal.resolvedCandidate}`)
    console.log(`    claimRefs=${proposal.claimRefs.join(',')} evidenceRefs=${proposal.evidenceRefs.join(',')}`)
    console.log(`    ${proposal.description.slice(0, 120)}`)
  }

  const diagnostics = research.diagnostics()
  for (const call of diagnostics) {
    console.log(`\n  diagnostics (non-canonical): stop=${call.stopReason}`
      + ` in=${call.inputTokens} out=${call.outputTokens} latency=${call.latencyMs}ms`)
  }
}

main().catch((err: unknown) => {
  console.error(`PROBE FAILED: ${String(err)}`)
  process.exitCode = 1
})
