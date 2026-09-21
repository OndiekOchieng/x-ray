/**
 * The Anthropic `ResearchModel` (#20 slice 20b).
 *
 * WHAT THIS CLASS IS
 * ==================
 * Seven typed questions, each: build a `RefScope` from what the stage offered,
 * present that material without canonical ids, ask, and validate the answer
 * back into proposals. It implements `ResearchModel` exactly — no method added,
 * none widened — so a stage cannot tell which provider it has.
 *
 * WHY EVERY OPERATION LOOKS THE SAME
 * ==================================
 * Because the differences between them are data, not control flow. The scope,
 * the presented material and the prompt differ; the sequence does not. A
 * provider-specific branch per stage is what #20's non-goals forbid, and the
 * shape below is what keeps it from appearing by accident.
 *
 * WHAT IT DOES NOT DO
 * ===================
 * No retrieval: 20b implements the model port only, and `search`/`retrieve`
 * belong to `ResearchAdapter` in 20c. No retry — `runPipeline` owns that. No
 * persistence of diagnostics: they are offered in memory and #20's boundary 7
 * keeps them out of graph state.
 */

import { isUnavailable, type CapabilityResult, type CapabilityUnavailable } from '@/lib/xray/capability'
import { available } from '@/lib/xray/capability'
import type {
  ClaimClassificationProposal, ClaimProposal, DisconfirmationProposal,
  DiscrepancyProposal, FindingProposal, GapProposal,
} from '@/lib/xray/pipeline/proposals'
import type {
  ClassifyInput, DecomposeInput, DisconfirmInput, GradeInput, IdentifyGapsInput,
  ReconcileInput, ResearchModel, ResearchModelOperation, TraceInput, TraceProposals,
} from '@/lib/xray/pipeline/model-port'
import {
  decodeClaims, decodeClassifications, decodeDisconfirmations, decodeDiscrepancies,
  decodeFindings, decodeGaps, decodeTrace, type RefScope,
} from './decode'
import {
  presentClaim, presentDocument, presentEvidence, presentFinding, presentGap,
  presentSource, requestBody,
} from './present'
import * as PROMPTS from './prompts'
import { callMessages, type CallDiagnostics, type MessagesRequest } from './transport'

export interface AnthropicModelOptions {
  readonly modelId: string
  readonly apiKey: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

/** Every operation this adapter implements. All seven; none is stubbed. */
const OPERATIONS = [
  'decompose', 'classify', 'trace', 'disconfirm', 'reconcile', 'grade', 'identifyGaps',
] as const satisfies readonly ResearchModelOperation[]

export class AnthropicResearchModel implements ResearchModel {
  readonly name: string
  readonly capabilities = OPERATIONS

  /**
   * Execution detail for the calls this instance made.
   *
   * On the class, not on the port: `ResearchModel` has no diagnostics channel
   * and 20b does not give it one. Nothing reads this to build a proposal, and
   * #20 boundary 7 keeps it out of graph state — 17e decides where it is
   * recorded outside the graph.
   */
  private readonly calls: CallDiagnostics[] = []

  private readonly options: AnthropicModelOptions

  constructor(options: AnthropicModelOptions) {
    this.options = options
    this.name = `anthropic:${options.modelId}`
  }

  /** A copy, so a caller cannot accumulate into this instance's record. */
  diagnostics(): readonly CallDiagnostics[] { return [...this.calls] }

  async decompose(
    input: DecomposeInput,
  ): Promise<CapabilityResult<readonly ClaimProposal[]>> {
    const scope: RefScope = { sources: refs([input.surfaceSource.ref]) }
    return this.ask('decompose', PROMPTS.DECOMPOSE, scope, requestBody({
      record: presentSource(input.surfaceSource),
      inspectedContent: presentDocument(input.document),
    }, input.researchCutoffAt), (structured) => decodeClaims('decompose', structured, scope))
  }

  async classify(
    input: ClassifyInput,
  ): Promise<CapabilityResult<readonly ClaimClassificationProposal[]>> {
    const scope: RefScope = { claims: refs(input.claims.map((claim) => claim.ref)) }
    return this.ask('classify', PROMPTS.CLASSIFY, scope, requestBody({
      claims: input.claims.map(presentClaim),
    }, input.researchCutoffAt), (structured) =>
      decodeClassifications('classify', structured, scope))
  }

