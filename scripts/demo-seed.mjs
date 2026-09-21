/**
 * pnpm demo:seed — provision the demo lineage. Idempotent.
 *
 * Provisioning is deliberately a command, not something a page request does.
 * Run it once against a fresh database; run it again and it reports that the
 * lineage is already there without writing a second publication event.
 *
 *   XRAY_POSTGRES_URL=postgres://…  pnpm demo:seed     deployment
 *   XRAY_DEMO_PGLITE=1              pnpm demo:seed     local, in-process
 *
 * PGlite is in-process and per-process, so a PGlite seed is only useful inside
 * one long-lived process. A deployed demo needs PostgreSQL, because #10's
 * action history has to survive between requests.
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./ts-resolve-hook.mjs', pathToFileURL(import.meta.filename))

const { closeHostDatabase, hostDatabase, hostDatabaseConfigured } = await import('../lib/xray/host/database.ts')
const { migrateHost, seedDemoLineage, DEMO_SEED } = await import('../lib/xray/host/demo-seed.ts')

if (!hostDatabaseConfigured()) {
  console.error('No database configured.')
  console.error('  deployment: XRAY_POSTGRES_URL=postgres://… pnpm demo:seed')
  console.error('  local:      XRAY_DEMO_PGLITE=1 pnpm demo:seed')
  process.exit(1)
}

const db = await hostDatabase()

const applied = await migrateHost(db)
console.log(`migrations: ${applied.length} newly applied`)

const report = await seedDemoLineage(db)
console.log(`seed:       ${report.outcome.result}`)
console.log(`slug:       ${report.outcome.slug}`)
console.log(`version:    v${report.outcome.version}`)
console.log(`events:     ${report.before.publicationEvents} → ${report.after.publicationEvents}`)
console.log()
console.log(`demo entry: /                       (featured)`)
console.log(`            /library`)
console.log(`            /xray/${DEMO_SEED.slug}`)
console.log(`            /investigations/${DEMO_SEED.investigationId}`)

// An open client keeps the process alive; provisioning is a command and must
// exit. PostgreSQL provisioning takes a couple of minutes on a single
// connection, because every artifact row is its own round trip.
await closeHostDatabase()
