import type { ClaimId, SourcePosition } from '@/lib/xray/domain'
import type { IdentityAllocator } from './identity'
import type { ProposalRef, SourcePositionProposal } from './proposals'
import { PipelineContractError } from './accumulator'

/** Stage-owned resolution of offered handles; providers never assign canonical identity. */
export interface SourcePositionHandles {
  sources: ReadonlyMap<ProposalRef, string>
  claims: ReadonlyMap<ProposalRef, string>
  evidence: ReadonlyMap<ProposalRef, string>
  positions?: ReadonlyMap<ProposalRef, string>
}

function resolve(map: ReadonlyMap<ProposalRef, string> | undefined, ref: ProposalRef): string {
  const id = map?.get(ref)
  if (!id) throw new PipelineContractError(`unoffered SourcePosition reference ${ref}`)
  return id
}

/** Used by TRACE for initial positions and PROVENANCE for offered revisions. */
export function canonicalizeSourcePositions(
  proposals: readonly SourcePositionProposal[],
  handles: SourcePositionHandles,
  ids: IdentityAllocator,
): SourcePosition[] {
  return proposals.map((proposal) => {
    if (proposal.claimRefs.length === 0 ||
        (proposal.supportingEvidenceRefs.length === 0 && !proposal.basisDescription?.trim())) {
      throw new PipelineContractError('SourcePosition requires a claim and visible basis')
    }
    return {
      id: proposal.positionRef ? resolve(handles.positions, proposal.positionRef) : ids.sourcePosition(),
      sourceId: resolve(handles.sources, proposal.sourceRef),
      claimIds: proposal.claimRefs.map((ref) => resolve(handles.claims, ref) as ClaimId),
      relationship: proposal.relationship,
      ...(proposal.relationshipDescription !== undefined ? { relationshipDescription: proposal.relationshipDescription } : {}),
      powerOrDependency: [...proposal.powerOrDependency],
      ...(proposal.productionPurpose !== undefined ? { productionPurpose: proposal.productionPurpose } : {}),
      ...(proposal.timeScope !== undefined ? { timeScope: proposal.timeScope } : {}),
      basis: proposal.basis,
      confidence: proposal.confidence,
      supportingEvidenceIds: proposal.supportingEvidenceRefs.map((ref) => resolve(handles.evidence, ref)),
      ...(proposal.basisDescription !== undefined ? { basisDescription: proposal.basisDescription } : {}),
    }
  })
}
