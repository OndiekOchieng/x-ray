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

## Public addressing

**Amended 2026-09-20 · #9 decisions D2/D3 · supersedes the v0.1 example below.**

A published X-Ray is identified by a stable public slug.

```text
/xray/{slug}          current public alias
/xray/{slug}/v{n}     exact historical version address
```

> **The v0.1 example `/xray/ke/mamboleo-miwani-road` is withdrawn as contract.**
> The investigation domain has no general jurisdiction field; the only
> jurisdiction concept is ATI-specific. A permanent public address must not
> depend on data the investigation does not own, and must never be
> reverse-engineered from ATI state or inferred from prose. **No jurisdiction
> segment in v1.** If a real investigation-level jurisdiction is ever
> introduced, it may become metadata or a new routing layer.

### The slug belongs to the investigation, not to a version

A slug is the stable public identity of one investigation lineage:

- minted at first publication — before publication there is no public identity
  to preserve;
- globally unique within the public namespace;
- immutable once minted;
- shared by every version of that investigation;
- unchanged by corrections to title, source wording, geography or findings;
- not freed for reuse by withdrawal, and never inherited by another
  investigation.

The slug is an address. It is not canonical evidence and not a claim about the
investigation. A human-readable base may be derived from publication-facing
metadata; the minting algorithm and collision handling are implementation
detail, and the semantic requirement is stable identity.

### Exact version addresses are citation-grade

`/xray/{slug}/v{n}` means *the public presentation state of this exact
committed version*. It never means "whatever is current now". It follows the
publication history of that exact version:

| State | Response |
| --- | --- |
| never published | `NOT_PUBLIC` |
| currently presented | immutable version N |
| currently withdrawn | 410 tombstone |
| withdrawn then republished | version N again, with event history preserved |

Publishing v2 does not change the content or availability of published v1.

### The alias follows publication events, never commit arithmetic

`/xray/{slug}` resolves from publication event history alone. It must never
consult `latestCommittedVersion`, and it is **not** "the numerically highest
published version" — that definition would break deliberate rollback.

The alias points at the **current presentation head**: the version selected by
the latest deliberate publication-state act.

```text
publish v1        → alias presents v1
commit v2         → alias still presents v1
publish v2        → alias presents v2
withdraw v2       → alias presents v2 tombstone
publish v1 again  → alias presents v1
publish v2 again  → alias presents v2
```

The last two steps are deliberate rollback and republication, not fallback.
Withdrawing the current head never makes the resolver search backward for
another published version; the alias stays bound to the withdrawn head until a
principal acts again.

The alias is a convenience address; the exact version URL is the citation-grade
one. Public projections and share surfaces identify the exact version they
represent and expose its exact-version URL even when the reader arrived through
the alias.

### Address non-leakage

A slug is not publicly allocated merely because an internal investigation
exists. Before first publication an internal id may exist, committed versions
may exist, and a slug candidate may even be computable internally — the public
resolver still returns `NOT_PUBLIC` and reveals nothing about draft state. See
[ADR-0015](../adr/0015-public-retrieval-is-a-separate-trust-boundary.md).

---

## Public retrieval resolves publication first

**Recorded 2026-09-20 · #9 decision D7 ·
[ADR-0015](../adr/0015-public-retrieval-is-a-separate-trust-boundary.md).**

#8's `getInvestigationGraph` answers an internal storage question and keeps its
meaning. Public retrieval is a separate resolver asking a different one, and
the ordering is an invariant:

```text
public address
    ↓
publication history
    ├─ never published / unknown      → NOT_PUBLIC
    ├─ currently withdrawn            → WITHDRAWN + tombstone
    └─ currently published version N  → read immutable committed N → project
```

A committed graph is never reconstructed and then tested for publication.
Reversed, the seam would have crossed the draft boundary before deciding the
caller was not entitled to the graph.

---

## What a cached public X-Ray contains

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

## Cache boundary

**Recorded 2026-09-20 · #9 decision D4 ·
[ADR-0016](../adr/0016-cache-the-version-projection-not-the-response.md).**

