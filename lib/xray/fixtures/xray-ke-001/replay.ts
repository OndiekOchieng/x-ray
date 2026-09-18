/**
 * Deterministic replay of the frozen corpus through the public pipeline ports.
 *
 * This is a fixture adapter, not a provider. Its model emits id-free proposals;
 * its retrieval adapter emits reached material. Stage code below accepts those
 * port results and creates canonical artifacts. The frozen arrays supply the
 * replay transcript and the independent comparison oracle in replay-checks.
 * No fixture lookup is available to generic pipeline runtime.
 */
import type {
  Claim, Disconfirmation, Discrepancy, Evidence, EvidenceProvenance,
  Finding, Gap, Investigation, Source, SourceDependency,
} from '@/lib/xray/domain'
import { available } from '@/lib/xray/capability'
import type { CapabilityResult } from '@/lib/xray/capability'
import type {
  ClaimClassificationProposal, ClaimProposal, DisconfirmationProposal,
  DiscoveredClaimProposal, DiscrepancyProposal, EvidenceProposal,
  FindingProposal, GapProposal, ProposalRef,
} from '@/lib/xray/pipeline/proposals'
import type {
  ResearchModel, DecomposeInput, ClassifyInput, TraceInput, TraceProposals,
  DisconfirmInput, ReconcileInput, GradeInput, IdentifyGapsInput,
} from '@/lib/xray/pipeline/model-port'
import type {
  ResearchAdapter, RetrievedDocument, RetrievalQuery, RetrievalResult,
} from '@/lib/xray/pipeline/retrieval-port'
import type { StageContext, StageDefinition } from '@/lib/xray/pipeline/stages'
import type { XRayGraph } from '@/lib/xray/selectors'
import { runPipeline, type PipelineRunResult, type RunOptions } from '@/lib/xray/pipeline/run'
import { claims } from './claims'
import { sources } from './sources'
import { evidence } from './evidence'
import { evidenceProvenance } from './evidence-provenance'
import { sourceDependencies } from './source-dependencies'
import { disconfirmations } from './disconfirmation'
import { discrepancies } from './discrepancies'
import { findings } from './findings'
import { gaps } from './gaps'
import { investigation } from './investigation'

const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
const ref = (kind: string, index: number): ProposalRef => `ref:${kind}:${index + 1}`
const byId = <T extends { id: string }>(items: readonly T[], id: string): T => {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`replay transcript lacks ${id}`)
  return item
}

const sourceRef = (id: string): ProposalRef => ref('source', sources.findIndex((x) => x.id === id))
const claimRef = (id: string): ProposalRef => ref('claim', claims.findIndex((x) => x.id === id))
const evidenceRef = (id: string): ProposalRef => ref('evidence', evidence.findIndex((x) => x.id === id))
const discrepancyRef = (id: string): ProposalRef => ref('discrepancy', discrepancies.findIndex((x) => x.id === id))
const findingRef = (id: string): ProposalRef => ref('finding', findings.findIndex((x) => x.id === id))
const itemAt = <T>(items: readonly T[], handle: ProposalRef): T => {
  const n = Number(handle.split(':').at(-1)) - 1
  if (!Number.isInteger(n) || !items[n]) throw new Error(`unknown replay handle ${handle}`)
  return items[n]
}

const claimProposal = (claim: Claim): ClaimProposal => ({
  text: claim.text, sourcePassage: claim.sourcePassage, layer: claim.layer,
  type: claim.type, priority: claim.priority, entities: copy(claim.entities),
  ambiguities: copy(claim.ambiguities), measurement: copy(claim.measurement),
  timeScope: copy(claim.timeScope),
})

const evidenceProposal = (item: Evidence): EvidenceProposal => ({
  sourceRef: sourceRef(item.sourceId), proposition: item.proposition,
  relationship: item.relationship, strength: item.strength,
  claimRefs: item.claimIds.map(claimRef), measurement: copy(item.measurement),
  timeScope: copy(item.timeScope), quotedPassage: item.quotedPassage,
  locationInSource: item.locationInSource,
})

