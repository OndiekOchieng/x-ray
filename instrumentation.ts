/**
 * Server startup (#11 slice 11b).
 *
 * WHY HERE
 * ========
 * The application seam `setDatabaseProvider` had no caller, which is what left
 * `/` and `/library` rendering a 200 shell and then failing. A host has to
 * register itself once, before any route asks for a database, and Next's
 * instrumentation hook is the one place that runs exactly then.
 *
 * WHAT IT DOES NOT DO
 * ===================
 * It does not migrate, and it does not seed. Provisioning and serving are
 * separate concerns: a reader hitting `/` must never cause data to be created.
 * The database is provisioned by `pnpm demo:seed`, deliberately and out of
 * band.
 *
 * A process with no database configuration registers no provider, so
 * `getDatabase()` keeps reporting `HostNotConfigured` and the surfaces report
 * themselves unavailable — which is the honest answer and now a rendered one.
 */

export async function register(): Promise<void> {
  const { hostDatabase, hostDatabaseConfigured } = await import('@/lib/xray/host/database')
  const { setDatabaseProvider } = await import('@/lib/xray/application/runtime')

  if (!hostDatabaseConfigured()) return
  setDatabaseProvider(() => hostDatabase())
}
