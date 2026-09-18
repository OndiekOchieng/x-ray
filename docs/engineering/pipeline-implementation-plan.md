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

**Delivers** typed stage contracts, the in-flight accumulator, the append-only
run journal, retry and resume. No adapters, no providers, no stage bodies that
need one.

- Pipeline owns a mutable canonical-input accumulator; `XRayGraph` gains **no**
  mutation API and is rebuilt as the read aggregate when a stage needs to
  inspect (D3).
- Deterministic stage-scoped identity allocation in the reserved namespaces
  (D5). No random generation for anything referenced by id.
- `RunJournal`: append-only, `StageRun`-compatible, in memory, shaped so #7
  persists the same conceptual records (D11).
- STAGED validation after each artifact-producing stage; a stage that
  introduces an ERROR fails there and blocks downstream execution (D9).
- Sequential execution (D10).

**Checkpoint.** A hand-built sequence of stage stubs traverses the pipeline,
produces a journal, and survives a forced mid-run failure and retry without
renumbering artifacts.

**Rollback.** Additive only, under `lib/xray/pipeline/`. Nothing existing is
modified; reverting the slice removes a directory.

**Verification gate.** `pnpm check:fixtures` green. New `check:pipeline`
covering: identity stable across retry; retrying one stage does not renumber
another's artifacts; journal is append-only; accumulator rebuild produces a
graph identical to `createXRayGraph` over the same arrays.

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
