/** Investigation command/read boundary. No HTTP, provider or fixture dependency. */
import { randomUUID } from 'node:crypto'
import type { XRayGraphInput } from '@/lib/xray/selectors'
import type { WorkspaceRunStatus } from '@/lib/xray/persistence/workspace'
import { loadCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { readExecutionAudit } from '@/lib/xray/persistence/execution-audit'
import { readSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
export { VersionConflict } from '@/lib/xray/persistence/version-commit'

export type MissingResource = 'INVESTIGATION' | 'EXECUTION_RUN' | 'CANDIDATE_WORKSPACE' | 'COMMITTED_VERSION'
export class InvestigationResourceNotFound extends Error {
  readonly resource: MissingResource
  readonly id: string
  constructor(resource: MissingResource, id: string) {
    super(`${resource} ${id} not found`)
    this.name = 'InvestigationResourceNotFound'
    this.resource = resource
    this.id = id
  }
}
export class InvalidSubmissionInput extends Error {
  readonly field: 'sourceUrl' | 'focus' | 'executionRunId'
  constructor(field: 'sourceUrl' | 'focus' | 'executionRunId', message: string) {
    super(message)
    this.name = 'InvalidSubmissionInput'
    this.field = field
  }
}
export interface SubmissionInput { sourceUrl: string; focus?: string }
export interface SubmissionMetadata { sourceUrl: string; focus?: string; createdAt: string }
export interface InvestigationIdentityDto {
  investigationId: string
  latestCommittedVersion: number | null
  submission: SubmissionMetadata | null
}
export interface ExecutionStatusDto {
  investigationId: string
  executionRunId: string
  status: WorkspaceRunStatus
  startedAt: string
  committedVersion: number | null
  stageRuns: readonly {
    id: string; stage: string; status: string; inputArtifactVersion: number
    outputArtifactVersion?: number; startedAt?: string; completedAt?: string
  }[]
}
export interface CandidateStateDto {
  kind: 'CANDIDATE'
  investigationId: string
  executionRunId: string
  status: WorkspaceRunStatus
  artifactVersion: number
  updatedAt: string
  staleStages: readonly string[]
  graph: XRayGraphInput
}
export interface CommittedVersionDto {
  kind: 'COMMITTED_VERSION'
  investigationId: string
  version: number
  graph: XRayGraphInput
}
export interface VersionHistoryItemDto {
  version: number
  createdAt: string
  trigger: string
  supersedesVersion?: number
}
export interface VersionHistoryDto {
  investigationId: string
  latestCommittedVersion: number | null
  versions: readonly VersionHistoryItemDto[]
}
const canonicalInput = (graph: XRayGraphInput & {index?: unknown}): XRayGraphInput => {
  const { index: _index, ...value } = graph
  return value
}
function sourceUrl(raw: string): string {
  if (typeof raw !== 'string') throw new InvalidSubmissionInput('sourceUrl', 'Source URL must be a string')
  const value = raw.trim() // Only surrounding whitespace is normalized; URL spelling is retained.
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' || !parsed.hostname)
      throw new Error('unsupported scheme or host')
  } catch { throw new InvalidSubmissionInput('sourceUrl', 'Source URL must be an absolute HTTP(S) URL') }
  return value
}
function requestedFocus(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'string' || !raw.trim())
    throw new InvalidSubmissionInput('focus', 'Focus must be a nonempty string when supplied')
  return raw.trim()
}
export class InvestigationService {
  private readonly db: SnapshotDatabase
  private readonly clock: () => string
  private readonly newId: () => string
  constructor(db: SnapshotDatabase,
    clock: () => string = () => new Date().toISOString(),
    newId: () => string = () => `XRAY-${randomUUID()}`) {
    this.db = db
    this.clock = clock
    this.newId = newId
  }

  async createInvestigation(input: SubmissionInput): Promise<InvestigationIdentityDto> {
    const url = sourceUrl(input.sourceUrl)
    const focus = requestedFocus(input.focus)
    const createdAt = this.clock()
    const investigationId = this.newId()
    await this.db.query('BEGIN')
    try {
      await this.db.query('INSERT INTO investigations(id) VALUES ($1)', [investigationId])
      await this.db.query(`INSERT INTO investigation_submissions
        (investigation_id,submitted_source_url,requested_focus,created_at) VALUES ($1,$2,$3,$4)`,
      [investigationId, url, focus ?? null, createdAt])
      await this.db.query('COMMIT')
    } catch (error) {
      await this.db.query('ROLLBACK')
      throw error
    }
    return { investigationId, latestCommittedVersion: null,
      submission: { sourceUrl: url, ...(focus === undefined ? {} : { focus }), createdAt } }
  }

