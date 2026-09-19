import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db=new PGlite();
const up=readFileSync(new URL('../db/migrations/0001_version_ownership.up.sql', import.meta.url),'utf8');
await db.exec(up);
await db.exec(readFileSync(new URL('../db/migrations/0001_version_ownership.down.sql', import.meta.url), 'utf8'));
await db.exec(up);
console.log('PASS empty DB up/down/up');
const q=async sql=>db.exec(sql);
let failed=0;
async function pass(name,sql){try{await q(sql);console.log('PASS',name)}catch(e){failed++;console.log('FAIL',name,e.message)}}
async function reject(name,sql){try{await q('BEGIN;'+sql+'COMMIT;');failed++;console.log('FAIL',name,'unexpectedly accepted')}catch(e){await q('ROLLBACK;');console.log('PASS',name,'rejected')}}
const v=(n,s)=>`INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,supersedes_version,protocol_version,status,surface_source_id,investigation_created_at) VALUES ('I',${n},'2026-09-19T00:00:00Z',${n===1?"'INITIAL_RESEARCH',NULL":"'CORRECTION',1"},'0.1','RESEARCH_COMPLETE','S','2026-09-19T00:00:00Z'); INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',${n},'S',${s},'2026-09-19T00:00:00Z','NEWS','SECONDARY','REPEATING','RETRIEVED');`;
await pass('v1 seed',`BEGIN; INSERT INTO investigations(id) VALUES ('I'); ${v(1,"'v1'")} INSERT INTO gaps(investigation_id,version_number,id,missing_evidence,why_it_matters,resolving_evidence,search_already_attempted,status,effect_on_finding,resolution_path,ati_eligible) VALUES ('I',1,'G_ELIGIBLE','x','y','[]','[]','OPEN','z','PUBLIC_RECORD_REQUEST',true),('I',1,'G_OTHER','x','y','[]','[]','OPEN','z','WAIT_FOR_RECORD',false); INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',1,'S_ONLY_V1','v1','2026-09-19T00:00:00Z','NEWS','SECONDARY','REPEATING','RETRIEVED'); UPDATE investigations SET latest_committed_version=1 WHERE id='I'; COMMIT;`);
await pass('v2 same canonical id different content',`BEGIN; ${v(2,"'v2'")} UPDATE investigations SET latest_committed_version=2 WHERE id='I'; COMMIT;`);
await reject('duplicate scoped id',`INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',1,'S','again','2026-09-19T00:00:00Z','NEWS','SECONDARY','REPEATING','RETRIEVED');`);
await reject('late insert into committed v1',`INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',1,'S_ONLY_V1','v1','2026-09-19T00:00:00Z','NEWS','SECONDARY','REPEATING','RETRIEVED');`);
await reject('cross-version evidence source',`INSERT INTO evidence(investigation_id,version_number,id,source_id,proposition,relationship,strength) VALUES ('I',2,'E','S_ONLY_V1','p','SUPPORTS','DIRECT');`);
await reject('bad claim namespace',`INSERT INTO claims(investigation_id,version_number,id,text,origin,layer,type,priority,entities,ambiguities) VALUES ('I',1,'DC1','x','SURFACE','OBSERVATION','OTHER','HIGH','[]','[]');`);
await reject('bad source enum',`INSERT INTO sources(investigation_id,version_number,id,title,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',1,'BAD','bad','2026-09-19T00:00:00Z','INVENTED','SECONDARY','REPEATING','RETRIEVED');`);
await reject('invalid date-only precision',`INSERT INTO sources(investigation_id,version_number,id,title,published_at,retrieved_at,source_type,evidence_class,origin_status,accessibility) VALUES ('I',1,'BAD','bad','2026-09-19T00:00:00','2026-09-19T00:00:00Z','NEWS','SECONDARY','REPEATING','RETRIEVED');`);
await reject('invalid gap eligibility',`INSERT INTO gaps(investigation_id,version_number,id,missing_evidence,why_it_matters,resolving_evidence,search_already_attempted,status,effect_on_finding,resolution_path,ati_eligible) VALUES ('I',1,'G','x','y','[]','[]','OPEN','z','WAIT_FOR_RECORD',true);`);
await reject('immutable source',`UPDATE sources SET title='tampered' WHERE investigation_id='I' AND version_number=1 AND id='S';`);
await reject('latest pointer cannot rewind',`UPDATE investigations SET latest_committed_version=1 WHERE id='I';`);
await pass('ATI eligible origin',`INSERT INTO ati_requests(id,investigation_id,origin_version,gap_id,ordinal,jurisdiction,holding_institution,requested_records,public_interest_context,status,drafted_at,received_source_ids) VALUES ('A','I',1,'G_ELIGIBLE',0,'KE','Office','[]','why','DRAFT','2026-09-19T00:00:00Z','[]');`);
await reject('ATI ineligible origin',`INSERT INTO ati_requests(id,investigation_id,origin_version,gap_id,ordinal,jurisdiction,holding_institution,requested_records,public_interest_context,status,drafted_at,received_source_ids) VALUES ('B','I',1,'G_OTHER',1,'KE','Office','[]','why','DRAFT','2026-09-19T00:00:00Z','[]');`);
await reject('cross-version link target',`INSERT INTO investigation_sources(investigation_id,version_number,ordinal,source_id) VALUES ('I',2,0,'S_ONLY_V1');`);
await reject('orphan version without pointer advance',`INSERT INTO investigation_versions(investigation_id,version_number,created_at,trigger,supersedes_version,protocol_version,status,surface_source_id,investigation_created_at) VALUES ('I',3,'2026-09-19T00:00:00Z','CORRECTION',2,'0.1','RESEARCH_COMPLETE','S','2026-09-19T00:00:00Z');`);
await reject('JSON string list rejects non-string',`INSERT INTO ati_requests(id,investigation_id,origin_version,gap_id,ordinal,jurisdiction,holding_institution,requested_records,public_interest_context,status,drafted_at,received_source_ids) VALUES ('C','I',1,'G_ELIGIBLE',2,'KE','Office','[42]','why','DRAFT','2026-09-19T00:00:00Z','[]');`);
await reject('negative ordinal',`INSERT INTO investigation_sources(investigation_id,version_number,ordinal,source_id) VALUES ('I',1,-1,'S');`);
await reject('duplicate ordinal',`INSERT INTO investigation_sources(investigation_id,version_number,ordinal,source_id) VALUES ('I',1,0,'S'); INSERT INTO investigation_sources(investigation_id,version_number,ordinal,source_id) VALUES ('I',1,0,'S_ONLY_V1');`);
const catalog=await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace");
console.log('foreign_keys',catalog.rows[0].n); if(catalog.rows[0].n < 66){failed++;console.log('FAIL FK coverage below baseline')}
const columns=await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public'");
const names=columns.rows.map(row=>row.column_name);
if(names.some(name=>/^(latest_public|public_version|published_version|.*_count$)/i.test(name))){failed++;console.log('FAIL publication or derived count column')} else console.log('PASS no publication or derived count columns');
console.log('failure_count',failed);await db.close();if(failed)process.exitCode=1;
