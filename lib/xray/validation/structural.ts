/**
 * Structural validation — does the artifact conform to its shape?
 *
 * TypeScript already guarantees most of this at compile time. This layer
 * matters because the validator's real job is checking graphs that did NOT
 * come from a typechecked literal: model output, deserialized API payloads,
 * rows read back from a store. At that boundary a field declared `string` can
 * arrive as `undefined`, and an enum can arrive as any string at all.
 *
 * So the checks here are deliberately defensive about values the type system
 * claims are impossible.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import type { Violation, ViolationTarget, ValidationMode } from './violations'

const ISO_DATE = /^\d{4}(-\d{2})?(-\d{2})?([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

/** A stored derived count is a second source of truth. XR-INV-011. */
const DERIVED_FIELD = /(count|Count)$/

const target = (kind: ViolationTarget['kind'], id: string): ViolationTarget => ({ kind, id })

const nonEmpty = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0

const requiresKnowledgeBasis = (version: string): boolean => {
  const match = /^v?(\d+)\.(\d+)(?:\.|$)/.exec(version)
  return match !== null && (Number(match[1]) > 0 || Number(match[2]) >= 3)
}

export function validateStructure(graph: XRayGraph, mode: ValidationMode = 'FULL'): Violation[] {
  const out: Violation[] = []

  const requireString = (
    kind: ViolationTarget['kind'],
    id: string,
    field: string,
    value: unknown,
  ): void => {
    if (value === undefined || value === null) {
      out.push({
        code: 'STRUCTURAL/MISSING_REQUIRED_FIELD',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target(kind, id)],
        message: `${kind} ${id} is missing required field "${field}".`,
        detail: { field },
      })
    } else if (!nonEmpty(value)) {
      out.push({
        code: 'STRUCTURAL/EMPTY_REQUIRED_STRING',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target(kind, id)],
        message: `${kind} ${id} has an empty "${field}", which carries no information.`,
        detail: { field },
      })
    }
  }

  const requireEnum = <T extends string>(
    kind: ViolationTarget['kind'],
    id: string,
    field: string,
    value: unknown,
    allowed: readonly T[],
  ): void => {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      out.push({
        code: 'STRUCTURAL/ILLEGAL_ENUM_VALUE',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target(kind, id)],
        message: `${kind} ${id} has illegal ${field} "${String(value)}".`,
        detail: { field, value: String(value), allowed },
      })
    }
  }

  const requireIso = (
    kind: ViolationTarget['kind'],
    id: string,
    field: string,
    value: unknown,
    required: boolean,
  ): void => {
    if (value === undefined) {
      if (required) requireString(kind, id, field, value)
      return
    }
    if (typeof value !== 'string' || !ISO_DATE.test(value)) {
      out.push({
        code: 'STRUCTURAL/NON_ISO_TIMESTAMP',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target(kind, id)],
        message: `${kind} ${id} field "${field}" is not an ISO date or date-time string. Domain timestamps are strings, never Date objects.`,
        detail: { field, value: String(value) },
      })
    }
  }

  const noDerivedFields = (kind: ViolationTarget['kind'], id: string, obj: object): void => {
    for (const key of Object.keys(obj)) {
      if (!DERIVED_FIELD.test(key)) continue
      out.push({
        code: 'STRUCTURAL/DERIVED_FIELD_STORED',
        invariant: 'XR-INV-011',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target(kind, id)],
        message: `${kind} ${id} stores a derived field "${key}". Counts are computed from the graph; storing one creates a second source of truth that can drift.`,
        detail: { field: key },
      })
    }
  }

  // --- duplicate ids across the whole graph --------------------------------
  const seen = new Map<string, ViolationTarget['kind']>()
  const claimId = (kind: ViolationTarget['kind'], id: string): void => {
    const existing = seen.get(id)
    if (existing !== undefined) {
      out.push({
        code: 'STRUCTURAL/DUPLICATE_ID',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target(kind, id), target(existing, id)],
        message: `Id "${id}" is used by both a ${existing} and a ${kind}.`,
        detail: { id, kinds: [existing, kind] },
      })
    }
    seen.set(id, kind)
  }

  // --- Investigation -------------------------------------------------------
  const inv = graph.investigation
  requireString('Investigation', inv.id, 'protocolVersion', inv.protocolVersion)
  requireString('Investigation', inv.id, 'surfaceSourceId', inv.surfaceSourceId)
  requireIso('Investigation', inv.id, 'createdAt', inv.createdAt, true)
  requireIso('Investigation', inv.id, 'researchCutoffAt', inv.researchCutoffAt, false)
  requireIso('Investigation', inv.id, 'completedAt', inv.completedAt, false)
  requireEnum('Investigation', inv.id, 'status', inv.status, [
    'CREATED',
    'RUNNING',
    'RESEARCH_COMPLETE',
    'SYNTHESIZED',
    'PUBLISHED',
    'FAILED',
  ])
  if (typeof inv.currentVersion !== 'number' || inv.currentVersion < 1) {
    out.push({
      code: 'STRUCTURAL/ILLEGAL_ENUM_VALUE',
      class: 'STRUCTURAL',
      severity: 'ERROR',
      targets: [target('Investigation', inv.id)],
      message: `Investigation ${inv.id} has currentVersion ${String(inv.currentVersion)}; versions are 1-based.`,
      detail: { field: 'currentVersion', value: String(inv.currentVersion) },
    })
  }
  noDerivedFields('Investigation', inv.id, inv)

  // --- Claims --------------------------------------------------------------
  for (const claim of graph.claims) {
    claimId('Claim', claim.id)
    requireString('Claim', claim.id, 'text', claim.text)
    requireString('Claim', claim.id, 'investigationId', claim.investigationId)
    requireEnum('Claim', claim.id, 'origin', claim.origin, ['SURFACE', 'DISCOVERED'])
    requireEnum('Claim', claim.id, 'layer', claim.layer, [
      'OBSERVATION',
      'INTERPRETATION',
      'MEANING',
    ])
    requireEnum('Claim', claim.id, 'type', claim.type, [
      'QUANTITATIVE',
      'FINANCIAL',
      'GEOGRAPHIC',
      'DELIVERY',
      'TIMELINE',
      'ATTRIBUTION',
      'LEGAL',
      'OTHER',
    ])
    requireEnum('Claim', claim.id, 'priority', claim.priority, ['HIGH', 'MEDIUM', 'LOW'])
    noDerivedFields('Claim', claim.id, claim)
  }

  // --- Sources -------------------------------------------------------------
  for (const source of graph.sources) {
    claimId('Source', source.id)
    requireString('Source', source.id, 'title', source.title)
    requireIso('Source', source.id, 'retrievedAt', source.retrievedAt, true)
    requireIso('Source', source.id, 'publishedAt', source.publishedAt, false)
    requireEnum('Source', source.id, 'evidenceClass', source.evidenceClass, [
      'PRIMARY',
      'PRIMARY_ADJACENT',
      'ATTRIBUTED_ORIGIN_NOT_RETRIEVED',
      'SECONDARY',
      'TERTIARY',
    ])
    requireEnum('Source', source.id, 'originStatus', source.originStatus, [
      'ORIGINATING',
      'REPEATING',
      'UNKNOWN',
    ])
    // The absence of DOES_NOT_EXIST from this list is the point. XR-INV-006.
    requireEnum('Source', source.id, 'accessibility', source.accessibility, [
      'RETRIEVED',
      'PARTIAL',
      'NOT_LOCATED',
      'NOT_RETRIEVED',
      'DEAD_LINK',
    ])
    noDerivedFields('Source', source.id, source)
  }

  for (const position of graph.sourcePositions) {
    claimId('SourcePosition', position.id)
    requireString('SourcePosition', position.id, 'sourceId', position.sourceId)
    requireEnum('SourcePosition', position.id, 'relationship', position.relationship, [
      'SUBJECT', 'PARTICIPANT', 'WITNESS', 'GOVERNING_AUTHORITY', 'REGULATOR',
      'AUDITOR', 'INVESTIGATOR', 'DETENTION_OR_ENFORCEMENT_AUTHORITY',
      'EMPLOYER_OR_PRINCIPAL', 'EMPLOYEE_OR_AGENT', 'CONTRACTUAL_COUNTERPARTY',
      'BENEFICIARY', 'ADVERSARY', 'INTERMEDIARY', 'OTHER',
    ])
    requireEnum('SourcePosition', position.id, 'basis', position.basis, ['DOCUMENTED', 'INFERRED'])
    requireEnum('SourcePosition', position.id, 'confidence', position.confidence, ['HIGH', 'MEDIUM', 'LOW'])
    if (!Array.isArray(position.claimIds) || position.claimIds.length === 0) out.push({
      code: 'REFERENTIAL/ORPHANED_ARTIFACT', class: 'REFERENTIAL', severity: 'ERROR',
      targets: [target('SourcePosition', position.id)],
      message: `SourcePosition ${position.id} bears on no claim.`,
    })
    if (!Array.isArray(position.powerOrDependency) ||
        position.powerOrDependency.some((entry) => !nonEmpty(entry))) out.push({
      code: 'STRUCTURAL/EMPTY_REQUIRED_STRING', class: 'STRUCTURAL', severity: 'ERROR',
      targets: [target('SourcePosition', position.id)],
      message: `SourcePosition ${position.id} has invalid powerOrDependency entries.`,
      detail: { field: 'powerOrDependency' },
    })
    if ((!Array.isArray(position.supportingEvidenceIds) || position.supportingEvidenceIds.length === 0) && !nonEmpty(position.basisDescription)) out.push({
      code: 'STRUCTURAL/SOURCE_POSITION_BASIS_UNEXPLAINED', class: 'STRUCTURAL', severity: 'ERROR',
      targets: [target('SourcePosition', position.id)],
      message: `SourcePosition ${position.id} has neither supporting evidence nor a basis description.`,
    })
    noDerivedFields('SourcePosition', position.id, position)
  }

  // --- Evidence ------------------------------------------------------------
  for (const evidence of graph.evidence) {
    claimId('Evidence', evidence.id)
    requireString('Evidence', evidence.id, 'proposition', evidence.proposition)
    requireString('Evidence', evidence.id, 'sourceId', evidence.sourceId)
    requireEnum('Evidence', evidence.id, 'relationship', evidence.relationship, [
      'SUPPORTS',
      'CHALLENGES',
      'CONTRADICTS',
      'CONTEXTUALIZES',
    ])
    requireEnum('Evidence', evidence.id, 'strength', evidence.strength, [
      'DIRECT',
      'STRONG_INDIRECT',
      'CONTEXTUAL',
      'WEAK',
    ])
    if (evidence.knowledgeBasis !== undefined) {
      requireEnum('Evidence', evidence.id, 'knowledgeBasis', evidence.knowledgeBasis, [
        'DIRECT_OBSERVATION', 'SELF_REPORT', 'PARTICIPANT_ACCOUNT', 'MEASUREMENT', 'ADMINISTRATIVE_RECORD',
        'INSTITUTIONAL_CHARACTERIZATION', 'ATTRIBUTED_SOURCE',
        'EXPERT_INTERPRETATION', 'SECONDARY_SYNTHESIS', 'INFERENCE', 'UNKNOWN',
      ])
      if (evidence.knowledgeBasis === 'UNKNOWN' && mode === 'FULL' &&
          requiresKnowledgeBasis(graph.investigation.protocolVersion)) out.push({
        code: 'STRUCTURAL/UNKNOWN_KNOWLEDGE_BASIS', class: 'STRUCTURAL', severity: 'ERROR',
        targets: [target('Evidence', evidence.id)],
        message: `Evidence ${evidence.id} has UNKNOWN knowledgeBasis; v0.3+ FULL requires a concrete basis.`,
      })
    } else if (mode === 'FULL' && requiresKnowledgeBasis(graph.investigation.protocolVersion)) out.push({
      code: 'STRUCTURAL/MISSING_KNOWLEDGE_BASIS', class: 'STRUCTURAL', severity: 'ERROR',
      targets: [target('Evidence', evidence.id)],
      message: `Evidence ${evidence.id} lacks knowledgeBasis required for v0.3+ FULL validation.`,
    })
    if (evidence.claimIds.length === 0) {
      out.push({
        code: 'REFERENTIAL/ORPHANED_ARTIFACT',
        class: 'REFERENTIAL',
        severity: 'ERROR',
        targets: [target('Evidence', evidence.id)],
        message: `Evidence ${evidence.id} bears on no claim. Evidence that connects to nothing is not evidence.`,
      })
    }
    noDerivedFields('Evidence', evidence.id, evidence)
  }

  // --- Evidence provenance -------------------------------------------------
  for (const provenance of graph.evidenceProvenance) {
    claimId('EvidenceProvenance', provenance.id)
    requireString('EvidenceProvenance', provenance.id, 'evidenceId', provenance.evidenceId)
    requireEnum('EvidenceProvenance', provenance.id, 'relationship', provenance.relationship, [
      'REPRODUCES',
      'QUOTES',
      'ATTRIBUTES_TO',
      'DERIVED_FROM',
    ])
    requireEnum('EvidenceProvenance', provenance.id, 'confidence', provenance.confidence, [
      'HIGH',
      'MEDIUM',
      'LOW',
    ])

    const origin = provenance.origin as {
      kind?: string
      sourceId?: string
      description?: string
    }
    if (origin?.kind === 'SOURCE') {
      requireString('EvidenceProvenance', provenance.id, 'origin.sourceId', origin.sourceId)
      if (origin.description !== undefined) {
        out.push({
          code: 'STRUCTURAL/ILLEGAL_ENUM_VALUE',
          class: 'STRUCTURAL',
          severity: 'ERROR',
          targets: [target('EvidenceProvenance', provenance.id)],
          message: `EvidenceProvenance ${provenance.id} is a SOURCE origin but also carries a description. The two origin forms cannot coexist.`,
          detail: { field: 'origin' },
        })
      }
    } else if (origin?.kind === 'UNIDENTIFIED') {
      requireString(
        'EvidenceProvenance',
        provenance.id,
        'origin.description',
        origin.description,
      )
      if (origin.sourceId !== undefined) {
        out.push({
          code: 'STRUCTURAL/ILLEGAL_ENUM_VALUE',
          class: 'STRUCTURAL',
          severity: 'ERROR',
          targets: [target('EvidenceProvenance', provenance.id)],
          message: `EvidenceProvenance ${provenance.id} is an UNIDENTIFIED origin but also names a sourceId. The two origin forms cannot coexist.`,
          detail: { field: 'origin' },
        })
      }
    } else {
      out.push({
        code: 'STRUCTURAL/ILLEGAL_ENUM_VALUE',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target('EvidenceProvenance', provenance.id)],
        message: `EvidenceProvenance ${provenance.id} has illegal origin kind "${String(origin?.kind)}".`,
        detail: { field: 'origin.kind', value: String(origin?.kind) },
      })
    }
  }

  // --- Findings ------------------------------------------------------------
  for (const finding of graph.findings) {
    claimId('Finding', finding.id)
    requireEnum('Finding', finding.id, 'status', finding.status, [
      'ESTABLISHED',
      'SUPPORTED',
      'PARTIALLY_SUPPORTED',
      'CONTESTED',
      'CONTRADICTED',
      'UNRESOLVED',
      'INSUFFICIENT_EVIDENCE',
    ])
    // Ordinal only. A numeric confidence would fail here.
    requireEnum('Finding', finding.id, 'confidence', finding.confidence, [
      'HIGH',
      'MEDIUM',
      'LOW',
    ])
    requireIso('Finding', finding.id, 'gradedAt', finding.gradedAt, true)
    noDerivedFields('Finding', finding.id, finding)
  }

  // --- Gaps ----------------------------------------------------------------
  for (const gap of graph.gaps) {
    claimId('Gap', gap.id)
    requireString('Gap', gap.id, 'missingEvidence', gap.missingEvidence)
    requireString('Gap', gap.id, 'whyItMatters', gap.whyItMatters)
    requireEnum('Gap', gap.id, 'status', gap.status, [
      'OPEN',
      'REQUESTED',
      'RECEIVED',
      'RESOLVED',
      'UNRESOLVABLE',
    ])
    requireEnum('Gap', gap.id, 'resolutionPath', gap.resolutionPath, [
      'PUBLIC_RECORD_REQUEST',
      'WAIT_FOR_RECORD',
      'FIELD_VERIFICATION',
      'SOURCE_CLARIFICATION',
      'DATASET_QUERY',
      'EXPERT_INTERPRETATION',
      'OTHER',
    ])
    if (gap.likelyHolder) {
      requireString('Gap', gap.id, 'likelyHolder.institution', gap.likelyHolder.institution)
      requireEnum('Gap', gap.id, 'likelyHolder.basis', gap.likelyHolder.basis, [
        'CONFIRMED',
        'INFERRED',
      ])
    }
    noDerivedFields('Gap', gap.id, gap)
  }

  // --- Discrepancies, disconfirmations, dependencies, stage runs -----------
  for (const d of graph.discrepancies) {
    claimId('Discrepancy', d.id)
    requireString('Discrepancy', d.id, 'description', d.description)
    requireEnum('Discrepancy', d.id, 'classification', d.classification, [
      'DIFFERENT_DATE',
      'DIFFERENT_SCOPE',
      'DIFFERENT_DEFINITION',
      'DIFFERENT_PHASE',
      'DIFFERENT_UNIT',
      'REVISED_VALUE',
      'GENUINE_CONTRADICTION',
      'PROBABLE_SOURCE_ERROR',
      'UNRESOLVED',
    ])
  }

  for (const d of graph.disconfirmations) {
    claimId('Disconfirmation', d.id)
    requireString('Disconfirmation', d.id, 'claimId', d.claimId)
    requireEnum('Disconfirmation', d.id, 'result', d.result, [
      'SURVIVED',
      'SURVIVED_WEAKENED',
      'CHANGED',
      'FAILED',
      'UNRESOLVED',
    ])
  }

  for (const dep of graph.sourceDependencies) {
    claimId('SourceDependency', dep.id)
    requireString('SourceDependency', dep.id, 'sourceId', dep.sourceId)
    requireEnum('SourceDependency', dep.id, 'relationship', dep.relationship, [
      'REPRODUCES',
      'QUOTES',
      'ATTRIBUTES_TO',
      'DERIVED_FROM',
      'SAME_EVENT',
      'PROBABLE_COMMON_ORIGIN',
      'UNKNOWN',
    ])
    requireEnum('SourceDependency', dep.id, 'confidence', dep.confidence, [
      'HIGH',
      'MEDIUM',
      'LOW',
    ])
    if (dep.dependsOnSourceId === undefined && !nonEmpty(dep.originDescription)) {
      out.push({
        code: 'STRUCTURAL/MISSING_REQUIRED_FIELD',
        class: 'STRUCTURAL',
        severity: 'ERROR',
        targets: [target('SourceDependency', dep.id)],
        message: `SourceDependency ${dep.id} names neither a parent source nor an originDescription, so it records a dependency on nothing.`,
        detail: { field: 'dependsOnSourceId|originDescription' },
      })
    }
  }

  for (const run of graph.investigation.stageRuns) {
    claimId('StageRun', run.id)
    requireEnum('StageRun', run.id, 'status', run.status, [
      'PENDING',
      'RUNNING',
      'SUCCEEDED',
      'FAILED',
    ])
    requireIso('StageRun', run.id, 'startedAt', run.startedAt, false)
    requireIso('StageRun', run.id, 'completedAt', run.completedAt, false)
  }

  // No ATI request shape checks: the graph no longer carries requests, and the
  // shape of a stored one is the database's (`ati_request_revisions` requires a
  // non-blank institution, an enumerated custody basis and a stated rationale
  // for confirmed custody) with the sequences checked at the command boundary.

  return out
}
