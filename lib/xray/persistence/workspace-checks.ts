import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger, correlationKey } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import { runPipeline, type PipelineRunResult } from '@/lib/xray/pipeline/run'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { loadCandidateCheckpoint, saveCandidateCheckpoint } from './workspace'

const AT = '2026-09-19T20:00:00Z'
const graph = kenyattaMaralalGraph()
const key = correlationKey({ investigationId: graph.investigation.id, stage: 'TRACE', inputArtifactVersion: 1 },
  { proposition: 'Synthetic durable correlation' })
async function migrate(db: PGlite) {
  for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit','0004_source_position_knowledge_basis']) {
    await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
  }
}
const source = graph.sources.find((item) => item.id === 'SRC-100')!
let ingestCalls = 0
let traceCalls = 0
const stages: StageDefinition[] = [
  { stage: 'INGEST', run: () => { ingestCalls++; return { sources: [source] } } },
  { stage: 'TRACE', run: (ctx) => {
    traceCalls++
    assert.equal(ctx.ledger.idFor(key), 'EV-100')
    if (traceCalls <= 2) throw new Error(`injected TRACE failure ${traceCalls}`)
    return { sourcePositions: [graph.sourcePositions[0]] }
  } },
]

async function run() {
  const db = new PGlite()
  try {
    await migrate(db)
    const ledger = new CorrelationLedger()
    ledger.assign(key, () => 'EV-100')
    let first: PipelineRunResult | undefined = await runPipeline({
      investigation: graph.investigation,
      seed: graph,
      stages,
      maxAttempts: 1,
      clock: () => AT,
      resume: { journal: new RunJournal(graph.investigation.id),
        accumulator: new GraphAccumulator(graph.investigation, graph), ledger },
    })
    assert.equal(first.status, 'STAGE_FAILED')
    assert.equal(first.artifactVersion, 1)
    assert.equal(first.journal.stageEntries().length, 2)
    assert.equal(first.journal.stageEntries()[1].status, 'FAILED')
    first.journal.appendCapability({ id: 'CR-DURABLE-1', investigationId: graph.investigation.id,
      stage: 'TRACE', observedArtifactVersion: 1,
      unavailable: { kind: 'CAPABILITY_UNAVAILABLE', operation: 'research-model:trace',
        reason: 'NOT_CONFIGURED', detail: 'Synthetic unavailable capability.', resolvedBy: 'Supply a model.' }, observedAt: AT })
    first.journal.appendInvalidation({ id: 'IR-DURABLE-1', investigationId: graph.investigation.id,
      requestId: 'REV-DURABLE-1', target: 'TRACE', staleStages: ['TRACE'], observedAt: AT })
    first.accumulator.setResearchStop({ reason: 'SATURATION', unresolvedHighPriorityLeads: [] })
    first.journal.appendStop({ id: 'TR-DURABLE-1', investigationId: graph.investigation.id,
      action: 'STOPPED', stop: { reason: 'SATURATION', unresolvedHighPriorityLeads: [] }, observedAt: AT })
    const before = {
      graph: first.accumulator.rebuild(),
      accumulator: first.accumulator.exportState(),
      journal: structuredClone(first.journal.entries),
      bindings: first.ledger.bindings(),
      revision: first.artifactVersion,
    }
    await saveCandidateCheckpoint(db, { executionRunId: 'RUN-DURABLE-1', investigationId: graph.investigation.id,
      startedAt: AT, updatedAt: AT, status: first.status, artifactVersion: first.artifactVersion,
      accumulator: first.accumulator, journal: first.journal, ledger: first.ledger })
    first = undefined // No in-memory execution objects are used after this point.
    const restored = await loadCandidateCheckpoint(db, 'RUN-DURABLE-1')
    assert.deepStrictEqual(restored.accumulator.rebuild(), before.graph)
    assert.deepStrictEqual(restored.accumulator.exportState(), before.accumulator)
    assert.deepStrictEqual(restored.journal.entries, before.journal)
    assert.deepStrictEqual(restored.ledger.bindings(), before.bindings)
    assert.equal(restored.artifactVersion, before.revision)
    assert.equal(restored.status, 'STAGE_FAILED')
    assert.deepStrictEqual(restored.journal.staleStages(), ['TRACE'])
    assert.equal(restored.journal.activeCapabilityEntries().length, 1)
    assert.equal(restored.accumulator.rebuild().investigation.researchStop?.reason, 'SATURATION')
    assert.deepStrictEqual(restored.accumulator.rebuild().sourcePositions, graph.sourcePositions)
    assert.deepStrictEqual(restored.accumulator.rebuild().evidence.map((item) => item.knowledgeBasis),
      graph.evidence.map((item) => item.knowledgeBasis))
    const ownershipProbe = GraphAccumulator.fromState(restored.accumulator.exportState())
    ownershipProbe.replace('INGEST', { sources: [] })
    assert.equal(ownershipProbe.rebuild().sources.some((item) => item.id === source.id), false)
    assert.equal(restored.accumulator.rebuild().sources.some((item) => item.id === source.id), true)
    const versionRows = await db.query('SELECT count(*)::int AS count FROM investigation_versions')
    assert.equal((versionRows.rows[0] as { count: number }).count, 0)
    assert.equal(((await db.query('SELECT latest_committed_version FROM investigations WHERE id=$1', [graph.investigation.id])).rows[0] as { latest_committed_version: number | null }).latest_committed_version, null)
    console.log('7d-a: checkpoint reload preserves canonical state, ownership, revision, ledger, journal, stale/capability/stop PASS')

    const oldIds = new Set(restored.journal.runIds())
    const oldEntries = restored.journal.length
    const retry = await runPipeline({ investigation: graph.investigation, stages,
      resume: { accumulator: restored.accumulator, journal: restored.journal, ledger: restored.ledger },
      startArtifactVersion: restored.artifactVersion, clock: () => AT })
    assert.equal(ingestCalls, 1)
    assert.equal(traceCalls, 2)
    assert.equal(retry.status, 'STAGE_FAILED')
    assert.equal(retry.artifactVersion, 1)
    assert.deepStrictEqual(retry.journal.staleStages(), ['TRACE'])
    assert.equal(retry.journal.activeCapabilityEntries().length, 1)
    assert.equal(retry.journal.stopEntries().at(-1)?.action, 'RESUMED')
    await saveCandidateCheckpoint(db, { executionRunId: 'RUN-DURABLE-1', investigationId: graph.investigation.id,
      startedAt: AT, updatedAt: AT, status: retry.status, artifactVersion: retry.artifactVersion,
      accumulator: retry.accumulator, journal: retry.journal, ledger: retry.ledger })
    const secondReload = await loadCandidateCheckpoint(db, 'RUN-DURABLE-1')
    assert.deepStrictEqual(secondReload.journal.staleStages(), ['TRACE'])
    const resumed = await runPipeline({ investigation: graph.investigation, stages,
      resume: { accumulator: secondReload.accumulator, journal: secondReload.journal, ledger: secondReload.ledger },
      startArtifactVersion: secondReload.artifactVersion, clock: () => AT })
    assert.equal(ingestCalls, 1)
    assert.equal(traceCalls, 3)
    assert.equal(resumed.artifactVersion, 2)
    assert.equal(resumed.journal.stageEntries().filter((item) => item.stage === 'TRACE' && item.status === 'FAILED').length, 2)
    assert.deepStrictEqual(resumed.journal.staleStages(), [])
    assert.deepStrictEqual(resumed.journal.activeCapabilityEntries(), [])
    assert.equal(resumed.journal.stopEntries().at(-1)?.action, 'RESUMED')
    assert.equal(resumed.graph.investigation.researchStop, undefined)
    assert.deepStrictEqual(resumed.graph.sourcePositions, graph.sourcePositions)
    assert.deepStrictEqual(resumed.graph.evidence.map((item) => item.knowledgeBasis), graph.evidence.map((item) => item.knowledgeBasis))
    assert.equal(resumed.ledger.idFor(key), 'EV-100')
    assert.equal(resumed.journal.entries.slice(oldEntries).some((entry) => oldIds.has(entry.run.id)), false)
    await saveCandidateCheckpoint(db, { executionRunId: 'RUN-DURABLE-1', investigationId: graph.investigation.id,
      startedAt: AT, updatedAt: AT, status: resumed.status, artifactVersion: resumed.artifactVersion,
      accumulator: resumed.accumulator, journal: resumed.journal, ledger: resumed.ledger })
    const finalReload = await loadCandidateCheckpoint(db, 'RUN-DURABLE-1')
    assert.equal(finalReload.artifactVersion, 2)
    assert.equal(finalReload.status, resumed.status)
    assert.deepStrictEqual(finalReload.journal.entries, resumed.journal.entries)
    assert.equal(finalReload.journal.gateEntries().length, 2)
    assert.equal(((await db.query('SELECT count(*)::int AS count FROM investigation_versions')).rows[0] as { count: number }).count, 0)
    console.log('7d-a: resumed run skips success, retains failure, clears stale/capability/stop, preserves identities; no version PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
