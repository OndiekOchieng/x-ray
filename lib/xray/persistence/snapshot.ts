/** Immutable snapshot mapping. No fixture IDs, network client, or publication state. */
import type { XRayGraph } from '@/lib/xray/selectors/graph'
import { createXRayGraph } from '@/lib/xray/selectors/graph'
import type {
  Claim, Disconfirmation, Discrepancy, Evidence, EvidenceProvenance, Finding,
  Gap, Investigation, InvestigationVersion, Source, SourceDependency, StageRun,
} from '@/lib/xray/domain'

export interface SnapshotDatabase {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
}

const snake = (name: string) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const optional = (value: unknown) => value === undefined ? null : value
const json = (value: unknown) => value === undefined ? null : JSON.stringify(value)
const present = (row: Record<string, unknown>, key: string, value: unknown) => {
  if (value !== null && value !== undefined) row[key] = value
}
const at = (row: Record<string, unknown>, key: string) => row[snake(key)]
const withOptional = (row: Record<string, unknown>, keys: string[]) => {
  const out: Record<string, unknown> = {}
  for (const key of keys) present(out, key, at(row, key))
  return out
}
const textArray = (value: unknown): string[] => value as string[]

async function insert(db: SnapshotDatabase, table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row)
  const placeholders = columns.map((_, index) => `$${index + 1}`)
  await db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, Object.values(row))
}
async function rows(db: SnapshotDatabase, table: string, investigationId: string, version: number, order = 'id') {
  return (await db.query(`SELECT * FROM ${table} WHERE investigation_id = $1 AND version_number = $2 ORDER BY ${order}`, [investigationId, version])).rows
}

const entityFields = {
  claims: ['text','sourcePassage','origin','layer','type','priority','measurement','timeScope','entities','ambiguities'],
  sources: ['title','publisher','institution','author','url','publishedAt','retrievedAt','sourceType','evidenceClass','originStatus','accessibility','contentHash'],
  evidence: ['sourceId','proposition','relationship','strength','measurement','timeScope','quotedPassage','locationInSource'],
  discrepancies: ['description','classification','reconciliation','resolved'],
  disconfirmations: ['claimId','preliminaryHypothesis','counterHypothesis','result','effectOnFinding','searchStrategy'],
  findings: ['claimId','status','confidence','rationale','gradedAt','wouldChangeFinding'],
  gaps: ['missingEvidence','whyItMatters','resolvingEvidence','likelyHolder','searchAlreadyAttempted','status','effectOnFinding','resolutionPath','atiEligible','identifiers'],
} as const
const jsonFields = new Set(['measurement','timeScope','entities','ambiguities','searchStrategy','wouldChangeFinding','resolvingEvidence','likelyHolder','searchAlreadyAttempted','identifiers'])

type Collection = keyof typeof entityFields
function entityRow(item: Record<string, unknown>, table: Collection, investigationId: string, version: number) {
  const row: Record<string, unknown> = { investigation_id: investigationId, version_number: version, id: item.id }
  for (const key of entityFields[table]) row[snake(key)] = jsonFields.has(key) ? json(item[key]) : optional(item[key])
  return row
}
function entityFromRow(row: Record<string, unknown>, table: Collection) {
  const out: Record<string, unknown> = { id: row.id }
  if (table === 'claims') out.investigationId = row.investigation_id
  for (const key of entityFields[table]) present(out, key, at(row, key))
  return out
}

/** Owner ID lists. Each table has its own composite owner/target foreign keys. */
const links = [
  ['investigation_claims', 'investigation', 'claimIds', 'claim_id'],
  ['investigation_sources', 'investigation', 'sourceIds', 'source_id'],
  ['investigation_evidence', 'investigation', 'evidenceIds', 'evidence_id'],
  ['investigation_discrepancies', 'investigation', 'discrepancyIds', 'discrepancy_id'],
  ['investigation_disconfirmations', 'investigation', 'disconfirmationIds', 'disconfirmation_id'],
  ['investigation_findings', 'investigation', 'findingIds', 'finding_id'],
  ['investigation_gaps', 'investigation', 'gapIds', 'gap_id'],
  ['version_added_sources', 'version', 'addedSourceIds', 'source_id'],
  ['version_added_evidence', 'version', 'addedEvidenceIds', 'evidence_id'],
  ['version_reevaluated_claims', 'version', 'reEvaluatedClaimIds', 'claim_id'],
  ['version_findings', 'version', 'findingIds', 'finding_id'],
  ['version_gaps', 'version', 'gapIds', 'gap_id'],
  ['evidence_claims', 'evidence', 'claimIds', 'claim_id'],
  ['discrepancy_claims', 'discrepancies', 'claimIds', 'claim_id'],
  ['discrepancy_evidence', 'discrepancies', 'evidenceIds', 'evidence_id'],
  ['disconfirmation_supporting_evidence', 'disconfirmations', 'strongestSupportingEvidenceIds', 'evidence_id'],
  ['disconfirmation_opposing_evidence', 'disconfirmations', 'strongestOpposingEvidenceIds', 'evidence_id'],
  ['finding_supporting_evidence', 'findings', 'supportingEvidenceIds', 'evidence_id'],
  ['finding_challenging_evidence', 'findings', 'challengingEvidenceIds', 'evidence_id'],
  ['finding_contextual_evidence', 'findings', 'contextualEvidenceIds', 'evidence_id'],
  ['finding_discrepancies', 'findings', 'discrepancyIds', 'discrepancy_id'],
  ['finding_gaps', 'findings', 'gapIds', 'gap_id'],
  ['gap_claims', 'gaps', 'claimIds', 'claim_id'],
] as const

