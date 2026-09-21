/**
 * Provisioning the demo lineage (#11 slice 11b).
 *
 * WHAT THIS IS
 * ============
 * An idempotent provisioning step that writes **already-verified canonical
 * state** into storage: the frozen benchmark investigation as version 1, its
 * graduation assessment as recorded, and a publication event under a
 * deterministic slug.
 *
 * WHAT THIS IS NOT
 * ================
 * Not a research run, and it must never be presentable as one. No stage
 * executes, nothing is inferred, and no evidence is produced here — every
 * artifact written is one the benchmark corpus already contains and the
 * acceptance gates already check. The execution run it creates exists only to
 * carry the authorizing assessment; it is named `SEED-PROVISION-…` so that a
 * reader of `execution_runs` can tell it apart from research, and its status is
 * `CAPABILITY_BLOCKED` because that is true: no reviewer model was available,
 * which is exactly what the recorded assessment says.
 *
 * ONE ARCHITECTURAL GAP THIS EXPOSES
 * ==================================
 * #7 has no production path that links a *first* version to its authorizing
 * graduation assessment. `commitNextVersion` does that for every successor, and
 * `writeInitialSnapshot` deliberately does not — it writes v1 and advances the
 * pointer, nothing more. So the link below is written here, explicitly, and
 * recorded in the 11b report as a gap rather than hidden as a detail.
 *
 * NO TEST HELPERS
 * ===============
 * Everything called here is production: `writeInitialSnapshot`,
 * `saveCandidateCheckpoint`, `appendGraduationAudit`, `assessGraduation`,
 * `publishVersion`. `graduation-check-support.ts` and
 * `publication-check-support.ts` are not imported, by rule.
 */

import { readFile } from 'node:fs/promises'

import { assessGraduation } from '@/lib/xray/acceptance'
import { createXrayKe001Graph } from '@/lib/xray/fixtures/xray-ke-001/graph'
import { XRAY_KE_001_ACCEPTANCE } from '@/lib/xray/fixtures/xray-ke-001/acceptance'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { CorrelationLedger } from '@/lib/xray/pipeline/correlation'
import { RunJournal } from '@/lib/xray/pipeline/journal'
import { appendGraduationAudit } from '@/lib/xray/persistence/graduation-audit'
import {
  publishVersion, readPublicationHistory, readSlug,
} from '@/lib/xray/persistence/publication'
import { writeInitialSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import type { HostDatabase } from './database'
import { isEligibleAssessment } from '@/lib/xray/persistence/version-commit'
import { saveCandidateCheckpoint } from '@/lib/xray/persistence/workspace'
import { XRAY_MIGRATIONS } from './migrations'

/**
 * The seed contract. Pinned, not generated.
 *
 * `slug` is what `publishVersion` derives from the investigation id and its
 * surface title, asserted here so a change to either is caught at provisioning
 * time rather than discovered as a dead demo link.
 */
export const DEMO_SEED = {
  investigationId: 'XRAY-KE-001',
  version: 1,
  slug: 'inside-ruto-s-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-520ecf67fe',
  executionRunId: 'SEED-PROVISION-XRAY-KE-001',
  /**
   * Who provisioned this.
   *
   * #9 requires every publication event to carry a `Principal` and forbids
   * falling back to "the operator". A demo seed is an administrative act by
   * whoever ran it, and naming it as provisioning is the honest attribution
   * available without an auth system.
   */
  principalId: 'demo-seed-provisioning',
  /** Fixed, so re-provisioning a fresh database is byte-reproducible. */
  provisionedAt: '2026-09-21T00:00:00Z',
} as const

export type SeedOutcome =
  | { result: 'SEEDED'; slug: string; version: number }
  | { result: 'ALREADY_SEEDED'; slug: string; version: number }

export interface SeedReport {
  outcome: SeedOutcome
  /** What was found before anything was written. */
  before: { lineageExists: boolean; slug?: string; publicationEvents: number }
  after: { slug: string; publicationEvents: number }
}

/**
 * Apply every migration a deployed X-Ray needs, once each.
 *
 * Takes a `HostDatabase` rather than a `SnapshotDatabase`: a migration file is
 * a multi-statement script with its own transaction, which the one-statement
 * query contract cannot carry.
 *
 * WHY A LEDGER AND NOT A TRY/CATCH
 * ================================
 * The first version of this caught "already exists" and carried on, which was
 * wrong in a way only a real PostgreSQL showed: each migration file opens its
 * own `BEGIN`, so the failing statement aborted the transaction and left the
 * connection in `current transaction is aborted, commands ignored` for
 * everything after it. Swallowing the error kept the process running against a
 * connection that could no longer do anything.
 *
 * So applied migrations are recorded, and a recorded one is skipped rather
 * than re-run and rescued. A migration that genuinely fails rolls back its own
 * transaction, is not recorded, and stops provisioning.
 */
export async function migrateHost(
  db: HostDatabase, readSql = defaultReadSql,
): Promise<readonly string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS xray_schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)

  const applied = new Set((await db.query(
    'SELECT name FROM xray_schema_migrations')).rows.map((row) => row.name as string))

  const newly: string[] = []
  for (const name of XRAY_MIGRATIONS) {
    if (applied.has(name)) continue
    try {
      await db.exec(await readSql(name))
    } catch (error) {
      // Leave no aborted transaction behind for the next statement.
      await db.query('ROLLBACK').catch(() => undefined)
      throw error
    }
    await db.query('INSERT INTO xray_schema_migrations(name) VALUES ($1)', [name])
    newly.push(name)
  }
  return newly
}