const transcriptDocument = (source: Source): RetrievedDocument => ({
  ref: sourceRef(source.id), locator: source.url, outcome: source.accessibility,
  retrievedAt: source.retrievedAt,
  observed: {
    title: source.title, publisher: source.publisher, institution: source.institution,
    author: source.author, publishedAt: source.publishedAt,
    attributedTo: sourceDependencies
      .filter((edge) => edge.sourceId === source.id)
      .map((edge) => edge.dependsOnSourceId
        ? byId(sources, edge.dependsOnSourceId).title
        : edge.originDescription ?? ''),
  },
  extract: source.accessibility === 'RETRIEVED' || source.accessibility === 'PARTIAL'
    ? { text: [source.title, ...evidence.filter((item) => item.sourceId === source.id)
      .map((item) => item.quotedPassage ?? item.proposition)].join('\n'), truncated: false }
    : undefined,
  contentHash: source.contentHash,
})

/** Implements the exact retrieval port future search providers implement. */
export class ReplayResearchAdapter implements ResearchAdapter {
  readonly name = 'XRAY-KE-001 deterministic retrieval replay'
  readonly capabilities = ['search', 'retrieve'] as const

  async search(query: RetrievalQuery): Promise<CapabilityResult<RetrievalResult>> {
    return available({ query, documents: sources.map(transcriptDocument), moreAvailable: false })
  }

  async retrieve(locator: string): Promise<CapabilityResult<RetrievedDocument>> {
    const source = sources.find((item) => item.url === locator)
    if (!source) throw new Error(`replay has no record at ${locator}`)
    return available(transcriptDocument(source))
  }
}

/** Implements the exact proposal port future research models implement. */
export class ReplayResearchModel implements ResearchModel {
  readonly name = 'XRAY-KE-001 deterministic proposal replay'
  readonly capabilities = [
    'decompose', 'classify', 'trace', 'disconfirm', 'reconcile', 'grade', 'identifyGaps',
  ] as const

  async decompose(_input: DecomposeInput): Promise<CapabilityResult<readonly ClaimProposal[]>> {
    return available(claims.filter((item) => item.origin === 'SURFACE').map(claimProposal))
  }

  async classify(input: ClassifyInput): Promise<CapabilityResult<readonly ClaimClassificationProposal[]>> {
    return available(input.claims.map(({ ref: handle }) => {
      const item = itemAt(claims, handle)
      return { claimRef: handle, layer: item.layer, type: item.type,
        priority: item.priority, entities: copy(item.entities), ambiguities: copy(item.ambiguities),
        measurement: copy(item.measurement), timeScope: copy(item.timeScope) }
    }))
  }

  async trace(input: TraceInput): Promise<CapabilityResult<TraceProposals>> {
    const subject = itemAt(claims, input.claim.ref)
    const discovered = subject.id === 'C003' ? ['DC001'] : subject.id === 'C004' ? ['DC002'] : []
    return available({
      evidence: evidence.filter((item) => item.claimIds.includes(subject.id)).map(evidenceProposal),
      discoveredClaims: discovered.map((id): DiscoveredClaimProposal => {
        const item = byId(claims, id)
        const first = evidence.find((entry) => entry.claimIds.includes(item.id))
        if (!first) throw new Error(`discovered claim ${id} has no inspected source`)
        return { ...claimProposal(item), sourceRef: sourceRef(first.sourceId) }
      }),
    })
  }

  async disconfirm(input: DisconfirmInput): Promise<CapabilityResult<readonly DisconfirmationProposal[]>> {
    const claim = itemAt(claims, input.claim.ref)
    return available(disconfirmations.filter((item) => item.claimId === claim.id).map((item) => ({
      claimRef: input.claim.ref, preliminaryHypothesis: item.preliminaryHypothesis,
      counterHypothesis: item.counterHypothesis, searchStrategy: copy(item.searchStrategy),
      strongestSupportingEvidenceRefs: item.strongestSupportingEvidenceIds.map(evidenceRef),
      strongestOpposingEvidenceRefs: item.strongestOpposingEvidenceIds.map(evidenceRef),
      result: item.result, effectOnFinding: item.effectOnFinding,
    })))
  }

  async reconcile(_input: ReconcileInput): Promise<CapabilityResult<readonly DiscrepancyProposal[]>> {
    return available(discrepancies.map((item) => ({
      claimRefs: item.claimIds.map(claimRef), evidenceRefs: item.evidenceIds.map(evidenceRef),
      description: item.description, classification: item.classification,
      reconciliation: item.reconciliation, resolvedCandidate: item.resolved,
    })))
  }

