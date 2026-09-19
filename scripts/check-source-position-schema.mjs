import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = n => readFileSync(new URL(`../db/migrations/${n}`, import.meta.url), 'utf8');
const exec = sql => db.exec(sql);
const row = async sql => (await db.query(sql)).rows[0];
let checks = 0;

async function rejects(name, sql, expected) {
  try {
    await exec(`BEGIN; ${sql} COMMIT;`);
    throw new Error(`${name} unexpectedly accepted`);
  } catch (error) {
    await exec('ROLLBACK;');
    if (error.message.includes('unexpectedly accepted')) throw error;
    assert.match(error.message, expected, `${name}: wrong rejection reason`);
    checks += 1;
    console.log('PASS', name);
  }
}

for (const n of ['0001_version_ownership', '0002_source_retrieval_precision', '0003_reevaluation_audit'])
  await exec(migration(`${n}.up.sql`));
await exec(migration('0004_source_position_knowledge_basis.up.sql'));
await exec(migration('0004_source_position_knowledge_basis.down.sql'));
await exec(migration('0004_source_position_knowledge_basis.up.sql'));
checks += 1;
console.log('PASS 0004 up/down/up');

// Exercise the additive migration over a committed pre-v0.3 row, not only a
// fresh schema. Its new values must remain NULL/absent through up/down/up.
const legacyDb = new PGlite();
for (const n of ['0001_version_ownership', '0002_source_retrieval_precision', '0003_reevaluation_audit'])
  await legacyDb.exec(migration(`${n}.up.sql`));
await legacyDb.exec(`BEGIN;
  INSERT INTO investigations(id) VALUES ('LEGACY');
  INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,protocol_version,status,surface_source_id,investigation_created_at)
    VALUES ('LEGACY',1,'2026-09-19T00:00:00Z','INITIAL_RESEARCH','0.1.0','RESEARCH_COMPLETE','S','2026-09-19T00:00:00Z');
  INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility)
    VALUES ('LEGACY',1,'S','historical','2026-09-19','NEWS','SECONDARY','REPEATING','RETRIEVED');
  INSERT INTO evidence(investigation_id,version_number,id,source_id,proposition,relationship,strength)
    VALUES ('LEGACY',1,'E','S','historical proposition','SUPPORTS','DIRECT');
  UPDATE investigations SET latest_committed_version=1 WHERE id='LEGACY'; COMMIT;`);
await legacyDb.exec(migration('0004_source_position_knowledge_basis.up.sql'));
await legacyDb.exec(migration('0004_source_position_knowledge_basis.down.sql'));
await legacyDb.exec(migration('0004_source_position_knowledge_basis.up.sql'));
assert.equal((await legacyDb.query("SELECT knowledge_basis FROM evidence WHERE investigation_id='LEGACY' AND id='E'")).rows[0].knowledge_basis, null);
assert.equal((await legacyDb.query("SELECT source_position_membership_present FROM investigation_versions WHERE investigation_id='LEGACY'")).rows[0].source_position_membership_present, false);
assert.equal((await legacyDb.query("SELECT count(*)::int AS n FROM source_positions WHERE investigation_id='LEGACY'")).rows[0].n, 0);
await legacyDb.close();
checks += 1;
console.log('PASS migration over committed historical v1 preserves NULL/absence');

const columns = (await db.query(`SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='public'`)).rows;
assert.ok(columns.some(x => x.table_name === 'evidence' && x.column_name === 'knowledge_basis' && x.is_nullable === 'YES'));
assert.ok(columns.some(x => x.table_name === 'investigation_versions' && x.column_name === 'source_position_membership_present'));
for (const name of ['source_positions','source_position_claims','source_position_supporting_evidence','investigation_source_positions'])
  assert.ok(columns.some(x => x.table_name === name), `${name} missing`);
checks += 1;
console.log('PASS exact tables and nullable knowledge basis');

