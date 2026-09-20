# Publication and Cache

**Source:** `X-Ray System Architecture v0.1` §23, XR-INV-008, XR-INV-011
**Architecture version:** 0.1
**Status:** Proposed

How a completed investigation becomes a public artifact — and the boundary
that keeps the public artifact from becoming the research record.

---

## Publication is an event

**Recorded 2026-09-20 · #9 slice 9a semantics · see
[ADR-0013](../adr/0013-publication-is-an-attributed-event.md) and
[ADR-0014](../adr/0014-withdrawal-is-a-presentation-event.md).**

This document previously described how a published X-Ray is *served* without
saying what makes one published. That gap is now closed.

A committed version is a candidate for publication and nothing more.
Publication is a separate, deliberate act recorded as an append-only event
against an exact `(investigation, version)`.

```text
research run  →  graduate  →  commit version N     (storage)
                                    │
                                    │  a human decides
                                    ▼
                              publish version N     (public)
```

Committing never publishes. Without that separation there is no moment at which
a person takes responsibility for what goes out.

### Principal

Every publish, withdraw and republish event names a **`Principal`** — who
performed the administrative act.

It is not called `Actor`, because `Actor` is already a claim dimension in
[Protocol v0.3](../protocol/v0.3/XRAY_RESEARCH_PROTOCOL_v0.3.md): part of
proposition identity, and something the protocol works to keep straight about
the world under investigation. Whoever pressed publish does not belong in that
vocabulary.

**Principal attribution lives in the publication event history and never in the
evidence graph.** No canonical artifact gains a principal field. Who published
an X-Ray is not evidence about anything the X-Ray says.

#9 owns attribution only. It does not own login, accounts, sessions, roles or
permissions. The trusted host or auth boundary supplies the principal, and an
act with no attributable principal is invalid — there is no fallback to "the
operator", because an unattributed publication is a public statement nobody
made.

### What may be published

`PASS`, or an eligible `BLOCKED` **with its capability blockers carried onto the
page**. Never `REVISE` or `FAIL`.

`BLOCKED` is the honest normal state while no reviewer model is wired, so
"publish only `PASS`" would either publish nothing or quietly redefine `PASS`.
Publishing incomplete assurance while hiding what could not be checked would be
worse than not publishing, which is why the disclosure is the condition.

---

## Withdrawal

A published X-Ray sometimes has to come down. Withdrawal is the same kind of
append-only event, with a different meaning: it changes what a reader is shown
and never changes what happened. Canonical versions are insert-only and
withdrawal does not touch them.

Reasons are a closed, named set:

| Reason | What X-Ray is saying |
| --- | --- |
| `ERRONEOUS` | The published artifact contains a material error warranting retraction. X-Ray owns it. |
| `COMPELLED` | Removed under legal or platform compulsion. X-Ray is **not** conceding error. |
| `PRIVACY_HARM` | Removed to prevent harm to a person. Not a statement about the evidence. |
| `OUT_OF_SCOPE` | Should not have been published under X-Ray's own rules. |

One undifferentiated "withdrawn" state would collapse claims that are not the
same. Merging `ERRONEOUS` and `COMPELLED` would let X-Ray disown work it still
stands behind, or concede an error it has not found.

**Superseding is not withdrawal.** Publishing v2 leaves v1 historically
addressable — that is versioning working, and marking v1 withdrawn would
present ordinary research progress as a problem.

**A withdrawn address stays resolvable:** `410 Gone` with a tombstone, never
`404`. Published URLs get cited, and an address that stops resolving leaves the
reader to conclude whatever they like. The tombstone says that the X-Ray was
withdrawn, when, and the reason class; for `ERRONEOUS` it says what was wrong.
It does not re-serve withdrawn content under `COMPELLED` or `PRIVACY_HARM`.

**The alias does not fall back.** Withdrawing the latest published version sends
the alias to the tombstone rather than to its predecessor, which may share the
defect. Re-pointing is a separate deliberate act.

**Withdrawal is reversible**, and both events remain in the history.

**Withdrawal is never automatic.** No assessment, re-graduation, validation
result or capability gap may withdraw a published version. With no reviewer
model wired every re-assessment returns `BLOCKED`, so an automatic rule would
let an unconfigured adapter silently retract published civic evidence.

A withdrawal notice is generated prose about an investigation, and often about a
named institution or person. It sits below the projection boundary with share
cards and ATI drafts, and is bound by the same responsible-sharing rule: a
withdrawal must not become an accusation by implication.

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
