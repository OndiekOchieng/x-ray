# Architecture Decision Records

Nine decisions define X-Ray's architecture. Each was made in
`X-Ray System Architecture v0.1` §37 and is recorded here in full form
(Status / Context / Decision / Consequences).

ADR-0001 through ADR-0009 restate decisions already present in System
Architecture v0.1 §37. ADR-0010 onward record decisions made after it.
Context and Consequences for the first nine are derived from material already
present in v0.1; where scaffold reconciliation
(2026-09-15) clarified a decision's consequences, that is marked inline as a
**v0.1 clarification**.

| ADR | Decision | In one line |
| --- | --- | --- |
| [0001](./0001-evidence-graph-canonical-state.md) | Evidence Graph Is Canonical State | Structured artifacts are the record; reports are projections. |
| [0002](./0002-staged-research-pipeline.md) | Pipeline Over Monolithic Agent | Research runs as independently persisted stages. |
| [0003](./0003-relational-store-first.md) | Relational Store First | PostgreSQL; graph semantics via IDs and edge tables. |
| [0004](./0004-model-adapter-boundary.md) | Model Behind Adapter | Protocol stays provider-independent; v1 may use one provider. |
| [0005](./0005-epistemic-invariants-outside-prompts.md) | Invariants Outside Prompt | Epistemic rules are validated in code, not asked for in prompts. |
| [0006](./0006-immutable-investigation-versions.md) | Immutable Investigation Versions | New receipts create versions; history is never rewritten. |
| [0007](./0007-gap-first-class-state.md) | Gap Is First-Class Product State | Missing evidence is persisted, displayed, and actionable. |
| [0008](./0008-ati-resolution-adapter.md) | ATI Is a Resolution Adapter | Only `PUBLIC_RECORD_REQUEST` gaps produce an ATI draft. |
| [0009](./0009-benchmark-runs-as-acceptance-evidence.md) | Benchmark Runs Are Acceptance Evidence | Raw runs are frozen; tests target epistemic behaviour, not prose. |
| [0010](./0010-research-retrieval-boundary.md) | Retrieval Is a Separate Boundary From Extraction | A search provider returns material and retrieval metadata; stages mint Evidence. |

## Numbering

v0.1 numbered these `ADR-001` … `ADR-009`. This directory uses four-digit
`ADR-0001` … `ADR-0009` for sort stability. The mapping is one-to-one and
recorded in each file's header.

## Adding an ADR

Next number is `0011`. Use the same four sections, and state Status as
`Proposed` until accepted. An ADR that replaces an earlier one sets
`Supersedes:` and the superseded ADR is marked `Superseded by:` rather than
deleted — the same preservation rule the system applies to its own findings
([ADR-0006](./0006-immutable-investigation-versions.md)).