type LinkOwner = typeof links[number][1]
function owners(graph: XRayGraph, owner: LinkOwner): Record<string, unknown>[] {
  if (owner === 'investigation') return [graph.investigation as unknown as Record<string, unknown>]
  if (owner === 'version') return [graph.version as unknown as Record<string, unknown>]
  return graph[owner] as unknown as Record<string, unknown>[]
}

/** One transaction inserts a completed v1 snapshot and advances its identity pointer. */
export async function writeInitialSnapshot(db: SnapshotDatabase, graph: XRayGraph): Promise<void> {
  const investigation = graph.investigation
  const version = graph.version
  if (!version || investigation.currentVersion !== 1 || version.version !== 1 || version.investigationId !== investigation.id) {
    throw new Error('writeInitialSnapshot requires a coherent initial v1 graph')
  }
  if (graph.atiRequests.length > 0) throw new Error('ATI lifecycle records are outside immutable snapshots')
  await db.query('BEGIN')
  try {
    await insert(db, 'investigations', { id: investigation.id })
    await insert(db, 'investigation_versions', {
      investigation_id: investigation.id, version_number: 1, created_at: version.createdAt,
      trigger: version.trigger, supersedes_version: optional(version.supersedesVersion),
      protocol_version: investigation.protocolVersion, status: investigation.status,
      surface_source_id: investigation.surfaceSourceId, focus: optional(investigation.focus),
      investigation_created_at: investigation.createdAt, research_cutoff_at: optional(investigation.researchCutoffAt),
      completed_at: optional(investigation.completedAt),
      research_stop_reason: optional(version.researchStop?.reason),
      research_stop_leads: json(version.researchStop?.unresolvedHighPriorityLeads),
      investigation_research_stop_reason: optional(investigation.researchStop?.reason),
      investigation_research_stop_leads: json(investigation.researchStop?.unresolvedHighPriorityLeads),
    })
    for (const table of Object.keys(entityFields) as Collection[]) {
      for (const item of graph[table]) await insert(db, table, entityRow(item as unknown as Record<string, unknown>, table, investigation.id, 1))
    }
    for (const [ordinal, item] of graph.sourceDependencies.entries()) await insert(db, 'source_dependencies', {
      investigation_id: investigation.id, version_number: 1, ordinal, id: item.id,
      source_id: item.sourceId, depends_on_source_id: optional(item.dependsOnSourceId),
      origin_description: optional(item.originDescription), relationship: item.relationship, confidence: item.confidence,
    })
    for (const [ordinal, item] of graph.evidenceProvenance.entries()) await insert(db, 'evidence_provenance', {
      investigation_id: investigation.id, version_number: 1, ordinal, id: item.id,
      evidence_id: item.evidenceId, origin_kind: item.origin.kind,
      origin_source_id: item.origin.kind === 'SOURCE' ? item.origin.sourceId : null,
      origin_description: item.origin.kind === 'UNIDENTIFIED' ? item.origin.description : null,
      relationship: item.relationship, confidence: item.confidence,
    })
    for (const [ordinal, item] of investigation.stageRuns.entries()) await insert(db, 'version_stage_runs', {
      investigation_id: investigation.id, version_number: 1, ordinal, id: item.id,
      stage: item.stage, status: item.status, input_artifact_version: item.inputArtifactVersion,
      output_artifact_version: optional(item.outputArtifactVersion), model: optional(item.model),
      started_at: optional(item.startedAt), completed_at: optional(item.completedAt), error: optional(item.error),
    })
    for (const [table, owner, key, target] of links) {
      for (const item of owners(graph, owner)) {
        const values = item[key] as string[]
        for (const [ordinal, id] of values.entries()) await insert(db, table, {
          investigation_id: investigation.id, version_number: 1,
          ...(owner === 'investigation' || owner === 'version' ? {} : { owner_id: item.id }),
          ordinal, [target]: id,
        })
      }
    }
    await db.query('UPDATE investigations SET latest_committed_version = 1 WHERE id = $1', [investigation.id])
    await db.query('COMMIT')
  } catch (error) {
    await db.query('ROLLBACK')
    throw error
  }
}

