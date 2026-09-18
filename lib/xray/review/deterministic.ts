/**
 * Deterministic Reviewer checks.
 *
 * Every check here looks for a pattern the validator PERMITS. If a check could
 * fire on an illegal graph it belongs in the validator, not here — the Reviewer
 * only ever sees validator-clean input.
 *
 * Each check derives from the detection signals recorded in
 * `docs/calibration/failure-modes/`, and cites the calibration case it reasons
 * from. Concerns are derived from the graph and the corpus; validator warnings
 * are not an input (D8).
 *
 * A check that would fire on the canonical XRAY-KE-001 fixture is wrong by
 * construction — that graph is the worked example of correct judgment.
 */

import type { Finding, FindingStatus } from '@/lib/xray/domain'
import type { XRayGraph } from '@/lib/xray/selectors'
import {
  claimById,
  claimProvenanceSummary,
  evidenceForClaim,
  gapsForClaim,
  independentEvidenceOriginsForClaim,
  opposingEvidenceForClaim,
  originForEvidence,
  originKey,
  sourceById,
} from '@/lib/xray/selectors'
import { assessMeasurementCompatibility } from '@/lib/xray/validation'
import type {
  CalibrationCaseId,
  FailureModeId,
  ReviewCapability,
  ReviewFinding,
  ReviewSeverity,
  ReviewTarget,
} from './types'

export interface DeterministicCheck {
  checkId: string
  title: string
  failureMode: FailureModeId
  calibrationCases: readonly CalibrationCaseId[]
  capability: ReviewCapability
  run(graph: XRayGraph): Omit<ReviewFinding, 'id' | 'checkId' | 'failureMode' | 'calibrationCases'>[]
}

const t = (kind: ReviewTarget['kind'], id: string): ReviewTarget => ({ kind, id })

/** Grades that assert the evidence carried the claim in some direction. */
const POSITIVE: readonly FindingStatus[] = ['ESTABLISHED', 'SUPPORTED', 'PARTIALLY_SUPPORTED']
const SETTLED: readonly FindingStatus[] = [...POSITIVE, 'CONTRADICTED']

const findingsWith = (graph: XRayGraph, statuses: readonly FindingStatus[]): Finding[] =>
  graph.findings.filter((f) => statuses.includes(f.status))

// ---------------------------------------------------------------------------