const at = '2026-09-19T00:00:00Z';
const source = (v,id) => `INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',${v},'${id}','test','${at}','NEWS','SECONDARY','REPEATING','RETRIEVED');`;
const claim = (v,id) => `INSERT INTO claims(investigation_id,version_number,id,text,origin,layer,type,priority,entities,ambiguities) VALUES ('I',${v},'${id}','test','SURFACE','OBSERVATION','OTHER','HIGH','[]','[]');`;
const evidence = (v,id,sourceId,basis='NULL') => `INSERT INTO evidence(investigation_id,version_number,id,source_id,proposition,relationship,strength,knowledge_basis) VALUES ('I',${v},'${id}','${sourceId}','test','SUPPORTS','DIRECT',${basis});`;
const position = (v,id,sourceId) => `INSERT INTO source_positions(investigation_id,version_number,id,source_id,relationship,power_or_dependency,basis,confidence,basis_description) VALUES ('I',${v},'${id}','${sourceId}','WITNESS','[]','INFERRED','LOW','test basis');`;

await exec(`BEGIN; INSERT INTO investigations(id) VALUES ('I');
  INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,protocol_version,status,surface_source_id,investigation_created_at)
  VALUES ('I',1,'${at}','INITIAL_RESEARCH','0.1.0','RESEARCH_COMPLETE','S1','${at}');
  ${source(1,'S1')} ${source(1,'S_ONLY_V1')} ${claim(1,'C1')} ${evidence(1,'E1','S1')}
  UPDATE investigations SET latest_committed_version=1 WHERE id='I'; COMMIT;`);
assert.equal((await row("SELECT knowledge_basis FROM evidence WHERE version_number=1 AND id='E1'")).knowledge_basis, null);
assert.equal((await row("SELECT source_position_membership_present FROM investigation_versions WHERE version_number=1")).source_position_membership_present, false);
checks += 1;
console.log('PASS historical NULL and absent membership, no backfill');

await exec(`BEGIN;
  INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,supersedes_version,protocol_version,status,surface_source_id,investigation_created_at,source_position_membership_present)
  VALUES ('I',2,'${at}','CORRECTION',1,'0.3.0','RESEARCH_COMPLETE','S2','${at}',true);
  ${source(2,'S2')} ${claim(2,'C2')} ${claim(2,'C4')}
  ${evidence(2,'E2','S2',"'INSTITUTIONAL_CHARACTERIZATION'")}
  ${evidence(2,'E4','S2',"'DIRECT_OBSERVATION'")}
  ${position(2,'SP2','S2')}
  INSERT INTO source_positions(investigation_id,version_number,id,source_id,relationship,
    relationship_description,power_or_dependency,production_purpose,time_scope,basis,confidence,basis_description)
    VALUES ('I',2,'SP_FULL','S2','OTHER','specific contextual relation',
      '["first context","second context"]','record a decision',
      '{"from":"1952-01-01","to":"1960-12-31","description":"T1 to T2"}',
      'DOCUMENTED','HIGH','documented in the record');
  INSERT INTO source_position_claims VALUES ('I',2,'SP2',0,'C2');
  INSERT INTO source_position_claims VALUES ('I',2,'SP_FULL',0,'C4'),('I',2,'SP_FULL',1,'C2');
  INSERT INTO source_position_supporting_evidence VALUES ('I',2,'SP2',0,'E2');
  INSERT INTO source_position_supporting_evidence VALUES ('I',2,'SP_FULL',0,'E4'),('I',2,'SP_FULL',1,'E2');
  INSERT INTO investigation_source_positions VALUES ('I',2,0,'SP2');
  INSERT INTO investigation_source_positions VALUES ('I',2,1,'SP_FULL');
  UPDATE investigations SET latest_committed_version=2 WHERE id='I'; COMMIT;`);
