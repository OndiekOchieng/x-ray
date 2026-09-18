# ADR-0004 — Model Behind Adapter

**ADR:** 0004 (v0.1: ADR-004)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-004; see also §21)
**Supersedes:** —
**Amended:** 2026-09-18 (twice; see *Amendments* below)

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

## Amendment 1 — 2026-09-18 · the adapter returns proposals, not canonical artifacts

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


---

## Amendment 2 — 2026-09-18 · what a proposal may carry, and how many methods there are

**Status:** Accepted. Corrects a rule that was too strong, and narrows the
interface further. Amendment 1 is unchanged.
**Source:** Human decisions D16 and D17, recorded on #6.

### D16 — a proposal may carry judgment

The 6a→6d implementation plan restated Amendment 1 as *"a proposal carries no
field the validator constrains as an epistemic judgment"*, and set a
verification gate asserting no proposal type carries a `Finding`-grade field.

That was too strong, and it conflicts with the evidence recorded in this ADR's
own Context: two benchmark runs of XRAY-KE-001 produced **materially different
grades for the same claim**. Grading is judgment. No stage can derive
`Finding.status` from evidence relationships, so a proposal that may not carry
one leaves grading with no author at all.

It also drains ADR-0005 of meaning. A validator that only ever sees fields a
provider was forbidden to fill has nothing left to check.

**Amended:** a proposal MAY carry epistemic judgment that cannot be derived
deterministically — `Claim.layer` and `type`, a `Finding` status and
confidence, a `Discrepancy` classification, a `Disconfirmation` result, an
`Evidence` relationship and strength. The boundary is not *providers may not
suggest judgment*. It is:

1. proposals carry no canonical ids;
2. proposals are not canonical domain objects;
3. proposals cannot mutate graph state;
4. the stage validates shape, applies invariants, assigns canonical identity,
   and decides accept / reject / route for revision;
5. facts [ADR-0010](./0010-research-retrieval-boundary.md) assigns to a stage
   stay stage-owned — provenance, accessibility, `evidenceClass`,
   `originStatus`.

Two fields are absent for reasons worth naming, because they show the rule is
not merely about identity: `Gap.atiEligible`, because XR-INV-009 binds it to
`resolutionPath` and a provider must not be able to assert that a gap is
answerable by an access-to-information request; and `Finding.gapIds`, because
`GAPS` owns that back-reference.

A proposal refers to existing artifacts through a **stage-issued handle**
(`ref:…`), never a canonical id. The stage offers the artifact and the provider
answers about the handle, so a provider never learns an identifier it could
later assert.

### D17 — methods exist where judgment is required, not one per stage

The original decision said "one method per pipeline stage". That produces
methods with nothing to do and, worse, methods whose return type the domain
forbids.

**Amended:** `ResearchModel` has a method only where model judgment is
genuinely required. Three stages therefore have none:

| Stage | Why no method |
|---|---|
| `INGEST` | Obtains a record. That is retrieval, not judgment. |
| `PLAN` | Owns no canonical collection, and there is no `ResearchPlan` domain type to return. Inventing one to fill a method slot is what D13 forbids. Query formulation is carried on `TraceInput` instead. |
| `PROVENANCE` | Decides lineage and independence. ADR-0010 assigns that to the stage precisely so a provider cannot assert it. |

Seven operations remain: `decompose`, `classify`, `trace`, `disconfirm`,
`reconcile`, `grade`, `identifyGaps`.

### Capability is part of the signature

Every operation returns `CapabilityResult<…>`: a provider may say it cannot do
this. That is not an error and not a defect in the graph — it is a disclosure
that becomes a graduation blocker (#5's `BLOCKED`), never a `FAIL`. Declared
capability is per operation, never one coarse flag, and a caller must still
handle `UNAVAILABLE` at runtime because capability depends on quota, content
type and execution context.
