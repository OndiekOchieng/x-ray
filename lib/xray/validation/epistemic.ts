/**
 * Epistemic validation — does the graph assert something it may not?
 *
 * This is where protocol becomes software. Each rule enforces an invariant
 * deterministically over graph state, and stops there. Whether a *legal*
 * judgment is also a *good* one is the Reviewer's question; nothing in this
 * module attempts it.
 *
 * NO BENCHMARK IDS. These rules are generic over any graph. XRAY-KE-001 ids
 * appear only in the checks that exercise them.
 *
 * LEGAL UNCERTAINTY IS PRESERVED. `UNIDENTIFIED` and `UNRESOLVED` provenance
 * are not errors — they are honest states. The rules below refuse to let them
 * be *counted as confirmed independence*, which is a different thing from
 * refusing to let them exist.
 */

import type { Claim, Evidence, Finding } from '@/lib/xray/domain'
import type { XRayGraph } from '@/lib/xray/selectors'
import {
  claimProvenanceSummary,
  evidenceForClaim,
  independentEvidenceOriginsForClaim,
  originForEvidence,
  provenanceForEvidence,
} from '@/lib/xray/selectors'
import { assessMeasurementCompatibility } from './measurement'
import type { Violation, ViolationTarget, TargetKind, ValidationMode } from './violations'

const target = (kind: TargetKind, id: string): ViolationTarget => ({ kind, id })

/** Finding statuses that mean the evidence did not settle the claim. */
const UNSETTLED: readonly Finding['status'][] = [
  'UNRESOLVED',
  'INSUFFICIENT_EVIDENCE',
  'CONTESTED',
]

const SURFACE_ID_PATTERN = /^C\d+$/
const DISCOVERED_ID_PATTERN = /^DC\d+$/

