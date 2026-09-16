# X-Ray Documentation

> **Verdicts expire. Receipts compound.**

Start here. This page explains the documentation topology; you should be able
to find anything below in under five minutes.

---

## 1. What X-Ray is

X-Ray is **civic research infrastructure**, not a truth oracle.

Given a public claim — from a news article, speech, report or official
statement — X-Ray reconstructs the evidence underneath it: what was actually
asserted, what independently testable claims it decomposes into, what records
support or challenge them, which of those records are genuinely independent,
what the evidence can and cannot establish, what is missing, and what would
settle it.

It does not tell citizens whether a statement is true. It makes the chain
between a claim and its evidence **inspectable**.

The core loop:

```text
CLAIM → RECEIPTS → PROVENANCE → CHALLENGE → RECONCILIATION
      → WHAT CAN WE ESTABLISH? → WHAT CAN'T WE? → WHAT WOULD SETTLE IT? → ACT
```

The one architectural commitment everything else follows from: **canonical
state is a versioned evidence graph, not generated prose**
([ADR-0001](./adr/0001-evidence-graph-canonical-state.md)).

---

## 2. Where to read the architecture

**→ [`architecture/`](./architecture/README.md)** — System Architecture v0.1,
split by concern.

| Document | Answers |
| --- | --- |
| [system-overview](./architecture/system-overview.md) | What is X-Ray; the thesis; the boundary; the north star |
| [evidence-graph](./architecture/evidence-graph.md) | What canonical state *is*; Source vs Evidence; provenance; measurement |
| [domain-model](./architecture/domain-model.md) | Every canonical artifact and its exact shape |
| [research-pipeline](./architecture/research-pipeline.md) | How state is produced; stage contracts; saturation; model boundary |
| [validation-and-invariants](./architecture/validation-and-invariants.md) | XR-INV-001 … XR-INV-012; structural / referential / epistemic validation |
| [runtime-architecture](./architecture/runtime-architecture.md) | Web, API, adapters, PostgreSQL; implementation boundaries |
| [investigation-versioning](./architecture/investigation-versioning.md) | Immutable snapshots; new receipts; affected-claim re-evaluation |
| [publication-and-cache](./architecture/publication-and-cache.md) | Cached public X-Rays; the synthesis boundary |

**If you read only two:** `evidence-graph.md` and
`validation-and-invariants.md`. They carry the actual commitments. Everything
else follows from them.

---

## 3. Where the research protocol lives

**→ [`protocol/v0.1/`](./protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md)**

| File | What it is |
| --- | --- |
| [XRAY_RESEARCH_PROTOCOL_v0.1.md](./protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md) | The research method: ten principles and the stage-by-stage procedure |
| [XRAY_RESEARCH_ACTION_PROMPT_v0.1.md](./protocol/v0.1/XRAY_RESEARCH_ACTION_PROMPT_v0.1.md) | The prompt used to execute a run |

The protocol is the **method**; the architecture is the **system that
enforces it**. Invariants exist because a protocol principle needed to hold
regardless of which model executes it
([ADR-0005](./adr/0005-epistemic-invariants-outside-prompts.md)).

Protocol v0.1 is preserved as written. Architecture v0.1 targets Protocol
v0.2, which does not exist yet.

---

## 4. Where benchmark evidence lives

**→ [`benchmarks/XRAY-KE-001/`](./benchmarks/XRAY-KE-001/README.md)**

XRAY-KE-001 is the reference benchmark the architecture was derived from: two
independent protocol runs (Claude and GPT) against one Citizen Digital
article, research cutoff 2026-09-13.

- [README](./benchmarks/XRAY-KE-001/README.md) — purpose, source, cutoff, core claims, why two models
- [raw/claude-run.md](./benchmarks/XRAY-KE-001/raw/claude-run.md) — **immutable**
- [raw/gpt-run.md](./benchmarks/XRAY-KE-001/raw/gpt-run.md) — **immutable**

