/**
 * Deterministic stage plans for the 10d gate.
 *
 * WHY THIS EXISTS
 * ===============
 * The bridge composes real machinery: `startReevaluation`, `runPipeline`, the
 * VALIDATE and REVIEW gates, `GraduationService`. To exercise that end to end a
 * gate needs stages that actually produce canonical artifacts, deterministically
 * and without a provider. These are those stages.
 *
 * WHAT THEY MODEL HONESTLY
 * ========================
 * `TRACE` reaches the supplied material through the retrieval port and decides
 * every canonical field itself — `accessibility` from the retrieval outcome,
 * `evidenceClass`, `originStatus`, publisher from observed metadata, the
 * quotability of a passage from whether the extract was truncated. That is the
 * point: the adapter hands over material and the stage decides what it means
 * (ADR-0010). Nothing here lets the adapter mint a `Source` or an `Evidence`.
 *
 * Ids come from `ctx.ids`, never from the intake or a filename.
 */

import type { Claim, Evidence, Finding, Source } from '@/lib/xray/domain'
import type { StageDefinition } from '@/lib/xray/pipeline/stages'
import { isQuotable, type RetrievedDocument } from '@/lib/xray/pipeline/retrieval-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'

export const ATI_PROPOSAL: ProposalRef = 'ati-intake-1' as ProposalRef

/** An already-graded surface claim, for the blocked-path probes. */
export const EXISTING_CLAIM = 'C001'

export interface AtiStagePlanOptions {
  /** How many canonical sources TRACE decides the material yields. */
  sources?: number
  /**
   * Bear the new evidence on an already-graded claim.
   *
   * This is the case the staged-debt exemption exists for: the inherited
   * finding stops mirroring `Evidence.relationship` the moment `TRACE` adds
   * the evidence, and only `GRADE` can repair it.
   */
  bearOnExistingClaim?: boolean

  /**
   * `GRADE` repairs the finding it owes.
   *
   * Left off deliberately in one check, so the gate can prove `GRADE` fails
   * when it declines to pay the debt.
   */
  regradeExisting?: boolean
  /** TRACE also writes a finding, which it does not own. For the same reason. */
  traceWritesFinding?: boolean
  /** Collects what each stage did, so a gate can assert the stages ran. */
  ran?: string[]
  /** Called once with the graph TRACE was handed, to inspect the seed. */
  observeSeed?: (graph: import('@/lib/xray/selectors').XRayGraph) => void
}

/**
 * Turn one retrieved record into a canonical Source.
 *
 * Every field is a stage decision. `accessibility` mirrors what the adapter
 * reported reaching, not what it would like to have reached; a truncated
 * extract yields `PARTIAL`, and a passage read from part of a record is not
 * quotable as the record's.
 */
function sourceFrom(
  document: RetrievedDocument, sourceId: string, template: Source, ordinal: number,
): Source {
  const observed = document.observed
  return {
    ...template,
    id: sourceId,
    title: observed.title === undefined
      ? 'Record released in answer to an information request'
      : ordinal === 0 ? observed.title : `${observed.title} (annex ${ordinal})`,
    ...(observed.publisher === undefined ? {} : { publisher: observed.publisher }),
    ...(observed.institution === undefined ? {} : { institution: observed.institution }),
    ...(observed.publishedAt === undefined ? {} : { publishedAt: observed.publishedAt }),
    retrievedAt: document.retrievedAt ?? '2026-10-16',
    sourceType: 'PROCUREMENT_RECORD',
    evidenceClass: 'PRIMARY',
    originStatus: 'ORIGINATING',
    accessibility: document.outcome,
    ...(document.contentHash === undefined ? {} : { contentHash: document.contentHash }),
  }
}

/**
 * The stages an ATI re-evaluation runs.
 *
 * Every research stage is present. A received record is not exempt from
 * `PROVENANCE`, `DISCONFIRM`, `RECONCILE`, `GRADE` or `GAPS` for having been
 * formally requested — that is what "no privileged evidence status" means in
 * practice (release 10d §J).
 */