async function readLinks(db: SnapshotDatabase, investigationId: string, version: number, table: string, target: string, ownerId?: string) {
  const all = await rows(db, table, investigationId, version, 'ordinal')
  return all.filter((row) => ownerId === undefined || row.owner_id === ownerId).map((row) => row[target] as string)
}

export async function readSnapshot(db: SnapshotDatabase, investigationId: string, versionNumber: number): Promise<XRayGraph> {
  const found = await rows(db, 'investigation_versions', investigationId, versionNumber, 'version_number')
  if (found.length !== 1) throw new Error(`No committed snapshot ${investigationId} v${versionNumber}`)
  const row = found[0]
  const investigation: Record<string, unknown> = {
    id: investigationId, protocolVersion: row.protocol_version, status: row.status,
    surfaceSourceId: row.surface_source_id, createdAt: row.investigation_created_at,
    currentVersion: versionNumber,
  }
  Object.assign(investigation, withOptional(row, ['focus','researchCutoffAt','completedAt']))
  if (row.investigation_research_stop_reason !== null) investigation.researchStop = {
    reason: row.investigation_research_stop_reason,
    unresolvedHighPriorityLeads: textArray(row.investigation_research_stop_leads),
  }
  const version: Record<string, unknown> = {
    investigationId, version: versionNumber, createdAt: row.created_at, trigger: row.trigger,
  }
  present(version, 'supersedesVersion', row.supersedes_version)
  if (row.research_stop_reason !== null) version.researchStop = {
    reason: row.research_stop_reason, unresolvedHighPriorityLeads: textArray(row.research_stop_leads),
  }
  const artifacts: Record<string, Record<string, unknown>[]> = {}
  for (const table of Object.keys(entityFields) as Collection[]) {
    artifacts[table] = (await rows(db, table, investigationId, versionNumber)).map((item) => entityFromRow(item, table))
  }
  const dependencies = (await rows(db, 'source_dependencies', investigationId, versionNumber, 'ordinal')).map((item) => ({
    id: item.id, sourceId: item.source_id, relationship: item.relationship, confidence: item.confidence,
    ...withOptional(item, ['dependsOnSourceId','originDescription']),
  }))
  const provenance = (await rows(db, 'evidence_provenance', investigationId, versionNumber, 'ordinal')).map((item) => ({
    id: item.id, evidenceId: item.evidence_id, relationship: item.relationship, confidence: item.confidence,
    origin: item.origin_kind === 'SOURCE'
      ? { kind: 'SOURCE', sourceId: item.origin_source_id }
      : { kind: 'UNIDENTIFIED', description: item.origin_description },
  }))
  investigation.stageRuns = (await rows(db, 'version_stage_runs', investigationId, versionNumber, 'ordinal')).map((item) => ({
    id: item.id, investigationId, stage: item.stage, status: item.status,
    inputArtifactVersion: item.input_artifact_version,
    ...withOptional(item, ['outputArtifactVersion','model','startedAt','completedAt','error']),
  }))
  for (const [table, owner, key, target] of links) {
    if (owner === 'investigation' || owner === 'version') {
      (owner === 'investigation' ? investigation : version)[key] = await readLinks(db, investigationId, versionNumber, table, target)
    } else {
      for (const item of artifacts[owner]) item[key] = await readLinks(db, investigationId, versionNumber, table, target, String(item.id))
    }
  }
  // Investigation memberships define collection order. Edge collections have their own ordinals.
  for (const [collection, membership] of [
    ['claims','claimIds'],['sources','sourceIds'],['evidence','evidenceIds'],
    ['discrepancies','discrepancyIds'],['disconfirmations','disconfirmationIds'],
    ['findings','findingIds'],['gaps','gapIds'],
  ] as const) {
    const byId = new Map(artifacts[collection].map((item) => [item.id, item]))
    artifacts[collection] = (investigation[membership] as string[]).map((id) => {
      const item = byId.get(id)
      if (!item) throw new Error(`Snapshot member missing: ${collection} ${id}`)
      return item
    })
  }
  return createXRayGraph({
    investigation: investigation as unknown as Investigation,
    version: version as unknown as InvestigationVersion,
    claims: artifacts.claims as unknown as Claim[], sources: artifacts.sources as unknown as Source[],
    evidence: artifacts.evidence as unknown as Evidence[], discrepancies: artifacts.discrepancies as unknown as Discrepancy[],
    disconfirmations: artifacts.disconfirmations as unknown as Disconfirmation[],
    findings: artifacts.findings as unknown as Finding[], gaps: artifacts.gaps as unknown as Gap[],
    sourceDependencies: dependencies as SourceDependency[], evidenceProvenance: provenance as EvidenceProvenance[],
  })
}
