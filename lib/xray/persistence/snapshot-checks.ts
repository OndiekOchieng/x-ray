import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { validateXRayGraph } from '@/lib/xray/validation'
import { evidenceForSource, originForEvidence, sourceById, evidenceById } from '@/lib/xray/selectors'
import { readSnapshot, writeInitialSnapshot } from './snapshot'

async function main() {
const db = new PGlite()
try {
  const migration = readFileSync(new URL('../../../db/migrations/0001_version_ownership.up.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const precisionUp = readFileSync(new URL('../../../db/migrations/0002_source_retrieval_precision.up.sql', import.meta.url), 'utf8')
  await db.exec(precisionUp)
  await db.exec(readFileSync(new URL('../../../db/migrations/0002_source_retrieval_precision.down.sql', import.meta.url), 'utf8'))
  await db.exec(precisionUp)
  console.log('7b: precision migration up/down/up PASS')
  const canonical = createXrayKe001Graph()
  await writeInitialSnapshot(db, canonical)
  const restored = await readSnapshot(db, canonical.investigation.id, 1)
  assert.deepStrictEqual(restored, canonical)
  console.log('7b: canonical XRayGraph deep round-trip PASS')
  assert.equal(restored.investigation.currentVersion, 1)
  assert.deepStrictEqual(restored.investigation.stageRuns, canonical.investigation.stageRuns)
  assert.equal(restored.investigation.researchStop?.reason, 'SATURATION')
  assert.deepStrictEqual(restored.sourceDependencies, canonical.sourceDependencies)
  assert.deepStrictEqual(restored.evidenceProvenance, canonical.evidenceProvenance)
  assert.deepStrictEqual(restored.sources.map((source) => source.id), canonical.sources.map((source) => source.id))
  assert.deepStrictEqual(restored.evidence.map((item) => item.id), canonical.evidence.map((item) => item.id))
  assert.ok(sourceById(restored, restored.sources[0].id))
  assert.ok(evidenceById(restored, restored.evidence[0].id))
  assert.notDeepStrictEqual(restored.sources[0], restored.evidence[0])
  assert.deepStrictEqual(evidenceForSource(restored, restored.sources[0].id), evidenceForSource(canonical, canonical.sources[0].id))
  assert.deepStrictEqual(originForEvidence(restored, restored.evidenceProvenance[0].evidenceId),
    originForEvidence(canonical, canonical.evidenceProvenance[0].evidenceId))
  const provenanceTables = await db.query("SELECT count(*)::int AS source_count FROM source_dependencies WHERE investigation_id=$1 AND version_number=1", [canonical.investigation.id])
  const propositionTable = await db.query("SELECT count(*)::int AS proposition_count FROM evidence_provenance WHERE investigation_id=$1 AND version_number=1", [canonical.investigation.id])
  assert.equal((provenanceTables.rows[0] as { source_count: number }).source_count, canonical.sourceDependencies.length)
  assert.equal((propositionTable.rows[0] as { proposition_count: number }).proposition_count, canonical.evidenceProvenance.length)
  console.log('7b: distinct source/evidence and both provenance queries PASS')
  const validation = validateXRayGraph(restored, { mode: 'FULL' })
  assert.equal(validation.valid, true)
  for (const behavior of XRAY_KE_001_ACCEPTANCE) assert.equal(behavior.run(restored).status, 'SATISFIED', behavior.id)
  console.log('7b: FULL validation and A01–A10 PASS')
} finally {
  await db.close()
}
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