The raw runs are frozen historical evidence. They are never edited,
reformatted, or regenerated — not even to fix something now known to be wrong
([ADR-0009](./adr/0009-benchmark-runs-as-acceptance-evidence.md)).

Where the two runs **disagreed**, the disagreement became an invariant. That
is the origin of
[XR-INV-005](./architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule).

---

## 5. Where ADRs live

**→ [`adr/`](./adr/README.md)** — nine decisions, `Status / Context /
Decision / Consequences`.

| | | | |
| --- | --- | --- | --- |
| [0001](./adr/0001-evidence-graph-canonical-state.md) Evidence graph is canonical | [0002](./adr/0002-staged-research-pipeline.md) Staged pipeline | [0003](./adr/0003-relational-store-first.md) Relational store first | [0004](./adr/0004-model-adapter-boundary.md) Model behind adapter |
| [0005](./adr/0005-epistemic-invariants-outside-prompts.md) Invariants outside prompt | [0006](./adr/0006-immutable-investigation-versions.md) Immutable versions | [0007](./adr/0007-gap-first-class-state.md) Gap is first-class | [0008](./adr/0008-ati-resolution-adapter.md) ATI is an adapter |
| [0009](./adr/0009-benchmark-runs-as-acceptance-evidence.md) Benchmarks as acceptance evidence | | | |

---

## 6. Where calibration lives

**→ [`calibration/`](./calibration/README.md)** — six worked cases and six
failure modes.

The protocol says what to do. The invariants say what is representable and what
is forbidden. Calibration says **which answer is right when the rule permits
two** — the judgment two competent models disagreed on.

| | |
| --- | --- |
| [cases/](./calibration/cases) | CAL-001 … CAL-006, each grounded in canonical XRAY-KE-001 ids |
| [failure-modes/](./calibration/failure-modes) | FM-001 … FM-006, written to recur outside this benchmark |

Calibration cases are **not source-of-truth facts**. They are regression
examples for reasoning behaviour, and they do not override evidence in a live
investigation.

---

## 7. Where engineering and acceptance design lives

**→ [`engineering/`](./engineering/build-order.md)**

| Document | What it is |
| --- | --- |
| [acceptance-fixtures.md](./engineering/acceptance-fixtures.md) | What the XRAY-KE-001 suite must assert; required reconciliations; forbidden inferences |
| [v0-scope.md](./engineering/v0-scope.md) | What v0 builds — and what it deliberately does not |
| [build-order.md](./engineering/build-order.md) | The 15-step build order and the 14-point definition of done |

These are **design documents**. No executable fixtures exist yet. The
acceptance suite is step 6 of the build order; making it green is step 12.

---

## Documentation map

```text
docs/
├── README.md                   ← you are here
├── architecture/               System Architecture v0.1, split by concern
├── protocol/v0.1/              The research method (preserved as written)
├── adr/                        ADR-0001 … ADR-0009
├── benchmarks/XRAY-KE-001/     Reference benchmark + immutable raw runs
├── calibration/                Worked judgment cases + recurring failure modes
└── engineering/                Acceptance design, scope, build order
```

---

## Conventions

**Versioning.** Architecture is v0.1. Protocol is v0.1. They version
independently; Architecture v0.1 targets a Protocol v0.2 that does not exist
yet.

**Amendments.** Scaffold reconciliation on 2026-09-15 produced five
clarifications to Architecture v0.1. They are recorded inline where they
apply, marked as clarifications, and indexed in
[validation-and-invariants § Architecture v0.1 clarifications](./architecture/validation-and-invariants.md#architecture-v01-clarifications).
They are **not** Protocol v0.2.

**Immutability.** Anything under `benchmarks/*/raw/` and `protocol/*/` is
historical evidence: preserved, never rewritten. Corrections go into analysis
documents, never into the artifacts. This is the same rule the system applies
to its own investigations
([ADR-0006](./adr/0006-immutable-investigation-versions.md)).

**Status.** Architecture v0.1 is *Proposed*. Engine v0.1 is not built. A UI
scaffold exists and is a visual prototype only — it does not implement the
canonical domain model.
