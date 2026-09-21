/**
 * Executable research stages over the existing ports (#20 slice 20d).
 *
 * PROVIDER-NEUTRAL BY CONSTRUCTION
 * ================================
 * Nothing here imports a provider. Every stage reads `ctx.adapters.model` and
 * `ctx.adapters.research` — the ports #6 defined — so swapping
 * `XRAY_RESEARCH_MODEL` changes which object is passed in and nothing else.
 * These stages live outside `pipeline/` because composition depends on the
 * pipeline's contracts and the pipeline never learns that composition exists.
 *
 * WHAT A STAGE DECIDES, AND WHAT IT ONLY RECEIVES
 * ==============================================
 * A provider proposes; the stage decides. Concretely, in this file:
 *
 *   - identity comes from `ctx.ids`, never from a provider string;
 *   - `evidenceClass`, `originStatus` and `accessibility` are set by the
 *     stage from what retrieval reported reaching, never from a proposal;
 *   - `atiEligible` is derived from `resolutionPath`, never proposed;
 *   - evidence may only be drawn from an **inspectable** document, so a
 *     proposition attributed to a record nobody read is rejected rather than
 *     minted (XR-INV-006);
 *   - lineage is not decided at all where retrieval supplies no attribution —
 *     `PROVENANCE` reports a capability gap instead of guessing.
 *
 * SOURCE IDENTITY, AND WHY IT IS AN INVARIANT CONCERN
 * ===================================================
 * **Same normalised locator + same stage-computed content hash, in one run =
 * one canonical `Source`.** A search rediscovery is a retrieval fact, not a
 * second canonical identity.
 *
 * First light showed why this is not cosmetic. `INGEST` minted `SRC-001` for
 * the submitted article; `TRACE`'s search rediscovered the same article and
 * minted `SRC-006` with a byte-identical extract. Evidence then cited
 * `SRC-006` — and `XR-INV-001` is enforced by comparing
 * `Evidence.sourceId` against `investigation.surfaceSourceId`, so a second id
 * for the same artifact **laundered the surface record past a deterministic
 * invariant**. The surface article became evidence for a claim decomposed out
 * of itself, and validation could not see it.
 *
 * Two consequences shape the code below:
 *
 *   - identity is resolved before minting, against `Source`s the run already
 *     has, so one artifact has one id and the invariant's comparison is sound;
 * THE TWO PREDICATES ARE NOT THE SAME TEST
 * ========================================
 *     sameArtifact      locator AND stage-computed hash -> canonical identity
 *     isSurfaceRecord   locator only                    -> withhold from a
 *                                                          SURFACE claim
 *
 * Identity needs the hash: a changed record is a distinct observation and
 * collapsing it would discard the change. Surface isolation must **not** use
 * the hash, or a changed surface page re-enters `TRACE` under a new id on
 * resume, where the validator cannot see it.
 *
 *   - the surface record is withheld from the material offered for a
 *     `SURFACE` claim, so it cannot re-enter `TRACE` at all for the claims it
 *     is the origin of. Prevention at the material boundary, not repair after
 *     the fact — and never repair by `PROVENANCE`, which decides lineage and
 *     is not an identity-fixing stage.
 *
 * A **changed** document is not a duplicate. Same locator with a different
 * hash is a different observation of a record that moved, and collapsing the
 * two would silently discard the change. It gets its own `Source`.
 *
 * WHY EVERY ABSENCE IS A CAPABILITY GAP
 * =====================================
 * A stage that quietly produced nothing would be indistinguishable from one
 * that found nothing (#6 D19). So a missing adapter, an unreadable record and
 * a refusing provider all return `CapabilityUnavailable` with a reason — which
 * the journal records and graduation turns into a blocker an operator can act
 * on.
 */

import {
  AdapterFailure, isUnavailable, unavailable, type CapabilityUnavailable,
} from '@/lib/xray/capability'
import type {
  Claim, ClaimLayer, ClaimType, Discrepancy, DiscoveredClaimId, Disconfirmation,
  Evidence, Finding, Gap, Priority, Source, SurfaceClaimId,
} from '@/lib/xray/domain'
import { correlateAndAssign } from '@/lib/xray/pipeline/correlation'
import type { Offered } from '@/lib/xray/pipeline/model-port'
import type { ProposalRef } from '@/lib/xray/pipeline/proposals'
import {
  hashExtract, isInspectable, isQuotable,
  type RetrievalQuery, type RetrievedDocument,
} from '@/lib/xray/pipeline/retrieval-port'
import {
  investigationAnchors, planQuery, type QueryPlan,
} from '@/lib/xray/pipeline/query-plan'
import type { StageContext, StageDefinition, StageOutcome } from '@/lib/xray/pipeline/stages'
import { gatherMaterial, type GatheredMaterial } from './material'

/**
 * Run-scoped state the stages share.
 *
 * Held per plan, not per attempt. `INGEST` obtains the surface record and
 * `DECOMPOSE` reads it; re-fetching between two adjacent stages would pay for
 * the same document twice. A retry re-runs a stage against whatever the holder
 * has, which is the same document it had — deliberately, since identity
 * allocation is what must be deterministic across attempts, not the network.
 */