export function atiStagePlan(options: AtiStagePlanOptions = {}): readonly StageDefinition[] {
  const note = (stage: string) => options.ran?.push(stage)
  const wanted = options.sources ?? 1
  const discovered: string[] = []

  return [
    { stage: 'PLAN', run() { note('PLAN'); return {} } },
    {
      stage: 'TRACE',
      async run(ctx) {
        note('TRACE')
        options.observeSeed?.(ctx.graph)
        const adapter = ctx.adapters.research
        // A stage written against an adapter must handle its absence by saying
        // so, never by quietly producing nothing (#6 D19).
        if (!adapter) {
          return { kind: 'CAPABILITY_UNAVAILABLE' as const, capability: 'RETRIEVAL',
            detail: 'no research adapter was configured for this run' }
        }
        const reached = await adapter.retrieve('ati-intake')
        if (reached.kind !== 'AVAILABLE') {
          return { kind: 'CAPABILITY_UNAVAILABLE' as const, capability: 'RETRIEVAL',
            detail: 'the supplied material could not be reached' }
        }
        // The duplicate case: research already holds this record, so the
        // response yields no new canonical state (ADR-0018).
        if (wanted === 0) return {}

        const template = ctx.graph.sources[1] as Source
        const evidenceTemplate = ctx.graph.evidence[0] as Evidence
        const sources: Source[] = []
        const evidence: Evidence[] = []
        const claims: Claim[] = []

        for (let ordinal = 0; ordinal < wanted; ordinal += 1) {
          const source = sourceFrom(reached.value, ctx.ids.source(), template, ordinal)
          sources.push(source)
          const quotable = isQuotable(reached.value) && reached.value.extract?.truncated !== true

          let claimId: string = EXISTING_CLAIM
          if (!options.bearOnExistingClaim) {
            const discoveredId = ctx.ids.discoveredClaim()
            claimId = discoveredId
            discovered.push(discoveredId)
            // A discovered claim has no surface passage: it was not made by the
            // article under investigation, which is what XR-INV-012 separates.
            const {
              id: _id, origin: _origin, sourcePassage: _passage, ...rest
            } = ctx.graph.claims[0] as Claim
            claims.push({
              ...rest,
              id: discoveredId,
              text: `The released record establishes a figure the article never stated (${ordinal + 1}).`,
              origin: 'DISCOVERED',
            })
          }
          const item: Evidence = {
            ...evidenceTemplate,
            id: ctx.ids.evidence(),
            sourceId: source.id,
            claimIds: [claimId as Evidence['claimIds'][number]],
            proposition: `The released record states a Lot 3 supervision figure (${ordinal + 1}).`,
            relationship: 'SUPPORTS',
            knowledgeBasis: 'ADMINISTRATIVE_RECORD',
          }
          if (!quotable) delete (item as { quotedPassage?: string }).quotedPassage
          evidence.push(item)
        }

        if (options.traceWritesFinding) {
          const existing = ctx.graph.findings.find(
            (finding) => finding.claimId === EXISTING_CLAIM)!
          return { sources, evidence, claims,
            findings: [{ ...existing,
              supportingEvidenceIds: [...existing.supportingEvidenceIds,
                ...evidence.map((item) => item.id)] }] }
        }
        return claims.length > 0 ? { sources, evidence, claims } : { sources, evidence }
      },
    },
    { stage: 'PROVENANCE', run() { note('PROVENANCE'); return {} } },
    {
      stage: 'DISCONFIRM',
      run(ctx) {
        note('DISCONFIRM')
        // A research stop cannot be claimed while a material claim has had no
        // disconfirmation attempt (6c). The predecessor's recorded stop is
        // history of a different run and was cleared at seeding, so this run
        // has to earn its own — which means covering every material claim,
        // including any this run discovered.
        const material = new Set(ctx.graph.claims
          .filter((claim) => claim.priority === 'HIGH').map((claim) => claim.id))
        const attempted = new Set(ctx.graph.disconfirmations.map((item) => item.claimId))
        const missing = [...material].filter((id) => !attempted.has(id))
        if (missing.length === 0) return {}
        const template = ctx.graph.disconfirmations[0]
        if (!template) return {}
        return {
          disconfirmations: missing.map((claimId) => ({
            ...template,
            id: ctx.ids.disconfirmation(),
            claimId: claimId as typeof template.claimId,
            preliminaryHypothesis: 'The claim holds as stated.',
            counterHypothesis: 'The released record contradicts the claim.',
            result: 'SURVIVED' as const,
            effectOnFinding: 'The attempt located nothing that unseats the finding.',
            searchStrategy: ['Searched the released record for contrary figures.'],
            strongestSupportingEvidenceIds: [],
            strongestOpposingEvidenceIds: [],
          })),
        }
      },
    },
    { stage: 'RECONCILE', run() { note('RECONCILE'); return {} } },
    {
      stage: 'GRADE',
      run(ctx) {
        note('GRADE')
        const repaired: Finding[] = []

        // Pay the staged debt: re-mirror the inherited finding against the
        // evidence that arrived before this stage. If this is skipped, GRADE's
        // own boundary fails, which is what bounds the exemption.
        if (options.regradeExisting) {
          const existing = ctx.graph.findings.find(
            (finding) => finding.claimId === EXISTING_CLAIM)
          if (existing) {
            const bearing = ctx.graph.evidence
              .filter((item) => item.claimIds.includes(EXISTING_CLAIM as never))
            repaired.push({
              ...existing,
              supportingEvidenceIds: bearing
                .filter((item) => item.relationship === 'SUPPORTS').map((item) => item.id),
              challengingEvidenceIds: bearing
                .filter((item) => item.relationship === 'CHALLENGES'
                  || item.relationship === 'CONTRADICTS').map((item) => item.id),
              contextualEvidenceIds: bearing
                .filter((item) => item.relationship === 'CONTEXTUALIZES').map((item) => item.id),
              rationale: `${existing.rationale} A record released under an information request was considered.`,
            })
          }
        }

        if (discovered.length === 0) {
          return repaired.length > 0 ? { findings: repaired } : {}
        }
        // Each discovered claim gets its FIRST evaluation, never a
        // re-evaluation: a claim the article never made had no prior grade.
        const template = ctx.graph.findings[0] as Finding
        return {
          findings: [...repaired, ...discovered.map((claimId) => {
            const bearing = ctx.graph.evidence
              .filter((item) => item.claimIds.includes(claimId as never))
            return {
              ...template,
              id: ctx.ids.finding(claimId as Finding['claimId']),
              claimId: claimId as Finding['claimId'],
              status: 'SUPPORTED' as const,
              supportingEvidenceIds: bearing
                .filter((item) => item.relationship === 'SUPPORTS').map((item) => item.id),
              challengingEvidenceIds: [],
              contextualEvidenceIds: [],
              discrepancyIds: [],
              gapIds: [],
              rationale: 'The released record is the only record bearing on this claim.',
            }
          })],
        }
      },
    },
    { stage: 'GAPS', run() { note('GAPS'); return {} } },
  ]
}