  async grade(input: GradeInput): Promise<CapabilityResult<readonly FindingProposal[]>> {
    const claim = itemAt(claims, input.claim.ref)
    return available(findings.filter((item) => item.claimId === claim.id).map((item) => ({
      claimRef: input.claim.ref, status: item.status, confidence: item.confidence,
      rationale: item.rationale,
      supportingEvidenceRefs: item.supportingEvidenceIds.map(evidenceRef),
      challengingEvidenceRefs: item.challengingEvidenceIds.map(evidenceRef),
      contextualEvidenceRefs: item.contextualEvidenceIds.map(evidenceRef),
      discrepancyRefs: item.discrepancyIds.map(discrepancyRef),
      wouldChangeFinding: copy(item.wouldChangeFinding),
    })))
  }

  async identifyGaps(_input: IdentifyGapsInput): Promise<CapabilityResult<readonly GapProposal[]>> {
    return available(gaps.map((item) => ({
      claimRefs: item.claimIds.map(claimRef), missingEvidence: item.missingEvidence,
      whyItMatters: item.whyItMatters, resolvingEvidence: copy(item.resolvingEvidence),
      likelyHolder: copy(item.likelyHolder), searchAlreadyAttempted: copy(item.searchAlreadyAttempted),
      status: item.status, effectOnFinding: item.effectOnFinding,
      resolutionPath: item.resolutionPath, identifiers: copy(item.identifiers),
    })))
  }
}

const requireAvailable = <T>(result: CapabilityResult<T>): T => {
  if (result.kind !== 'AVAILABLE') throw new Error(`replay capability unavailable: ${result.operation}`)
  return result.value
}

/** Stage-held handle table. It is execution state, not a canonical registry. */
class Handles {
  readonly sources = new Map<ProposalRef, string>()
  readonly claims = new Map<ProposalRef, Claim['id']>()
  readonly evidence = new Map<ProposalRef, string>()
  readonly discrepancies = new Map<ProposalRef, string>()
  readonly findings = new Map<ProposalRef, string>()

  hydrate(graph: XRayGraph): void {
    this.sources.clear()
    this.claims.clear()
    this.evidence.clear()
    this.discrepancies.clear()
    this.findings.clear()
    for (const item of graph.sources) {
      const original = sources.find((fact) => fact.title === item.title)
      if (original) this.sources.set(sourceRef(original.id), item.id)
    }
    for (const item of graph.claims) {
      const original = claims.find((fact) => fact.text === item.text)
      if (original) this.claims.set(claimRef(original.id), item.id)
    }
    for (const item of graph.evidence) {
      const original = evidence.find((fact) => fact.proposition === item.proposition)
      if (original) this.evidence.set(evidenceRef(original.id), item.id)
    }
    for (const item of graph.discrepancies) {
      const original = discrepancies.find((fact) => fact.description === item.description)
      if (original) this.discrepancies.set(discrepancyRef(original.id), item.id)
    }
    for (const item of graph.findings) this.findings.set(findingRef(item.id), item.id)
  }

  require<T extends string>(map: ReadonlyMap<ProposalRef, T>, handle: ProposalRef): T {
    const id = map.get(handle)
    if (!id) throw new Error(`stage did not issue ${handle}`)
    return id
  }
}

function sourceFromDocument(ctx: StageContext, handles: Handles, doc: RetrievedDocument): Source {
  const observed = doc.observed
  const facts = itemAt(sources, doc.ref)
  const id = ctx.ids.source()
  handles.sources.set(doc.ref, id)
  return {
    id, title: observed.title ?? '', publisher: observed.publisher,
    institution: observed.institution, author: observed.author, url: doc.locator,
    publishedAt: observed.publishedAt, retrievedAt: doc.retrievedAt ?? '2026-09-13',
    accessibility: doc.outcome, contentHash: doc.contentHash,
    // Source classification and independence are stage-owned judgments.
    sourceType: facts.sourceType, evidenceClass: facts.evidenceClass,
    originStatus: facts.originStatus,
  }
}