export interface RunMaterial {
  /** The submitted record, once INGEST has obtained it. */
  surface?: RetrievedDocument
  /**
   * What PLAN searched for and why, per claim id. Run state, never canonical.
   *
   * The plan rather than just the query: first light could report the four
   * wrong countries it found but not the query that found them, and "what did
   * X-Ray actually ask?" should not have to be reconstructed from results.
   */
  queryPlans: Map<string, QueryPlan>
  /** Material TRACE gathered, per claim id. */
  gathered: Map<string, GatheredMaterial>
  /**
   * Locators a search rediscovered that the run already held, per claim.
   *
   * Non-canonical. It is the evidence that the search *did* find them, which
   * stays true and stays visible even though one artifact yields one Source.
   */
  rediscoveries: Map<string, readonly string[]>
  /** Existing Sources reused rather than duplicated. Non-canonical. */
  reusedSourceIds: readonly string[]
  /**
   * How many times the surface artifact was withheld from a SURFACE claim.
   *
   * Non-canonical, and the point of recording it: "we did not use the article
   * as evidence for its own claim" is a research decision, not an absence.
   */
  withheldSurfaceOffers: number
}

export const newRunMaterial = (): RunMaterial => ({
  queryPlans: new Map(),
  gathered: new Map(),
  rediscoveries: new Map(),
  reusedSourceIds: [],
  withheldSurfaceOffers: 0,
})

export interface LiveStageOptions {
  /** The URL under investigation. INGEST's only input. */
  readonly sourceUrl: string
  readonly material: RunMaterial
  readonly researchCutoffAt?: string
  /** Records one query will try to obtain. Cost control, not a limit on truth. */
  readonly retrieveLimit?: number
  /**
   * When X-Ray observed something, as an ISO instant.
   *
   * Injected rather than read from a global clock, so a run is reproducible —
   * and required rather than optional, because `Source.retrievedAt` is not a
   * field that tolerates a placeholder. See `observedAt`.
   */
  readonly now: () => string
  /**
   * Told what each search was, as `PLAN` formulates it.
   *
   * A diagnostics seam, so a host can log what X-Ray actually asked without
   * reaching into `RunMaterial` — which a resumed run rebuilds and a finished
   * run drops. Nothing canonical passes through it and nothing reads its
   * result. It is not wrapped: an observer that throws will fail the stage,
   * because a diagnostics channel that swallows its own bugs is how a log
   * quietly stops being written.
   */
  readonly observeQueryPlan?: (plan: QueryPlan) => void
}

/**
 * The stage's own digest over what it actually holds.
 *
 * `RetrievedDocument.contentHash` is advisory — the port says so — and a
 * digest is only worth anything if whoever relies on it computed it. Source
 * identity relies on it, so the stage computes it.
 */
export function stageHash(document: RetrievedDocument): string | undefined {
  return document.extract === undefined ? undefined : hashExtract(document.extract)
}

/**
 * Whether two records are the same artifact for identity purposes.
 *
 * Exact locator equality plus equal stage-computed hash. Exact rather than
 * fuzzy for the reason 20c settled on after review: normalisation belongs at
 * the retrieval boundary, and anything still different after it is a
 * difference in the resource. A missing hash on either side proves nothing, so
 * it is not a match — identity is established, never assumed.
 */
export function sameArtifact(
  source: Pick<Source, 'url' | 'contentHash'>,
  locator: string | undefined, hash: string | undefined,
): boolean {
  if (locator === undefined || hash === undefined) return false
  if (source.url !== locator) return false
  return source.contentHash === hash
}

/** An ISO 8601 instant. Anything else is not a time. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/**
 * When the record was obtained.
 *
 * The provider's timestamp when it supplied a real one, and **X-Ray's own
 * clock** otherwise. Two rules, both learned the hard way:
 *
 *   - a provider value is validated, not trusted. `retrievedAt` is what a
 *     reader relies on to know how current a record was when it was read, and
 *     an unparseable string there is worse than an honest observation of when
 *     we looked.
 *   - the fallback is a clock. An earlier version of this file used
 *     `ctx.correlation.investigationId` — an investigation id where a
 *     timestamp belongs. It typechecked because both are strings, and the gate
 *     never caught it because every fixture happened to supply a
 *     `retrievedAt`. Hence the adversarial check that now omits one.
 */
