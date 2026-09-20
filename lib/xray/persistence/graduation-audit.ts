/** Immutable graduation assessments bound to exact mutable candidate state. */
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { GraduationResult } from '@/lib/xray/acceptance/runner'
import { fingerprintGraph } from '@/lib/xray/review'
import type { XRayGraph } from '@/lib/xray/selectors'
import type { SnapshotDatabase } from './snapshot'
import { loadCandidateCheckpoint } from './workspace'
import { encodeValue, decodeValue, type Encoded } from './value-codec'

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered)
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]),
  )
  return value
}

/** Strong exact-state binding; the review fingerprint remains the protocol identity. */
export function candidateDigest(graph: XRayGraph): string {
  const { index: _index, ...canonicalInput } = graph
  return createHash('sha256').update(JSON.stringify(encodeValue(ordered(canonicalInput)))).digest('hex')
}

export interface GraduationAuditRecord {
  executionRunId: string
  assessmentIndex: number
  candidateDigest: string
  result: GraduationResult
}

export async function readLatestGraduation(db: SnapshotDatabase, executionRunId: string): Promise<GraduationAuditRecord | undefined> {
  const rows = (await db.query(`SELECT assessment_index,candidate_digest,result FROM run_graduations
    WHERE execution_run_id=$1 ORDER BY assessment_index DESC LIMIT 1`, [executionRunId])).rows
  if (rows.length === 0) return undefined
  return { executionRunId, assessmentIndex: rows[0].assessment_index as number,
    candidateDigest: rows[0].candidate_digest as string,
    result: decodeValue(rows[0].result as Encoded) as GraduationResult }
}

/**
 * One exact assessment, by its index.
 *
 * Distinct from `readLatestGraduation` on purpose. Publication binds to an
 * exact `(run, index)` pair, and assessments are append-only — so "latest" and
 * "the one that authorized this publication" diverge the moment a further
 * assessment is appended. A reader is entitled to the assessment that actually
 * authorized what they are looking at.
 */
export async function readGraduation(
  db: SnapshotDatabase, executionRunId: string, assessmentIndex: number,
): Promise<GraduationAuditRecord | undefined> {
  const rows = (await db.query(
    `SELECT assessment_index,candidate_digest,result FROM run_graduations
      WHERE execution_run_id=$1 AND assessment_index=$2`, [executionRunId, assessmentIndex])).rows
  if (rows.length !== 1) return undefined
  return { executionRunId, assessmentIndex: rows[0].assessment_index as number,
    candidateDigest: rows[0].candidate_digest as string,
    result: decodeValue(rows[0].result as Encoded) as GraduationResult }
}

/** Append an assessment for the current workspace graph; never replace prior assessments. */
export async function appendGraduationAudit(
  db: SnapshotDatabase, executionRunId: string, candidate: XRayGraph, result: GraduationResult,
): Promise<GraduationAuditRecord> {
  const digest = candidateDigest(candidate)
  if (result.investigationId !== candidate.investigation.id || result.graphFingerprint !== fingerprintGraph(candidate))
    throw new Error('Graduation result does not match candidate identity/fingerprint')
  await db.query('BEGIN')
  try {
    const rows = (await db.query(`SELECT investigation_id,committed_version FROM execution_runs
      WHERE id=$1 FOR UPDATE`, [executionRunId])).rows
    if (rows.length !== 1 || rows[0].investigation_id !== candidate.investigation.id || rows[0].committed_version !== null)
      throw new Error('Graduation execution run is missing, mismatched, or already committed')
    const workspace = await loadCandidateCheckpoint(db, executionRunId)
    if (candidateDigest(workspace.accumulator.rebuild()) !== digest)
      throw new Error('Graduation candidate differs from current workspace')
    const latest = await readLatestGraduation(db, executionRunId)
    if (latest && latest.candidateDigest === digest && isDeepStrictEqual(latest.result, result)) {
      await db.query('COMMIT')
      return latest
    }
    const assessmentIndex = latest === undefined ? 0 : latest.assessmentIndex + 1
    await db.query(`INSERT INTO run_graduations
      (execution_run_id,assessment_index,investigation_id,verdict,graph_fingerprint,candidate_digest,assessed_at,result)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [executionRunId, assessmentIndex, candidate.investigation.id,
      result.verdict, result.graphFingerprint, digest, result.assessedAt, JSON.stringify(encodeValue(result))])
    await db.query('COMMIT')
    return { executionRunId, assessmentIndex, candidateDigest: digest, result }
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}
