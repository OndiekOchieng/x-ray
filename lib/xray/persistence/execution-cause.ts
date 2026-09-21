/**
 * Why an execution run exists (#10 slice 10d §O).
 *
 * WHAT THIS ANSWERS
 * =================
 * `execution_runs` records that a run happened and which version it committed.
 * It cannot say what the run was *for*, so the chain
 *
 *   response → intake → run → committed version → added Source(s)
 *
 * was only reconstructable backwards from the acceptance mapping. That mapping
 * does not exist while a run is still going, and — legitimately — never exists
 * for a run that produced no new source (ADR-0018). A run whose research
 * concluded "nothing here to add" is a real research result, and it has to be
 * readable as one rather than as an absence.
 *
 * So the cause is recorded before the run executes, and never edited.
 *
 * GENERIC, NOT ATI-ONLY
 * =====================
 * `kind` covers the other re-evaluation triggers. ATI is the first caller, not
 * the only conceivable one, which is why this is not a set of `ati_` columns on
 * `execution_runs`.
 *
 * DURABLE EXECUTION AUDIT, NOT EVIDENCE
 * =====================================
 * Nothing here is canonical state. It records why work was done, which is a
 * fact about the system, not a fact about the world.
 */

import type { InvestigationVersionTrigger } from '@/lib/xray/domain'
import type { SnapshotDatabase } from './snapshot'

export type ExecutionCauseKind = 'ATI_INTAKE' | 'NEW_SOURCE' | 'RE_EVALUATION' | 'CORRECTION'

export interface ExecutionCause {
  kind: ExecutionCauseKind
  /** Human-readable reference to whatever occasioned the run. */
  reference: string
  /** Set for `ATI_INTAKE`, and only then. The exact durable intake. */
  atiIntakeId?: string
  /** Set for `ATI_INTAKE`, and only then. The exact durable response. */
  atiResponseRef?: string
}

export interface RecordedExecutionCause extends ExecutionCause {
  executionRunId: string
  /** The version the run was seeded from, recorded before it ran. */
  expectedPredecessorVersion: number
  intendedTrigger: InvestigationVersionTrigger
  recordedAt: string
}

/** State the cause of one run. Once, before it runs. */
export async function recordExecutionCause(
  db: SnapshotDatabase, cause: RecordedExecutionCause,
  options: { inTransaction?: boolean } = {},
): Promise<void> {
  if (!options.inTransaction) await db.query('BEGIN')
  try {
    await db.query(
      `INSERT INTO execution_run_causes(execution_run_id, kind, reference,
         expected_predecessor_version, intended_trigger, recorded_at,
         ati_intake_id, ati_response_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [cause.executionRunId, cause.kind, cause.reference,
        cause.expectedPredecessorVersion, cause.intendedTrigger, cause.recordedAt,
        cause.atiIntakeId ?? null, cause.atiResponseRef ?? null])
    if (!options.inTransaction) await db.query('COMMIT')
  } catch (error) {
    if (!options.inTransaction) await db.query('ROLLBACK')
    throw error
  }
}

export async function readExecutionCause(
  db: SnapshotDatabase, executionRunId: string,
): Promise<RecordedExecutionCause | undefined> {
  const rows = (await db.query(
    `SELECT kind, reference, expected_predecessor_version, intended_trigger,
            recorded_at, ati_intake_id, ati_response_ref
       FROM execution_run_causes WHERE execution_run_id=$1`, [executionRunId])).rows
  if (rows.length !== 1) return undefined
  const row = rows[0]
  return {
    executionRunId,
    kind: row.kind as ExecutionCauseKind,
    reference: row.reference as string,
    expectedPredecessorVersion: row.expected_predecessor_version as number,
    intendedTrigger: row.intended_trigger as InvestigationVersionTrigger,
    recordedAt: row.recorded_at as string,
    ...(row.ati_intake_id === null ? {} : { atiIntakeId: row.ati_intake_id as string }),
    ...(row.ati_response_ref === null ? {} : { atiResponseRef: row.ati_response_ref as string }),
  }
}

/**
 * Every run caused by one exact intake, oldest first, with what it committed.
 *
 * This is the reconstruction §H asks for, and it works for a run that added no
 * source: `committedVersion` is null and the run is still visible.
 */
export async function readRunsForIntake(
  db: SnapshotDatabase, intakeId: string,
): Promise<readonly { executionRunId: string; status: string; committedVersion: number | null }[]> {
  return (await db.query(
    `SELECT c.execution_run_id, r.status, r.committed_version
       FROM execution_run_causes c JOIN execution_runs r ON r.id = c.execution_run_id
      WHERE c.ati_intake_id=$1 ORDER BY c.recorded_at, c.execution_run_id`,
    [intakeId])).rows.map((row) => ({
    executionRunId: row.execution_run_id as string,
    status: row.status as string,
    committedVersion: row.committed_version as number | null,
  }))
}
