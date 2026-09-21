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
 *
 * THE EXECUTION RUNTIME (#20 slice 20d)
 * =====================================
 * The same rule, for the same reason. A live runtime is registered only when
 * every provider slot resolves `AVAILABLE`; a partial configuration registers
 * nothing, so `getExecutionRuntime()` keeps returning the unconfigured runtime
 * and a fresh run ends `CAPABILITY_BLOCKED` with its gaps journalled.
 *
 * Startup never fails for a configuration problem, and never silently
 * succeeds either. It logs what it resolved — **variable and provider names
 * only, never a value** — so an operator reading the boot log can tell a
 * deployment with no providers from one whose key is missing from one that is
 * fully live.
 */

export async function register(): Promise<void> {
  const { hostDatabase, hostDatabaseConfigured } = await import('@/lib/xray/host/database')
  const { setDatabaseProvider, setExecutionRuntimeProvider, setReviewerModelProvider } =
    await import('@/lib/xray/application/runtime')

  if (hostDatabaseConfigured()) setDatabaseProvider(() => hostDatabase())

  const { registerLiveProviders } = await import('@/lib/xray/providers/live-runtime')
  const { composition, registered } = await registerLiveProviders({
    setExecutionRuntime: setExecutionRuntimeProvider,
    // The reviewer's own seam. The pipeline gets its adapters through the
    // runtime; the REVIEW gate and graduation get the reviewer through here.
    setReviewerModel: setReviewerModelProvider,
  })

  if (composition.status === 'COMPOSED') {
    console.log(`[xray] ${composition.summary}`)
    console.log(`[xray] capabilities registered: ${registered.join(', ')}`)
    return
  }
  /*
   * Not an error. An unconfigured deployment is a deployment with no research
   * capability, which the pipeline already reports truthfully — and saying so
   * once at startup is what stops an operator wondering why a run produced
   * nothing.
   */
  console.log(`[xray] ${composition.summary}`)
  for (const { slot, reason } of composition.missing) {
    console.log(`[xray]   ${slot}: ${reason}`)
  }
}
