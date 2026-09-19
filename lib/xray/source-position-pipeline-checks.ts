import assert from 'node:assert/strict'
import { createXrayKe001Graph } from './fixtures/xray-ke-001/graph'
import { createXRayGraph } from './selectors'
import { validateXRayGraph } from './validation'
import { canonicalizeSourcePositions, runPipeline, type ProposalRef, type SourcePositionProposal } from './pipeline'

const historical = createXrayKe001Graph()
const source = historical.sources[0]
const claim = historical.claims[0]
const sourceRef = 'ref:source' as ProposalRef
const claimRef = 'ref:claim' as ProposalRef
const positionRef = 'ref:position' as ProposalRef
const base: SourcePositionProposal = {
  sourceRef, claimRefs: [claimRef], relationship: 'SUBJECT', powerOrDependency: [],
  basis: 'INFERRED', confidence: 'LOW', supportingEvidenceRefs: [],
  basisDescription: 'Position inferred from the inspected record.',
}
const handles = { sources: new Map([[sourceRef, source.id]]), claims: new Map([[claimRef, claim.id]]), evidence: new Map() }
async function checkPipeline(): Promise<void> {
let firstId = ''
const result = await runPipeline({
  investigation: historical.investigation,
  seed: historical,
  maxAttempts: 2,
  stages: [
    { stage: 'TRACE', run(ctx) {
      const position = canonicalizeSourcePositions([base], handles, ctx.ids)[0]
      if (ctx.attempt === 1) { firstId = position.id; throw new Error('transient trace failure') }
      assert.equal(position.id, firstId)
      return { sourcePositions: [position] }
    } },
    { stage: 'PROVENANCE', run(ctx) {
      const prior = ctx.graph.sourcePositions[0]
      assert.ok(prior)
      const revised = canonicalizeSourcePositions([{
        ...base, positionRef, basis: 'DOCUMENTED', confidence: 'MEDIUM',
        basisDescription: 'The source documents this position.',
      }], { ...handles, positions: new Map([[positionRef, prior.id]]) }, ctx.ids)[0]
      return { sourcePositions: [revised] }
    } },
  ],
})
assert.equal(firstId, 'SP-001')
assert.equal(result.journal.stageEntries().filter((e) => e.stage === 'TRACE' && e.status === 'FAILED').length, 1)
assert.equal(result.graph.sourcePositions[0].id, firstId)
assert.equal(result.graph.sourcePositions[0].basis, 'DOCUMENTED')
assert.deepEqual(result.graph.sourceDependencies, historical.sourceDependencies)
assert.deepEqual(result.graph.evidenceProvenance, historical.evidenceProvenance)
console.log('14b: TRACE retry identity, PROVENANCE revision, orthogonal lineage PASS')
}

void checkPipeline().catch((error: unknown) => { console.error(error); process.exitCode = 1 })

const v03 = createXRayGraph({ ...historical, investigation: { ...historical.investigation, protocolVersion: '0.3.0' } })
assert.equal(validateXRayGraph(v03, { mode: 'STAGED' }).violations.some((v) => v.code === 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS'), false)
assert.equal(validateXRayGraph(v03, { mode: 'FULL' }).violations.filter((v) => v.code === 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS').length, historical.evidence.length)
const unknown = createXRayGraph({ ...v03, evidence: v03.evidence.map((e) => ({ ...e, knowledgeBasis: 'UNKNOWN' as const })) })
assert.equal(validateXRayGraph(unknown, { mode: 'FULL' }).violations.filter((v) => v.code === 'STRUCTURAL/UNKNOWN_KNOWLEDGE_BASIS').length, historical.evidence.length)
assert.equal(validateXRayGraph(unknown, { mode: 'STAGED' }).violations.some((v) => v.code === 'STRUCTURAL/UNKNOWN_KNOWLEDGE_BASIS'), false)
const complete = createXRayGraph({ ...v03, evidence: v03.evidence.map((e) => ({ ...e, knowledgeBasis: 'SECONDARY_SYNTHESIS' as const })) })
assert.equal(validateXRayGraph(complete, { mode: 'FULL' }).violations.some((v) => v.code === 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS' || v.code === 'STRUCTURAL/UNKNOWN_KNOWLEDGE_BASIS'), false)
assert.equal(validateXRayGraph(historical, { mode: 'FULL' }).violations.some((v) => v.code === 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS'), false)
const v02 = createXRayGraph({ ...historical, investigation: { ...historical.investigation, protocolVersion: '0.2.0' } })
assert.equal(validateXRayGraph(v02, { mode: 'FULL' }).violations.some((v) => v.code === 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS'), false)
assert.equal(validateXRayGraph(createXRayGraph({ ...v02, evidence: unknown.evidence }), { mode: 'FULL' }).violations.some((v) => v.code === 'STRUCTURAL/UNKNOWN_KNOWLEDGE_BASIS'), false)
console.log('14b: v0.3 FULL basis requirement and historical/STAGED compatibility PASS')

const badPosition = {
  id: 'SP-001', sourceId: 'SRC-MISSING', claimIds: [claim.id], relationship: 'SUBJECT' as const,
  powerOrDependency: [], basis: 'INFERRED' as const, confidence: 'LOW' as const,
  supportingEvidenceIds: ['EV-MISSING'],
}
const invalid = createXRayGraph({ ...historical, sourcePositions: [badPosition] })
const codes = validateXRayGraph(invalid, { mode: 'STAGED' }).violations.map((v) => v.code)
assert.ok(codes.includes('REFERENTIAL/DANGLING_REFERENCE'))
const unexplained = createXRayGraph({ ...historical, sourcePositions: [{ ...badPosition, sourceId: source.id, supportingEvidenceIds: [] }] })
assert.ok(validateXRayGraph(unexplained, { mode: 'STAGED' }).violations.some((v) => v.code === 'STRUCTURAL/SOURCE_POSITION_BASIS_UNEXPLAINED'))
console.log('14b: SourcePosition referential and basis violations PASS')
