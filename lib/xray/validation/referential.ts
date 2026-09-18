/**
 * Referential validation — do the ids point at anything?
 *
 * A dangling reference is not a cosmetic problem. A finding citing evidence
 * that does not exist claims support it does not have, and a gap attached to
 * no claim blocks nothing. Both read as complete work.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import type { Violation, ViolationTarget, TargetKind, ValidationMode } from './violations'

const target = (kind: TargetKind, id: string): ViolationTarget => ({ kind, id })

export function validateReferences(
  graph: XRayGraph,
  mode: ValidationMode = 'FULL',
): Violation[] {
  const out: Violation[] = []

  const claims = new Set(graph.claims.map((c) => c.id))
  const sources = new Set(graph.sources.map((s) => s.id))
  const evidence = new Set(graph.evidence.map((e) => e.id))
  const discrepancies = new Set(graph.discrepancies.map((d) => d.id))
  const findings = new Set(graph.findings.map((f) => f.id))
  const gaps = new Set(graph.gaps.map((g) => g.id))

  const dangling = (
    from: ViolationTarget,
    field: string,
    toKind: TargetKind,
    id: string,
  ): void => {
    out.push({
      code: 'REFERENTIAL/DANGLING_REFERENCE',
      class: 'REFERENTIAL',
      severity: 'ERROR',
      targets: [from, target(toKind, id)],
      message: `${from.kind} ${from.id} field "${field}" references ${toKind} "${id}", which does not exist in the graph.`,
      detail: { field, referenced: id, referencedKind: toKind },
    })
  }

  const check = (
    from: ViolationTarget,
    field: string,
    toKind: TargetKind,
    ids: readonly string[],
    known: ReadonlySet<string>,
  ): void => {
    for (const id of ids) if (!known.has(id)) dangling(from, field, toKind, id)
  }

  // --- Investigation -------------------------------------------------------
  const inv = target('Investigation', graph.investigation.id)
  if (!sources.has(graph.investigation.surfaceSourceId))
    dangling(inv, 'surfaceSourceId', 'Source', graph.investigation.surfaceSourceId)

  check(inv, 'claimIds', 'Claim', graph.investigation.claimIds, claims)
  check(inv, 'sourceIds', 'Source', graph.investigation.sourceIds, sources)
  check(inv, 'evidenceIds', 'Evidence', graph.investigation.evidenceIds, evidence)
  check(inv, 'discrepancyIds', 'Discrepancy', graph.investigation.discrepancyIds, discrepancies)
  check(inv, 'findingIds', 'Finding', graph.investigation.findingIds, findings)
  check(inv, 'gapIds', 'Gap', graph.investigation.gapIds, gaps)

  /**
   * The index must be complete as well as valid: an artifact present in the
   * graph but absent from the investigation's own index is unreachable through
   * the investigation, which is how a claim silently stops being investigated.
   *
   * GRADUATION ONLY (D1). Staged validation runs against graphs whose later
   * artifacts do not exist yet; completeness is a property of a finished graph,
   * not of one mid-pipeline. This is graph completeness, not Reviewer judgment.
   */
  const indexMismatch = (field: string, indexed: readonly string[], actual: Set<string>) => {
    if (mode !== 'FULL') return
    const missing = [...actual].filter((id) => !indexed.includes(id))
    if (missing.length === 0) return
    out.push({
      code: 'REFERENTIAL/INVESTIGATION_INDEX_MISMATCH',
      class: 'REFERENTIAL',
      severity: 'ERROR',
      targets: [inv],
      message: `Investigation ${graph.investigation.id} field "${field}" omits ${missing.length} artifact(s) present in the graph: ${missing.join(', ')}.`,
      detail: { field, missing },
    })
  }
  indexMismatch('claimIds', graph.investigation.claimIds, claims)
  indexMismatch('sourceIds', graph.investigation.sourceIds, sources)
  indexMismatch('evidenceIds', graph.investigation.evidenceIds, evidence)
  indexMismatch('findingIds', graph.investigation.findingIds, findings)
  indexMismatch('gapIds', graph.investigation.gapIds, gaps)

  // --- Claims --------------------------------------------------------------
  for (const claim of graph.claims) {
    if (claim.investigationId !== graph.investigation.id) {
      out.push({
        code: 'REFERENTIAL/DANGLING_REFERENCE',
        class: 'REFERENTIAL',
        severity: 'ERROR',
        targets: [target('Claim', claim.id), inv],
        message: `Claim ${claim.id} belongs to investigation "${claim.investigationId}" but appears in the graph for "${graph.investigation.id}".`,
        detail: { field: 'investigationId', referenced: claim.investigationId },
      })
    }
  }

  // --- Evidence ------------------------------------------------------------
  for (const e of graph.evidence) {
    const from = target('Evidence', e.id)
    if (!sources.has(e.sourceId)) dangling(from, 'sourceId', 'Source', e.sourceId)
    check(from, 'claimIds', 'Claim', e.claimIds, claims)
  }

  // --- Evidence provenance -------------------------------------------------
  for (const p of graph.evidenceProvenance) {
    const from = target('EvidenceProvenance', p.id)
    if (!evidence.has(p.evidenceId)) dangling(from, 'evidenceId', 'Evidence', p.evidenceId)
    if (p.origin.kind === 'SOURCE' && !sources.has(p.origin.sourceId))
      dangling(from, 'origin.sourceId', 'Source', p.origin.sourceId)
  }

  // --- Source dependencies -------------------------------------------------
  for (const d of graph.sourceDependencies) {
    const from = target('SourceDependency', d.id)
    if (!sources.has(d.sourceId)) dangling(from, 'sourceId', 'Source', d.sourceId)
    if (d.dependsOnSourceId && !sources.has(d.dependsOnSourceId))
      dangling(from, 'dependsOnSourceId', 'Source', d.dependsOnSourceId)
  }

  // --- Findings ------------------------------------------------------------
  for (const f of graph.findings) {
    const from = target('Finding', f.id)
    if (!claims.has(f.claimId)) dangling(from, 'claimId', 'Claim', f.claimId)
    check(from, 'supportingEvidenceIds', 'Evidence', f.supportingEvidenceIds, evidence)
    check(from, 'challengingEvidenceIds', 'Evidence', f.challengingEvidenceIds, evidence)
    check(from, 'contextualEvidenceIds', 'Evidence', f.contextualEvidenceIds, evidence)
    check(from, 'discrepancyIds', 'Discrepancy', f.discrepancyIds, discrepancies)
    check(from, 'gapIds', 'Gap', f.gapIds, gaps)
  }

  // --- Discrepancies / disconfirmations ------------------------------------
  for (const d of graph.discrepancies) {
    const from = target('Discrepancy', d.id)
    check(from, 'claimIds', 'Claim', d.claimIds, claims)
    check(from, 'evidenceIds', 'Evidence', d.evidenceIds, evidence)
  }

  for (const d of graph.disconfirmations) {
    const from = target('Disconfirmation', d.id)
    if (!claims.has(d.claimId)) dangling(from, 'claimId', 'Claim', d.claimId)
    check(
      from,
      'strongestSupportingEvidenceIds',
      'Evidence',
      d.strongestSupportingEvidenceIds,
      evidence,
    )
    check(
      from,
      'strongestOpposingEvidenceIds',
      'Evidence',
      d.strongestOpposingEvidenceIds,
      evidence,
    )
  }

  // --- Gaps ----------------------------------------------------------------
  for (const g of graph.gaps) {
    const from = target('Gap', g.id)
    check(from, 'claimIds', 'Claim', g.claimIds, claims)
    if (g.claimIds.length === 0) {
      out.push({
        code: 'REFERENTIAL/ORPHANED_ARTIFACT',
        class: 'REFERENTIAL',
        severity: 'ERROR',
        targets: [from],
        message: `Gap ${g.id} blocks no claim. A gap that blocks nothing is not a research result.`,
      })
    }
  }

  // --- ATI requests --------------------------------------------------------
  for (const r of graph.atiRequests) {
    const from = target('ATIRequest', r.id)
    if (!gaps.has(r.gapId)) dangling(from, 'gapId', 'Gap', r.gapId)
    check(from, 'receivedSourceIds', 'Source', r.receivedSourceIds, sources)
  }

  // --- Stage runs / version ------------------------------------------------
  for (const run of graph.investigation.stageRuns) {
    if (run.investigationId !== graph.investigation.id) {
      out.push({
        code: 'REFERENTIAL/DANGLING_REFERENCE',
        class: 'REFERENTIAL',
        severity: 'ERROR',
        targets: [target('StageRun', run.id), inv],
        message: `StageRun ${run.id} names investigation "${run.investigationId}" but sits on "${graph.investigation.id}".`,
        detail: { field: 'investigationId', referenced: run.investigationId },
      })
    }
  }

  const version = graph.version
  if (version) {
    const from = target('InvestigationVersion', `${version.investigationId}@v${version.version}`)
    if (version.investigationId !== graph.investigation.id)
      dangling(from, 'investigationId', 'Investigation', version.investigationId)
    check(from, 'addedSourceIds', 'Source', version.addedSourceIds, sources)
    check(from, 'addedEvidenceIds', 'Evidence', version.addedEvidenceIds, evidence)
    check(from, 'reEvaluatedClaimIds', 'Claim', version.reEvaluatedClaimIds, claims)
    check(from, 'findingIds', 'Finding', version.findingIds, findings)
    check(from, 'gapIds', 'Gap', version.gapIds, gaps)
  }

  return out
}
