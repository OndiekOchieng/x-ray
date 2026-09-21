# Domain Model

**Source:** `X-Ray System Architecture v0.1` §5–§15, §17, §19
**Architecture version:** 0.1
**Status:** Proposed

Every canonical artifact an investigation produces. These are the objects the
pipeline writes, the validator checks, and the UI projects — never the other
way round.

Type definitions below are reproduced **verbatim** from System Architecture
v0.1. Where scaffold reconciliation (2026-09-15) clarified or corrected a
definition, the change is recorded in a marked block immediately after it and
nowhere else.

**Contents:** [Investigation](#investigation) · [Claim](#claim) ·
[Measurement](#measurement) · [Source](#source) ·
[SourceDependency](#sourcedependency) · [Evidence](#evidence) ·
[Discrepancy](#discrepancy) · [Disconfirmation](#disconfirmation) ·
[Finding](#finding) · [Gap](#gap) · [ATIRequest](#atirequest) ·
[StageRun](#stagerun) · [ResearchStop](#researchstop)

---

## Investigation

## 5.1 Investigation

```ts
interface Investigation {
  id: string;
  protocolVersion: string;

  status:
    | "CREATED"
    | "RUNNING"
    | "RESEARCH_COMPLETE"
    | "SYNTHESIZED"
    | "PUBLISHED"
    | "FAILED";

  surfaceSourceId: string;

  focus?: string;

  createdAt: string;
  researchCutoffAt?: string;
  completedAt?: string;

  currentVersion: number;

  stageRuns: StageRun[];

  claimIds: string[];
  sourceIds: string[];
  evidenceIds: string[];
  discrepancyIds: string[];
  disconfirmationIds: string[];
  findingIds: string[];
  gapIds: string[];
}
```

### #7 persistence clarification — selected snapshot

In a reconstructed graph for immutable version vN, `currentVersion` is **N**:
it identifies the version represented by this `Investigation` value. It is
not a query for the latest version stored for this investigation. Storage keeps
`latestCommittedVersion` on the separate investigation identity row; #9 owns
any public version pointer. The pipeline's in-run `artifactVersion` is a third,
unrelated number and never changes either pointer.

The fields needed to reconstruct this `Investigation` exactly, including its
ordered artifact membership and `stageRuns`, belong to the immutable version
snapshot. `stageRuns` stays embedded in the **domain aggregate** even though
its version-snapshot entries are normalized in PostgreSQL. Those entries are
not interchangeable with the producing run's `RunJournal`; GateRuns and
CapabilityRuns never become embedded StageRuns. The frozen XRAY-KE-001 legacy
StageRuns therefore remain unchanged. See
[investigation-versioning.md](./investigation-versioning.md#persistence-contract).

---

## Claim

```ts
type ClaimLayer =
  | "OBSERVATION"
  | "INTERPRETATION"
  | "MEANING";

type ClaimOrigin =
  | "SURFACE"
  | "DISCOVERED";

interface Claim {
  id: string;
  investigationId: string;

  origin: ClaimOrigin;

  text: string;

  sourcePassage?: string;

  layer: ClaimLayer;

  type:
    | "QUANTITATIVE"
    | "FINANCIAL"
    | "GEOGRAPHIC"
    | "DELIVERY"
    | "TIMELINE"
    | "ATTRIBUTION"
    | "LEGAL"
    | "OTHER";

  priority:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  entities: string[];

  ambiguities: string[];

  measurement?: Measurement;

  timeScope?: TimeScope;
}
```

> `layer` (OBSERVATION / INTERPRETATION / MEANING) is required by
> [XR-INV-003](./validation-and-invariants.md#xr-inv-003--observation--interpretation--meaning-separation).
> `origin` is required by
> [XR-INV-012](./validation-and-invariants.md#xr-inv-012--discovered-claims-are-separate),
> which also reserves separate identifier namespaces for `SURFACE` and
> `DISCOVERED` claims.

---

## Measurement

Measurement compatibility is a first-class system concept.

```ts
interface Measurement {
  metric?: string;

  value?: number;
  unit?: string;

  denominator?: string;

  scope?: string;

  definition?: string;
}
```

Example A:

```json
{
  "metric": "physical_project_completion",
  "value": 28,
  "unit": "percent",
  "denominator": "contractual_work",
  "scope": "three-lot project"
}
```

Example B:

```json
{
  "metric": "surfaced_length",
  "unit": "percent",
  "denominator": "mainline_length",
  "scope": "Mamboleo-Kipsitet main carriageway"
}
```

These measurements are not automatically compatible.

> Measurement is the mechanism behind
> [XR-INV-005](./validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule).
> Compatibility semantics are specified in
> [evidence-graph.md](./evidence-graph.md#measurement-compatibility).

---

## TimeScope

**Provisional — recorded 2026-09-15 · System Architecture v0.1**

`Claim.timeScope` is referenced in §6 but no shape is given there. The
following lean shape is ratified as provisional v0.1:

```ts
interface TimeScope {
  from?: string;
  to?: string;
  asOf?: string;
  description?: string;
}
```

`description` carries verbatim time-scope wording where it cannot be reduced
to dates — the benchmark runs recorded scopes such as *"as at 13 Sep 2026"*,
*"undated"*, and *"present (project as scoped)"*.

**Deliberately not introduced:** `SCHEDULED` / `OCCURRED`, or any wider
temporal ontology. The scheduled-versus-occurred distinction that XRAY-KE-001
turns on is carried by the claim text and its Finding, not by a temporal
enum. Adding one now would encode a decomposition decision that has not been
made.

Temporal semantics may be revisited when the `DECOMPOSE` and `CLASSIFY` stage
contracts become executable.

---

## Source

```ts
interface Source {
  id: string;

  title: string;
  publisher?: string;
  institution?: string;
  author?: string;

  url?: string;

  publishedAt?: string; // ISO month, date, or date-time at recorded precision
  retrievedAt: string; // ISO date or date-time at the precision actually recorded

  sourceType:
    | "LEGISLATION"
    | "GAZETTE"
    | "PROCUREMENT_RECORD"
    | "CONTRACT"
    | "BUDGET"
    | "AUDIT"
    | "PARLIAMENTARY_RECORD"
    | "COURT_RECORD"
    | "OFFICIAL_REPORT"
    | "OFFICIAL_STATEMENT"
    | "DATASET"
    | "NEWS"
    | "CONTRACTOR_RECORD"
    | "OTHER";

  evidenceClass:
    | "PRIMARY"
    | "PRIMARY_ADJACENT"
    | "ATTRIBUTED_ORIGIN_NOT_RETRIEVED"
    | "SECONDARY"
    | "TERTIARY";

  originStatus:
    | "ORIGINATING"
    | "REPEATING"
    | "UNKNOWN";

  accessibility:
    | "RETRIEVED"
    | "PARTIAL"
    | "NOT_RETRIEVED"
    | "DEAD_LINK";

  contentHash?: string;
}
```

> `accessibility: NOT_RETRIEVED` is how the graph records a record it could
> not obtain. It never becomes a claim that the record does not exist — see
> [XR-INV-006](./validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence).

> ### Ratified — `NOT_LOCATED` is distinct from `NOT_RETRIEVED`
>
> **Recorded:** 2026-09-15 · ratified during Slice 2 · System Architecture v0.1 clarification
>
> `accessibility` carries five values. §8 as written supplies four; `NOT_LOCATED`
> is ratified as the fifth:
>
> ```ts
> accessibility:
>   | "RETRIEVED"
>   | "PARTIAL"
>   | "NOT_LOCATED"
>   | "NOT_RETRIEVED"
>   | "DEAD_LINK";
> ```
>
> | Value | Meaning |
> | --- | --- |
> | `NOT_RETRIEVED` | The record has been **identified or referenced** — cited, attributed, indexed — but its contents could not be obtained. |
> | `NOT_LOCATED` | Reasonable tracing and search were **attempted** and the record was **not located**. |
>
> The distinction is load-bearing. XRAY-KE-001 contains both: PS Omollo's
> originating statements are identified and quoted by several outlets but the
> originals were never obtained (`NOT_RETRIEVED`), while no variation order or
> revised contract schedule was found at all despite targeted search
> (`NOT_LOCATED`).
>
> **Neither state means the record does not exist.** `DOES_NOT_EXIST` is not a
> member of this union and MUST NOT be introduced —
> [XR-INV-006](./validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence).
> A record whose existence is genuinely in question is represented as a
> [Gap](#gap), never as a negative fact about a source.

---

## SourceDependency

Source provenance is represented as graph edges.

```ts
interface SourceDependency {
  id: string;

  sourceId: string;
  dependsOnSourceId?: string;

  originDescription?: string;

  relationship:
    | "REPRODUCES"
    | "QUOTES"
    | "ATTRIBUTES_TO"
    | "DERIVED_FROM"
    | "SAME_EVENT"
    | "PROBABLE_COMMON_ORIGIN"
    | "UNKNOWN";

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";
}
```

This prevents repetition from becoming false corroboration.

---

## Evidence

A Source is not Evidence.

Evidence is the material proposition extracted from a Source and connected to Claims.

```ts
interface Evidence {
  id: string;

  sourceId: string;

  proposition: string;

  relationship:
    | "SUPPORTS"
    | "CHALLENGES"
    | "CONTRADICTS"
    | "CONTEXTUALIZES";

  claimIds: string[];

  strength:
    | "DIRECT"
    | "STRONG_INDIRECT"
    | "CONTEXTUAL"
    | "WEAK";

  measurement?: Measurement;

  quotedPassage?: string;

  locationInSource?: string;
}
```

This distinction is important:

```text
Source
   │
   ├── Evidence A ──supports────► C001
   │
   ├── Evidence B ──challenges──► C002
   │
   └── Evidence C ──context─────► C005
```

> ### Ratified — provenance is modelled at two levels
>
> **Recorded:** 2026-09-16 · Slice 4.1 · System Architecture v0.1 clarification
>
> `SourceDependency` (§9) is **document lineage**. It remains canonical and
> answers document-level questions: this article reproduces that ministry
> release; these publications share a probable common origin.
>
> `EvidenceProvenance` is **proposition lineage** — where one Evidence record
> came from:
>
> ```ts
> type EvidenceProvenanceRelationship =
>   | "REPRODUCES"
>   | "QUOTES"
>   | "ATTRIBUTES_TO"
>   | "DERIVED_FROM";
>
> type EvidenceOrigin =
>   | { kind: "SOURCE"; sourceId: string }
>   | { kind: "UNIDENTIFIED"; description: string };
>
> interface EvidenceProvenance {
>   id: string;
>   evidenceId: string;
>   origin: EvidenceOrigin;
>   relationship: EvidenceProvenanceRelationship;
>   confidence: "HIGH" | "MEDIUM" | "LOW";
> }
> ```
>
> The relationship vocabulary is narrower than `SourceDependency`'s on purpose.
> `SAME_EVENT` and `PROBABLE_COMMON_ORIGIN` describe two documents standing in
> a relation to each other; they say nothing about where a particular
> proposition came from.
>
> **Why both are needed.** A single publication routinely carries propositions
> from several origins. In XRAY-KE-001 one article reports September progress
> percentages from a ministry status release *and* lot contract values that
> repeat a 2021 procurement notice. At document level it depends on both. At
> proposition level each figure has exactly one origin.
>
> Resolving claim-level independence from document lineage therefore lends
> every origin of a source to every claim that source touches. For a claim
> resting on only the progress figures, the procurement notice was counted as a
> second independent observation — inflating apparent corroboration. See
> [XR-INV-004](./validation-and-invariants.md#xr-inv-004--source-independence)
> and [CAL-003](../calibration/cases/CAL-003-repetition-is-not-corroboration.md).
>
> **An absent provenance record is not a claim of independence.** Evidence with
> no record is independent only if its own source is `ORIGINATING`; otherwise
> its independence is *unresolved*, and unresolved is never counted.
> `UNIDENTIFIED` likewise means the proposition is known to be derivative from
> a record nobody identified — not that it is an independent observation.

> ### Ratified — Evidence carries its own temporal scope
>
> **Recorded:** 2026-09-16 · Slice 2.1 · System Architecture v0.1 clarification
>
> `Evidence` gains an optional `timeScope`:
>
> ```ts
> timeScope?: TimeScope;
> ```
>
> **A source's publication time is not the time the observation is true of.**
> The National Treasury published a report in November 2025 recording project
> completion **as at 30 June 2025**; a 2022 article states contract sums fixed
> at award in 2021. `Source.publishedAt` answers *when was this published*;
> `Evidence.timeScope` answers *when is this true of*.
>
> Without the field, the two collapse — and a finding cannot tell a current
> measurement from a stale one, which is exactly the judgment
> [XR-INV-005](./validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)
> and research cutoffs depend on.
>
> Temporal scope **MUST NOT** be encoded inside `Measurement.definition`.
> `definition` is reserved for measurement-definition semantics — what the
> metric means, not when it was taken. Where a record gives no measurement
> date, `TimeScope.description` says so rather than supplying one.

---

## Discrepancy

```ts
interface Discrepancy {
  id: string;

  claimIds: string[];
  evidenceIds: string[];

  description: string;

  classification:
    | "DIFFERENT_DATE"
    | "DIFFERENT_SCOPE"
    | "DIFFERENT_DEFINITION"
    | "DIFFERENT_PHASE"
    | "DIFFERENT_UNIT"
    | "REVISED_VALUE"
    | "GENUINE_CONTRADICTION"
    | "PROBABLE_SOURCE_ERROR"
    | "UNRESOLVED";

  reconciliation?: string;

  resolved: boolean;
}
```

The engine MUST attempt classification before permitting `GENUINE_CONTRADICTION`.

---

## Disconfirmation

```ts
interface Disconfirmation {
  id: string;

  claimId: string;

  preliminaryHypothesis: string;
  counterHypothesis: string;

  searchStrategy: string[];

  strongestSupportingEvidenceIds: string[];
  strongestOpposingEvidenceIds: string[];

  result:
    | "SURVIVED"
    | "SURVIVED_WEAKENED"
    | "CHANGED"
    | "FAILED"
    | "UNRESOLVED";

  effectOnFinding: string;
}
```

Disconfirmation is a pipeline stage, not a prose instruction.

A load-bearing claim cannot graduate without a disconfirmation record.

---

## Finding

```ts
type FindingStatus =
  | "ESTABLISHED"
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTESTED"
  | "CONTRADICTED"
  | "UNRESOLVED"
  | "INSUFFICIENT_EVIDENCE";

interface Finding {
  id: string;

  claimId: string;

  status: FindingStatus;

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  rationale: string;

  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];
  contextualEvidenceIds: string[];

  discrepancyIds: string[];
  gapIds: string[];

  wouldChangeFinding: string[];

  gradedAt: string;
}
```

> ### Correction — confidence is ordinal, not numeric
>
> **Recorded:** 2026-09-15 · scaffold reconciliation · System Architecture v0.1 clarification
>
> `Finding.confidence` is and remains:
>
> ```text
> HIGH | MEDIUM | LOW
> ```
>
> Numeric pseudo-probability — for example `0.86` rendered as
> `"86% confidence"` — **MUST NOT** be introduced. The v0 UI scaffold
> did so; that was a scaffold defect, not an architecture change.
>
> **Why:** a decimal implies a calibrated probability the pipeline cannot
> produce. On a civic-trust surface, fabricated precision is worse than an
> honest band. The architecture was already correct here; this note exists so
> the drift is not re-introduced.

> ### Ratified — findings carry contextualizing evidence explicitly
>
> **Recorded:** 2026-09-16 · Slice 2.1 · System Architecture v0.1 clarification
>
> `Finding` gains a third evidence list:
>
> ```ts
> contextualEvidenceIds: string[];
> ```
>
> Evidence reaches a finding through three lists, mapped from the canonical
> `Evidence.relationship`:
>
> ```text
> SUPPORTS       → supportingEvidenceIds
> CHALLENGES     → challengingEvidenceIds
> CONTRADICTS    → challengingEvidenceIds
> CONTEXTUALIZES → contextualEvidenceIds
> ```
>
> The mapping is **total**: every Evidence record bearing on the claim lands in
> exactly one list, and no list contains an id whose relationship maps
> elsewhere.
>
> **Why:** evidence that neither supports nor opposes a claim can still be
> decisive for the finding's reasoning — the ESIA record establishing that
> spur roads are programmed separately is what makes a scope reconciliation
> credible, without supporting or challenging the length figure itself.
> Previously such evidence appeared in no list, so finding-level
> explainability required scanning every Evidence record for a matching
> `claimId`, and load-bearing evidence was invisible in the finding it
> supported. [XR-INV-007](./validation-and-invariants.md#xr-inv-007--findings-must-be-reversible)
> requires a finding to account for itself; it cannot do that while part of its
> reasoning is unreachable from it.
>
> **`CHALLENGES` and `CONTRADICTS` deliberately share one list.** There is no
> `contradictingEvidenceIds`. The distinction between weakening a claim and
> refuting it is carried by `Evidence.relationship`, which stays canonical;
> duplicating it on the finding would create a second place for it to drift.

---

## Gap

```ts
type ResolutionPath =
  | "PUBLIC_RECORD_REQUEST"
  | "WAIT_FOR_RECORD"
  | "FIELD_VERIFICATION"
  | "SOURCE_CLARIFICATION"
  | "DATASET_QUERY"
  | "EXPERT_INTERPRETATION"
  | "OTHER";

interface Gap {
  id: string;

  claimIds: string[];

  missingEvidence: string;

  whyItMatters: string;

  resolvingEvidence: string[];

  likelyHolder?: {
    institution: string;
    office?: string;
  };

  searchAlreadyAttempted: string[];

  status:
    | "OPEN"
    | "REQUESTED"
    | "RECEIVED"
    | "RESOLVED"
    | "UNRESOLVABLE";

  effectOnFinding: string;

  resolutionPath: ResolutionPath;

  atiEligible: boolean;
}
```

Invariant:

```text
atiEligible =
resolutionPath === PUBLIC_RECORD_REQUEST
```

> ### Clarification — custody basis must be explicit
>
> **Recorded:** 2026-09-15 · scaffold reconciliation · System Architecture v0.1 clarification
>
> `likelyHolder` gains a required `basis`:
>
> ```ts
> likelyHolder?: {
>   institution: string;
>   office?: string;
>   basis: "CONFIRMED" | "INFERRED";
> };
> ```
>
> `CONFIRMED` means an actual information officer, office, or custody record
> was located. `INFERRED` means X-Ray reasoned about likely custody and did
> not confirm it.
>
> **Why:** the field name "likelyHolder" carries the uncertainty, but nothing
> downstream could read it. An ATI draft addressed to an inferred holder must
> be presentable as inferred. This applies
> [XR-INV-006](./validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence)
> to the action layer, which v0.1 did not do.

> ### Clarification — gaps may carry request identifiers
>
> **Recorded:** 2026-09-15 · scaffold reconciliation · System Architecture v0.1 clarification
>
> A Gap MAY preserve the project/entity identifiers needed to make a
> public-record request specific:
>
> ```ts
> identifiers?: string[];
> ```
>
> For example: a road or project name, an investigation id, a tender or
> contract reference, a described figure under dispute.
>
> **Why:** an ATI request that cannot name the project it concerns is
> unanswerable. These identifiers are derived from evidence already in the
> graph; the field records them rather than requiring the drafting step to
> re-derive them. It does **not** license inventing a record name —
> [ADR-0008](../adr/0008-ati-resolution-adapter.md) and §15 still govern that.

---

## ATIRequest

> ### Amendment — ATIRequest is a read model, not graph state
>
> **Recorded:** 2026-09-21 · #10 slice 10b
>
> `ATIRequest` is no longer a collection on `XRayGraph`. The immutable graph
> holds version-scoped research state only; a request is an action taken about
> a version, its status changes with no new version, and a frozen snapshot
> cannot hold a fact that keeps moving (#10 C1/C2/C7, ADR-0017).
>
> The interface below survives as a **derived read model**. Its canonical
> record is the append-only action history in `ati_requests`,
> `ati_request_revisions`, `ati_request_events`, `ati_responses`,
> `ati_response_intakes` and `ati_intake_source_acceptances`;
> `application/ati-read-model.ts` projects that history into this shape on
> demand. `status`, `draftedAt`, `submittedAt`, `respondedAt` and
> `receivedSourceIds` are all computed, never stored as authoritative facts.
>
> Two things the shape below cannot carry, and which the projection therefore
> adds rather than dropping: the **origin version** a request is anchored to,
> and the **custody basis** of its addressee. A request whose addressee was
> inferred must stay visibly inferred (#10 C5).

```ts
interface ATIRequest {
  id: string;

  gapId: string;

  jurisdiction: "KE";

  holdingInstitution: string;

  requestedRecords: string[];

  publicInterestContext: string;

  investigationUrl?: string;

  status:
    | "DRAFT"
    | "EXPORTED"
    | "SUBMITTED"
    | "ACKNOWLEDGED"
    | "RESPONDED"
    | "CLOSED";

  draftedAt: string;
  submittedAt?: string;
  respondedAt?: string;

  receivedSourceIds: string[];
}
```

ATI generation occurs after evidence grading.

The language model MAY draft the request.

The language model MUST NOT invent the name of a record the Gap Ledger has not established or reasonably described.

> ### Clarification — drafting is human-reviewable, and DRAFT ≠ SUBMITTED
>
> **Recorded:** 2026-09-15 · scaffold reconciliation · System Architecture v0.1 clarification
>
> Two requirements on the existing `status` lifecycle:
>
> 1. **`DRAFT` and `EXPORTED` are human-reviewable and human-editable.** The
>    model may draft; a person may edit before the request leaves X-Ray. No
>    transition past `EXPORTED` occurs without a human action.
> 2. **Any surface showing a request MUST visibly distinguish
>    `DRAFT`/`EXPORTED` from `SUBMITTED`.** A draft must never be presentable
>    as a filed request.
>
> ```text
> DRAFT ──edit──► DRAFT ──human action──► EXPORTED
>                                             │
>                                    human files it externally
>                                             ▼
>                                         SUBMITTED
> ```
>
> **Why:** X-Ray does not file requests
> ([v0-scope](../engineering/v0-scope.md) excludes automated ATI submission).
> A citizen must never believe X-Ray has submitted something on their behalf.

---

## InvestigationVersion

**Provisional — recorded 2026-09-15 · System Architecture v0.1**

§22 specifies immutable versioning behaviour and the version graph, but
defines no record. The following shape is ratified as provisional v0.1,
derived from the behaviour already accepted in
[investigation-versioning.md](./investigation-versioning.md) and
[ADR-0006](../adr/0006-immutable-investigation-versions.md):

```ts
type InvestigationVersionTrigger =
  | "INITIAL_RESEARCH"
  | "NEW_SOURCE_RECEIVED"
  | "ATI_RESPONSE_RECEIVED"
  | "RE_EVALUATION"
  | "CORRECTION";

interface InvestigationVersion {
  investigationId: string;
  version: number;
  createdAt: string;
  trigger: InvestigationVersionTrigger;
  supersedesVersion?: number;

  addedSourceIds: string[];
  addedEvidenceIds: string[];
  reEvaluatedClaimIds: string[];

  findingIds: string[];
  gapIds: string[];

  researchStop?: ResearchStop;
}
```

The fields carry exactly the behaviour §22 describes: what was **inherited**
versus **added**, which claims were **re-evaluated** under the recorded
trigger, and the findings and gaps **as they stood** at that version. A
version-scoped audit gives each re-evaluated claim its specific reason.

XRAY-KE-001 is **Version 1** — `trigger: "INITIAL_RESEARCH"`, no
`supersedesVersion`, and `reEvaluatedClaimIds` empty because nothing preceded
it.

**Deliberately not built:** version-transition machinery, inheritance
resolution, or supersession queries. Those belong to the slice that actually
produces a Version 2.

**#7 mapping, resolved 2026-09-19:** `Investigation.stageRuns` remains embedded
in the reconstructed domain snapshot and is normalized as an ordered
version-snapshot set in storage. Execution audit records remain separate.
`InvestigationVersion` is a completed research snapshot, not a publication
marker. `PASS` and eligible `BLOCKED` candidates may commit; `REVISE`, `FAIL`
and incomplete runs may not. `supersedesVersion` names the predecessor;
per-claim re-evaluation audit explains why an affected claim changed without
adding a SQL-driven field to this canonical type. All canonical artifacts and
the investigation fields needed for exact reconstruction are version-scoped in
storage. See [ADR-0006](../adr/0006-immutable-investigation-versions.md) and
[investigation-versioning.md](./investigation-versioning.md#persistence-contract).

`findingIds` and `gapIds` identify records **as they stand in this snapshot**.
An older finding with the same canonical id and earlier content remains in its
earlier version; vN does not embed all superseded rows from prior versions.
For initial v1, `addedSourceIds` and `addedEvidenceIds` name the initial
receipts and `reEvaluatedClaimIds` is empty, as XRAY-KE-001 demonstrates.

---

## StageRun

Reproduced from §17. The stage contract this participates in is specified in
[research-pipeline.md](./research-pipeline.md#stage-contract).

```ts
interface StageRun {
  id: string;

  investigationId: string;

  stage:
    | "INGEST"
    | "DECOMPOSE"
    | "CLASSIFY"
    | "PLAN"
    | "TRACE"
    | "PROVENANCE"
    | "DISCONFIRM"
    | "RECONCILE"
    | "GRADE"
    | "GAPS"
    | "VALIDATE"
    | "SYNTHESIZE"
    | "RESOLVE";

  status:
    | "PENDING"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED";

  inputArtifactVersion: number;

  outputArtifactVersion?: number;

  model?: string;

  startedAt?: string;
  completedAt?: string;

  error?: string;
}
```

---

## ResearchStop

Reproduced from §19. The saturation conditions that produce it are specified
in [research-pipeline.md](./research-pipeline.md#research-saturation).

```ts
interface ResearchStop {
  reason:
    | "SATURATION"
    | "TIME_BUDGET"
    | "SOURCE_EXHAUSTION"
    | "COST_BUDGET"
    | "MANUAL_STOP"
    | "ERROR";

  unresolvedHighPriorityLeads: string[];
}
```

---

## Related

- [Evidence graph](./evidence-graph.md) — how these objects connect
- [Validation and invariants](./validation-and-invariants.md) — what the graph may never assert
- [Research pipeline](./research-pipeline.md) — which stage writes which artifact
