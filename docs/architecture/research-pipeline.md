# Research Pipeline

**Source:** `X-Ray System Architecture v0.1` §16, §17, §19, §21
**Architecture version:** 0.1
**Status:** Proposed

Research is executed as independently persisted stages, not as one
long-running agent. See
[ADR-0002](../adr/0002-staged-research-pipeline.md).

---

## Stage architecture

```text
                    ┌─────────────┐
                    │    INPUT    │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │   INGEST    │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │ DECOMPOSE   │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │  CLASSIFY   │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │    PLAN     │
                    └──────┬──────┘
                           ▼
                  ┌─────────────────┐
                  │      TRACE      │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │   PROVENANCE    │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │  DISCONFIRM     │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │   RECONCILE     │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │      GRADE      │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │      GAPS       │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │    VALIDATE     │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │     PERSIST     │
                  └────────┬────────┘
                           │
               ┌───────────┴──────────┐
               ▼                      ▼
        ┌──────────────┐       ┌──────────────┐
        │  SYNTHESIZE  │       │    RESOLVE   │
        └──────────────┘       └───────┬──────┘
                                       ▼
                                  ATI / OTHER
```

Stages 1–9 generate canonical research state.

Synthesis and Action are downstream consumers.

---

## Stage contract

Every stage execution is persisted.

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

This permits stage-level retries.

TRACE failure does not require DECOMPOSE to rerun.