assert.equal((await row("SELECT knowledge_basis FROM evidence WHERE version_number=2 AND id='E2'")).knowledge_basis, 'INSTITUTIONAL_CHARACTERIZATION');
const full = await row("SELECT relationship_description,power_or_dependency,production_purpose,time_scope,basis,confidence,basis_description FROM source_positions WHERE investigation_id='I' AND version_number=2 AND id='SP_FULL'");
assert.equal(full.relationship_description, 'specific contextual relation');
assert.deepEqual(full.power_or_dependency, ['first context','second context']);
assert.equal(full.production_purpose, 'record a decision');
assert.deepEqual(full.time_scope, { from: '1952-01-01', to: '1960-12-31', description: 'T1 to T2' });
assert.equal(full.basis, 'DOCUMENTED');
assert.equal(full.confidence, 'HIGH');
assert.equal(full.basis_description, 'documented in the record');
assert.deepEqual((await db.query("SELECT claim_id FROM source_position_claims WHERE owner_id='SP_FULL' ORDER BY ordinal")).rows.map(x => x.claim_id), ['C4','C2']);
assert.deepEqual((await db.query("SELECT evidence_id FROM source_position_supporting_evidence WHERE owner_id='SP_FULL' ORDER BY ordinal")).rows.map(x => x.evidence_id), ['E4','E2']);
assert.deepEqual((await db.query("SELECT source_position_id FROM investigation_source_positions WHERE investigation_id='I' AND version_number=2 ORDER BY ordinal")).rows.map(x => x.source_position_id), ['SP2','SP_FULL']);
checks += 1;
console.log('PASS v2 concrete basis, full SourcePosition shape and ordered relations');

await exec(`BEGIN; INSERT INTO investigations(id) VALUES ('J');
  INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,protocol_version,status,surface_source_id,investigation_created_at)
    VALUES ('J',1,'${at}','INITIAL_RESEARCH','0.3.0','RESEARCH_COMPLETE','S_J','${at}');
  INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility)
    VALUES ('J',1,'S_J','other investigation','${at}','NEWS','SECONDARY','REPEATING','RETRIEVED');
  INSERT INTO claims(investigation_id,version_number,id,text,origin,layer,type,priority,entities,ambiguities)
    VALUES ('J',1,'C9','other investigation','SURFACE','OBSERVATION','OTHER','HIGH','[]','[]');
  INSERT INTO evidence(investigation_id,version_number,id,source_id,proposition,relationship,strength)
    VALUES ('J',1,'E_J','S_J','other investigation','SUPPORTS','DIRECT');
  UPDATE investigations SET latest_committed_version=1 WHERE id='J'; COMMIT;`);

// Pointer stays at v2; targeted deferred FKs are forced below.
const draft = `
  INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,supersedes_version,protocol_version,status,surface_source_id,investigation_created_at,source_position_membership_present)
  VALUES ('I',3,'${at}','CORRECTION',2,'0.3.0','RUNNING','S3','${at}',true);
  ${source(3,'S3')} ${claim(3,'C3')} ${evidence(3,'E3','S3')}`;