  async getInvestigation(investigationId: string): Promise<InvestigationIdentityDto> {
    const rows = (await this.db.query(`SELECT i.id,i.latest_committed_version,
      s.submitted_source_url,s.requested_focus,s.created_at
      FROM investigations i LEFT JOIN investigation_submissions s ON s.investigation_id=i.id
      WHERE i.id=$1`, [investigationId])).rows
    if (rows.length === 0) throw new InvestigationResourceNotFound('INVESTIGATION', investigationId)
    const row = rows[0]
    return { investigationId, latestCommittedVersion: row.latest_committed_version as number | null,
      submission: row.submitted_source_url === null ? null : {
        sourceUrl: row.submitted_source_url as string,
        ...(row.requested_focus === null ? {} : { focus: row.requested_focus as string }),
        createdAt: row.created_at as string,
      } }
  }

  async getExecutionStatus(investigationId: string, executionRunId: string): Promise<ExecutionStatusDto> {
    await this.getInvestigation(investigationId)
    const rows = (await this.db.query(`SELECT started_at,status,committed_version FROM execution_runs
      WHERE id=$1 AND investigation_id=$2`, [executionRunId, investigationId])).rows
    if (rows.length === 0) throw new InvestigationResourceNotFound('EXECUTION_RUN', executionRunId)
    const audit = await readExecutionAudit(this.db, executionRunId)
    const row = rows[0]
    return { investigationId, executionRunId, status: row.status as WorkspaceRunStatus,
      startedAt: row.started_at as string, committedVersion: row.committed_version as number | null,
      stageRuns: audit.journal.stageEntries().map(({ id, stage, status, inputArtifactVersion,
        outputArtifactVersion, startedAt, completedAt }) => ({ id, stage, status, inputArtifactVersion,
        ...(outputArtifactVersion === undefined ? {} : { outputArtifactVersion }),
        ...(startedAt === undefined ? {} : { startedAt }),
        ...(completedAt === undefined ? {} : { completedAt }) })),
    }
  }

  async getCandidate(investigationId: string, executionRunId: string): Promise<CandidateStateDto> {
    if (!executionRunId) throw new InvalidSubmissionInput('executionRunId', 'Explicit execution run ID required')
    await this.getExecutionStatus(investigationId, executionRunId)
    const exists = (await this.db.query(`SELECT 1 FROM candidate_workspaces WHERE execution_run_id=$1`,
      [executionRunId])).rows
    if (exists.length === 0) throw new InvestigationResourceNotFound('CANDIDATE_WORKSPACE', executionRunId)
    const checkpoint = await loadCandidateCheckpoint(this.db, executionRunId)
    return { kind: 'CANDIDATE', investigationId, executionRunId,
      status: checkpoint.status, artifactVersion: checkpoint.artifactVersion,
      updatedAt: checkpoint.updatedAt, staleStages: checkpoint.journal.staleStages(),
      graph: canonicalInput(checkpoint.accumulator.rebuild()) }
  }

  async getCommittedVersion(investigationId: string, version: number): Promise<CommittedVersionDto> {
    await this.getInvestigation(investigationId)
    const exists = (await this.db.query(`SELECT 1 FROM investigation_versions
      WHERE investigation_id=$1 AND version_number=$2`, [investigationId, version])).rows
    if (exists.length === 0) throw new InvestigationResourceNotFound('COMMITTED_VERSION', String(version))
    const graph = await readSnapshot(this.db, investigationId, version)
    return { kind: 'COMMITTED_VERSION', investigationId, version, graph: canonicalInput(graph) }
  }

  async listVersions(investigationId: string): Promise<VersionHistoryDto> {
    const identity = await this.getInvestigation(investigationId)
    const rows = (await this.db.query(`SELECT version_number,created_at,trigger,supersedes_version
      FROM investigation_versions WHERE investigation_id=$1 ORDER BY version_number`, [investigationId])).rows
    return { investigationId, latestCommittedVersion: identity.latestCommittedVersion,
      versions: rows.map((row) => ({ version: row.version_number as number,
        createdAt: row.created_at as string, trigger: row.trigger as string,
        ...(row.supersedes_version === null ? {} : { supersedesVersion: row.supersedes_version as number }) })) }
  }
}
