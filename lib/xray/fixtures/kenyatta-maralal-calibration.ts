/** Synthetic calibration state. The record is illustrative, not a historical source claim. */
import { createXrayKe001Graph } from './xray-ke-001/graph'
import { createXRayGraph, type XRayGraph } from '../selectors'
import type { Claim, Evidence, Finding, Source, SourcePosition } from '../domain'

export type CalibrationMutation =
  | 'CLEAN' | 'CHARACTERIZATION_PROMOTED' | 'ACTOR_LAUNDERED'
  | 'RETROSPECTIVE_INTENT' | 'UNFALSIFIABLE_SYSTEM'

export function kenyattaMaralalGraph(mutation: CalibrationMutation = 'CLEAN'): XRayGraph {
  const base = createXrayKe001Graph()
  const source: Source = {
    ...base.sources[0], id: 'SRC-100',
    title: 'Synthetic colonial administration characterization record (calibration only)',
    institution: 'Illustrative colonial administration',
    evidenceClass: 'PRIMARY', originStatus: 'ORIGINATING',
    publishedAt: '1952-01-01', retrievedAt: '2026-09-13',
  }
  const text = {
    CLEAN: 'The illustrative colonial administration record characterized Kenyatta as a Mau Mau leader.',
    CHARACTERIZATION_PROMOTED: 'Kenyatta operationally led Mau Mau.',
    ACTOR_LAUNDERED: 'They coordinated the detention and later political settlement under one continuing plan.',
    RETROSPECTIVE_INTENT: 'The later political benefit proves the administration planned that outcome at the time of detention.',
    UNFALSIFIABLE_SYSTEM: 'The system controlled every outcome, and no possible observation could count against that explanation.',
  }[mutation]
  const claim: Claim = {
    ...base.claims[0], id: 'DC003', origin: 'DISCOVERED',
    text, sourcePassage: 'The administration characterized Kenyatta as a Mau Mau leader.',
    layer: mutation === 'CLEAN' ? 'OBSERVATION' : 'INTERPRETATION',
    type: mutation === 'CLEAN' ? 'ATTRIBUTION' : 'OTHER',
    entities: ['Jomo Kenyatta', 'illustrative colonial administration'],
    ambiguities: [], measurement: undefined, timeScope: { from: '1952-01-01' },
  }
  const evidence: Evidence = {
    ...base.evidence[0], id: 'EV-100', sourceId: source.id, claimIds: [claim.id],
    proposition: 'The illustrative administration record characterized Kenyatta as a Mau Mau leader.',
    relationship: 'SUPPORTS', strength: 'DIRECT',
    knowledgeBasis: 'INSTITUTIONAL_CHARACTERIZATION',
    measurement: undefined, quotedPassage: undefined, locationInSource: undefined,
    timeScope: { from: '1952-01-01' },
  }
  const finding: Finding = {
    ...base.findings[0], id: 'FND-DC003', claimId: claim.id,
    status: 'SUPPORTED', confidence: 'MEDIUM',
    rationale: mutation === 'CLEAN'
      ? 'The synthetic record supports the fact of the administration’s characterization only.'
      : 'The same narrow characterization is presented as support for the broader claim.',
    supportingEvidenceIds: [evidence.id], challengingEvidenceIds: [], contextualEvidenceIds: [],
    discrepancyIds: [], gapIds: [],
    wouldChangeFinding: mutation === 'UNFALSIFIABLE_SYSTEM' ? ['Any outcome can be explained by the system.']
      : ['An independent record about the underlying proposition would change this finding.'],
  }
  const positions: SourcePosition[] = [
    { id: 'SP-001', sourceId: source.id, claimIds: [claim.id], relationship: 'DETENTION_OR_ENFORCEMENT_AUTHORITY',
      powerOrDependency: ['The record producer controlled this illustrative archive at T1.'],
      timeScope: { from: '1952-01-01', to: '1959-12-31' }, basis: 'DOCUMENTED', confidence: 'MEDIUM',
      supportingEvidenceIds: [evidence.id] },
    { id: 'SP-002', sourceId: source.id, claimIds: [claim.id], relationship: 'INTERMEDIARY',
      powerOrDependency: [], timeScope: { from: '1960-01-01' }, basis: 'INFERRED', confidence: 'LOW',
      supportingEvidenceIds: [], basisDescription: 'Synthetic later relationship for temporal calibration only.' },
  ]
  return createXRayGraph({
    ...base,
    investigation: {
      ...base.investigation, protocolVersion: '0.3.0',
      claimIds: [...base.investigation.claimIds, claim.id],
      sourceIds: [...base.investigation.sourceIds, source.id],
      evidenceIds: [...base.investigation.evidenceIds, evidence.id],
      findingIds: [...base.investigation.findingIds, finding.id],
      sourcePositionIds: positions.map((p) => p.id),
    },
    claims: [...base.claims, claim], sources: [...base.sources, source],
    evidence: [...base.evidence.map((item) => ({ ...item, knowledgeBasis: 'SECONDARY_SYNTHESIS' as const })), evidence],
    findings: [...base.findings, finding], sourcePositions: positions,
  })
}