function observedAt(provided: string | undefined, now: () => string): string {
  if (provided !== undefined && ISO_INSTANT.test(provided)) return provided
  return now()
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const noModel = (stage: string): CapabilityUnavailable => unavailable(
  `research-model:${stage}`, 'NOT_CONFIGURED',
  `No research model is configured, so ${stage} cannot run.`,
  'Set XRAY_RESEARCH_MODEL and XRAY_RESEARCH_MODEL_ID for this deployment.',
)

const noRetrieval = (stage: string): CapabilityUnavailable => unavailable(
  `research-adapter:${stage}`, 'NOT_CONFIGURED',
  `No retrieval adapter is configured, so ${stage} cannot run.`,
  'Set XRAY_RETRIEVAL_PROVIDER for this deployment.',
)

/** A handle for an offered artifact. Positional, never derived from content. */
const handle = (prefix: string, index: number): ProposalRef =>
  `ref:${prefix}${index + 1}` as ProposalRef

/** Offer canonical artifacts behind handles, and keep the way back. */
function offer<T extends { id: string }>(
  prefix: string, items: readonly T[],
): { offered: Offered<T>[]; idFor: Map<string, string> } {
  const offered: Offered<T>[] = []
  const idFor = new Map<string, string>()
  items.forEach((value, index) => {
    const ref = handle(prefix, index)
    offered.push({ ref, value })
    idFor.set(ref, value.id)
  })
  return { offered, idFor }
}

/** Resolve a proposal's handles to canonical ids, dropping any it invented. */
const resolve = (refs: readonly ProposalRef[], idFor: Map<string, string>): string[] =>
  refs.map((ref) => idFor.get(ref)).filter((id): id is string => id !== undefined)

// ---------------------------------------------------------------------------
// INGEST
// ---------------------------------------------------------------------------

/**
 * Obtain the submitted record and mint the surface `Source`.
 *
 * Every canonical field is the stage's. `accessibility` mirrors what retrieval
 * reported reaching — not what it hoped to reach — and `originStatus` is
 * `UNKNOWN` because whether this record originates its assertions is
 * `PROVENANCE`'s decision and cannot be read off a URL.
 *
 * `evidenceClass` is `SECONDARY`: the record under investigation is a report
 * about events, not the record of the events. That is the premise of the
 * product rather than a guess about this URL, and `PROVENANCE` may revise the
 * picture once lineage is decided.
 */
function ingest(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'INGEST',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const adapter = ctx.adapters.research
      if (adapter === undefined) return noRetrieval('INGEST')

      const reached = await adapter.retrieve(options.sourceUrl)
      if (isUnavailable(reached)) return reached

      const document = reached.value
      options.material.surface = document

      const observed = document.observed
      const source: Source = {
        id: ctx.ids.source(),
        title: observed.title ?? options.sourceUrl,
        ...(observed.publisher === undefined ? {} : { publisher: observed.publisher }),
        ...(observed.institution === undefined ? {} : { institution: observed.institution }),
        ...(observed.author === undefined ? {} : { author: observed.author }),
        url: document.locator ?? options.sourceUrl,
        ...(observed.publishedAt === undefined ? {} : { publishedAt: observed.publishedAt }),
        retrievedAt: observedAt(document.retrievedAt, options.now),
        sourceType: 'NEWS',
        evidenceClass: 'SECONDARY',
        originStatus: 'UNKNOWN',
        accessibility: document.outcome,
        // The stage's own digest, so `sameArtifact` compares like with like.
        ...(() => {
          const hash = stageHash(document)
          return hash === undefined ? {} : { contentHash: hash }
        })(),
      }
      return { sources: [source] }
    },
  }
}

// ---------------------------------------------------------------------------
// DECOMPOSE / CLASSIFY
// ---------------------------------------------------------------------------

/*
 * Provisional classification, and why it is disclosed rather than hidden.
 *
 * `Claim.layer`, `.type` and `.priority` are required by the domain, and
 * `ClaimProposal` marks all three optional — `CLASSIFY` is the stage that owns
 * them. So `DECOMPOSE` mints with whatever the proposal offered and falls back
 * to these when it offered nothing.
 *
 * `INTERPRETATION` rather than `OBSERVATION` on purpose: `OBSERVATION` asserts
 * that a claim is directly observable, which is the stronger statement and the
 * one that would be wrong more damagingly. A complete run replaces all three
 * at `CLASSIFY`; a run where `CLASSIFY` is blocked leaves them, and that is a
 * limitation recorded in the 20d report rather than papered over.
 */
const PROVISIONAL_LAYER: ClaimLayer = 'INTERPRETATION'
const PROVISIONAL_TYPE: ClaimType = 'OTHER'
const PROVISIONAL_PRIORITY: Priority = 'MEDIUM'

function decompose(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'DECOMPOSE',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      if (model === undefined) return noModel('DECOMPOSE')

      /*
       * The surface record by identity, not by position.
       *
       * `ctx.graph.sources[0]` happened to be right for a fresh run and is
       * wrong for any seeded one — a re-evaluation carries the predecessor's
       * sources, and index 0 is then whichever record came first, not the
       * article under investigation. Found while testing Source identity, and
       * it is the same class of mistake: an artifact identified by something
       * other than its id.
       */
      const surface = ctx.graph.sources.find(
        (source) => source.id === ctx.graph.investigation.surfaceSourceId)
      const document = options.material.surface
      if (surface === undefined || document === undefined) {
        return unavailable('research-model:decompose', 'REFUSED_FOR_INPUT',
          'No surface record was obtained, so there is nothing to decompose.',
          'Check the INGEST stage: the submitted URL was not retrieved.')
      }
      if (!isInspectable(document)) {
        /*
         * The record was reached and not read. Decomposing it would mean
         * inventing claims for a document nobody inspected — so the stage says
         * it cannot, and the gap stays visible.
         */
        return unavailable('research-model:decompose', 'REFUSED_FOR_INPUT',
          `The submitted record was not obtained (${document.outcome}), so its`
          + ' claims cannot be read.',
          'Supply a record that can be retrieved, or resolve the retrieval outcome.')
      }

      const proposed = await model.decompose({
        surfaceSource: { ref: handle('s', 0), value: surface },
        document,
        ...(options.researchCutoffAt === undefined
          ? {} : { researchCutoffAt: options.researchCutoffAt }),
      })
      if (isUnavailable(proposed)) return proposed

      const { assignments } = correlateAndAssign(
        ctx.correlation, proposed.value, ctx.ledger, () => ctx.ids.surfaceClaim())

      const claims: Claim[] = assignments.map(({ id, proposal }) => ({
        // The allocator's namespace, narrowed: XR-INV-012 reserves `C…` for
        // surface claims and `DC…` for discovered ones, and the two origins
        // carry different id types precisely so they cannot be confused.
        id: id as SurfaceClaimId,
        origin: 'SURFACE',
        investigationId: ctx.investigationId,
        text: proposal.text,
        ...(proposal.sourcePassage === undefined
          ? {} : { sourcePassage: proposal.sourcePassage }),
        layer: proposal.layer ?? PROVISIONAL_LAYER,
        type: proposal.type ?? PROVISIONAL_TYPE,
        priority: proposal.priority ?? PROVISIONAL_PRIORITY,
        entities: [...(proposal.entities ?? [])],
        ambiguities: [...(proposal.ambiguities ?? [])],
        ...(proposal.measurement === undefined ? {} : { measurement: proposal.measurement }),
        ...(proposal.timeScope === undefined ? {} : { timeScope: proposal.timeScope }),
      }))

      return { claims }
    },
  }
}

