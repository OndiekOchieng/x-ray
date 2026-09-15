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

  publishedAt?: string;
  retrievedAt: string;

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
versus **added**, which claims were **re-evaluated** because the new evidence
bore on them, and the findings and gaps **as they stood** at that version.

XRAY-KE-001 is **Version 1** — `trigger: "INITIAL_RESEARCH"`, no
`supersedesVersion`, and `reEvaluatedClaimIds` empty because nothing preceded
it.

**Deliberately not built:** version-transition machinery, inheritance
resolution, or supersession queries. Those belong to the slice that actually
produces a Version 2.

**Still open:** whether `Investigation.stageRuns` stays embedded (as §5.1
writes it) or becomes `stageRunIds` like every other artifact reference. That
is a persistence question and is not resolved here.

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
