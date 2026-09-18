# ADR-0004 — Model Behind Adapter

**ADR:** 0004 (v0.1: ADR-004)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-004; see also §21)
**Supersedes:** —
**Amended:** 2026-09-18 (see *Amendment* below)

## Context

X-Ray methodology is model-agnostic. The v1 runtime does not need to be
multi-model, and multi-model orchestration is explicitly excluded from scope
(§36).

Two benchmark runs against the same source — one Claude, one GPT — produced
materially different grades for the same claim
([XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md)). The system must be able
to change or compare providers without that being an architectural event.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Protocol remains provider-independent while V1 may use one provider.

Keep the research model behind a `ResearchModel` interface
([model boundary](../architecture/research-pipeline.md#model-boundary)) with one
method per pipeline stage. Provider-specific logic lives behind the adapter.

V1 may use a single provider.

## Consequences

- The protocol remains provider-independent while the runtime stays simple.
- Providers can be swapped or evaluated against the acceptance suite without
  changing pipeline, validation or persistence code.
- The adapter is one of only two permitted locations for provider-specific
  logic; the other is the search/research adapter
  ([runtime-architecture.md](../architecture/runtime-architecture.md)).
- Prompt-level differences between providers cannot be relied on to enforce
  correctness — which is precisely why ADR-0005 exists.

---

## Amendment — 2026-09-18 · the adapter returns proposals, not canonical artifacts

**Status:** Accepted. Narrows the interface; the decision above is unchanged.

### What prompted it

Pre-implementation investigation for the executable pipeline (#6) found that the
interface sketched in `research-pipeline.md §21` returns canonical domain
objects:

```ts
decompose(input: DecomposeInput): Promise<Claim[]>;
grade(input: GradeInput): Promise<Finding[]>;
```

A `Claim` carries an id in a namespace XR-INV-012 reserves, and a `Finding`
carries a status and confidence the validator constrains. Returning those types
means a provider mints canonical artifacts directly.

That contradicts two rules already in force:

- **§18** — *"LLM output does not directly enter canonical state."* It passes
  schema, invariant and graph validation first, and may be accepted, rejected
  or repaired.
- **[ADR-0005](./0005-epistemic-invariants-outside-prompts.md)** — critical
  epistemic rules are validated programmatically, outside the prompt. A provider
  that mints a `Finding` has already made the judgment the validator exists to
  check.

The original signature was written before the validator existed. It is not
wrong about the boundary's *location*; it is wrong about what crosses it.

### Amended decision

**A model adapter returns proposals. An executable stage produces canonical
artifacts.**

A proposal is id-free, unvalidated, and carries no field the validator
constrains as an epistemic judgment. The stage that called the adapter then:

1. validates the proposal structurally;
2. assigns canonical identity (XR-INV-012 namespaces, deterministically — see
   [§17](../architecture/research-pipeline.md#stage-contract));
3. merges or replaces the artifacts it owns;
4. records a `StageRun`, including the provider used;
5. decides retry.

None of that is delegable to a provider, and none of it is a model call.

**Stage and model call are distinct abstractions and must not be collapsed.**
One method per stage remains a reasonable adapter shape; it is not the stage.

### Consequences

- Canonical identity is minted inside the trust boundary, so a provider cannot
  occupy a reserved claim namespace or renumber artifacts on retry.
- A provider cannot emit a `Finding` whose grade the validator would reject —
  it can only propose one, which the stage then grades and validates.
- Swapping providers still cannot change domain contracts, which is the
  original decision holding rather than being weakened.
- Proposal types are pipeline-layer types, not domain types. They do not belong
  in `lib/xray/domain/`, which stays canonical and type-only.
- §21's illustrative interface is superseded by this amendment where the two
  disagree.