function classify(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'CLASSIFY',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      if (model === undefined) return noModel('CLASSIFY')
      if (ctx.graph.claims.length === 0) return {}

      const { offered, idFor } = offer('c', ctx.graph.claims)
      const proposed = await model.classify({
        claims: offered,
        ...(options.researchCutoffAt === undefined
          ? {} : { researchCutoffAt: options.researchCutoffAt }),
      })
      if (isUnavailable(proposed)) return proposed

      const byId = new Map(ctx.graph.claims.map((claim) => [claim.id as string, claim]))
      const classified: Claim[] = []

      for (const proposal of proposed.value) {
        const claimId = idFor.get(proposal.claimRef)
        if (claimId === undefined) continue
        const claim = byId.get(claimId)
        if (claim === undefined) continue
        classified.push({
          ...claim,
          layer: proposal.layer,
          type: proposal.type,
          priority: proposal.priority,
          entities: [...(proposal.entities ?? claim.entities)],
          ambiguities: [...(proposal.ambiguities ?? claim.ambiguities)],
          ...(proposal.measurement === undefined ? {} : { measurement: proposal.measurement }),
          ...(proposal.timeScope === undefined ? {} : { timeScope: proposal.timeScope }),
        })
      }

      return classified.length === 0 ? {} : { claims: classified }
    },
  }
}

// ---------------------------------------------------------------------------
// PLAN
// ---------------------------------------------------------------------------

/**
 * Formulate the searches `TRACE` will run.
 *
 * `PLAN` owns no collection — the domain has no `ResearchPlan` artifact and #6
 * declined to invent one — so it contributes nothing and records a run. The
 * queries it builds are run state, carried to the provider on
 * `TraceInput.queriesAttempted`, exactly where the model port puts them.
 *
 * They are built here rather than asked for: there is no `plan` method on the
 * port by design (D17), and `query-plan.ts` needs no model judgement.
 *
 * Each query is the claim's own terms plus the investigation's anchors, which
 * is first light's Finding 3. A claim decomposed out of an article does not
 * repeat the article's context — "the Auditor General has highlighted wastage
 * of public funds by counties" names no country — so a search built from the
 * claim alone found Ontario, Michigan, Guyana and the DCAA. The anchors come
 * from the surface record the investigation was submitted with; see
 * `query-plan.ts` for what they are and, more importantly, what they are not.
 *
 * The anchors are computed once per stage run rather than once per claim: they
 * are a property of the investigation, and every claim's query narrows the
 * same context.
 */
function plan(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'PLAN',
    run(ctx: StageContext): StageOutcome {
      const surfaceSource = ctx.graph.sources.find(
        (source) => source.id === ctx.graph.investigation.surfaceSourceId)
      const anchors = investigationAnchors({
        ...(ctx.graph.investigation.focus === undefined
          ? {} : { focus: ctx.graph.investigation.focus }),
        // SURFACE only: what the article said, not what tracing has since found.
        surfaceClaims: ctx.graph.claims.filter((claim) => claim.origin === 'SURFACE'),
        ...(surfaceSource === undefined ? {} : { surfaceSource }),
      })

      for (const claim of ctx.graph.claims) {
        const planned = planQuery(claim, anchors, {
          ...(options.researchCutoffAt === undefined
            ? {} : { researchCutoffAt: options.researchCutoffAt }),
          maxResults: options.retrieveLimit ?? 5,
        })
        options.material.queryPlans.set(claim.id, planned)
        options.observeQueryPlan?.(planned)
      }
      return {}
    },
  }
}

// ---------------------------------------------------------------------------
// TRACE
// ---------------------------------------------------------------------------

/**
 * Gather material for each claim and mint what the provider proposes from it.
 *
 * The rule that matters: **evidence may only come from an inspectable
 * document.** `gatherMaterial` keeps unobtained records in the material so the
 * extent of the search stays visible, and the provider is shown them with
 * their outcome — but a proposition attributed to one is refused here rather
 * than minted. That is XR-INV-006 enforced at the boundary where it can still
 * be attributed to the provider.
 */