export function validateEpistemics(
  graph: XRayGraph,
  mode: ValidationMode = 'FULL',
): Violation[] {
  const out: Violation[] = []
  const surfaceSourceId = graph.investigation.surfaceSourceId
  const claimById = new Map(graph.claims.map((c) => [c.id, c]))
  const evidenceById = new Map(graph.evidence.map((e) => [e.id, e]))

  // =========================================================================
  // XR-INV-001 — Surface Source Isolation
  // =========================================================================
  const surfaceClaimIds = new Set<string>(
    graph.claims.filter((c) => c.origin === 'SURFACE').map((c) => c.id),
  )

  for (const e of graph.evidence) {
    if (e.sourceId !== surfaceSourceId) continue
    const own = e.claimIds.filter((id) => surfaceClaimIds.has(id))
    if (own.length === 0) continue
    out.push({
      code: 'XR-INV-001/SURFACE_SOURCE_CORROBORATES_OWN_CLAIM',
      invariant: 'XR-INV-001',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [
        target('Evidence', e.id),
        target('Source', surfaceSourceId),
        ...own.map((id) => target('Claim', id)),
      ],
      message: `Evidence ${e.id} is drawn from the surface source and bears on surface claim(s) ${own.join(', ')}. A surface source establishes that a claim was made; it cannot corroborate the claim it made.`,
      detail: { sourceId: surfaceSourceId, claimIds: own },
    })
  }

  for (const p of graph.evidenceProvenance) {
    if (p.origin.kind !== 'SOURCE' || p.origin.sourceId !== surfaceSourceId) continue
    out.push({
      code: 'XR-INV-001/SURFACE_SOURCE_AS_EVIDENCE_ORIGIN',
      invariant: 'XR-INV-001',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('EvidenceProvenance', p.id), target('Source', surfaceSourceId)],
      message: `EvidenceProvenance ${p.id} names the surface source as the origin of evidence ${p.evidenceId}. Being the article under investigation does not make it the origin of what was traced afterwards.`,
      detail: { evidenceId: p.evidenceId, sourceId: surfaceSourceId },
    })
  }

  // =========================================================================
  // XR-INV-012 — Discovered Claims Are Separate
  // =========================================================================
  for (const claim of graph.claims) {
    const isSurfaceId = SURFACE_ID_PATTERN.test(claim.id)
    const isDiscoveredId = DISCOVERED_ID_PATTERN.test(claim.id)

    if (!isSurfaceId && !isDiscoveredId) {
      out.push({
        code: 'XR-INV-012/CLAIM_ID_OUTSIDE_NAMESPACE',
        invariant: 'XR-INV-012',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Claim', claim.id)],
        message: `Claim ${claim.id} falls outside both reserved namespaces. Surface claims use C###, discovered claims DC###, so research discovery cannot occupy a reserved identifier.`,
        detail: { claimId: claim.id, origin: claim.origin },
      })
      continue
    }

    const expected = claim.origin === 'SURFACE' ? isSurfaceId : isDiscoveredId
    if (!expected) {
      out.push({
        code: 'XR-INV-012/CLAIM_ID_NAMESPACE_MISMATCH',
        invariant: 'XR-INV-012',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Claim', claim.id)],
        message: `Claim ${claim.id} has origin ${claim.origin} but sits in the ${isSurfaceId ? 'surface' : 'discovered'} namespace. A discovered claim must not occupy a reserved benchmark identifier.`,
        detail: { claimId: claim.id, origin: claim.origin },
      })
    }
  }

  // =========================================================================
  // XR-INV-003 — claim layer present (structural half; see coverage table)
  // =========================================================================
  for (const claim of graph.claims) {
    if (claim.layer) continue
    out.push({
      code: 'XR-INV-003/CLAIM_LAYER_MISSING',
      invariant: 'XR-INV-003',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Claim', claim.id)],
      message: `Claim ${claim.id} carries no epistemic layer. Without it, evidence appropriate to one layer can silently establish another.`,
    })
  }

  // =========================================================================
  // XR-INV-004 — Source Independence, at the proposition level
  // =========================================================================

  // Provenance may not name its own source as the origin: that is a repetition
  // asserting it observed the thing it repeated.
  for (const p of graph.evidenceProvenance) {
    if (p.origin.kind !== 'SOURCE') continue
    const e = evidenceById.get(p.evidenceId)
    if (!e || e.sourceId !== p.origin.sourceId) continue
    out.push({
      code: 'XR-INV-004/PROVENANCE_ORIGIN_IS_SELF',
      invariant: 'XR-INV-004',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('EvidenceProvenance', p.id), target('Evidence', e.id)],
      message: `EvidenceProvenance ${p.id} names evidence ${e.id}'s own source as its origin. A record cannot be the origin of the proposition it carries; omit the provenance record if the source originates.`,
      detail: { evidenceId: e.id, sourceId: p.origin.sourceId },
    })
  }

  /**
   * One proposition, one origin.
   *
   * Two provenance records for the same Evidence make its origin ambiguous,
   * and the resolver silently takes the first — so the graph would assert an
   * independence it never established. If a proposition genuinely draws on two
   * originating records it is two propositions.
   */
  const provenanceCount = new Map<string, string[]>()
  for (const p of graph.evidenceProvenance) {
    const list = provenanceCount.get(p.evidenceId) ?? []
    list.push(p.id)
    provenanceCount.set(p.evidenceId, list)
  }
  for (const [evidenceId, provenanceIds] of provenanceCount) {
    if (provenanceIds.length < 2) continue
    out.push({
      code: 'XR-INV-004/EVIDENCE_HAS_MULTIPLE_ORIGINS',
      invariant: 'XR-INV-004',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [
        target('Evidence', evidenceId),
        ...provenanceIds.map((id) => target('EvidenceProvenance', id)),
      ],
      message: `Evidence ${evidenceId} carries ${provenanceIds.length} provenance records (${provenanceIds.join(', ')}), so its origin is ambiguous and resolution silently takes the first. A proposition drawing on two originating records is two propositions.`,
      detail: { evidenceId, provenanceIds },
    })
  }

  // A source with more than one parent cannot have its origins apportioned at
  // document level. Every proposition drawn from it must say which origin it
  // came from, or claim-level independence is computed from inherited lineage.
  const parentCount = new Map<string, number>()
  for (const d of graph.sourceDependencies) {
    if (!d.dependsOnSourceId) continue
    parentCount.set(d.sourceId, (parentCount.get(d.sourceId) ?? 0) + 1)
  }
  const multiOrigin = new Set(
    [...parentCount.entries()].filter(([, n]) => n > 1).map(([id]) => id),
  )
  const hasProvenance = new Set(graph.evidenceProvenance.map((p) => p.evidenceId))

  for (const e of graph.evidence) {
    if (!multiOrigin.has(e.sourceId) || hasProvenance.has(e.id)) continue
    out.push({
      code: 'XR-INV-004/MULTI_ORIGIN_SOURCE_LACKS_PROPOSITION_PROVENANCE',
      invariant: 'XR-INV-004',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Evidence', e.id), target('Source', e.sourceId)],
      message: `Evidence ${e.id} comes from source ${e.sourceId}, which depends on ${parentCount.get(e.sourceId)} originating records, but carries no proposition-level provenance. Its origin would be inherited from document lineage, crediting claims with observations that never bore on them.`,
      detail: {
        evidenceId: e.id,
        sourceId: e.sourceId,
        parentCount: parentCount.get(e.sourceId) ?? 0,
        claimIds: e.claimIds,
      },
    })
  }

  // Per claim: confirmed origins may never exceed the records they came from,
  // and no unresolved or unidentified origin may be among them.
  for (const claim of graph.claims) {
    const summary = claimProvenanceSummary(graph, claim.id)

    /**
     * The sound arithmetic bound — a RESOLVER-REGRESSION GUARD.
     *
     * Each proposition resolves to at most one origin, so confirmed origins can
     * never exceed the evidence records carrying them. Exceeding it means
     * origins were inherited from document lineage rather than resolved per
     * proposition — the Slice 4.1 regression class, which produced 5 origins
     * from 4 evidence records.
     *
     * NOTE: with the current 1:1 resolver this is unreachable through graph
     * data alone; the data-level path to ambiguity is caught above by
     * EVIDENCE_HAS_MULTIPLE_ORIGINS. It is retained deliberately, because the
     * bug it describes was a resolver bug, and a resolver change that
     * reintroduced lineage inheritance would trip it. Documented on issue #3
     * rather than deleted or claimed as data-tested.
     */
    if (summary.independentOriginCount > summary.evidenceCount) {
      out.push({
        code: 'XR-INV-004/CONFIRMED_ORIGINS_EXCEED_EVIDENCE',
        invariant: 'XR-INV-004',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Claim', claim.id)],
        message: `Claim ${claim.id} resolves to ${summary.independentOriginCount} confirmed independent origins from only ${summary.evidenceCount} evidence records. Each proposition resolves to at most one origin, so these were inherited from document lineage rather than resolved per proposition.`,
        detail: {
          claimId: claim.id,
          independentOriginCount: summary.independentOriginCount,
          evidenceCount: summary.evidenceCount,
        },
      })
    }

    /**
     * Origins outnumbering sources is a DIAGNOSTIC, not an illegality.
     *
     * It is the signature of lineage inheritance and worth a reviewer's eye.
     * But it is also the honest shape of one publication relaying two distinct
     * originating records: sources counts records read, origins counts records
     * those trace back to, and the second may legitimately exceed the first.
     *
     * Recorded on issue #3 as a correction to the literal acceptance criterion.
     */
    if (summary.independentOriginCount > summary.sourceCount) {
      out.push({
        code: 'XR-INV-004/CONFIRMED_ORIGINS_EXCEED_SOURCES',
        invariant: 'XR-INV-004',
        class: 'EPISTEMIC',
        severity: 'WARNING',
        targets: [target('Claim', claim.id)],
        message: `Claim ${claim.id} resolves to ${summary.independentOriginCount} confirmed independent origins from ${summary.sourceCount} source(s). Legal where one publication relays several originating records, but it is also the signature of origins inherited from document lineage — worth confirming each proposition was resolved individually.`,
        detail: {
          claimId: claim.id,
          independentOriginCount: summary.independentOriginCount,
          sourceCount: summary.sourceCount,
        },
      })
    }

    // The confirmed set must contain only resolved origins.
    const confirmed = independentEvidenceOriginsForClaim(graph, claim.id)
    const unidentifiedInConfirmed = confirmed.filter((o) => o.kind === 'UNIDENTIFIED')
    if (unidentifiedInConfirmed.length > 0) {
      out.push({
        code: 'XR-INV-004/UNRESOLVED_ORIGIN_COUNTED_AS_INDEPENDENT',
        invariant: 'XR-INV-004',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Claim', claim.id)],
        message: `Claim ${claim.id} counts ${unidentifiedInConfirmed.length} unidentified origin(s) among its confirmed independent observations. An origin nobody identified is not an independent observation.`,
        detail: { claimId: claim.id, unidentified: unidentifiedInConfirmed.length },
      })
    }
  }

  // Evidence from a REPEATING source with no provenance resolves to UNRESOLVED,
  // which is legal — but if it resolved to RESOLVED the independence would be
  // fabricated. This guards the resolver itself.
  for (const e of graph.evidence) {
    const source = graph.index.source.get(e.sourceId)
    if (!source || source.originStatus !== 'REPEATING') continue
    if (provenanceForEvidence(graph, e.id).length > 0) continue
    const resolution = originForEvidence(graph, e.id)
    if (resolution.status !== 'RESOLVED') continue
    out.push({
      code: 'XR-INV-004/REPEATING_SOURCE_EVIDENCE_TREATED_AS_ORIGINATING',
      invariant: 'XR-INV-004',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Evidence', e.id), target('Source', e.sourceId)],
      message: `Evidence ${e.id} comes from repeating source ${e.sourceId} with no recorded origin, yet resolves as a confirmed independent observation. Absence of provenance is not evidence of originality.`,
      detail: { evidenceId: e.id, sourceId: e.sourceId },
    })
  }

  // =========================================================================
  // XR-INV-005 — Same-Measure Contradiction Rule
  // =========================================================================
  const compatibilityFor = (claim: Claim, e: Evidence) =>
    assessMeasurementCompatibility(claim.measurement, e.measurement)

  for (const e of graph.evidence) {
    if (e.relationship !== 'CONTRADICTS') continue
    for (const claimId of e.claimIds) {
      const claim = claimById.get(claimId)
      if (!claim) continue
      const assessment = compatibilityFor(claim, e)

      if (assessment.compatibility === 'INCOMPATIBLE') {
        out.push({
          code: 'XR-INV-005/CONTRADICTS_ON_INCOMPATIBLE_MEASUREMENT',
          invariant: 'XR-INV-005',
          class: 'EPISTEMIC',
          severity: 'ERROR',
          targets: [target('Evidence', e.id), target('Claim', claim.id)],
          message: `Evidence ${e.id} asserts CONTRADICTS against claim ${claim.id}, but they measure different quantities. ${assessment.reason} Use CHALLENGES or CONTEXTUALIZES, and record the missing measurement as a gap.`,
          detail: {
            evidenceId: e.id,
            claimId: claim.id,
            differingFields: assessment.differingFields,
            claimMetric: claim.measurement?.metric ?? '',
            evidenceMetric: e.measurement?.metric ?? '',
          },
        })
      }
      // D2: UNDETERMINED compatibility emits nothing. Unmeasured testimony can
      // legitimately contradict a measured claim, and "compatibility cannot be
      // mechanically established" is not a graph defect. Coverage for that
      // case is recorded as PARTIAL rather than manufactured as a warning.
    }
  }

  // A CONTRADICTED grade must rest on at least one contradicting record whose
  // measurement is not demonstrably incompatible.
  for (const finding of graph.findings) {
    if (finding.status !== 'CONTRADICTED') continue
    const claim = claimById.get(finding.claimId)
    if (!claim) continue

    const contradicting = evidenceForClaim(graph, finding.claimId).filter(
      (e) => e.relationship === 'CONTRADICTS',
    )

    if (contradicting.length === 0) {
      out.push({
        code: 'XR-INV-005/CONTRADICTED_WITHOUT_COMPATIBLE_EVIDENCE',
        invariant: 'XR-INV-005',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Finding', finding.id), target('Claim', claim.id)],
        message: `Finding ${finding.id} grades claim ${claim.id} CONTRADICTED with no contradicting evidence at all. A contradiction must rest on a record, not on the absence of one.`,
        detail: { findingId: finding.id, claimId: claim.id },
      })
      continue
    }

    const usable = contradicting.filter(
      (e) => compatibilityFor(claim, e).compatibility !== 'INCOMPATIBLE',
    )
    if (usable.length === 0) {
      out.push({
        code: 'XR-INV-005/CONTRADICTED_WITHOUT_COMPATIBLE_EVIDENCE',
        invariant: 'XR-INV-005',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [
          target('Finding', finding.id),
          target('Claim', claim.id),
          ...contradicting.map((e) => target('Evidence', e.id)),
        ],
        message: `Finding ${finding.id} grades claim ${claim.id} CONTRADICTED, but every contradicting record measures a different quantity. Reject the grade: the evidence cannot settle this claim in either direction.`,
        detail: {
          findingId: finding.id,
          claimId: claim.id,
          evidenceIds: contradicting.map((e) => e.id),
        },
      })
    }
  }

  // A GENUINE_CONTRADICTION classification over measurement-incompatible
  // evidence is the scope-collapse error at the reconciliation layer.
  for (const d of graph.discrepancies) {
    if (d.classification !== 'GENUINE_CONTRADICTION') continue
    for (const claimId of d.claimIds) {
      const claim = claimById.get(claimId)
      if (!claim?.measurement) continue
      const incompatible = d.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((e): e is Evidence => e !== undefined)
        .filter((e) => compatibilityFor(claim, e).compatibility === 'INCOMPATIBLE')
      if (incompatible.length === 0) continue
      out.push({
        code: 'XR-INV-005/GENUINE_CONTRADICTION_ON_INCOMPATIBLE_MEASUREMENT',
        invariant: 'XR-INV-005',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [
          target('Discrepancy', d.id),
          target('Claim', claim.id),
          ...incompatible.map((e) => target('Evidence', e.id)),
        ],
        message: `Discrepancy ${d.id} is classified GENUINE_CONTRADICTION over claim ${claim.id}, but ${incompatible.length} of its records measure a different quantity. Classify the scope, definition, date, phase or unit difference instead.`,
        detail: {
          discrepancyId: d.id,
          claimId: claim.id,
          evidenceIds: incompatible.map((e) => e.id),
        },
      })
    }
  }

  // =========================================================================
  // Research cutoff discipline
  //
  // Not one of the twelve invariants, so no `invariant` id. It comes from the
  // acceptance fixture's scheduled-vs-occurred case (§31): "Future evidence
  // MUST NOT leak into this historical fixture."
  //
  // This is the deterministic half of CAL-005. A validator cannot read a claim
  // and tell whether it asserts scheduling or occurrence — that is text. What
  // it CAN do is refuse the mechanism by which scheduling silently becomes
  // occurrence: evidence dated after the cutoff entering the graph. An
  // investigation with a cutoff of the day before an event cannot hold a
  // record of that event.
  // =========================================================================
  const cutoff = graph.investigation.researchCutoffAt
  if (cutoff) {
    const evidenceSourceIds = new Set(graph.evidence.map((e) => e.sourceId))
    for (const source of graph.sources) {
      if (!source.publishedAt || !evidenceSourceIds.has(source.id)) continue
      // Compare on the shared prefix so a date-only cutoff and a date-time
      // publication compare on the date.
      const width = Math.min(source.publishedAt.length, cutoff.length)
      if (source.publishedAt.slice(0, width) <= cutoff.slice(0, width)) continue
      const bearing = graph.evidence
        .filter((e) => e.sourceId === source.id)
        .flatMap((e) => e.claimIds)
      out.push({
        code: 'EPISTEMIC/POST_CUTOFF_EVIDENCE',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Source', source.id)],
        message: `Source ${source.id} is published ${source.publishedAt}, after the research cutoff ${cutoff}, and yields evidence bearing on ${bearing.join(', ') || 'no claim'}. Evidence from after the cutoff cannot enter a historical investigation — it is how a scheduled event silently becomes an occurred one.`,
        detail: { sourceId: source.id, publishedAt: source.publishedAt, cutoff },
      })
    }
  }

  // =========================================================================
  // XR-INV-006 — Missing Evidence Is Not Negative Evidence
  // =========================================================================
  for (const source of graph.sources) {
    if ((source.accessibility as string) !== 'DOES_NOT_EXIST') continue
    out.push({
      code: 'XR-INV-006/NONEXISTENCE_ASSERTED',
      invariant: 'XR-INV-006',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Source', source.id)],
      message: `Source ${source.id} asserts that a record does not exist. The graph records NOT_LOCATED or NOT_RETRIEVED; failure to obtain a record is never evidence of its non-existence.`,
      detail: { sourceId: source.id },
    })
  }

  for (const gap of graph.gaps) {
    if (gap.searchAlreadyAttempted.length > 0) continue
    out.push({
      code: 'XR-INV-006/GAP_WITHOUT_SEARCH_RECORD',
      invariant: 'XR-INV-006',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Gap', gap.id)],
      message: `Gap ${gap.id} records no search. Without it "not located" is an unfalsifiable claim, and a reader cannot weigh how informative the absence is.`,
      detail: { gapId: gap.id },
    })
  }

  // Evidence may only be extracted from a record actually obtained.
  for (const e of graph.evidence) {
    const source = graph.index.source.get(e.sourceId)
    if (!source) continue
    const obtained = source.accessibility === 'RETRIEVED' || source.accessibility === 'PARTIAL'
    if (obtained) continue
    out.push({
      code: 'XR-INV-006/EVIDENCE_FROM_UNOBTAINED_SOURCE',
      invariant: 'XR-INV-006',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Evidence', e.id), target('Source', e.sourceId)],
      message: `Evidence ${e.id} is extracted from source ${e.sourceId}, which was never obtained (${source.accessibility}). A proposition cannot be read out of a record nobody held; attribute it to the publication that carried it and record the origin as provenance.`,
      detail: { evidenceId: e.id, sourceId: e.sourceId, accessibility: source.accessibility },
    })
  }

  for (const e of graph.evidence) {
    if (!e.quotedPassage) continue
    const source = graph.index.source.get(e.sourceId)
    if (!source) continue
    if (source.accessibility === 'RETRIEVED' || source.accessibility === 'PARTIAL') continue
    out.push({
      code: 'XR-INV-006/QUOTED_PASSAGE_FROM_UNOBTAINED_SOURCE',
      invariant: 'XR-INV-006',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Evidence', e.id), target('Source', e.sourceId)],
      message: `Evidence ${e.id} quotes source ${e.sourceId} verbatim, but that record was never obtained. You cannot quote a document you did not read.`,
      detail: { evidenceId: e.id, sourceId: e.sourceId },
    })
  }

  // =========================================================================
  // XR-INV-007 — Findings Must Be Reversible
  // =========================================================================
  const BUCKET: Record<Evidence['relationship'], keyof Finding> = {
    SUPPORTS: 'supportingEvidenceIds',
    CHALLENGES: 'challengingEvidenceIds',
    CONTRADICTS: 'challengingEvidenceIds',
    CONTEXTUALIZES: 'contextualEvidenceIds',
  }

  for (const finding of graph.findings) {
    if (finding.wouldChangeFinding.length === 0) {
      out.push({
        code: 'XR-INV-007/FINDING_NOT_REVERSIBLE',
        invariant: 'XR-INV-007',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Finding', finding.id)],
        message: `Finding ${finding.id} names nothing that would change it. A conclusion that cannot describe how it could be overturned is invalid.`,
        detail: { findingId: finding.id },
      })
    }

    if (finding.rationale.trim() === '') {
      out.push({
        code: 'XR-INV-007/FINDING_RATIONALE_EMPTY',
        invariant: 'XR-INV-007',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [target('Finding', finding.id)],
        message: `Finding ${finding.id} carries no rationale, so its reasoning cannot be inspected.`,
        detail: { findingId: finding.id },
      })
    }

    // The three lists must mirror Evidence.relationship exactly and totally.
    const bearing = evidenceForClaim(graph, finding.claimId)
    const expected: Record<string, string[]> = {
      supportingEvidenceIds: [],
      challengingEvidenceIds: [],
      contextualEvidenceIds: [],
    }
    for (const e of bearing) expected[BUCKET[e.relationship] as string].push(e.id)

    const actual: Record<string, readonly string[]> = {
      supportingEvidenceIds: finding.supportingEvidenceIds,
      challengingEvidenceIds: finding.challengingEvidenceIds,
      contextualEvidenceIds: finding.contextualEvidenceIds,
    }

    for (const key of Object.keys(expected)) {
      const want = expected[key]
      const have = actual[key]
      const missing = want.filter((id) => !have.includes(id))
      const extra = have.filter((id) => !want.includes(id))
      if (missing.length === 0 && extra.length === 0) continue
      out.push({
        code: 'XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH',
        invariant: 'XR-INV-007',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [
          target('Finding', finding.id),
          target('Claim', finding.claimId),
          ...[...missing, ...extra].map((id) => target('Evidence', id)),
        ],
        message: `Finding ${finding.id} field "${key}" does not mirror Evidence.relationship for claim ${finding.claimId}.${
          missing.length ? ` Missing: ${missing.join(', ')}.` : ''
        }${extra.length ? ` Wrongly listed: ${extra.join(', ')}.` : ''} Evidence load-bearing for a finding must be reachable from it.`,
        detail: { findingId: finding.id, field: key, missing, extra },
      })
    }
  }

  // =========================================================================
  // XR-INV-008 — Gap Preservation
  // =========================================================================
  /**
   * An unresolved finding must expose the gap preventing resolution.
   *
   * STAGED EXEMPTION, AND ONLY WHILE NO GAP EXISTS. The architecture grades at
   * stage 8 and identifies gaps at stage 9, so between those two stages an
   * unresolved finding necessarily names no gap — the artifact it would name
   * has not been produced. Enforcing the rule there would fail `GRADE` for
   * doing its job in the specified order.
   *
   * This is the mirror of the exemption already made below for orphaned gaps,
   * which anticipates the opposite ordering. Both say the same thing: a rule
   * relating two collections cannot bind before both exist.
   *
   * The exemption lapses the moment a gap exists. Once `GAPS` has run, a
   * finding still naming none is a real defect, is caught under STAGED, and is
   * attributed to `GAPS` rather than surfacing later at the gate with no owner.
   * `FULL` always enforces it, so graduation is unaffected.
   */
  const gapsProduced = graph.gaps.length > 0
  for (const finding of mode === 'FULL' || gapsProduced ? graph.findings : []) {
    if (!UNSETTLED.includes(finding.status)) continue
    if (finding.gapIds.length > 0) continue
    out.push({
      code: 'XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP',
      invariant: 'XR-INV-008',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Finding', finding.id), target('Claim', finding.claimId)],
      message: `Finding ${finding.id} is ${finding.status} but names no gap. A material unresolved claim must expose the evidence gap preventing resolution.`,
      detail: { findingId: finding.id, status: finding.status },
    })
  }

  /**
   * Every gap must be reachable from a finding on one of its claims.
   *
   * GRADUATION ONLY (D1). A pre-grade graph may legitimately hold a gap before
   * any Finding references it — the gap ledger is written before grading in
   * several protocol orderings. At graduation an orphaned canonical gap is
   * state nothing surfaces to a reader.
   */
  const gapsReferenced = new Set(graph.findings.flatMap((f) => f.gapIds))
  for (const gap of mode === 'FULL' ? graph.gaps : []) {
    if (gapsReferenced.has(gap.id)) continue
    out.push({
      code: 'XR-INV-008/GAP_NOT_REACHABLE_FROM_FINDING',
      invariant: 'XR-INV-008',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Gap', gap.id), ...gap.claimIds.map((id) => target('Claim', id))],
      message: `Gap ${gap.id} is named by no finding, so nothing surfaces it to a reader. Attach it to the finding(s) it blocks.`,
      detail: { gapId: gap.id, claimIds: gap.claimIds },
    })
  }

  // =========================================================================
  // XR-INV-009 — Action Eligibility
  // =========================================================================
  for (const gap of graph.gaps) {
    const shouldBeEligible = gap.resolutionPath === 'PUBLIC_RECORD_REQUEST'
    if (gap.atiEligible === shouldBeEligible) continue
    out.push({
      code: 'XR-INV-009/ATI_ELIGIBILITY_MISMATCH',
      invariant: 'XR-INV-009',
      class: 'EPISTEMIC',
      severity: 'ERROR',
      targets: [target('Gap', gap.id)],
      message: `Gap ${gap.id} has resolutionPath ${gap.resolutionPath} and atiEligible ${gap.atiEligible}. Eligibility holds exactly when the path is PUBLIC_RECORD_REQUEST; materiality does not create eligibility.`,
      detail: { gapId: gap.id, resolutionPath: gap.resolutionPath, atiEligible: gap.atiEligible },
    })
  }

  /*
   * The request half of XR-INV-009 is NOT here any more.
   *
   * "A request may only target an eligible gap" and "a request may only ask
   * for records that gap names" are enforced at the ATI command boundary
   * (`application/ati-service.ts`), against the exact frozen origin snapshot,
   * emitting these same two violation codes. They left because the graph
   * stopped carrying requests at all: an action taken about a frozen version
   * keeps changing after that version is frozen, so it was never version-scoped
   * research state (ADR-0017, #10 C1/C2/C7).
   *
   * The gap half above stays, because eligibility is a property of a gap and
   * gaps remain version-scoped.
   */

  // =========================================================================
  // XR-INV-010 — Historical Preservation (numbering coherence only)
  // =========================================================================
  const version = graph.version
  if (version) {
    const vTarget = target(
      'InvestigationVersion',
      `${version.investigationId}@v${version.version}`,
    )
    if (!Number.isInteger(version.version) || version.version < 1) {
      out.push({
        code: 'XR-INV-010/VERSION_NUMBERING_INVALID',
        invariant: 'XR-INV-010',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [vTarget],
        message: `Investigation version ${version.version} is not a positive integer. Versions are 1-based and monotonic.`,
        detail: { version: version.version },
      })
    }
    if (version.version === 1 && version.supersedesVersion !== undefined) {
      out.push({
        code: 'XR-INV-010/VERSION_SUPERSEDES_INVALID',
        invariant: 'XR-INV-010',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [vTarget],
        message: `Version 1 claims to supersede version ${version.supersedesVersion}. Nothing precedes the first version.`,
        detail: { version: version.version, supersedesVersion: version.supersedesVersion },
      })
    }
    if (
      version.supersedesVersion !== undefined &&
      version.supersedesVersion >= version.version
    ) {
      out.push({
        code: 'XR-INV-010/VERSION_SUPERSEDES_INVALID',
        invariant: 'XR-INV-010',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [vTarget],
        message: `Version ${version.version} claims to supersede version ${version.supersedesVersion}, which is not earlier. History accumulates forward.`,
        detail: { version: version.version, supersedesVersion: version.supersedesVersion },
      })
    }
    if (version.version !== graph.investigation.currentVersion) {
      out.push({
        code: 'XR-INV-010/CURRENT_VERSION_MISMATCH',
        invariant: 'XR-INV-010',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [vTarget, target('Investigation', graph.investigation.id)],
        message: `Investigation ${graph.investigation.id} reports currentVersion ${graph.investigation.currentVersion} but the attached version record is ${version.version}.`,
        detail: {
          currentVersion: graph.investigation.currentVersion,
          versionRecord: version.version,
        },
      })
    }
    if (version.version === 1 && version.reEvaluatedClaimIds.length > 0) {
      out.push({
        code: 'XR-INV-010/VERSION_NUMBERING_INVALID',
        invariant: 'XR-INV-010',
        class: 'EPISTEMIC',
        severity: 'ERROR',
        targets: [vTarget],
        message: `Version 1 re-evaluates ${version.reEvaluatedClaimIds.length} claim(s), but nothing preceded it to re-evaluate.`,
        detail: { reEvaluated: version.reEvaluatedClaimIds },
      })
    }
  }

  // =========================================================================
  // XR-INV-011 — Synthesis Cannot Mutate Evidence
  //
  // Structural half lives in `structural.ts`: no canonical artifact may carry a
  // derived count or presentation field, so synthesis has nothing to write
  // back into. Observing an actual mutation needs stage runs and stored
  // history; see the coverage table.
  // =========================================================================

  return out
}
