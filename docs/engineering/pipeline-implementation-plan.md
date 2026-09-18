# Pipeline Implementation Plan — 6a to 6d

**Status:** Committed
**Date:** 2026-09-18
**Issue:** #6 · decisions D1–D14 recorded on the issue
**Baseline:** `44b13b9`

Issue #6 covers thirteen stages, two adapter boundaries, retry, revision
routing, stop assessment and identity generation. That is too much for one safe
mutation, so it is sequenced into four slices with checkpoints between them.

Each slice ends green and leaves the repository in a state worth keeping. No
slice depends on a provider existing.

---

## What is already settled

These are not open, and no slice reopens them:

| Constraint | Source |
| --- | --- |
| Model adapter returns **proposals**; stages mint canonical artifacts | [ADR-0004 amendment](../adr/0004-model-adapter-boundary.md) |
| Retrieval adapter returns **material**; stages mint Evidence | [ADR-0010](../adr/0010-research-retrieval-boundary.md) |
| Artifact revisions are **in-run**, not investigation versions | [§17 amendment](../architecture/research-pipeline.md#stage-contract) |
| Identity is deterministic in stage input and survives retry | [§17 amendment](../architecture/research-pipeline.md#stage-contract) |
| A recorded terminal stop is **necessary but not sufficient** for PASS | [§19 amendment](../architecture/research-pipeline.md#research-saturation) |
| LLM output does not enter canonical state unvalidated | §18, [ADR-0005](../adr/0005-epistemic-invariants-outside-prompts.md) |
| Stages are independently recorded and retryable | [ADR-0002](../adr/0002-staged-research-pipeline.md) |

---

## 6a — Stage contracts and run state

**Status: delivered.** `lib/xray/pipeline/`, 50 checks in `pnpm check:pipeline`.

**Delivers** typed stage contracts, the in-flight accumulator, the append-only
run journal, retry and resume. No adapters, no providers, no stage bodies that
need one.

- Vocabulary split per [ADR-0011](../adr/0011-control-gates-are-not-stages.md):
  `ResearchStage` transforms state and owns artifacts; `ControlGate` inspects
  and owns nothing. Disjoint types, disjoint journal shapes (`StageRun` /
  `GateRun`), disjoint id namespaces (`SR-…` / `GR-…`).
- Stage ownership is declared and enforced: `STAGE_OUTPUTS` says which
  collections each stage may write, and a stage writing outside it fails.
- Pipeline owns a mutable canonical-input accumulator; `XRayGraph` gains **no**
  mutation API and is rebuilt as the read aggregate when a stage needs to
  inspect (D3).
- Deterministic stage-scoped identity allocation in the reserved namespaces
  (D5). No random generation, no clock, anywhere in allocation.
- `RunJournal`: append-only, in memory, shaped so #7 persists the same
  conceptual records (D11).
- STAGED validation after each artifact-producing stage; a stage that
  introduces an ERROR fails there and blocks downstream execution (D9).
- Sequential execution (D10), with rollback of a failed attempt so a retry
  allocates exactly the identifiers its predecessor did.
- Both control gates run after the research stages: `VALIDATE` (FULL), then
  `REVIEW` — skipped, not run, if `VALIDATE` blocked.

**Checkpoint.** Met. Stage stubs replay XRAY-KE-001 end to end, reproduce the
canonical graph artifact-for-artifact, survive a stage failing twice before
succeeding without renumbering anything, and resume from an interrupted run.

**Rollback.** Additive under `lib/xray/pipeline/`, plus three narrow edits
noted below.

**Verification gate.** Met. `pnpm check:fixtures` green (282 checks across six
harnesses, `tsc --noEmit` clean). `pnpm check:pipeline` covers identity
stability across retry, non-renumbering, journal append-only enforcement,
accumulator/`createXRayGraph` equivalence, gate/stage separation, and one
meta-proof that the ownership guard is what stops an illegal write.

### What 6a changed outside `lib/xray/pipeline/`

Three edits, each required by the decision or discovered by the replay.

**1. The stage vocabulary split (ADR-0011).** `ResearchStage` and `ControlGate`
added to the domain; `PipelineStage` frozen at its existing members and
documented as legacy. `RevisionRequest.stage` and `CHECK_ROUTING` narrowed to
`ResearchStage`. No historical record was rewritten.

**2. `GAPS` owns the finding back-reference.** `Finding.gapIds` points at gaps
that stage 9 identifies, but grading is stage 8. A finding cannot carry the
link when `GRADE` writes it, so `GAPS` produces the gaps and revises the
findings to record them. The alternative — reordering `GAPS` before `GRADE` —
was rejected: Protocol v0.1 grades at 8 and identifies gaps at 9, and
reordering the frozen method to suit the type model is not a change #6 is
authorised to make (D12).

**3. `XR-INV-008` gains a narrow STAGED exemption.** Between `GRADE` and
`GAPS`, an unresolved finding necessarily names no gap, so the invariant fired
and failed `GRADE` for executing in the specified order. The rule is now
skipped under STAGED *only while no gap exists*, and binds again the moment one
does — so a finding that `GAPS` fails to link is still caught under STAGED and
still attributed to `GAPS`. `FULL` never grants the exemption, so graduation is
unchanged. This mirrors the exemption the validator already made in the
opposite direction for orphaned gaps. Three adversarial checks in
`check:validation` hold the boundary.

### Known contract gap, recorded not worked around

`PLAN` owns no canonical collection. Protocol v0.1 stage 4 produces a research
plan, but the domain has no `ResearchPlan` artifact and #6 is not the slice
that invents one. `PLAN` executes and records a run while contributing nothing
to the graph. Inventing the type, or letting `PLAN` write another stage's
collection, were both rejected.

---

## 6b — Adapter boundaries

**Delivers** the two adapter interfaces and the proposal types. **No provider
implementation** — the same discipline as `ReviewerModel` in #4.

- `ResearchModel` returning proposals: id-free, unvalidated, carrying no field
  the validator constrains as an epistemic judgment (D1, D2).
- `ResearchAdapter` returning retrieved material plus retrieval metadata
  sufficient for a stage to decide `accessibility`, `evidenceClass` and
  `originStatus` (D7).
- Proposal types live in the pipeline layer. `lib/xray/domain/` stays canonical
  and type-only.
- Capability reporting when an adapter is absent, matching #4's
  `NOT_EVALUATED` treatment: absent capability is disclosed, never silently
  treated as success.

**Checkpoint.** A stage can be written against both interfaces, compile, and
report honestly that it cannot run.

**Rollback.** Additive. Types only.

**Verification gate.** No provider SDK, no `fetch`, no prompt string anywhere
under `lib/xray/pipeline/`. A check asserts a proposal type carries no
canonical id field and no `Finding`-grade field.

---

## 6c — Stop assessment and revision routing

**Delivers** research-stop assessment and the routing that closes the review
loop.

- `assessResearchStop(...)` evaluating §19's conditions and producing a named
  `ResearchStop`. Always recorded — including for runs that end well (D4).
- Graduation integration: a recorded terminal stop becomes **necessary** for
  PASS; budget, exhaustion, manual and error stops become **blockers**, never
  `REVISE` or `FAIL` (D4).
- Revision routing: a blocking `RevisionRequest` re-runs its target stage,
  replaces that stage's outputs, marks dependent downstream results stale, and
  records the invalidation in the journal (D8).

**Checkpoint.** A graph with no claims is `BLOCKED` at graduation for want of a
terminal stop, rather than passing silently — the hole identified in the #6
investigation.

**Rollback.** Touches `lib/xray/acceptance/runner.ts` to add a stop
prerequisite. One additive behavior; revertible without disturbing the existing
verdict logic.

**Verification gate.** `pnpm graduate` still reports `BLOCKED` for
XRAY-KE-001 with its six capability blockers **plus** a satisfied stop
prerequisite — the fixture records `SATURATION`. Adversarial checks prove a
budget stop never yields `REVISE` or `FAIL`, and that an empty graph is now
caught generically.

---

## 6d — XRAY-KE-001 replay

**Delivers** the acceptance criterion: *"XRAY-KE-001 can be replayed through the
pipeline without violating its benchmark acceptance behavior."*

- Deterministic stub adapters replaying the frozen corpus. They are fixtures,
  not providers: no network, no model, no inference.
- The replayed graph is compared against the canonical fixture on the
  properties that matter — artifact counts, identity, relationships, provenance
  edges — not on prose.
- A01–A10 must hold for the replayed graph exactly as for the canonical one.

**Checkpoint.** The pipeline reconstructs a graph that satisfies every benchmark
acceptance behavior, from stage contracts alone.

**Rollback.** Additive fixture and harness.

**Verification gate.** Replayed graph: validator-clean, review-clean, all ten
acceptance behaviors satisfied, graduation verdict identical to the canonical
graph's.

---

## Sequencing constraints

```text
6a ──► 6b ──► 6d
  └──► 6c ──► 6d
```

6b and 6c are independent of each other and both depend on 6a. 6d depends on
all three because it exercises the whole path.

6a and 6c have durable value with no provider in existence. 6b is pure
interface. Only 6d is disposable if the contracts turn out wrong — which is why
it comes last and is the honest test of the other three.

## Out of scope for all four slices

Persistence and database schema (#7), API and orchestration (#8), public
caching (#9), ATI lifecycle (#10), live provider implementations, and
`SYNTHESIZE` / `RESOLVE` stage bodies.

`Evidence.layer` and `TimeScope` are **not** revisited (D13). If an executable
stage contract demonstrably cannot represent a required semantic, that surfaces
as a separate consequential domain decision before mutation — it is not folded
into a slice.

Protocol v0.2 is **not** authored (D12). Execution runs against frozen Protocol
v0.1. Build-order steps 2 and 7–9 are intentionally taken out of their original
sequence; see [build-order.md](./build-order.md).