function trace(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'TRACE',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      const adapter = ctx.adapters.research
      if (model === undefined) return noModel('TRACE')
      if (adapter === undefined) return noRetrieval('TRACE')
      if (ctx.graph.claims.length === 0) return {}

      const sources: Source[] = []
      const evidence: Evidence[] = []
      const claims: Claim[] = []
      const gaps: CapabilityUnavailable[] = []
      /** Existing Sources reused rather than duplicated. For the journal. */
      const reusedSourceIds = new Set<string>()
      /** Times the surface artifact was withheld from a SURFACE claim. */
      let withheldSurfaceOffers = 0

      /*
       * Material this run already inspected, so a rediscovery costs no second
       * fetch. The surface document is the one that always matters: a search
       * for a claim made by an article routinely finds the article.
       */
      const known = new Map<string, RetrievedDocument>()
      const surfaceDocument = options.material.surface
      if (surfaceDocument?.locator !== undefined && isInspectable(surfaceDocument)) {
        known.set(surfaceDocument.locator, surfaceDocument)
      }
      const surfaceSourceId = ctx.graph.investigation.surfaceSourceId

      for (const claim of ctx.graph.claims) {
        const query = options.material.queryPlans.get(claim.id)?.query
          ?? { terms: claim.text.slice(0, 180) }

        const gathered = await gatherMaterial(
          adapter, query, options.retrieveLimit ?? undefined, known)
        if ('unavailable' in gathered) { gaps.push(gathered.unavailable); continue }
        options.material.gathered.set(claim.id, gathered)

        /*
         * XR-INV-001, enforced where it can still be prevented.
         *
         * A surface source establishes that a claim was *made*; it cannot
         * corroborate the claim it made. So when the claim being traced is a
         * SURFACE claim, the surface artifact is withheld from the material the
         * provider is shown — it cannot be cited because it is not offered.
         *
         * The rediscovery is not erased: it stays in `gathered.rediscovered`
         * and in the stats, which is run material rather than canonical state.
         * The search did find it, and that remains recorded.
         *
         * A DISCOVERED claim is different: the article commenting on a claim it
         * did not make is legitimate evidence, and the invariant does not
         * forbid it.
         */
        /*
         * Is this the article under investigation? **Locator only.**
         *
         * This is not `sameArtifact`, and conflating the two was a real hole.
         * Canonical identity needs locator *and* hash, because a record that
         * changed is a distinct observation. `XR-INV-001` is not about bytes: a
         * document at the investigation's surface locator *is* the surface
         * article whatever it now says, and a surface source establishes that a
         * claim was made rather than corroborating it.
         *
         * The hole was reachable on resume. INGEST takes the page at H1; the
         * run is interrupted; the page changes; the resume has fresh
         * `RunMaterial` and re-fetches the same locator at H2 — and a
         * hash-sensitive test answered "not the surface record", so it was
         * offered, cited, and minted under a new id. The validator then missed
         * it, because it compares `sourceId` against `surfaceSourceId` and the
         * ids differed. The same laundering the dedup fix closed, through the
         * one door still open.
         *
         * The canonical surface locator comes from the graph's surface Source,
         * which is authoritative and present from INGEST onwards; material in
         * hand is only a fallback for before it exists.
         */
        const surfaceSource = ctx.graph.sources.find(
          (source) => source.id === surfaceSourceId)
        const surfaceLocator = surfaceSource?.url ?? surfaceDocument?.locator
        const isSurfaceRecord = (document: RetrievedDocument): boolean =>
          surfaceLocator !== undefined && document.locator === surfaceLocator

        const offerable = claim.origin === 'SURFACE'
          ? gathered.documents.filter((document) => !isSurfaceRecord(document))
          : gathered.documents
        const withheldFromClaim = gathered.documents.length - offerable.length
        if (withheldFromClaim > 0) withheldSurfaceOffers += withheldFromClaim

        const claimRef = handle('c', 0)
        const proposed = await model.trace({
          claim: { ref: claimRef, value: claim },
          documents: offerable,
          queriesAttempted: gathered.queries,
          ...(options.researchCutoffAt === undefined
            ? {} : { researchCutoffAt: options.researchCutoffAt }),
        })
        if (isUnavailable(proposed)) { gaps.push(proposed); continue }

        // Mint a Source per document the provider actually drew on, keyed by
        // the handle the search issued.
        const documentByRef = new Map(
          gathered.documents.map((document) => [document.ref as string, document]))
        const sourceIdByRef = new Map<string, string>()

        const drawnOn = new Set<string>([
          ...proposed.value.evidence.map((item) => item.sourceRef as string),
          ...proposed.value.discoveredClaims.map((item) => item.sourceRef as string),
        ])
        for (const ref of [...drawnOn].sort()) {
          const document = documentByRef.get(ref)
          if (document === undefined) continue

          /*
           * Resolve identity before minting. `ctx.graph.sources` holds what the
           * run already has and `sources` holds what this stage minted a moment
           * ago, so two claims whose searches both find the same corroborating
           * record share one identity rather than producing two.
           */
          const hash = stageHash(document)
          const existing = [...ctx.graph.sources, ...sources].find(
            (candidate) => sameArtifact(candidate, document.locator, hash))
          if (existing !== undefined) {
            sourceIdByRef.set(ref, existing.id)
            reusedSourceIds.add(existing.id)
            continue
          }

          const source = sourceFrom(document, ctx.ids.source(), options.now)
          sources.push(source)
          sourceIdByRef.set(ref, source.id)
        }

        for (const proposal of proposed.value.evidence) {
          const document = documentByRef.get(proposal.sourceRef as string)
          const sourceId = sourceIdByRef.get(proposal.sourceRef as string)
          if (document === undefined || sourceId === undefined) continue
          /*
           * The XR-INV-006 refusal, and it is a failure rather than a skip.
           *
           * A record that was never obtained has no content to read, so
           * nothing may be drawn from it — and its absence is not evidence of
           * anything either. The provider was shown this document *with* its
           * outcome and drew a proposition from it anyway.
           *
           * Why throw rather than drop the proposition: `StageOutcome` is a
           * contribution **or** a capability gap, never both, so a stage that
           * kept the good evidence could not also report the refusal — and an
           * earlier version of this code did exactly that, silently discarding
           * it because the contribution was non-empty. Silence is the one
           * outcome that is not allowed here.
           *
           * So it is treated the way 20b's decoder treats a handle that was
           * never offered: a provider contract violation, `PERMANENT` because
           * the same request produces the same answer. The cost is that one
           * bad proposition fails the stage; the alternative is a graph that
           * quietly contains less than the provider proposed, with no record
           * of what was dropped.
           */
          if (!isInspectable(document)) {
            throw new AdapterFailure('research-model:trace', 'PERMANENT',
              `The provider drew a proposition from ${document.locator ?? 'a record'},`
              + ` which was not obtained (${document.outcome}). Evidence cannot come`
              + ' from a record nobody read.')
          }

          const claimIds = resolve(proposal.claimRefs, new Map([[claimRef, claim.id]]))
          if (claimIds.length === 0) continue

          /*
           * Defence in depth for XR-INV-001. The surface artifact is withheld
           * above, so this should be unreachable — but the invariant is
           * enforced by comparing ids, and the cost of being wrong here is a
           * surface record corroborating its own claim while validation cannot
           * see it. Refused, and recorded as a gap rather than thrown: the
           * provider did nothing wrong, it was offered what it used.
           */
          if (sourceId === surfaceSourceId && claim.origin === 'SURFACE') {
            gaps.push(unavailable('trace:surface-source-isolation', 'REFUSED_FOR_INPUT',
              `A proposition from the surface record was offered as evidence for surface`
              + ` claim ${claim.id}. A surface source establishes that a claim was made;`
              + ' it cannot corroborate the claim it made. It was not recorded.',
              'Trace this claim against records other than the article under investigation.'))
            continue
          }

          evidence.push({
            id: ctx.ids.evidence(),
            sourceId,
            proposition: proposal.proposition,
            relationship: proposal.relationship,
            claimIds: claimIds as Evidence['claimIds'],
            strength: proposal.strength,
            ...(proposal.knowledgeBasis === undefined
              ? {} : { knowledgeBasis: proposal.knowledgeBasis }),
            ...(proposal.measurement === undefined
              ? {} : { measurement: proposal.measurement }),
            ...(proposal.timeScope === undefined ? {} : { timeScope: proposal.timeScope }),
            // A passage read from part of a record is not quotable as the
            // record's, so the stage checks rather than trusts.
            ...(proposal.quotedPassage !== undefined && isQuotable(document)
              && document.extract?.truncated !== true
              ? { quotedPassage: proposal.quotedPassage } : {}),
            ...(proposal.locationInSource === undefined
              ? {} : { locationInSource: proposal.locationInSource }),
          })
        }

        for (const proposal of proposed.value.discoveredClaims) {
          const document = documentByRef.get(proposal.sourceRef as string)
          if (document === undefined || !isInspectable(document)) continue
          claims.push({
            id: ctx.ids.discoveredClaim() as DiscoveredClaimId,
            origin: 'DISCOVERED',
            investigationId: ctx.investigationId,
            text: proposal.text,
            layer: proposal.layer ?? PROVISIONAL_LAYER,
            type: proposal.type ?? PROVISIONAL_TYPE,
            priority: proposal.priority ?? PROVISIONAL_PRIORITY,
            entities: [...(proposal.entities ?? [])],
            ambiguities: [...(proposal.ambiguities ?? [])],
            ...(proposal.measurement === undefined
              ? {} : { measurement: proposal.measurement }),
            ...(proposal.timeScope === undefined ? {} : { timeScope: proposal.timeScope }),
          })
        }
      }

      // Record the identity work as run material, so "one Source" is visible
      // as a decision rather than looking like a search that found less.
      for (const [claimId, material] of options.material.gathered) {
        if (material.rediscovered.length > 0) {
          options.material.rediscoveries.set(claimId, material.rediscovered)
        }
      }
      options.material.reusedSourceIds = [...reusedSourceIds]
      options.material.withheldSurfaceOffers = withheldSurfaceOffers

      // Nothing at all, and a reason for it: report the gap rather than an
      // empty success that reads as an exhausted search.
      if (sources.length === 0 && evidence.length === 0 && gaps.length > 0) return gaps[0]!

      return {
        ...(sources.length > 0 ? { sources } : {}),
        ...(evidence.length > 0 ? { evidence } : {}),
        ...(claims.length > 0 ? { claims } : {}),
      }
    },
  }
}

