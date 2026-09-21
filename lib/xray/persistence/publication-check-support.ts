/**
 * Shared setup for the publication gates (9b, 9c).
 *
 * Builds lineages whose versions carry real graduation linkage, so publication
 * eligibility is read from records the normal path produced rather than from
 * something the test asserted into being.
 */

import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'

import { createXRayGraph, type XRayGraph, type XRayGraphInput } from '@/lib/xray/selectors'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { assessGraduation, type GraduationResult } from '@/lib/xray/acceptance'
import { fingerprintGraph } from '@/lib/xray/review'
import { writeInitialSnapshot } from './snapshot'
import { commitNextVersion, type ReEvaluationAudit } from './version-commit'
import { prepareAssessedRun } from './graduation-check-support'

export const AT = '2026-09-20T12:00:00Z'

export const MIGRATIONS = [
  '0001_version_ownership', '0002_source_retrieval_precision', '0003_reevaluation_audit',
  '0004_source_position_knowledge_basis', '0005_execution_audit', '0006_graduation_audit',
  '0007_investigation_submissions', '0008_publication_events',
]

/**
 * The ATI action-lifecycle migrations, in order.
 *
 * Shared by every ATI gate. Three copies of this list drifted the moment 10c
 * added one, so there is one copy.
 */
export const ATI_MIGRATIONS = [
  '0009_ati_lifecycle', '0010_ati_origin_and_acceptance',
  '0011_ati_acceptance_requires_added_source',
  '0012_ati_intake_digest_provenance',
]

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export async function migrate(db: PGlite, roundTripLast = true): Promise<void> {
  for (const n of MIGRATIONS)
    await db.exec(readFileSync(new URL(`../../../db/migrations/${n}.up.sql`, import.meta.url), 'utf8'))
  if (!roundTripLast) return
  // The migration must remain reversible.
  await db.exec(readFileSync(new URL('../../../db/migrations/0008_publication_events.down.sql', import.meta.url), 'utf8'))
  await db.exec(readFileSync(new URL('../../../db/migrations/0008_publication_events.up.sql', import.meta.url), 'utf8'))
}

/** The benchmark corpus under another lineage id, so ids are never shared. */
export function corpusFor(id: string): XRayGraph {
  const base = createXrayKe001Graph()
  return createXRayGraph({
    ...(base as XRayGraphInput),
    claims: base.claims.map((c) => ({ ...c, investigationId: id })),
    investigation: {
      ...base.investigation, id,
      stageRuns: base.investigation.stageRuns.map((r) => ({ ...r, investigationId: id })),
    },
    version: { ...base.version!, investigationId: id },
  })
}

/** A legitimate successor: one new source, one new evidence, two re-evaluated claims. */
export function candidateNext(v1: XRayGraph, version: number): XRayGraph {
  const input: XRayGraphInput = {
    ...clone(v1 as XRayGraphInput),
    investigation: { ...clone(v1.investigation), currentVersion: version },
    version: {
      ...clone(v1.version!), version, createdAt: AT, trigger: 'NEW_SOURCE_RECEIVED',
      supersedesVersion: version - 1,
      addedSourceIds: [`SRC-NEW-${version}`], addedEvidenceIds: [`EV-NEW-${version}`],
      reEvaluatedClaimIds: ['C001', 'C002'],
    },
  }
  input.sources = [...input.sources, { ...input.sources[1], id: `SRC-NEW-${version}`,
    title: `Additional received source v${version}`, retrievedAt: '2026-09-13', publishedAt: '2026-09-12' }]
  input.evidence = [...input.evidence, { ...input.evidence[0], id: `EV-NEW-${version}`,
    sourceId: `SRC-NEW-${version}`,
    proposition: `An additional source supports the main carriageway scope (v${version}).`,
    claimIds: ['C001' as const] }]
  input.findings = input.findings.map((f) => f.claimId === 'C001'
    ? { ...f, supportingEvidenceIds: [...f.supportingEvidenceIds, `EV-NEW-${version}`],
        rationale: `${f.rationale} Additional receipt considered at v${version}.` }
    : f)
  input.investigation.sourceIds = [...input.investigation.sourceIds, `SRC-NEW-${version}`]
  input.investigation.evidenceIds = [...input.investigation.evidenceIds, `EV-NEW-${version}`]
  return createXRayGraph(input)
}

export const reEvaluationAudit = (version: number): ReEvaluationAudit[] => [
  { claimId: 'C001', reason: 'NEW_EVIDENCE',
    causes: [{ kind: 'SOURCE', id: `SRC-NEW-${version}` }, { kind: 'EVIDENCE', id: `EV-NEW-${version}` }] },
  { claimId: 'C002', reason: 'REVIEW_REVISION', detail: 'Reassessed; finding unchanged.', causes: [] },
]

/** Seed v1 and commit an assessed v2 carrying real graduation linkage. */
export async function seedLineage(db: PGlite, id: string, runId: string, verdictOverride?: 'PASS') {
  const v1 = corpusFor(id)
  await writeInitialSnapshot(db, v1)
  const candidate = candidateNext(v1, 2)
  const base = assessGraduation(candidate, { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: AT })
  const assessment = verdictOverride ? { ...base, verdict: verdictOverride, blockers: [] } : base
  // #7 refuses to let a capability-blocked run assert PASS, which is the same
  // honesty rule #5 built BLOCKED for.
  await prepareAssessedRun(db, runId, candidate, assessment,
    assessment.verdict === 'PASS' ? 'COMPLETED' : 'CAPABILITY_BLOCKED')
  await commitNextVersion(db, { expectedPredecessor: 1, graph: candidate,
    assessment, reEvaluationAudit: reEvaluationAudit(2), executionRunId: runId })
  return { v1, candidate, assessment }
}

/** Commit a further assessed version on an existing lineage. */
export async function commitFurtherVersion(db: PGlite, id: string, runId: string,
  predecessor: XRayGraph, version: number) {
  const candidate = candidateNext(predecessor, version)
  const assessment = assessGraduation(candidate, { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: AT })
  await prepareAssessedRun(db, runId, candidate, assessment, 'CAPABILITY_BLOCKED')
  await commitNextVersion(db, { expectedPredecessor: version - 1, graph: candidate,
    assessment, reEvaluationAudit: reEvaluationAudit(version), executionRunId: runId })
  return { candidate, assessment }
}

/**
 * Give an already-committed version the run and graduation linkage a
 * first-version commit path would produce.
 *
 * Test setup, not production behaviour: #7 has no route-created-v1 promotion
 * path, so a lineage needing two publishable versions constructs it directly.
 */
export async function linkVersion(db: PGlite, id: string, version: number, runId: string,
  graph: XRayGraph, assessment: GraduationResult): Promise<void> {
  const matched: GraduationResult = {
    ...assessment, investigationId: id, graphFingerprint: fingerprintGraph(graph),
    verdict: 'PASS', reasons: [], blockers: [],
  }
  await prepareAssessedRun(db, runId, graph, matched, 'COMPLETED')
  await db.query('UPDATE execution_runs SET committed_version=$1, committed_graduation_index=0 WHERE id=$2',
    [version, runId])
}