**The cached unit is the version projection keyed `(investigationId, version)`
— never the public route response.**

A version is immutable as canonical research state. Its *presentation state* is
not: an exact-version address can go from serving content to serving a 410
tombstone the moment a principal withdraws it. Caching the response would cache
the one thing that can change.

| Surface | Posture |
| --- | --- |
| Exact immutable projection `(investigationId, version)` | Next.js function cache, long-lived |
| Alias `/xray/{slug}` | fresh resolution every request |
| Published alias | **temporary** redirect to the exact version address |
| Withdrawn alias | tombstone; no predecessor fallback |
| Exact-version route | fresh publication-state check, then cached projection only if still publishable |
| Library and search membership | fresh; may reuse the cached projection internally |

The redirect is temporary because a permanent one is cached by clients and
would outlive a withdrawal.

Nothing that can change on withdrawal may be embedded in the cached projection.

---

## The public library

Published X-Rays are indexed and browsable. The library is a projection of
**published** investigations: it carries identity, surface source, protocol
version, investigation date, and the counts of claims, receipts and open gaps.

Counts shown in the library are **derived from the graph**, never stored
alongside it. A stored count is a second source of truth that will drift.

**Amended 2026-09-20 · #9 decisions D5/D6.**

### The library is a projection of published versions, not a table of display fields

```text
publication history
    ↓ selects the publicly presentable version
immutable committed graph
    ↓
library projection
```

The same ordering as public retrieval applies: publication eligibility resolves
first, and only published version graphs are read. The library never reads all
committed investigations and filters afterwards, so a committed-but-unpublished
investigation contributes **nothing**.

No canonical library row. Title, publisher, protocol version and research
cutoff come from the published graph projection; claim, receipt, source,
independent-origin and open-gap counts are derived from it; version-change
counts come from `InvestigationVersion`; presentation state comes from
publication history. If a stored card ever disagreed with the graph, the graph
wins — and in v1 no such stored card exists.

### Projection cost — derive first, index only on measured need

v1 reconstructs and projects published entries on demand. If measured cost
later justifies a read model, it may exist only as derived infrastructure:

1. rebuildable entirely from publication history plus immutable versions;
2. never accepted as canonical evidence or publication state;
3. carrying source publication and version identity, so staleness is detectable;
4. deletable and regenerable without information loss;
5. any disagreement with the canonical projection is an index bug, not a
   competing truth.

That is the status of a CDN artifact, not of a domain record.

### Withdrawal and library membership

A currently withdrawn version is not an ordinary browsable entry. Its history
stays reachable through its known public URL and tombstone — the library exists
for discovery of currently presented X-Rays, not discovery of takedowns.
Republishing restores membership.

**No automatic library transition may be triggered by re-graduation or
capability state.** Only publication-state events move public membership.

### Search scope

#9 search covers library and publication projection fields only: public title,
surface publisher or source identity, protocol version, investigation date,
exact slug, presentation state where relevant to administration, and other
explicit library-card metadata later accepted into the projection. Filters may
use derived numeric counts, which do not become canonical by being filtered on.

Explicitly **out of scope**: free-text search over claim text, evidence
propositions, finding prose, gap prose, source passages or reviewer output.
That is a research-discovery surface with different indexing, leakage and
ranking semantics.

The leakage argument is the decisive one: a search engine can reveal text even
when the page resolver correctly answers `NOT_PUBLIC`. Keeping search at
publication metadata is what makes ADR-0015's non-leakage enforceable end to
end. Any future index must be built **after** publication filtering:

```text
publication resolver → discoverable publications → library projection → optional index
```

never over all committed graphs with public filtering applied afterwards.

### Featured content

Featured selection should eventually draw from the published library surface
rather than the benchmark registry. How something becomes featured is not
publication semantics; unless a curated-feature event is added later, v1 may
omit featured selection or derive a deterministic default. Editorial ranking is
not smuggled into the publication record.

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