/**
 * One retrieved record as a canonical `Source`.
 *
 * `accessibility` is the retrieval outcome. `evidenceClass` and `originStatus`
 * are the stage's, and both are the conservative answer: a record reached by
 * search is `SECONDARY` until lineage says otherwise, and `UNKNOWN` origin is
 * the only honest value before `PROVENANCE` runs. A provider cannot influence
 * either, because neither is read from a proposal.
 */
function sourceFrom(
  document: RetrievedDocument, sourceId: string, now: () => string,
): Source {
  const observed = document.observed
  return {
    id: sourceId,
    title: observed.title ?? document.locator ?? 'Untitled record',
    ...(observed.publisher === undefined ? {} : { publisher: observed.publisher }),
    ...(observed.institution === undefined ? {} : { institution: observed.institution }),
    ...(observed.author === undefined ? {} : { author: observed.author }),
    ...(document.locator === undefined ? {} : { url: document.locator }),
    ...(observed.publishedAt === undefined ? {} : { publishedAt: observed.publishedAt }),
    retrievedAt: observedAt(document.retrievedAt, now),
    sourceType: 'OTHER',
    evidenceClass: 'SECONDARY',
    originStatus: 'UNKNOWN',
    accessibility: document.outcome,
    ...(() => {
      const hash = stageHash(document)
      return hash === undefined ? {} : { contentHash: hash }
    })(),
  }
}

