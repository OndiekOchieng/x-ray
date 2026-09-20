import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { readSnapshot, writeInitialSnapshot } from './snapshot'

const fixture = createXrayKe001Graph()
const AT = '2026-09-20T05:00:00Z'
async function run() {
  const db = new PGlite()
  try {
    for (const name of ['0001_version_ownership','0002_source_retrieval_precision','0003_reevaluation_audit',
      '0004_source_position_knowledge_basis','0005_execution_audit','0006_graduation_audit'])
      await db.exec(readFileSync(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8'))
    await writeInitialSnapshot(db, fixture)
    const before = await readSnapshot(db, fixture.investigation.id, 1)
    const insert = (id: string, investigationId: string, version: number, gapId: string) =>
      db.query(`INSERT INTO ati_requests(id,investigation_id,origin_version,gap_id,ordinal,jurisdiction,
        holding_institution,requested_records,public_interest_context,status,drafted_at,received_source_ids)
        VALUES ($1,$2,$3,$4,0,'KE','Illustrative office','["record"]','Public record context','DRAFT',$5,'[]')`,
      [id, investigationId, version, gapId, AT])
    await insert('ATI-7DD', fixture.investigation.id, 1, 'GAP-001')
    for (const [id, investigationId, version, gapId] of [
      ['ATI-BAD-INV','OTHER',1,'GAP-001'], ['ATI-BAD-VERSION',fixture.investigation.id,2,'GAP-001'],
      ['ATI-BAD-GAP',fixture.investigation.id,1,'GAP-NOT-FOUND'],
      ['ATI-NOT-ELIGIBLE',fixture.investigation.id,1,'GAP-003'],
    ] as const) await assert.rejects(insert(id, investigationId, version, gapId), /foreign key|violates/i)
    await db.query(`UPDATE ati_requests SET status='RESPONDED',submitted_at=$1,responded_at=$1,
      received_source_ids='["SRC-LATER"]' WHERE id='ATI-7DD'`, [AT])
    const lifecycle = (await db.query(`SELECT origin_version,gap_id,status,received_source_ids FROM ati_requests
      WHERE id='ATI-7DD'`)).rows[0] as {origin_version:number;gap_id:string;status:string;received_source_ids:string[]}
    assert.equal(lifecycle.origin_version, 1)
    assert.equal(lifecycle.gap_id, 'GAP-001')
    assert.equal(lifecycle.status, 'RESPONDED')
    assert.deepStrictEqual(lifecycle.received_source_ids, ['SRC-LATER'])
    assert.deepStrictEqual(await readSnapshot(db, fixture.investigation.id, 1), before)
    assert.equal(((await db.query(`SELECT count(*)::int AS n FROM investigation_versions
      WHERE investigation_id=$1`, [fixture.investigation.id])).rows[0] as {n:number}).n, 1)
    assert.equal(((await db.query(`SELECT count(*)::int AS n FROM evidence
      WHERE investigation_id=$1 AND source_id='SRC-LATER'`, [fixture.investigation.id])).rows[0] as {n:number}).n, 0)
    console.log('7d-d ATI: version-scoped eligible origin, invalid references, lifecycle isolation PASS')
  } finally { await db.close() }
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