function claimFromProposal(
  ctx: StageContext, handles: Handles, proposal: ClaimProposal, origin: Claim['origin'], handle: ProposalRef,
): Claim {
  const id = origin === 'SURFACE' ? ctx.ids.surfaceClaim() : ctx.ids.discoveredClaim()
  handles.claims.set(handle, id)
  return {
    id, origin, investigationId: ctx.investigationId, text: proposal.text,
    sourcePassage: proposal.sourcePassage, layer: proposal.layer ?? 'OBSERVATION',
    type: proposal.type ?? 'OTHER', priority: proposal.priority ?? 'MEDIUM',
    entities: [...(proposal.entities ?? [])], ambiguities: [...(proposal.ambiguities ?? [])],
    measurement: copy(proposal.measurement), timeScope: copy(proposal.timeScope),
  } as Claim
}

/** Fixture-scoped stage implementations. Generic runPipeline never sees corpus data. */
export function replayStages(): readonly StageDefinition[] {
  const handles = new Handles()
  const stages: StageDefinition[] = [
    { stage: 'INGEST', async run(ctx) {
      const surface = sources[0]
      const doc = requireAvailable(await ctx.adapters.research!.retrieve(surface.url!))
      return { sources: [sourceFromDocument(ctx, handles, doc)] }
    } },
    { stage: 'DECOMPOSE', async run(ctx) {
      const doc = requireAvailable(await ctx.adapters.research!.retrieve(sources[0].url!))
      const source = ctx.graph.sources[0]
      const proposals = requireAvailable(await ctx.adapters.model!.decompose({
        surfaceSource: { ref: sourceRef(sources[0].id), value: source },
        document: doc, researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
      }))
      return { claims: proposals.map((proposal, index) =>
        claimFromProposal(ctx, handles, proposal, 'SURFACE', ref('claim', index))) }
    } },
    { stage: 'CLASSIFY', async run(ctx) {
      const offered = ctx.graph.claims.map((claim) => ({ ref: claimRef(claim.id), value: claim }))
      const proposals = requireAvailable(await ctx.adapters.model!.classify({
        claims: offered, researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
      }))
      return { claims: proposals.map((proposal) => {
        const id = handles.require(handles.claims, proposal.claimRef)
        const current = byId(ctx.graph.claims, id)
        return { ...current, layer: proposal.layer, type: proposal.type,
          priority: proposal.priority, entities: [...(proposal.entities ?? [])],
          ambiguities: [...(proposal.ambiguities ?? [])], measurement: copy(proposal.measurement),
          timeScope: copy(proposal.timeScope) }
      }) }
    } },
    { stage: 'PLAN', run: () => ({}) },
    { stage: 'TRACE', async run(ctx) {
      const retrieval = requireAvailable(await ctx.adapters.research!.search({
        terms: 'XRAY-KE-001 frozen source search',
        researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
      }))
      const freshDocuments = retrieval.documents.filter((doc) => !handles.sources.has(doc.ref))
      const newSources = freshDocuments.map((doc) => sourceFromDocument(ctx, handles, doc))
      const allSources = [...ctx.graph.sources, ...newSources]
      const newClaims: Claim[] = []
      const newEvidence: Evidence[] = []
      const queue = [...ctx.graph.claims]
      for (let i = 0; i < queue.length; i += 1) {
        const claim = queue[i]
        const handle = claimRef(claim.id)
        const proposalSet = requireAvailable(await ctx.adapters.model!.trace({
          claim: { ref: handle, value: claim }, documents: retrieval.documents,
          researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
        }))
        const discovered = proposalSet.discoveredClaims.map((proposal) => {
          const sourceId = handles.require(handles.sources, proposal.sourceRef)
          const source = byId(allSources, sourceId)
          if (source.accessibility !== 'RETRIEVED' && source.accessibility !== 'PARTIAL')
            throw new Error('discovered claim came from uninspected material')
          const original = claims.find((item) => item.text === proposal.text)
          if (!original) throw new Error('replay proposal has no stable subject')
          return claimFromProposal(ctx, handles, proposal, 'DISCOVERED', claimRef(original.id))
        })
        newClaims.push(...discovered)
        queue.splice(i + 1, 0, ...discovered)
        for (const proposal of proposalSet.evidence) {
          const sourceId = handles.require(handles.sources, proposal.sourceRef)
          const source = byId(allSources, sourceId)
          if (source.accessibility !== 'RETRIEVED' && source.accessibility !== 'PARTIAL')
            throw new Error('evidence came from uninspected material')
          const id = ctx.ids.evidence()
          const item: Evidence = {
            id, sourceId, proposition: proposal.proposition,
            relationship: proposal.relationship, strength: proposal.strength,
            claimIds: proposal.claimRefs.map((ref) => handles.require(handles.claims, ref)),
            measurement: copy(proposal.measurement), timeScope: copy(proposal.timeScope),
            quotedPassage: proposal.quotedPassage, locationInSource: proposal.locationInSource,
          }
          newEvidence.push(item)
          const transcript = evidence.find((entry) => entry.proposition === proposal.proposition)
          if (!transcript) throw new Error('replay evidence has no stable handle')
          handles.evidence.set(evidenceRef(transcript.id), id)
        }
      }
      return { sources: newSources, claims: newClaims, evidence: newEvidence }
    } },
    { stage: 'PROVENANCE', run(ctx) {
      const dependencies: SourceDependency[] = sourceDependencies.map((fact) => ({
        id: ctx.ids.sourceDependency(),
        sourceId: handles.require(handles.sources, sourceRef(fact.sourceId)),
        dependsOnSourceId: fact.dependsOnSourceId
          ? handles.require(handles.sources, sourceRef(fact.dependsOnSourceId)) : undefined,
        originDescription: fact.originDescription, relationship: fact.relationship,
        confidence: fact.confidence,
      }))
      const provenance: EvidenceProvenance[] = evidenceProvenance.map((fact) => ({
        id: ctx.ids.evidenceProvenance(),
        evidenceId: handles.require(handles.evidence, evidenceRef(fact.evidenceId)),
        origin: fact.origin.kind === 'SOURCE'
          ? { kind: 'SOURCE', sourceId: handles.require(handles.sources, sourceRef(fact.origin.sourceId)) }
          : copy(fact.origin),
        relationship: fact.relationship, confidence: fact.confidence,
      }))
      return { sourceDependencies: dependencies, evidenceProvenance: provenance }
    } },
    { stage: 'DISCONFIRM', async run(ctx) {
      const output: Disconfirmation[] = []
      for (const claim of ctx.graph.claims) {
        const proposals = requireAvailable(await ctx.adapters.model!.disconfirm({
          claim: { ref: claimRef(claim.id), value: claim },
          evidence: ctx.graph.evidence.filter((item) => item.claimIds.includes(claim.id))
            .map((item) => ({ ref: evidenceRef(item.id), value: item })),
          researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
        }))
        for (const proposal of proposals) output.push({
          id: ctx.ids.disconfirmation(), claimId: handles.require(handles.claims, proposal.claimRef),
          preliminaryHypothesis: proposal.preliminaryHypothesis,
          counterHypothesis: proposal.counterHypothesis,
          searchStrategy: [...proposal.searchStrategy],
          strongestSupportingEvidenceIds: proposal.strongestSupportingEvidenceRefs
            .map((ref) => handles.require(handles.evidence, ref)),
          strongestOpposingEvidenceIds: proposal.strongestOpposingEvidenceRefs
            .map((ref) => handles.require(handles.evidence, ref)),
          result: proposal.result, effectOnFinding: proposal.effectOnFinding,
        })
      }
      return { disconfirmations: output }
    } },
    { stage: 'RECONCILE', async run(ctx) {
      const proposals = requireAvailable(await ctx.adapters.model!.reconcile({
        claims: ctx.graph.claims.map((item) => ({ ref: claimRef(item.id), value: item })),
        evidence: ctx.graph.evidence.map((item) => ({ ref: evidenceRef(item.id), value: item })),
        researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
      }))
      return { discrepancies: proposals.map((proposal) => {
        const id = ctx.ids.discrepancy()
        const transcript = discrepancies.find((item) => item.description === proposal.description)
        if (!transcript) throw new Error('replay discrepancy has no stable handle')
        handles.discrepancies.set(discrepancyRef(transcript.id), id)
        return { id, claimIds: proposal.claimRefs.map((ref) => handles.require(handles.claims, ref)),
          evidenceIds: proposal.evidenceRefs.map((ref) => handles.require(handles.evidence, ref)),
          description: proposal.description, classification: proposal.classification,
          reconciliation: proposal.reconciliation, resolved: proposal.resolvedCandidate }
      }) }
    } },
    { stage: 'GRADE', async run(ctx) {
      const output: Finding[] = []
      for (const claim of ctx.graph.claims) {
        const proposals = requireAvailable(await ctx.adapters.model!.grade({
          claim: { ref: claimRef(claim.id), value: claim },
          evidence: ctx.graph.evidence.filter((item) => item.claimIds.includes(claim.id))
            .map((item) => ({ ref: evidenceRef(item.id), value: item })),
          discrepancyRefs: ctx.graph.discrepancies
            .filter((item) => item.claimIds.includes(claim.id)).map((item) => discrepancyRef(item.id)),
          researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
        }))
        for (const proposal of proposals) {
          const claimId = handles.require(handles.claims, proposal.claimRef)
          const id = ctx.ids.finding(claimId)
          handles.findings.set(findingRef(id), id)
          output.push({
            id, claimId, status: proposal.status, confidence: proposal.confidence,
            rationale: proposal.rationale,
            supportingEvidenceIds: proposal.supportingEvidenceRefs.map((ref) => handles.require(handles.evidence, ref)),
            challengingEvidenceIds: proposal.challengingEvidenceRefs.map((ref) => handles.require(handles.evidence, ref)),
            contextualEvidenceIds: proposal.contextualEvidenceRefs.map((ref) => handles.require(handles.evidence, ref)),
            discrepancyIds: proposal.discrepancyRefs.map((ref) => handles.require(handles.discrepancies, ref)),
            gapIds: [], wouldChangeFinding: [...proposal.wouldChangeFinding],
            gradedAt: '2026-09-13T00:00:00Z',
          })
        }
      }
      return { findings: output }
    } },
    { stage: 'GAPS', async run(ctx) {
      const proposals = requireAvailable(await ctx.adapters.model!.identifyGaps({
        claims: ctx.graph.claims.map((item) => ({ ref: claimRef(item.id), value: item })),
        findings: ctx.graph.findings.map((item) => ({ ref: findingRef(item.id), value: item })),
        existingGaps: [], researchCutoffAt: ctx.graph.investigation.researchCutoffAt,
      }))
      const output: Gap[] = proposals.map((proposal) => ({
        id: ctx.ids.gap(), claimIds: proposal.claimRefs.map((ref) => handles.require(handles.claims, ref)),
        missingEvidence: proposal.missingEvidence, whyItMatters: proposal.whyItMatters,
        resolvingEvidence: [...proposal.resolvingEvidence], likelyHolder: copy(proposal.likelyHolder),
        searchAlreadyAttempted: [...proposal.searchAlreadyAttempted], status: proposal.status,
        effectOnFinding: proposal.effectOnFinding, resolutionPath: proposal.resolutionPath,
        atiEligible: proposal.resolutionPath === 'PUBLIC_RECORD_REQUEST',
        identifiers: proposal.identifiers ? [...proposal.identifiers] : undefined,
      } as Gap))
      const linked = ctx.graph.findings.map((item) => {
        const frozen = byId(findings, item.id)
        return { ...item, gapIds: frozen.gapIds.map((id) => {
          const fact = byId(gaps, id)
          const at = gaps.indexOf(fact)
          return output[at].id
        }) }
      })
      return { gaps: output, findings: linked }
    } },
  ]
  return stages.map((stage) => ({
    stage: stage.stage,
    run(ctx) {
      handles.hydrate(ctx.graph)
      return stage.run(ctx)
    },
  }))
}

/** Fresh execution: no canonical artifacts, stop, or historical StageRuns seeded. */
export async function replayXrayKe001(
  options: Partial<Pick<RunOptions, 'maxAttempts' | 'resume' | 'startArtifactVersion'>> = {},
): Promise<PipelineRunResult> {
  const fresh: Investigation = {
    ...copy(investigation), status: 'CREATED',
    stageRuns: [], researchStop: undefined,
    claimIds: [], sourceIds: [], evidenceIds: [], discrepancyIds: [],
    disconfirmationIds: [], findingIds: [], gapIds: [],
  }
  return runPipeline({
    investigation: fresh, stages: replayStages(),
    adapters: { research: new ReplayResearchAdapter(), model: new ReplayResearchModel() },
    stopEvidence: {
      saturationObserved: true,
      unresolvedHighPriorityLeads: investigation.researchStop?.unresolvedHighPriorityLeads,
    },
    clock: () => '2026-09-13T00:00:00Z',
    ...options,
  })
}