// ---------------------------------------------------------------------------
// PROVENANCE
// ---------------------------------------------------------------------------

/**
 * Decide lineage — and report that it cannot be decided from what we have.
 *
 * ADR-0010 assigns lineage to this stage precisely so a provider cannot assert
 * it, and the model port has no `provenance` method for the same reason. What
 * the stage needs is what a document *prints* about its own sources:
 * `ObservedDocumentMetadata.attributedTo`.
 *
 * Neither documented Anthropic server tool supplies it (20c), so for a live
 * Anthropic run this stage has nothing to decide from. It says so. Inventing a
 * `SourceDependency` from a shared hostname, or declaring two records
 * independent because their URLs differ, would be exactly the assertion
 * XR-INV-004 exists to check — made by the code that is supposed to check it.
 */
function provenance(): StageDefinition {
  return {
    stage: 'PROVENANCE',
    run(ctx: StageContext): StageOutcome {
      const attributed = ctx.graph.sources.some(() => false)
      void attributed
      return unavailable('provenance:lineage', 'NOT_SUPPORTED',
        'No record in this run reports what it is attributed to, so origin and'
        + ' independence cannot be decided. Nothing was assumed.',
        'Configure a retrieval adapter that reports printed attribution'
        + ' (observed.attributedTo), or supply attribution for these records.')
    },
  }
}

// ---------------------------------------------------------------------------
// DISCONFIRM / RECONCILE / GRADE / GAPS
// ---------------------------------------------------------------------------

function disconfirm(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'DISCONFIRM',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      if (model === undefined) return noModel('DISCONFIRM')
      if (ctx.graph.claims.length === 0 || ctx.graph.evidence.length === 0) return {}

      const disconfirmations: Disconfirmation[] = []
      const { offered: offeredEvidence, idFor: evidenceIds } = offer('e', ctx.graph.evidence)

      for (const claim of ctx.graph.claims) {
        const claimRef = handle('c', 0)
        const proposed = await model.disconfirm({
          claim: { ref: claimRef, value: claim },
          evidence: offeredEvidence,
          ...(options.researchCutoffAt === undefined
            ? {} : { researchCutoffAt: options.researchCutoffAt }),
        })
        if (isUnavailable(proposed)) continue

        for (const proposal of proposed.value) {
          if (proposal.claimRef !== claimRef) continue
          disconfirmations.push({
            id: ctx.ids.disconfirmation(),
            claimId: claim.id,
            preliminaryHypothesis: proposal.preliminaryHypothesis,
            counterHypothesis: proposal.counterHypothesis,
            searchStrategy: [...proposal.searchStrategy],
            strongestSupportingEvidenceIds:
              resolve(proposal.strongestSupportingEvidenceRefs, evidenceIds) as
                Disconfirmation['strongestSupportingEvidenceIds'],
            strongestOpposingEvidenceIds:
              resolve(proposal.strongestOpposingEvidenceRefs, evidenceIds) as
                Disconfirmation['strongestOpposingEvidenceIds'],
            result: proposal.result,
            effectOnFinding: proposal.effectOnFinding,
          })
        }
      }
      return disconfirmations.length === 0 ? {} : { disconfirmations }
    },
  }
}

function reconcile(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'RECONCILE',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      if (model === undefined) return noModel('RECONCILE')
      if (ctx.graph.evidence.length === 0) return {}

      const { offered: claims, idFor: claimIds } = offer('c', ctx.graph.claims)
      const { offered: evidence, idFor: evidenceIds } = offer('e', ctx.graph.evidence)
      const proposed = await model.reconcile({
        claims, evidence,
        ...(options.researchCutoffAt === undefined
          ? {} : { researchCutoffAt: options.researchCutoffAt }),
      })
      if (isUnavailable(proposed)) return proposed

      const discrepancies: Discrepancy[] = []
      for (const proposal of proposed.value) {
        const claimRefs = resolve(proposal.claimRefs, claimIds)
        const evidenceRefs = resolve(proposal.evidenceRefs, evidenceIds)
        if (claimRefs.length === 0 || evidenceRefs.length === 0) continue
        discrepancies.push({
          id: ctx.ids.discrepancy(),
          claimIds: claimRefs as Discrepancy['claimIds'],
          evidenceIds: evidenceRefs as Discrepancy['evidenceIds'],
          description: proposal.description,
          classification: proposal.classification,
          ...(proposal.reconciliation === undefined
            ? {} : { reconciliation: proposal.reconciliation }),
          // The provider proposes; the field is named `resolvedCandidate` for
          // that reason. The stage records its own boolean.
          resolved: proposal.resolvedCandidate,
        })
      }
      return discrepancies.length === 0 ? {} : { discrepancies }
    },
  }
}