export const DETERMINISTIC_CHECKS: readonly DeterministicCheck[] = [
  {
    checkId: 'FM-001/SETTLED_GRADE_ON_INCOMPARABLE_EVIDENCE',
    title: 'A settled grade is carried by evidence that does not measure the claim',
    failureMode: 'FM-001',
    calibrationCases: ['CAL-001'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const finding of findingsWith(graph, SETTLED)) {
        const claim = claimById(graph, finding.claimId)
        if (!claim?.measurement) continue

        /**
         * Inspect the evidence that CARRIES the grade, not all of it.
         *
         * A SUPPORTED grade rests on its supporting records; a CONTRADICTED one
         * rests on its opposing records. An earlier revision of this check
         * examined opposing evidence for every settled grade and flagged DC001
         * in the clean fixture — a SUPPORTED claim whose supporting evidence is
         * perfectly comparable and whose single opposing record simply carries
         * no measurement. Failure evidence preserved on issue #4.
         */
        const carrying =
          finding.status === 'CONTRADICTED'
            ? opposingEvidenceForClaim(graph, finding.claimId)
            : evidenceForClaim(graph, finding.claimId).filter(
                (e) => e.relationship === 'SUPPORTS',
              )
        if (carrying.length === 0) continue

        const comparable = carrying.filter(
          (e) =>
            assessMeasurementCompatibility(claim.measurement, e.measurement).compatibility ===
            'COMPATIBLE',
        )
        if (comparable.length > 0) continue

        const direction = finding.status === 'CONTRADICTED' ? 'against' : 'for'
        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [
            t('Finding', finding.id),
            t('Claim', claim.id),
            ...carrying.map((e) => t('Evidence', e.id)),
          ],
          rationale: `Claim ${claim.id} measures ${claim.measurement.metric ?? 'a quantity'}${
            claim.measurement.denominator ? ` per ${claim.measurement.denominator}` : ''
          }, but not one of the ${carrying.length} record(s) weighing ${direction} it measures the same thing. The grade ${finding.status} therefore rests on a proxy measure, and the evidence cannot settle this claim in either direction.`,
          requiredAction: `Re-grade ${finding.claimId} to an unsettled status, or locate evidence measuring ${claim.measurement.metric ?? 'the claimed quantity'} directly and record the missing measurement as a gap.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-002/CONTRADICTION_WITHOUT_RECONCILIATION',
    title: 'A genuine contradiction was declared without recording the alternatives tested',
    failureMode: 'FM-002',
    calibrationCases: ['CAL-002'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const d of graph.discrepancies) {
        if (d.classification !== 'GENUINE_CONTRADICTION') continue
        if (d.reconciliation && d.reconciliation.trim().length > 0) continue
        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [t('Discrepancy', d.id), ...d.claimIds.map((id) => t('Claim', id))],
          rationale: `Discrepancy ${d.id} is classified GENUINE_CONTRADICTION but records no reconciliation. The engine must attempt scope, definition, date, phase and unit classification before a contradiction is permitted, and nothing here shows that it did.`,
          requiredAction: `Record which alternative classifications were tested for ${d.id} and why each failed, or reclassify.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-002/RESOLVED_WITHOUT_RECONCILIATION',
    title: 'A discrepancy is marked resolved without saying how',
    failureMode: 'FM-002',
    calibrationCases: ['CAL-002'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const d of graph.discrepancies) {
        if (!d.resolved) continue
        if (d.reconciliation && d.reconciliation.trim().length > 0) continue
        out.push({
          severity: 'ADVISORY' as ReviewSeverity,
          targets: [t('Discrepancy', d.id)],
          rationale: `Discrepancy ${d.id} is marked resolved but carries no reconciliation, so a reader cannot see what reconciled it.`,
          requiredAction: `State the reconciliation for ${d.id} or mark it unresolved.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-003/POSITIVE_GRADE_ON_SINGLE_ORIGIN',
    title: 'Several supporting records collapse to one originating observation',
    failureMode: 'FM-003',
    calibrationCases: ['CAL-003'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const finding of findingsWith(graph, POSITIVE)) {
        if (finding.supportingEvidenceIds.length < 2) continue

        const origins = new Set<string>()
        let unresolved = 0
        for (const id of finding.supportingEvidenceIds) {
          const r = originForEvidence(graph, id)
          if (r.status === 'RESOLVED') origins.add(originKey(r.origin))
          else unresolved += 1
        }
        // Only flag when the supporting set genuinely narrows to one origin.
        if (origins.size !== 1 || unresolved > 0) continue

        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [
            t('Finding', finding.id),
            t('Claim', finding.claimId),
            ...finding.supportingEvidenceIds.map((id) => t('Evidence', id)),
          ],
          rationale: `Finding ${finding.id} is graded ${finding.status} on ${finding.supportingEvidenceIds.length} supporting records that all trace to a single originating observation. That is one observation reported several times, not corroboration, and the grade reads as though it were the latter.`,
          requiredAction: `Either locate an independent originating record for ${finding.claimId}, or restate the finding so it does not imply corroboration it does not have.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-003/IDENTICAL_MEASUREMENT_ACROSS_SOURCES',
    title: 'Distinct sources publish an identical measurement with no dependency recorded',
    failureMode: 'FM-003',
    calibrationCases: ['CAL-003'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const buckets = new Map<string, { evidenceIds: string[]; sourceIds: Set<string> }>()
      for (const e of graph.evidence) {
        const m = e.measurement
        if (!m || m.value === undefined) continue
        // Identical metric, value, unit AND scope. Two lots both at 28% are
        // different measurements; the same figure for the same scope is not.
        const key = [m.metric, m.value, m.unit, m.scope].join('|')
        const bucket = buckets.get(key) ?? { evidenceIds: [], sourceIds: new Set<string>() }
        bucket.evidenceIds.push(e.id)
        bucket.sourceIds.add(e.sourceId)
        buckets.set(key, bucket)
      }

      const out = []
      for (const [key, bucket] of buckets) {
        if (bucket.sourceIds.size < 2) continue
        // If every source involved already resolves to one origin, provenance
        // has done its job and there is nothing to raise.
        const origins = new Set<string>()
        let unresolved = 0
        for (const id of bucket.evidenceIds) {
          const r = originForEvidence(graph, id)
          if (r.status === 'RESOLVED') origins.add(originKey(r.origin))
          else unresolved += 1
        }
        if (origins.size <= 1 && unresolved === 0) continue

        out.push({
          severity: 'ADVISORY' as ReviewSeverity,
          targets: bucket.evidenceIds.map((id) => t('Evidence', id)),
          rationale: `${bucket.sourceIds.size} distinct sources publish an identical measurement (${key.replace(/\|/g, ' ')}) yet resolve to ${origins.size} origins${unresolved ? ` with ${unresolved} unresolved` : ''}. Independent measurements rarely agree exactly; an unrecorded dependency is the likelier explanation.`,
          requiredAction: `Check whether these records share an origin and record the dependency, or confirm each measured independently.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-004/SETTLED_GRADE_OVER_OPEN_GAP',
    title: 'A finding is settled while the gap that would settle it is open',
    failureMode: 'FM-004',
    calibrationCases: ['CAL-004', 'CAL-006'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const finding of graph.findings) {
        // ESTABLISHED and CONTRADICTED both assert the question is closed.
        if (finding.status !== 'ESTABLISHED' && finding.status !== 'CONTRADICTED') continue
        const openGaps = finding.gapIds
          .map((id) => graph.gaps.find((g) => g.id === id))
          .filter((g): g is NonNullable<typeof g> => g !== undefined && g.status === 'OPEN')
        if (openGaps.length === 0) continue

        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [
            t('Finding', finding.id),
            t('Claim', finding.claimId),
            ...openGaps.map((g) => t('Gap', g.id)),
          ],
          rationale: `Finding ${finding.id} grades ${finding.claimId} ${finding.status} — a closed question — while ${openGaps.length} gap(s) it names remain OPEN. The graph is contradicting itself: the gap says the settling record was never located, and the grade says the matter is settled.`,
          requiredAction: `Re-grade ${finding.claimId} to an unsettled status, or close the gap with the record that settles it.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-004/THIN_SEARCH_BEHIND_GAP',
    title: 'A gap rests on a single search avenue',
    failureMode: 'FM-004',
    calibrationCases: ['CAL-004'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const gap of graph.gaps) {
        if (gap.searchAlreadyAttempted.length !== 1) continue
        out.push({
          severity: 'ADVISORY' as ReviewSeverity,
          targets: [t('Gap', gap.id), ...gap.claimIds.map((id) => t('Claim', id))],
          rationale: `Gap ${gap.id} records one search avenue. "Not located" is only informative in proportion to how far the search reached, and one avenue makes the absence weak evidence of anything.`,
          requiredAction: `Widen the search behind ${gap.id} or record why one avenue was sufficient.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-005/OCCURRENCE_ESTABLISHED_AFTER_CUTOFF',
    title: 'An event after the research cutoff is graded as established',
    failureMode: 'FM-005',
    calibrationCases: ['CAL-005'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const cutoff = graph.investigation.researchCutoffAt
      if (!cutoff) return []
      const out = []
      for (const finding of graph.findings) {
        if (finding.status !== 'ESTABLISHED') continue
        const claim = claimById(graph, finding.claimId)
        const from = claim?.timeScope?.from
        if (!from) continue
        const width = Math.min(from.length, cutoff.length)
        if (from.slice(0, width) <= cutoff.slice(0, width)) continue

        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [t('Finding', finding.id), t('Claim', claim!.id)],
          rationale: `Claim ${claim!.id} concerns a period beginning ${from}, after the research cutoff ${cutoff}, yet finding ${finding.id} grades it ESTABLISHED. Nothing gathered by the cutoff can establish an event that had not happened.`,
          requiredAction: `Re-grade ${finding.claimId} to what the cutoff evidence supports — typically the scheduled or expected proposition — and keep occurrence as a separate gap.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-005/TEMPORAL_SCOPE_IN_MEASUREMENT',
    title: 'Temporal scope is hidden inside a measurement field',
    failureMode: 'FM-005',
    calibrationCases: ['CAL-005'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const YEAR = /\b(19|20)\d{2}\b/
      const out = []
      for (const e of graph.evidence) {
        const m = e.measurement
        if (!m) continue
        const fields = [
          ['definition', m.definition],
          ['scope', m.scope],
        ] as const
        const offending = fields.filter(([, v]) => v !== undefined && YEAR.test(v))
        if (offending.length === 0) continue

        out.push({
          severity: 'ADVISORY' as ReviewSeverity,
          targets: [t('Evidence', e.id)],
          rationale: `Evidence ${e.id} carries a date inside Measurement.${offending
            .map(([f]) => f)
            .join(' and ')}. Measurement fields describe what is measured; when it was measured belongs in timeScope, and mixing them lets a stale figure read as current.`,
          requiredAction: `Move the temporal scope of ${e.id} into timeScope and leave the measurement describing only the quantity.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-006/SETTLED_GRADE_OVER_UNRESOLVED_DISCREPANCY',
    title: 'A finding is established while a discrepancy it rests on is unresolved',
    failureMode: 'FM-006',
    calibrationCases: ['CAL-006'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const finding of graph.findings) {
        if (finding.status !== 'ESTABLISHED') continue
        const unresolved = finding.discrepancyIds
          .map((id) => graph.discrepancies.find((d) => d.id === id))
          .filter((d): d is NonNullable<typeof d> => d !== undefined && !d.resolved)
        if (unresolved.length === 0) continue

        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [
            t('Finding', finding.id),
            t('Claim', finding.claimId),
            ...unresolved.map((d) => t('Discrepancy', d.id)),
          ],
          rationale: `Finding ${finding.id} grades ${finding.claimId} ESTABLISHED while ${unresolved.length} discrepancy it names remains unresolved. Declaring the matter settled selects among competing values rather than reconciling them.`,
          requiredAction: `Resolve the discrepancy with an authoritative record, or re-grade ${finding.claimId} as unresolved.`,
        })
      }
      return out
    },
  },

  {
    checkId: 'FM-003/UNRESOLVED_INDEPENDENCE_ON_POSITIVE_GRADE',
    title: 'A positive grade rests partly on evidence of undetermined independence',
    failureMode: 'FM-003',
    calibrationCases: ['CAL-003'],
    capability: 'DETERMINISTIC',
    run(graph) {
      const out = []
      for (const finding of findingsWith(graph, ['ESTABLISHED'])) {
        const summary = claimProvenanceSummary(graph, finding.claimId)
        if (summary.isIndependenceResolved) continue
        const confirmed = independentEvidenceOriginsForClaim(graph, finding.claimId)
        out.push({
          severity: 'BLOCKING' as ReviewSeverity,
          targets: [t('Finding', finding.id), t('Claim', finding.claimId)],
          rationale: `Finding ${finding.id} grades ${finding.claimId} ESTABLISHED, but ${summary.unresolvedEvidenceCount} evidence point(s) have undetermined independence and ${summary.unidentifiedOriginCount} origin(s) were never identified. Only ${confirmed.length} independent observation(s) are confirmed, so the strongest available grade is weaker than ESTABLISHED.`,
          requiredAction: `Establish provenance for the unresolved evidence behind ${finding.claimId}, or grade below ESTABLISHED.`,
        })
      }
      return out
    },
  },
] as const

/** Which research stage can address a given check. Never a control gate. */
export const CHECK_ROUTING: Readonly<
  Record<string, { stage: import('@/lib/xray/domain').ResearchStage; action: string }>
> = {
  'FM-001/SETTLED_GRADE_ON_INCOMPARABLE_EVIDENCE': {
    stage: 'GRADE',
    action: 'Re-grade against what the located evidence actually measures.',
  },
  'FM-002/CONTRADICTION_WITHOUT_RECONCILIATION': {
    stage: 'RECONCILE',
    action: 'Test and record the alternative classifications before permitting contradiction.',
  },
  'FM-003/POSITIVE_GRADE_ON_SINGLE_ORIGIN': {
    stage: 'TRACE',
    action: 'Trace toward an independent originating record, or restate the finding.',
  },
  'FM-004/SETTLED_GRADE_OVER_OPEN_GAP': {
    stage: 'GRADE',
    action: 'Re-grade to an unsettled status while the gap remains open.',
  },
  'FM-005/OCCURRENCE_ESTABLISHED_AFTER_CUTOFF': {
    stage: 'GRADE',
    action: 'Re-grade to the proposition the cutoff evidence supports.',
  },
  'FM-006/SETTLED_GRADE_OVER_UNRESOLVED_DISCREPANCY': {
    stage: 'RECONCILE',
    action: 'Reconcile the discrepancy or re-grade as unresolved.',
  },
  'FM-003/UNRESOLVED_INDEPENDENCE_ON_POSITIVE_GRADE': {
    stage: 'PROVENANCE',
    action: 'Establish proposition-level provenance before grading at ESTABLISHED.',
  },

  // Model-assisted checks (#4's port, connected in 6b under D21).
  //
  // Unrouted until now, and harmlessly so: no model-assisted check could raise
  // a finding while the seam was open. Once it can, an unrouted BLOCKING
  // finding would count toward the verdict and name no stage able to fix it,
  // leaving a hole in exactly the loop 6c exists to close.
  'XR-INV-002/CLAIM_ATOMICITY': {
    stage: 'DECOMPOSE',
    action: 'Split the claim into independently testable assertions.',
  },
  'XR-INV-003/CROSS_LAYER_INFERENCE': {
    stage: 'GRADE',
    action: "Re-grade against evidence at the claim's own epistemic layer.",
  },
  'XR-INV-005/SEMANTIC_COMPATIBILITY': {
    stage: 'RECONCILE',
    action: 'Establish whether the two measures are comparable before permitting contradiction.',
  },
  'XR-INV-007/REVERSIBILITY_ADEQUACY': {
    stage: 'GRADE',
    action: 'State overturn conditions that would actually overturn the finding.',
  },
  'FM-001/SILENT_CONVERSION_IN_RATIONALE': {
    stage: 'GRADE',
    action: 'Restate the rationale without converting between measures.',
  },
  'FM-005/TENSE_MODALITY_DRIFT': {
    stage: 'DECOMPOSE',
    action: 'Restate the claim in the modality of its source passage.',
  },
}

export { sourceById, evidenceForClaim, gapsForClaim }
