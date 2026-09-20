/**
 * Graduation and commit orchestration.
 *
 * WHAT THIS IS
 * ============
 * A thin composition over persistence that already exists (#7): assess a
 * completed run's candidate, record the assessment, and commit it as the next
 * immutable version. It invents no storage, no publication endpoint and no
 * lifecycle of its own — every durable effect is a call into `#7`'s own
 * functions, which keep their own rules about eligibility and conflict.
 *
 * THE ONE PIECE OF REAL WORK: PROMOTION
 * =====================================
 * A run accumulates artifacts. It does not decide that those artifacts are a
 * *version* — the pipeline never writes `currentVersion`, because in-run
 * artifact revisions and published versions are separate axes (§17, ADR-0006).
 * Something has to put the two together, and that is `promote`.
 *
 * Promotion is arithmetic over recorded state, not judgment. The version
 * number comes from the predecessor, the added artifacts come from comparing
 * against it, the re-evaluated claims come from `changedClaimIds`, and the
 * research stop comes from what the run actually recorded. Nothing is
 * fabricated: a run that recorded no terminal stop produces a candidate that
 * `commitNextVersion` will refuse, which is the intended outcome rather than
 * something to work around.
 *
 * PURITY: no HTTP, no provider, no publication.
 */

import type { ClaimId, InvestigationVersionTrigger } from '@/lib/xray/domain'
import { createXRayGraph, type XRayGraph } from '@/lib/xray/selectors'
import { assessGraduation, type AcceptanceBehavior, type GraduationResult } from '@/lib/xray/acceptance'
import type { ReviewerModel } from '@/lib/xray/review'
import { GraphAccumulator } from '@/lib/xray/pipeline/accumulator'
import { appendGraduationAudit, readLatestGraduation, type GraduationAuditRecord } from '@/lib/xray/persistence/graduation-audit'
import { readSnapshot, type SnapshotDatabase } from '@/lib/xray/persistence/snapshot'
import {
  changedClaimIds, commitNextVersion, type ReEvaluationAudit,
} from '@/lib/xray/persistence/version-commit'
import { loadCandidateCheckpoint, saveCandidateCheckpoint } from '@/lib/xray/persistence/workspace'

export class GraduationNotEligible extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GraduationNotEligible'
  }
}

export interface PromoteOptions {
  expectedPredecessor: number
  trigger: InvestigationVersionTrigger
  createdAt: string
}

export interface AssessOptions {
  behaviors?: readonly AcceptanceBehavior[]
  requiredReviewChecks?: readonly string[]
  model?: ReviewerModel
}

export class GraduationService {
  private readonly db: SnapshotDatabase
  private readonly clock: () => string

  constructor(db: SnapshotDatabase, clock: () => string = () => new Date().toISOString()) {
    this.db = db
    this.clock = clock
  }

  /**
   * Turn a finished run's candidate into a proposed next version, in place.
   *
   * Writes the promoted graph back to the workspace, because the version
   * envelope is part of what the run produced and the graduation audit is
   * checked against the workspace digest.
   */
  async promote(investigationId: string, executionRunId: string,
    options: PromoteOptions): Promise<XRayGraph> {
    const checkpoint = await loadCandidateCheckpoint(this.db, executionRunId)
    if (checkpoint.investigationId !== investigationId)
      throw new GraduationNotEligible('Execution run belongs to a different investigation')

    const previous = await readSnapshot(this.db, investigationId, options.expectedPredecessor)
    const candidate = checkpoint.accumulator.rebuild()
    const next = options.expectedPredecessor + 1

    const inherited = <T extends { id: string }>(before: readonly T[], after: readonly T[]) => {
      const known = new Set(before.map((item) => item.id))
      return after.filter((item) => !known.has(item.id)).map((item) => item.id)
    }

    const investigation = {
      ...candidate.investigation,
      status: 'RESEARCH_COMPLETE' as const,
      completedAt: candidate.investigation.completedAt ?? options.createdAt,
      currentVersion: next,
    }

    const promoted = createXRayGraph({
      ...candidate,
      investigation,
      version: {
        investigationId,
        version: next,
        createdAt: options.createdAt,
        trigger: options.trigger,
        supersedesVersion: options.expectedPredecessor,
        addedSourceIds: inherited(previous.sources, candidate.sources),
        addedEvidenceIds: inherited(previous.evidence, candidate.evidence),
        reEvaluatedClaimIds: [...changedClaimIds(previous, candidate)] as ClaimId[],
        findingIds: candidate.findings.map((finding) => finding.id),
        gapIds: candidate.gaps.map((gap) => gap.id),
        // What the run itself recorded. Absent stays absent.
        ...(investigation.researchStop ? { researchStop: investigation.researchStop } : {}),
      },
    })

    await saveCandidateCheckpoint(this.db, {
      ...checkpoint,
      updatedAt: this.clock(),
      accumulator: new GraphAccumulator(investigation, promoted),
    })

    return promoted
  }

  /** Assess the current workspace candidate and append the assessment. */
  async assess(investigationId: string, executionRunId: string,
    options: AssessOptions = {}): Promise<GraduationAuditRecord> {
    const checkpoint = await loadCandidateCheckpoint(this.db, executionRunId)
    if (checkpoint.investigationId !== investigationId)
      throw new GraduationNotEligible('Execution run belongs to a different investigation')

    const candidate = checkpoint.accumulator.rebuild()
    const result = assessGraduation(candidate, {
      behaviors: options.behaviors ?? [],
      ...(options.requiredReviewChecks ? { requiredReviewChecks: options.requiredReviewChecks } : {}),
      ...(options.model ? { model: options.model } : {}),
      assessedAt: this.clock(),
    })
    return appendGraduationAudit(this.db, executionRunId, candidate, result)
  }

  /** The assessment a commit would be judged against. */
  async latestAssessment(executionRunId: string): Promise<GraduationResult | undefined> {
    return (await readLatestGraduation(this.db, executionRunId))?.result
  }

  /**
   * Commit the assessed candidate as the next immutable version.
   *
   * Eligibility, version arithmetic, workspace staleness and predecessor
   * conflict are all `commitNextVersion`'s rules, unchanged. This only finds
   * the pieces and hands them over.
   */
  async commit(investigationId: string, executionRunId: string, options: {
    expectedPredecessor: number
    reEvaluationAudit: readonly ReEvaluationAudit[]
  }): Promise<{ version: number }> {
    const assessment = await this.latestAssessment(executionRunId)
    if (!assessment)
      throw new GraduationNotEligible('No graduation assessment has been recorded for this run')

    const checkpoint = await loadCandidateCheckpoint(this.db, executionRunId)
    if (checkpoint.investigationId !== investigationId)
      throw new GraduationNotEligible('Execution run belongs to a different investigation')

    await commitNextVersion(this.db, {
      expectedPredecessor: options.expectedPredecessor,
      graph: checkpoint.accumulator.rebuild(),
      assessment,
      reEvaluationAudit: options.reEvaluationAudit,
      executionRunId,
    })
    return { version: options.expectedPredecessor + 1 }
  }
}
