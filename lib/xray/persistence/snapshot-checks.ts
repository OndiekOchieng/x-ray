import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { kenyattaMaralalGraph } from '@/lib/xray/fixtures/kenyatta-maralal-calibration'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { validateXRayGraph } from '@/lib/xray/validation'
import { evidenceForSource, originForEvidence, sourceById, evidenceById } from '@/lib/xray/selectors'
import { createXRayGraph } from '@/lib/xray/selectors/graph'
import { readSnapshot, writeInitialSnapshot } from './snapshot'

const migrationSql = (name: string) => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), 'utf8')
async function migrate(db: PGlite) {
  for (const name of [
    '0001_version_ownership.up.sql', '0002_source_retrieval_precision.up.sql',
    '0003_reevaluation_audit.up.sql', '0004_source_position_knowledge_basis.up.sql',
  ]) await db.exec(migrationSql(name))
}

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
  await db.exec(migrationSql('0003_reevaluation_audit.up.sql'))
  await db.exec(migrationSql('0004_source_position_knowledge_basis.up.sql'))
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
  assert.deepStrictEqual(restored.sourcePositions, [])
  assert.equal(Object.hasOwn(restored.investigation, 'sourcePositionIds'), false)
  assert.ok(restored.evidence.every((item) => !Object.hasOwn(item, 'knowledgeBasis')))
  const historicalStorage = await db.query('SELECT source_position_membership_present FROM investigation_versions WHERE investigation_id=$1 AND version_number=1', [canonical.investigation.id])
  assert.equal((historicalStorage.rows[0] as { source_position_membership_present: boolean }).source_position_membership_present, false)
  assert.equal(((await db.query('SELECT count(*)::int AS count FROM evidence WHERE knowledge_basis IS NOT NULL')).rows[0] as { count: number }).count, 0)
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

const v03db = new PGlite()
try {
  await migrate(v03db)
  const calibration = kenyattaMaralalGraph()
  // Discovered claims have no surface passage; omit explicit undefined fields.
  const input = JSON.parse(JSON.stringify({ ...calibration, index: undefined,
    investigation: { ...calibration.investigation, sourcePositionIds: [...calibration.investigation.sourcePositionIds!].reverse() },
    sourcePositions: [...calibration.sourcePositions].reverse(),
    claims: calibration.claims.map((claim) => claim.id === 'DC003' ? { ...claim, sourcePassage: undefined } : claim),
  }))
  const fixture = createXRayGraph(input)
  await writeInitialSnapshot(v03db, fixture)
  const v03 = await readSnapshot(v03db, fixture.investigation.id, 1)
  assert.deepStrictEqual(v03, fixture)
  assert.deepStrictEqual(v03.investigation.sourcePositionIds, ['SP-002', 'SP-001'])
  assert.deepStrictEqual(v03.sourcePositions.map((item) => item.claimIds), fixture.sourcePositions.map((item) => item.claimIds))
  assert.deepStrictEqual(v03.sourcePositions.map((item) => item.supportingEvidenceIds), fixture.sourcePositions.map((item) => item.supportingEvidenceIds))
  assert.deepStrictEqual(v03.sourcePositions.map((item) => item.timeScope), fixture.sourcePositions.map((item) => item.timeScope))
  assert.deepStrictEqual(v03.evidence.map((item) => item.knowledgeBasis), fixture.evidence.map((item) => item.knowledgeBasis))
  assert.deepStrictEqual(v03.sourceDependencies, fixture.sourceDependencies)
  assert.deepStrictEqual(v03.evidenceProvenance, fixture.evidenceProvenance)
  assert.equal(((await v03db.query('SELECT count(*)::int AS count FROM source_positions')).rows[0] as { count: number }).count, 2)
  assert.equal(((await v03db.query('SELECT count(*)::int AS count FROM source_dependencies')).rows[0] as { count: number }).count, fixture.sourceDependencies.length)
  assert.equal(((await v03db.query('SELECT count(*)::int AS count FROM evidence_provenance')).rows[0] as { count: number }).count, fixture.evidenceProvenance.length)
  console.log('15b: v0.3 SourcePosition/KnowledgeBasis and four independent layers round-trip PASS')
} finally {
  await v03db.close()
}
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
