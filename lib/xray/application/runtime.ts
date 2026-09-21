/**
 * Host seams the API routes resolve through.
 *
 * WHY A SEAM RATHER THAN A CONNECTION
 * ===================================
 * A route needs a database and an execution runtime. Neither is this slice's
 * to invent: 8c is retrieval and HTTP, and wiring a live provider, a pool or a
 * worker is explicitly out of scope. So the routes ask for both by name, and
 * the host — or a check harness — supplies them.
 *
 * Unconfigured is an error with its own type, never a silent default. A route
 * that quietly answered from nothing would report an empty investigation as
 * though it had been researched.
 *
 * PURITY: no SQL, no driver import, no provider SDK, no prompt.
 */

import type { Investigation } from '@/lib/xray/domain'
import { notConfigured } from '@/lib/xray/capability'
import { RESEARCH_STAGES } from '@/lib/xray/pipeline/stages'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import type { SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import type { ExecutionRuntime, InitialExecutionPlan, ExecutionPlan } from './inline-execution'

export class HostNotConfigured extends Error {
  readonly seam: 'DATABASE' | 'EXECUTION_RUNTIME'
  constructor(seam: 'DATABASE' | 'EXECUTION_RUNTIME') {
    super(`No ${seam === 'DATABASE' ? 'database' : 'execution runtime'} is configured for this build`)
    this.name = 'HostNotConfigured'
    this.seam = seam
  }
}

/**
 * Registered providers, held on `globalThis`.
 *
 * WHY NOT MODULE-LEVEL VARIABLES
 * ==============================
 * They were, and it did not work. Next bundles the server startup hook
 * separately from the app's server components, so each got its **own instance**
 * of this module: `instrumentation.ts` registered a database into one copy and
 * every page read `null` from another. The symptom was exactly the 11a symptom
 * it was meant to fix — `/` and `/library` reporting storage unreachable while
 * a perfectly good connection sat in the other bundle.
 *
 * One slot on `globalThis`, keyed by a named symbol, is shared by every bundle
 * in the process. The seam is unchanged: hosts and check harnesses still
 * register through `setDatabaseProvider`, and nothing reads these fields
 * directly.
 */
interface ProviderSlot {
  database: (() => Promise<SnapshotDatabase>) | null
  runtime: (() => Promise<ExecutionRuntime>) | null
}

const SLOT = Symbol.for('xray.application.providers')

function slot(): ProviderSlot {
  const host = globalThis as unknown as Record<symbol, ProviderSlot | undefined>
  host[SLOT] ??= { database: null, runtime: null }
  return host[SLOT]
}

export function setDatabaseProvider(provider: (() => Promise<SnapshotDatabase>) | null): void {
  slot().database = provider
}

export function setExecutionRuntimeProvider(
  provider: (() => Promise<ExecutionRuntime>) | null,
): void {
  slot().runtime = provider
}

export async function getDatabase(): Promise<SnapshotDatabase> {
  const provider = slot().database
  if (!provider) throw new HostNotConfigured('DATABASE')
  return provider()
}

/** Whether a database is available, for readers that may legitimately do without. */
export const databaseConfigured = (): boolean => slot().database !== null

export async function getExecutionRuntime(): Promise<ExecutionRuntime> {
  const provider = slot().runtime
  return provider ? provider() : unconfiguredResearchRuntime()
}

// ---------------------------------------------------------------------------
// The default runtime
// ---------------------------------------------------------------------------

/**
 * Every research stage, reporting that no adapter is configured.
 *
 * This is not a stub provider and produces nothing: each stage returns a
 * capability gap, so a run started without adapters ends `CAPABILITY_BLOCKED`
 * with the gaps journalled. That is the honest answer for a build with no
 * provider wired — as distinct from a run that failed, or one that succeeded
 * at finding nothing.
 */
function unconfiguredStages(): StageDefinition[] {
  return RESEARCH_STAGES.map((stage) => ({
    stage,
    run: () =>
      notConfigured(
        `research-adapter:${stage}`,
        'Configure a research model and retrieval adapter for this deployment.',
      ),
  }))
}

/**
 * The investigation a submitted URL starts from.
 *
 * It carries no Source, no Evidence and no claim — only identity and the id
 * `INGEST` will mint for the surface record once an adapter actually returns
 * one. `currentVersion` is 1 because the validator numbers versions from 1; it
 * is a pointer, not a claim that a version exists, and nothing in execution
 * writes a version row.
 */
export function submittedInvestigation(investigationId: string, createdAt: string): Investigation {
  return {
    id: investigationId,
    protocolVersion: '0.1.0',
    status: 'CREATED',
    surfaceSourceId: 'SRC-001',
    createdAt,
    currentVersion: 1,
    stageRuns: [],
    claimIds: [],
    sourceIds: [],
    evidenceIds: [],
    discrepancyIds: [],
    disconfirmationIds: [],
    findingIds: [],
    gapIds: [],
  }
}

export function unconfiguredResearchRuntime(now: () => string = () => new Date().toISOString()): ExecutionRuntime {
  return {
    async initial(investigationId, submission): Promise<InitialExecutionPlan> {
      return {
        investigation: submittedInvestigation(investigationId, submission?.createdAt ?? now()),
        stages: unconfiguredStages(),
        maxAttempts: 1,
      }
    },
    async resume(): Promise<ExecutionPlan> {
      return { stages: unconfiguredStages(), maxAttempts: 1 }
    },
  }
}