await rejects('cross-version Source FK', `${draft} ${position(3,'SP3','S2')} SET CONSTRAINTS source_position_source_fk IMMEDIATE;`, /source_position_source_fk/);
await rejects('cross-version Claim FK', `${draft} ${position(3,'SP3','S3')} INSERT INTO source_position_claims VALUES ('I',3,'SP3',0,'C2'); SET CONSTRAINTS source_position_claim_target_fk IMMEDIATE;`, /source_position_claim_target_fk/);
await rejects('cross-version Evidence FK', `${draft} ${position(3,'SP3','S3')} INSERT INTO source_position_supporting_evidence VALUES ('I',3,'SP3',0,'E2'); SET CONSTRAINTS source_position_evidence_target_fk IMMEDIATE;`, /source_position_evidence_target_fk/);
await rejects('cross-version Investigation membership FK', `${draft} INSERT INTO investigation_source_positions VALUES ('I',3,0,'SP2'); SET CONSTRAINTS investigation_source_position_target_fk IMMEDIATE;`, /investigation_source_position_target_fk/);
await rejects('cross-investigation Source FK', `${draft} ${position(3,'SP3','S_J')} SET CONSTRAINTS source_position_source_fk IMMEDIATE;`, /source_position_source_fk/);
await rejects('cross-investigation Claim FK', `${draft} ${position(3,'SP3','S3')} INSERT INTO source_position_claims VALUES ('I',3,'SP3',0,'C9'); SET CONSTRAINTS source_position_claim_target_fk IMMEDIATE;`, /source_position_claim_target_fk/);
await rejects('cross-investigation Evidence FK', `${draft} ${position(3,'SP3','S3')} INSERT INTO source_position_supporting_evidence VALUES ('I',3,'SP3',0,'E_J'); SET CONSTRAINTS source_position_evidence_target_fk IMMEDIATE;`, /source_position_evidence_target_fk/);

await rejects('illegal KnowledgeBasis enum', `${draft} ${evidence(3,'E_BAD','S3',"'NOT_A_BASIS'")}`, /knowledge_basis/);
await rejects('invalid power list JSON', `${draft} INSERT INTO source_positions(investigation_id,version_number,id,source_id,relationship,power_or_dependency,basis,confidence) VALUES ('I',3,'SP3','S3','WITNESS','[42]','INFERRED','LOW');`, /xray_json_string_array/);

const immutable = /committed version data is immutable/;
const late = /cannot add data to committed version/;
for (const [name, table, update, insert] of [
  ['position','source_positions',"UPDATE source_positions SET relationship='SUBJECT' WHERE investigation_id='I' AND version_number=2 AND id='SP2';",position(2,'SP_LATE','S2')],
  ['claim link','source_position_claims',"UPDATE source_position_claims SET ordinal=1 WHERE investigation_id='I' AND version_number=2 AND owner_id='SP2';","INSERT INTO source_position_claims VALUES ('I',2,'SP2',1,'C2');"],
  ['evidence link','source_position_supporting_evidence',"UPDATE source_position_supporting_evidence SET ordinal=1 WHERE investigation_id='I' AND version_number=2 AND owner_id='SP2';","INSERT INTO source_position_supporting_evidence VALUES ('I',2,'SP2',1,'E2');"],
  ['membership','investigation_source_positions',"UPDATE investigation_source_positions SET ordinal=1 WHERE investigation_id='I' AND version_number=2;","INSERT INTO investigation_source_positions VALUES ('I',2,1,'SP2');"],
]) {
  await rejects(`immutable ${name} update`, update, immutable);
  await rejects(`immutable ${name} delete`, `DELETE FROM ${table} WHERE investigation_id='I' AND version_number=2;`, immutable);
  await rejects(`late ${name} insert`, insert, late);
}
await rejects('immutable KnowledgeBasis column', "UPDATE evidence SET knowledge_basis='UNKNOWN' WHERE investigation_id='I' AND version_number=2 AND id='E2';", immutable);
await rejects('immutable membership presence', "UPDATE investigation_versions SET source_position_membership_present=false WHERE investigation_id='I' AND version_number=2;", immutable);

const triggers = (await db.query(`SELECT tgrelid::regclass::text AS relation, tgname FROM pg_trigger WHERE NOT tgisinternal`)).rows;
for (const table of ['source_positions','source_position_claims','source_position_supporting_evidence','investigation_source_positions']) {
  assert.ok(triggers.some(x => x.relation === table && x.tgname === `immutable_${table}`));
  assert.ok(triggers.some(x => x.relation === table && x.tgname === `uncommitted_${table}`));
}
checks += 1;
console.log('PASS complete immutability/uncommitted trigger catalog');

await db.close();
console.log(`15a schema: ${checks}/${checks} checks passed`);