const defaultReadSql = async (name: string): Promise<string> =>
  readFile(new URL(`../../../db/migrations/${name}.up.sql`, import.meta.url), 'utf8')

/**
 * Provision the demo lineage, or report that it is already provisioned.
 *
 * Idempotent by inspection, not by exception handling: the existing state is
 * read first and nothing is written when the lineage is already there. It never
 * mutates an existing seeded lineage to "refresh" it — a change to the seeded
 * contents is an explicit decision about seed versioning, not something a
 * second run should do quietly.
 */
export async function seedDemoLineage(db: SnapshotDatabase): Promise<SeedReport> {
  const { investigationId, version, executionRunId, principalId, provisionedAt } = DEMO_SEED

  const existing = (await db.query(
    'SELECT latest_committed_version FROM investigations WHERE id=$1', [investigationId])).rows
  const lineageExists = existing.length === 1
    && existing[0].latest_committed_version !== null
  const existingSlug = lineageExists ? await readSlug(db, investigationId) : undefined
  const eventsBefore = lineageExists
    ? (await readPublicationHistory(db, investigationId)).length : 0

  const before = {
    lineageExists,
    ...(existingSlug === undefined ? {} : { slug: existingSlug }),
    publicationEvents: eventsBefore,
  }

  if (lineageExists && existingSlug !== undefined && eventsBefore > 0) {
    return {
      outcome: { result: 'ALREADY_SEEDED', slug: existingSlug, version },
      before,
      after: { slug: existingSlug, publicationEvents: eventsBefore },
    }
  }

  const graph = createXrayKe001Graph()
  if (graph.investigation.id !== investigationId)
    throw new Error(`The benchmark corpus is ${graph.investigation.id}, not ${investigationId}`)

  // 1 · the canonical version, exactly as the corpus froze it.
  if (!lineageExists) await writeInitialSnapshot(db, graph)

  // 2 · the assessment that authorizes publication. Recorded, not invented:
  //     BLOCKED on capability blockers only, which #7's own rule accepts.
  const assessment = assessGraduation(graph,
    { behaviors: XRAY_KE_001_ACCEPTANCE, assessedAt: provisionedAt })
  if (!isEligibleAssessment(assessment))
    throw new Error(
      `The benchmark graduated ${assessment.verdict} with ${assessment.reasons.length} reason(s) and may not be published`)

  if (existingSlug === undefined) {
    await saveCandidateCheckpoint(db, {
      executionRunId,
      investigationId,
      startedAt: provisionedAt,
      updatedAt: provisionedAt,
      // True of this run: no reviewer capability was available to it.
      status: 'CAPABILITY_BLOCKED',
      artifactVersion: 0,
      accumulator: new GraphAccumulator(graph.investigation, graph),
      ledger: new CorrelationLedger(),
      journal: new RunJournal(investigationId),
    })
    await appendGraduationAudit(db, executionRunId, graph, assessment)

    // 3 · the link #7 has no production path for at version 1. See the header.
    await db.query(
      `UPDATE execution_runs SET committed_version=$1, committed_graduation_index=0
        WHERE id=$2 AND committed_version IS NULL`, [version, executionRunId])

    // 4 · publication, under the slug #9 derives. Asserted against the pin.
    const published = await publishVersion(db, {
      investigationId, version, principalId, occurredAt: provisionedAt,
    })
    if (published.slug !== DEMO_SEED.slug)
      throw new Error(
        `The derived slug is ${published.slug}; the seed contract pins ${DEMO_SEED.slug}`)
  }

  const slug = (await readSlug(db, investigationId))!
  const eventsAfter = (await readPublicationHistory(db, investigationId)).length
  return {
    outcome: { result: 'SEEDED', slug, version },
    before,
    after: { slug, publicationEvents: eventsAfter },
  }
}
