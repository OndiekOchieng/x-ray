/**
 * Read the durable record of one live run. No provider call, no secret printed.
 *
 * Run:  node --import ./scripts/register-ts-resolve.mjs --env-file=.env \
 *         verification/issue-20-20k/inspect-run.ts RUN-...
 */

import { Client } from 'pg'

const RUN = process.argv[2] ?? ''
const url = process.env['XRAY_POSTGRES_URL'] ?? ''

async function main(): Promise<void> {
if (RUN === '') throw new Error('pass an execution run id')
if (url === '') throw new Error('XRAY_POSTGRES_URL is not set')

const client = new Client({ connectionString: url })
await client.connect()

const one = async (sql: string, params: unknown[] = []) =>
  (await client.query(sql, params)).rows

console.log('=== execution run ===')
for (const row of await one(
  `SELECT id, investigation_id, status, started_at, committed_version
     FROM execution_runs WHERE id = $1`, [RUN])) {
  for (const [key, value] of Object.entries(row)) console.log(`  ${key.padEnd(20)} ${String(value)}`)
}

console.log('\n=== journal ===')
const entries = await one(
  `SELECT sequence, kind, run_payload FROM run_journal_entries
     WHERE execution_run_id = $1 ORDER BY sequence`, [RUN])
for (const row of entries) {
  const entry = row['run_payload'] as Record<string, unknown>
  const run = (entry['run'] ?? entry) as Record<string, unknown>
  const detail = [
    String(run['stage'] ?? run['gate'] ?? ''),
    String(run['status'] ?? run['outcome'] ?? ''),
    run['inputArtifactVersion'] === undefined ? '' : `in=${String(run['inputArtifactVersion'])}`,
    run['outputArtifactVersion'] === undefined ? '' : `out=${String(run['outputArtifactVersion'])}`,
    run['id'] === undefined ? '' : `id=${String(run['id'])}`,
  ].filter(Boolean).join('  ')
  console.log(`  [${String(row['sequence']).padStart(2)}] ${String(row['kind']).padEnd(11)} ${detail}`)
  if (run['error'] !== undefined && run['error'] !== null) {
    console.log(`        error: ${String(run['error'])}`)
  }
  if (entry['unavailable'] !== undefined || run['unavailable'] !== undefined) {
    console.log(`        unavailable: ${JSON.stringify(run['unavailable'] ?? entry['unavailable'])}`)
  }
}

console.log('\n=== the surface record this run obtained ===')
for (const row of await one(
  `SELECT id, url, content_hash, accessibility, title
     FROM sources WHERE investigation_id = (
       SELECT investigation_id FROM execution_runs WHERE id = $1)
     ORDER BY id`, [RUN])) {
  console.log(`  ${String(row['id'])}  ${String(row['accessibility'])}  ${String(row['url'])}`)
  console.log(`      hash=${String(row['content_hash'])}  title=${String(row['title'])}`)
}

console.log('\n=== the candidate workspace ===')
for (const row of await one(
  `SELECT updated_at, length(state::text) AS chars,
          jsonb_array_length(COALESCE(state->'sources', '[]'::jsonb)) AS sources,
          jsonb_array_length(COALESCE(state->'claims', '[]'::jsonb)) AS claims
     FROM candidate_workspaces WHERE execution_run_id = $1`, [RUN])) {
  for (const [key, value] of Object.entries(row)) console.log(`  ${key.padEnd(12)} ${String(value)}`)
}

await client.end()
}

main().catch((err: unknown) => {
  console.error(`\nINSPECTION FAILED: ${String(err)}`)
  process.exitCode = 1
})