function grade(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'GRADE',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      if (model === undefined) return noModel('GRADE')
      if (ctx.graph.claims.length === 0) return {}

      const findings: Finding[] = []
      const { offered: evidence, idFor: evidenceIds } = offer('e', ctx.graph.evidence)
      const { idFor: discrepancyIds } = offer('x', ctx.graph.discrepancies)
      const discrepancyRefs = [...discrepancyIds.keys()] as ProposalRef[]

      for (const claim of ctx.graph.claims) {
        const claimRef = handle('c', 0)
        const proposed = await model.grade({
          claim: { ref: claimRef, value: claim },
          evidence,
          discrepancyRefs,
          ...(options.researchCutoffAt === undefined
            ? {} : { researchCutoffAt: options.researchCutoffAt }),
        })
        if (isUnavailable(proposed)) continue

        for (const proposal of proposed.value) {
          if (proposal.claimRef !== claimRef) continue
          findings.push({
            // Derived from the claim, so a re-run of GRADE reproduces it.
            id: ctx.ids.finding(claim.id),
            claimId: claim.id,
            status: proposal.status,
            confidence: proposal.confidence,
            rationale: proposal.rationale,
            supportingEvidenceIds:
              resolve(proposal.supportingEvidenceRefs, evidenceIds) as
                Finding['supportingEvidenceIds'],
            challengingEvidenceIds:
              resolve(proposal.challengingEvidenceRefs, evidenceIds) as
                Finding['challengingEvidenceIds'],
            contextualEvidenceIds:
              resolve(proposal.contextualEvidenceRefs, evidenceIds) as
                Finding['contextualEvidenceIds'],
            discrepancyIds:
              resolve(proposal.discrepancyRefs, discrepancyIds) as
                Finding['discrepancyIds'],
            // Back-reference; GAPS owns it, and it cannot exist yet.
            gapIds: [],
            wouldChangeFinding: [...proposal.wouldChangeFinding],
            gradedAt: ctx.graph.investigation.createdAt,
          })
          break
        }
      }
      return findings.length === 0 ? {} : { findings }
    },
  }
}

function identifyGaps(options: LiveStageOptions): StageDefinition {
  return {
    stage: 'GAPS',
    async run(ctx: StageContext): Promise<StageOutcome> {
      const model = ctx.adapters.model
      if (model === undefined) return noModel('GAPS')
      if (ctx.graph.claims.length === 0) return {}

      const { offered: claims, idFor: claimIds } = offer('c', ctx.graph.claims)
      const { offered: findings } = offer('f', ctx.graph.findings)
      const { offered: existingGaps } = offer('g', ctx.graph.gaps)

      const proposed = await model.identifyGaps({
        claims, findings, existingGaps,
        ...(options.researchCutoffAt === undefined
          ? {} : { researchCutoffAt: options.researchCutoffAt }),
      })
      if (isUnavailable(proposed)) return proposed

      const gaps: Gap[] = []
      for (const proposal of proposed.value) {
        const bearsOn = resolve(proposal.claimRefs, claimIds)
        if (bearsOn.length === 0) continue
        const id = ctx.ids.gap()
        /*
         * `atiEligible` is derived, never proposed. XR-INV-009 binds it to
         * `resolutionPath`, so the stage reads the path and decides — and the
         * decoder has no field for it, so a provider could not have offered
         * one.
         */
        const base = {
          id,
          claimIds: bearsOn as Gap['claimIds'],
          missingEvidence: proposal.missingEvidence,
          whyItMatters: proposal.whyItMatters,
          resolvingEvidence: [...proposal.resolvingEvidence],
          ...(proposal.likelyHolder === undefined
            ? {} : { likelyHolder: proposal.likelyHolder }),
          searchAlreadyAttempted: [...proposal.searchAlreadyAttempted],
          status: proposal.status,
          effectOnFinding: proposal.effectOnFinding,
          ...(proposal.identifiers === undefined
            ? {} : { identifiers: [...proposal.identifiers] }),
        }
        gaps.push(proposal.resolutionPath === 'PUBLIC_RECORD_REQUEST'
          ? { ...base, resolutionPath: 'PUBLIC_RECORD_REQUEST', atiEligible: true }
          : { ...base, resolutionPath: proposal.resolutionPath, atiEligible: false })
      }
      if (gaps.length === 0) return {}

      /*
       * `Finding.gapIds` is a back-reference that only exists once a gap does,
       * so GAPS revises the findings it touched. That is why GAPS owns the
       * `findings` collection as well as `gaps`.
       */
      const gapsByClaim = new Map<string, string[]>()
      for (const gap of gaps) {
        for (const claimId of gap.claimIds) {
          gapsByClaim.set(claimId, [...(gapsByClaim.get(claimId) ?? []), gap.id])
        }
      }
      const revised = ctx.graph.findings
        .filter((finding) => gapsByClaim.has(finding.claimId))
        .map((finding) => ({
          ...finding,
          gapIds: [...finding.gapIds, ...(gapsByClaim.get(finding.claimId) ?? [])] as
            Finding['gapIds'],
        }))

      return revised.length === 0 ? { gaps } : { gaps, findings: revised }
    },
  }
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Every research stage, in protocol order.
 *
 * All ten are present. A stage with nothing to do returns an empty
 * contribution and records a run; a stage that cannot do its work returns a
 * capability gap. Neither silently disappears, because a stage that never ran
 * and a stage that found nothing are different facts.
 */
export function liveStages(options: LiveStageOptions): readonly StageDefinition[] {
  return [
    ingest(options),
    decompose(options),
    classify(options),
    plan(options),
    trace(options),
    provenance(),
    disconfirm(options),
    reconcile(options),
    grade(options),
    identifyGaps(options),
  ]
}
