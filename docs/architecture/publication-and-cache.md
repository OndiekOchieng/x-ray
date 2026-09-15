# Publication and Cache

**Source:** `X-Ray System Architecture v0.1` §23, XR-INV-008, XR-INV-011
**Architecture version:** 0.1
**Status:** Proposed

How a completed investigation becomes a public artifact — and the boundary
that keeps the public artifact from becoming the research record.

---

## Cached public X-Rays

A published X-Ray is identified by a stable public slug.

```text
/xray/ke/mamboleo-miwani-road
```

The latest version is served by default.

Historical versions remain addressable.

The cached representation contains:

- source claim;
- claim tree;
- findings;
- receipts;
- source provenance;
- discrepancies;
- gaps;
- what-would-settle-it;
- resolution actions;
- investigation timestamp;
- protocol version.

The public page does not need to rerun research.

---

## The public library

Published X-Rays are indexed and browsable. The library is a projection of
cached investigations: it carries identity, surface source, protocol version,
investigation date, and the counts of claims, receipts and open gaps.

Counts shown in the library are **derived from the graph**, never stored
alongside it. A stored count is a second source of truth that will drift.

---

## Projection and synthesis boundary

## XR-INV-011 — Synthesis Cannot Mutate Evidence

Translation, simplification, cards, summaries and citizen-facing prose MUST operate downstream of grading.

They MUST NOT alter claims, evidence relationships, grades, gaps, or provenance.

This is the single most important boundary in the public tier:

```text
       canonical research state
                 │
                 │   (read only)
                 ▼
          SYNTHESIS / PROJECTION
                 │
                 ▼
   cached page · share card · library entry · ATI draft
```

Arrows point one way. Prose, cards, summaries and translations are
**downstream consumers**. Nothing on the lower half of that diagram may write
to the upper half.

Concretely, a synthesis surface may not:

- change a claim's text, type, layer, or origin;
- change a finding's status or confidence;
- add, remove, or re-point evidence or source-dependency edges;
- hide a gap ([XR-INV-008](./validation-and-invariants.md#xr-inv-008--gap-preservation));
- introduce a number, date, or record name not present in the graph.

### Responsible sharing

**Recorded 2026-09-15 · scaffold reconciliation · System Architecture v0.1 clarification**

An unresolved gap **MUST NOT** be transformed into an implication of
wrongdoing by any sharing or synthesis surface.

A Gap says a record is missing and says what would settle it. It does not say
that anyone concealed it, misused funds, or misled the public. Share cards
are the highest-reach, lowest-context surface X-Ray has; they are bound by
this most strictly.

A shareable artifact derived from a gap should carry:

- what is missing;
- why it matters;
- what would settle it;
- that a missing record is not itself evidence of wrongdoing
  ([XR-INV-006](./validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence)).

Rationale and scope: [validation-and-invariants.md](./validation-and-invariants.md#responsible-sharing-is-a-synthesis-constraint).

### ATI drafts are a synthesis surface too

An ATI draft is generated prose and therefore sits below the boundary. It may
be drafted by the model, must be human-reviewable, and must never present
itself as submitted — see
[domain-model.md](./domain-model.md#atirequest) and
[ADR-0008](../adr/0008-ati-resolution-adapter.md).

---

## Verdicts expire. Receipts compound.

A published X-Ray is a dated statement of what the evidence supported at a
research cutoff — not a permanent verdict.

When a new receipt arrives, the investigation gains a version rather than
losing its history
([investigation-versioning.md](./investigation-versioning.md)). The latest
version is served by default; earlier versions remain addressable. What
accumulates across versions is the evidence, not the conclusion.

That is why the cached representation records `investigation timestamp` and
`protocol version` alongside the findings: a reader must be able to see
**when** the X-Ray was true.

---

## Related

- [Investigation versioning](./investigation-versioning.md)
- [Validation and invariants](./validation-and-invariants.md)
- [ADR-0001 — Evidence graph is canonical state](../adr/0001-evidence-graph-canonical-state.md)
