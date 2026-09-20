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

let databaseProvider: (() => Promise<SnapshotDatabase>) | null = null
let runtimeProvider: (() => Promise<ExecutionRuntime>) | null = null

export function setDatabaseProvider(provider: (() => Promise<SnapshotDatabase>) | null): void {
  databaseProvider = provider
}

export function setExecutionRuntimeProvider(
  provider: (() => Promise<ExecutionRuntime>) | null,
): void {
  runtimeProvider = provider
}

export async function getDatabase(): Promise<SnapshotDatabase> {
  if (!databaseProvider) throw new HostNotConfigured('DATABASE')
  return databaseProvider()
}

/** Whether a database is available, for readers that may legitimately do without. */
export const databaseConfigured = (): boolean => databaseProvider !== null

export async function getExecutionRuntime(): Promise<ExecutionRuntime> {
  return runtimeProvider ? runtimeProvider() : unconfiguredResearchRuntime()
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