The `StageRun` type is reproduced in
[domain-model.md](./domain-model.md#stagerun).

### Amendment — 2026-09-18 · artifact revisions are in-run, not investigation versions

`StageRun.inputArtifactVersion` and `outputArtifactVersion` are **in-run
artifact-state revisions**. They are not
[InvestigationVersion](./investigation-versioning.md) numbers, and the two must
never be conflated.

| | `artifactVersion` | `InvestigationVersion` |
| --- | --- | --- |
| Scope | one execution of one run | the investigation's published history |
| Lifetime | the run | permanent |
| Meaning | which artifact state a stage read and produced | an immutable snapshot of what was known |
| Mutable? | monotonic within a run; discarded if the run is abandoned | never rewritten ([ADR-0006](../adr/0006-immutable-investigation-versions.md)) |
| Owner | pipeline (#6) | persistence (#7) |

The distinction is load-bearing. Investigation versions are the mechanism by
which *"verdicts expire, receipts compound"* — they are immutable, publicly
addressable, and created when a new receipt arrives. A stage retried three times
inside a single run has not produced three versions of the investigation; it has
produced three attempts at one artifact state. Borrowing `currentVersion` as a
per-stage counter would make the run's internal bookkeeping look like published
history and would break XR-INV-010.

So:

- a run begins at artifact revision `0` and increments as artifact-producing
  stages succeed;
- a retried stage reads the same `inputArtifactVersion` it read before, which is
  what makes the retry deterministic (see identity, below);
- `Investigation.currentVersion` is untouched by the pipeline. It changes only
  when persistence records a new investigation version.

### Amendment — 2026-09-18 · canonical identity must survive retry

Artifacts referenced by other artifacts must have identities that do not change
when a stage is retried. A re-run `DECOMPOSE` that renumbered its claims would
invalidate every finding, gap, discrepancy and provenance record pointing at
them.

Therefore:

- **identity is assigned by the stage, never by a provider**
  ([ADR-0004 amendment](../adr/0004-model-adapter-boundary.md));
- **identity is deterministic in the stage's input**, not in wall-clock time,
  completion order, or random generation. Retrying a stage against the same
  input artifact revision reproduces the same identities;
- **retrying one stage must not renumber artifacts owned by another**;
- where concurrency would make identity depend on completion order, execution
  stays sequential until it can be shown not to (D10).

Random identifier generation is not permitted for artifacts other records
reference by id.

Stage output does not become canonical state by being produced. It passes
through the validation layer first —
[validation-and-invariants.md](./validation-and-invariants.md).

---

## Research saturation

Research MUST NOT stop merely because the model says it is finished.

A run may graduate when:

```text
materialClaimsDecomposed = true

AND

loadBearingClaimsHaveOriginTracing = true

AND

loadBearingClaimsHaveDisconfirmation = true

AND

materialDiscrepanciesClassified = true

AND

materialClaimsGraded = true

AND

unresolvedMaterialClaimsHaveGaps = true

AND

noNewHighPriorityLeadDiscoveredWithinBudget = true
```

The last condition is budget-aware rather than pretending research can be exhaustive.

The engine records why it stopped.

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

The `ResearchStop` type is reproduced in
[domain-model.md](./domain-model.md#researchstop).

### 6c executable mapping

For v1, a material claim has `priority === HIGH`; a load-bearing claim is a
HIGH-priority claim in the current finding set; a material gap references at
least one HIGH-priority claim. These are operational mappings for this protocol,
not new domain fields.

Assessment occurs once after GAPS. A single pass cannot observe whether a
further search produced new material evidence, so it never proves saturation
by itself. `SATURATION` requires an affirmative execution observation or an
explicit historical replay record. A new proposition-bearing Evidence item
relevant to a material claim or gap may be material even when its source or
origin already appeared. `unresolvedHighPriorityLeads` remains authored prose
so unobtained records can be named.

Capability absence is journalled separately from `ResearchStop`. TIME_BUDGET
and COST_BUDGET require actual configured time and cost meters; neither is
inferred from step or provider-call counts. On resume, the old stop becomes
history and the current graph needs a new stop before PASS.

### Amendment — 2026-09-18 · stages, gates and lifecycle boundaries

The §16 diagram draws every box the same way, and the executable model cannot.
Three kinds of step, per [ADR-0011](../adr/0011-control-gates-are-not-stages.md):

| Kind | Members | Owns artifacts | Journal record |
|---|---|---|---|
| Research stage | INGEST DECOMPOSE CLASSIFY PLAN TRACE PROVENANCE DISCONFIRM RECONCILE GRADE GAPS | yes | `StageRun` (`SR-…`) |
| Control gate | VALIDATE, REVIEW | no | `GateRun` (`GR-…`) |
| Lifecycle boundary | PERSIST (#7), SYNTHESIZE, RESOLVE (#10) | n/a in #6 | not run here |

A gate has no artifact-output-revision field to write into, so it cannot claim
to have changed canonical state. `REVIEW` references the `ReviewHistory` round
rather than restating its verdict.

`PipelineStage` keeps its original members as the legacy vocabulary so
XRAY-KE-001's historical records stay readable. New contracts use
`ResearchStage` and `ControlGate`.

### Amendment — 2026-09-18 · `GRADE` precedes `GAPS`, so the gap link is written by `GAPS`

`Finding.gapIds` is a back-reference. The gap it names is identified at stage 9;
the grade is assigned at stage 8. `GRADE` therefore writes findings without the
link, and `GAPS` produces the gaps and revises the findings to record it. Stage
ownership (`STAGE_OUTPUTS`) grants `GAPS` both collections for this reason.

XR-INV-008 is correspondingly exempt under STAGED validation *while no gap
exists*, and binds again as soon as one does. FULL always enforces it.

### Amendment — 2026-09-18 · stopping is not graduating

The conditions above answer **why research stopped**. They do not answer
**whether the result may be published**. Those are different questions with
different owners, and collapsing them would break the verdict semantics
established by the graduation gate.

**Research stop assessment** is a pipeline concern. Every run records a
`ResearchStop` — always, including runs that end well. A run that stops without
recording why has not finished; it has merely ceased.

**Graduation** is the gate's concern, and it asks whether enough *evaluated*
evidence and assurance exist to publish.

The relationship between them is one-directional:

```text
recorded terminal research stop   →   necessary for PASS
recorded terminal research stop   ↛   sufficient for PASS
```

#### What each stop reason means at the gate

| `ResearchStop.reason` | At graduation |
| --- | --- |
| `SATURATION` | Satisfies the stop prerequisite. Says nothing about whether the graph is sound. |
| `TIME_BUDGET`, `COST_BUDGET` | Incomplete assurance → **BLOCKED** |
| `SOURCE_EXHAUSTION` | Incomplete assurance → **BLOCKED** |
| `MANUAL_STOP` | Incomplete assurance → **BLOCKED** |
| `ERROR` | Incomplete assurance → **BLOCKED** |
| *(absent)* | No terminal stop recorded → **BLOCKED** |

A budget-limited or exhausted run is **not** a defective graph. It is a graph
whose research did not reach the end of what was available, which is precisely
the distinction `BLOCKED` exists to carry: nothing is accused, and the remedy is
more capability or more budget rather than a revision. None of these ever
produces `REVISE` or `FAIL`.

#### What this is not

**Do not encode the seven conditions as a conjunction that must be satisfied to
graduate.** They describe when a run *may* stop, not when a graph *is* publishable:

- unresolved material gaps remain legal where the evidence contract permits them
  — that is [XR-INV-008](./validation-and-invariants.md#xr-inv-008--gap-preservation)
  working, not a failure;
- `noNewHighPriorityLeadDiscoveredWithinBudget` is budget-aware by design, and
  treating it as a pass condition would make budget exhaustion look like
  completeness — exactly the confusion this amendment prevents;
- the named stop reason is the durable record. Reducing it to a boolean would
  discard why the run ended, which is the part a reader needs.

#### The hole this closes

Before this amendment, nothing generic gated completeness. A graph containing no
claims at all validates cleanly and reviews cleanly, because every rule is
conditional on artifacts existing. Only the benchmark-specific acceptance suite
caught emptiness, and a fresh civic source has no such suite.

Requiring a recorded terminal stop makes "this run never really finished"
visible for any investigation, without asserting that an incomplete run is an
invalid one.

---

## Model boundary

X-Ray methodology is model-agnostic.

X-Ray V1 runtime does not need to be multi-model.

```ts
interface ResearchModel {
  decompose(input: DecomposeInput): Promise<Claim[]>;
  classify(input: ClassifyInput): Promise<ClassifiedClaim[]>;
  plan(input: PlanInput): Promise<ResearchPlan>;
  trace(input: TraceInput): Promise<TraceResult>;
  disconfirm(input: DisconfirmInput): Promise<Disconfirmation>;
  reconcile(input: ReconcileInput): Promise<Discrepancy[]>;
  grade(input: GradeInput): Promise<Finding[]>;
  identifyGaps(input: GapInput): Promise<Gap[]>;
}
```

Provider-specific logic lives behind the adapter.

See [ADR-0004](../adr/0004-model-adapter-boundary.md). The invariants in
[validation-and-invariants.md](./validation-and-invariants.md) are enforced
*outside* this interface, not inside the prompts it sends — see
[ADR-0005](../adr/0005-epistemic-invariants-outside-prompts.md).

> **Amended 2026-09-18.** The signatures above are illustrative and predate the
> validator. They return canonical domain objects, which would let a provider
> mint artifacts the validator exists to check — contradicting §18 and
> ADR-0005. **A model adapter returns proposals; the executable stage produces
> canonical artifacts, assigns identity and records the `StageRun`.** Where the
> sketch above and the
> [ADR-0004 amendment](../adr/0004-model-adapter-boundary.md#amendment--2026-09-18--the-adapter-returns-proposals-not-canonical-artifacts)
> disagree, the amendment governs.
>
> Retrieval is a separate boundary again: a search/research adapter returns
> retrieved material and retrieval metadata and never mints Evidence — see
> [ADR-0010](../adr/0010-research-retrieval-boundary.md).
>
> **Amended again 2026-09-18.** The method list above is also superseded.
> `ResearchModel` has a method only where model judgment is genuinely required:
> `INGEST` is retrieval, `PLAN` owns no canonical collection and has no
> `ResearchPlan` to return, and `PROVENANCE` decides lineage the stage must
> own. Seven operations remain — `decompose`, `classify`, `trace`,
> `disconfirm`, `reconcile`, `grade`, `identifyGaps` — and each returns a
> capability result, because a provider may report that it cannot run. See
> [ADR-0004 Amendment 2](../adr/0004-model-adapter-boundary.md) and
> [ADR-0010's payload amendment](../adr/0010-research-retrieval-boundary.md).

---

## Related

- [Validation and invariants](./validation-and-invariants.md) — what happens to stage output
- [Runtime architecture](./runtime-architecture.md) — what executes the stages
- [Research Protocol v0.1](../protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md) — the method these stages implement
