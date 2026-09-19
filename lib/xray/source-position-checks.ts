/** Slice 14a: additive domain and graph compatibility, without v0.3 validation. */
import assert from 'node:assert/strict'
import type { SourcePosition } from './domain'
import { createXrayKe001Graph } from './fixtures/xray-ke-001/graph'
import {
  allSourcePositions, createXRayGraph, sourcePositionById,
  sourcePositionsForClaim, sourcePositionsForSource,
} from './selectors'

const historical = createXrayKe001Graph()
assert.deepStrictEqual(historical.sourcePositions, [])
assert.equal(historical.investigation.sourcePositionIds, undefined)
assert.equal(historical.evidence.some((item) => Object.hasOwn(item, 'knowledgeBasis')), false)
assert.equal(sourcePositionById(historical, 'SP-001'), undefined)
assert.deepStrictEqual(sourcePositionsForSource(historical, historical.sources[0].id), [])
console.log('14a: historical graph and Evidence optionality PASS')

const sourceId = historical.sources[0].id
const claimId = historical.claims[0].id
const positions: SourcePosition[] = [
  {
    id: 'SP-001', sourceId, claimIds: [claimId], relationship: 'ADVERSARY',
    powerOrDependency: ['producer had custodial authority at T1'],
    timeScope: { from: '2020-01-01', to: '2020-12-31' },
    basis: 'DOCUMENTED', confidence: 'MEDIUM', supportingEvidenceIds: [],
    basisDescription: 'The source identifies the relationship at T1.',
  },
  {
    id: 'SP-002', sourceId, claimIds: [claimId], relationship: 'INTERMEDIARY',
    powerOrDependency: [], productionPurpose: 'Record a later exchange',
    timeScope: { from: '2021-01-01' },
    basis: 'INFERRED', confidence: 'LOW', supportingEvidenceIds: [],
    basisDescription: 'The later record supports a narrower relationship at T2.',
  },
]
const graph = createXRayGraph({
  ...historical,
  investigation: { ...historical.investigation, sourcePositionIds: positions.map((item) => item.id) },
  evidence: historical.evidence.map((item, index) => index === 0
    ? { ...item, knowledgeBasis: 'INSTITUTIONAL_CHARACTERIZATION' as const }
    : item),
  sourcePositions: positions,
})
assert.deepStrictEqual(allSourcePositions(graph), positions)
assert.equal(sourcePositionById(graph, 'SP-001'), positions[0])
assert.deepStrictEqual(sourcePositionsForSource(graph, sourceId), positions)
assert.deepStrictEqual(sourcePositionsForClaim(graph, claimId), positions)
assert.deepStrictEqual(positions.map((item) => item.relationship), ['ADVERSARY', 'INTERMEDIARY'])
assert.equal(graph.evidence[0].knowledgeBasis, 'INSTITUTIONAL_CHARACTERIZATION')
assert.equal(historical.evidence[0].knowledgeBasis, undefined)
assert.deepStrictEqual(historical.sourceDependencies, graph.sourceDependencies)
assert.deepStrictEqual(historical.evidenceProvenance, graph.evidenceProvenance)
console.log('14a: contextual positions, T1/T2, Evidence basis and orthogonal provenance PASS')