  /**
   * One operation, three requests.
   *
   * `ResearchModel.trace` is unchanged and the `TRACE` stage is unchanged: the
   * split is provider-local, because the reason for it is provider-local.
   * Anthropic refuses the combined schema under `strict: true` — 43 optional
   * parameters against a limit of 24 — and the alternative, making optional
   * semantic fields required, would have the model invent a `measurement`
   * rather than omit one. `prompts.ts` records the measurement in full.
   *
   * The three run concurrently. They ask about the same claim and the same
   * documents, share one `RefScope`, and none depends on another's answer, so
   * serialising them would triple the stage's wall clock for nothing.
   *
   * A capability gap in any of them is the operation's gap: a trace missing
   * its evidence, its discoveries or its positions is not a complete trace,
   * and reporting a partial answer as whole is the failure mode `#6 D19`
   * exists to prevent. The gap is returned as it came back.
   */
  async trace(input: TraceInput): Promise<CapabilityResult<TraceProposals>> {
    const scope: RefScope = {
      claims: refs([input.claim.ref]),
      documents: refs(input.documents.map((document) => document.ref)),
    }
    const material = requestBody({
      claim: presentClaim(input.claim),
      retrievedDocuments: input.documents.map(presentDocument),
      ...(input.queriesAttempted === undefined || input.queriesAttempted.length === 0 ? {} : {
        searchesAlreadyRun: input.queriesAttempted.map((query) => ({
          terms: query.terms,
          ...(query.constraints === undefined ? {} : { constraints: query.constraints }),
        })),
      }),
    }, input.researchCutoffAt)

    const decode = (structured: unknown) => decodeTrace('trace', structured, scope)
    const [evidence, discovered, positions] = await Promise.all([
      this.ask('trace', PROMPTS.TRACE_EVIDENCE, scope, material, decode),
      this.ask('trace', PROMPTS.TRACE_DISCOVERED, scope, material, decode),
      this.ask('trace', PROMPTS.TRACE_POSITIONS, scope, material, decode),
    ])

    for (const part of [evidence, discovered, positions]) {
      if (isUnavailable(part)) return part
    }

    /*
     * Each answer is decoded by the same decoder that read the combined one,
     * so every family is validated exactly as before — unknown handles
     * refused, vocabularies pinned, no scalar coerced into a list. What is
     * combined here is already-validated proposals, and each family is taken
     * only from the call that asked for it: a tool that answered outside its
     * own family is ignored rather than merged.
     */
    const ok = <T>(result: CapabilityResult<T>): T => (result as { value: T }).value
    const queries = ok(positions).suggestedQueries
    const found = ok(positions).sourcePositions
    return available({
      evidence: ok(evidence).evidence,
      discoveredClaims: ok(discovered).discoveredClaims,
      ...(found === undefined ? {} : { sourcePositions: found }),
      ...(queries === undefined ? {} : { suggestedQueries: queries }),
    })
  }

  async disconfirm(
    input: DisconfirmInput,
  ): Promise<CapabilityResult<readonly DisconfirmationProposal[]>> {
    const scope: RefScope = {
      claims: refs([input.claim.ref]),
      evidence: refs(input.evidence.map((evidence) => evidence.ref)),
    }
    return this.ask('disconfirm', PROMPTS.DISCONFIRM, scope, requestBody({
      claim: presentClaim(input.claim),
      evidence: input.evidence.map(presentEvidence),
    }, input.researchCutoffAt), (structured) =>
      decodeDisconfirmations('disconfirm', structured, scope))
  }

  async reconcile(
    input: ReconcileInput,
  ): Promise<CapabilityResult<readonly DiscrepancyProposal[]>> {
    const scope: RefScope = {
      claims: refs(input.claims.map((claim) => claim.ref)),
      evidence: refs(input.evidence.map((evidence) => evidence.ref)),
    }
    return this.ask('reconcile', PROMPTS.RECONCILE, scope, requestBody({
      claims: input.claims.map(presentClaim),
      evidence: input.evidence.map(presentEvidence),
    }, input.researchCutoffAt), (structured) =>
      decodeDiscrepancies('reconcile', structured, scope))
  }

  async grade(input: GradeInput): Promise<CapabilityResult<readonly FindingProposal[]>> {
    const scope: RefScope = {
      claims: refs([input.claim.ref]),
      evidence: refs(input.evidence.map((evidence) => evidence.ref)),
      discrepancies: refs(input.discrepancyRefs),
    }
    return this.ask('grade', PROMPTS.GRADE, scope, requestBody({
      claim: presentClaim(input.claim),
      evidence: input.evidence.map(presentEvidence),
      // Handles only: a discrepancy is offered as a reference the grade may
      // cite, and the stage did not offer its content.
      discrepancyHandles: [...input.discrepancyRefs],
    }, input.researchCutoffAt), (structured) => decodeFindings('grade', structured, scope))
  }

  async identifyGaps(
    input: IdentifyGapsInput,
  ): Promise<CapabilityResult<readonly GapProposal[]>> {
    const scope: RefScope = {
      claims: refs(input.claims.map((claim) => claim.ref)),
      findings: refs(input.findings.map((finding) => finding.ref)),
      gaps: refs(input.existingGaps.map((gap) => gap.ref)),
    }
    return this.ask('identifyGaps', PROMPTS.IDENTIFY_GAPS, scope, requestBody({
      claims: input.claims.map(presentClaim),
      findings: input.findings.map(presentFinding),
      gapsAlreadyRecorded: input.existingGaps.map(presentGap),
    }, input.researchCutoffAt), (structured) => decodeGaps('identifyGaps', structured, scope))
  }

  /**
   * The one path every operation takes.
   *
   * A capability outcome is returned; an `AdapterFailure` from the transport or
   * the decoder propagates. That split is `capability.ts`'s, not this file's:
   * "a function that may lack capability returns `CapabilityResult<T>`; a
   * function that may break throws."
   */
  private async ask<T>(
    operation: ResearchModelOperation,
    prompt: PROMPTS.OperationPrompt,
    _scope: RefScope,
    userContent: string,
    decode: (structured: unknown) => T,
  ): Promise<CapabilityResult<T>> {
    const request: MessagesRequest = {
      operation: `research-model:${operation}`,
      modelId: this.options.modelId,
      apiKey: this.options.apiKey,
      ...(this.options.baseUrl === undefined ? {} : { baseUrl: this.options.baseUrl }),
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
      system: prompt.system,
      userContent,
      tool: prompt.tool,
      maxTokens: prompt.maxTokens,
    }

    const outcome = await callMessages(request)
    if (outcome.kind === 'CAPABILITY') return outcome.value
    this.calls.push(outcome.value.diagnostics)
    return available(decode(outcome.value.structured))
  }
}

const refs = (values: readonly string[]): ReadonlySet<string> => new Set(values)

/** Re-exported so a composition site can narrow on it without importing capability. */
export const isCapabilityGap = (
  result: CapabilityResult<unknown>,
): result is CapabilityUnavailable => isUnavailable(result)
