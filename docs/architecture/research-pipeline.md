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

---

## Related

- [Validation and invariants](./validation-and-invariants.md) — what happens to stage output
- [Runtime architecture](./runtime-architecture.md) — what executes the stages
- [Research Protocol v0.1](../protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md) — the method these stages implement
