/**
 * The cross-realm error check's endpoint (#20, 20k). Inert unless asked for.
 *
 * WHY A ROUTE
 * ===========
 * The defect it exercises only exists in a built application: Next compiles
 * `instrumentation.ts` separately from the route handlers, so one process
 * holds two copies of `lib/xray/capability.ts` and therefore two
 * `AdapterFailure` classes. A check running in one Node process with one
 * module graph cannot reproduce that — every in-process suite was green while
 * the Eastleigh Voice run retried a permanent failure. So the check has to run
 * inside a real build, and something inside the build has to run it.
 *
 * WHY IT IS INERT BY DEFAULT
 * ==========================
 * `XRAY_REALM_CHECK=1` or this handler is a 404. A deployment that has not
 * asked for the check does not serve it, and the gate sets the variable for
 * the one process it starts. Nothing here reads a secret, touches a database,
 * or makes a provider call.
 */

import { isPermanent, isAdapterFailure, AdapterFailure } from '@/lib/xray/capability'
import { runPipeline } from '@/lib/xray/pipeline/run'
import { submittedInvestigation } from '@/lib/xray/application/runtime'
import { REALM_PROBE, type RealmProbe } from '@/lib/xray/host/realm-probe'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'

export async function GET(): Promise<Response> {
  if (process.env['XRAY_REALM_CHECK'] !== '1') {
    return new Response('Not found', { status: 404 })
  }

  const published = (globalThis as unknown as Record<symbol, RealmProbe | undefined>)[REALM_PROBE]
  if (published === undefined) {
    return Response.json({ error: 'the host bundle published no probe' }, { status: 500 })
  }

  // Built where the provider adapters are built, thrown where they throw.
  const hostFailure = published.permanentFailure()
  const appFailure = new AdapterFailure('research-model:decompose', 'PERMANENT', 'app realm')

  const stages: StageDefinition[] = [{
    stage: 'DECOMPOSE',
    run() { throw published.permanentFailure() },
  }]
  const result = await runPipeline({
    investigation: submittedInvestigation('XRAY-REALM-CHECK', '2026-09-21T00:00:00Z'),
    stages,
    adapters: {},
    // Two, so a retry has somewhere to go. One attempt would prove nothing.
    maxAttempts: 2,
  })

  return Response.json({
    hostBundleIsSeparate: published.adapterFailureClass !== AdapterFailure,
    hostFailureIsAppInstance: hostFailure instanceof AdapterFailure,
    appFailureIsAppInstance: appFailure instanceof AdapterFailure,
    brandedPredicateSeesHostFailure: isAdapterFailure(hostFailure),
    permanentPredicateSeesHostFailure: isPermanent(hostFailure),
    hostFailureName: hostFailure.name,
    hostFailureDisposition: (hostFailure as { disposition?: string }).disposition ?? null,
    attempts: result.journal.entries
      .filter((entry) => entry.kind === 'STAGE')
      .map((entry) => `${(entry.run as { stage: string }).stage}:${
        (entry.run as { status: string }).status}`),
  })
}
