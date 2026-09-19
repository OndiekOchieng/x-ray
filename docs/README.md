# X-Ray Documentation

> **Verdicts expire. Receipts compound.**

Start here. This page explains the documentation topology; you should be able
to find anything below in under five minutes.

---

## 1. What X-Ray is

X-Ray is **civic research infrastructure**, not a truth oracle.

Given a public claim — from a news article, speech, report or official
statement — X-Ray reconstructs the evidence underneath it: what was actually
asserted, what independently testable claims it decomposes into, who produced
the relevant records, from what position and knowledge basis, what records
support or challenge the claims, which origins are genuinely independent,
what the evidence can and cannot establish, what is missing, and what would
settle it.

It does not tell citizens whether a statement is true. It makes the chain
between a claim and its evidence **inspectable**.

The core loop:

```text
CLAIM → SOURCE POSITION → RECEIPTS → PROVENANCE → CHALLENGE → RECONCILIATION
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

Protocol v0.3 intentionally introduces methodological requirements whose
canonical architecture impact is **not yet settled**. Issue #13 owns that
reconciliation.

---

## 3. Where the research protocol lives

**→ [`protocol/v0.3/`](./protocol/v0.3/XRAY_RESEARCH_PROTOCOL_v0.3.md)** — current for new manual investigations

| File | What it is |
| --- | --- |
| [XRAY_RESEARCH_PROTOCOL_v0.3.md](./protocol/v0.3/XRAY_RESEARCH_PROTOCOL_v0.3.md) | Current research method: source position, proposition identity, evidentiary reach, causal non-inheritance, record-producing power, and system-level falsifiability |
| [XRAY_RESEARCH_ACTION_PROMPT_v0.3.md](./protocol/v0.3/XRAY_RESEARCH_ACTION_PROMPT_v0.3.md) | Current prompt used to execute a manual v0.3 research run |
| [CALIBRATION_CANDIDATES_v0.3.md](./protocol/v0.3/CALIBRATION_CANDIDATES_v0.3.md) | Protocol-side candidates from the cross-domain v0.2 runs; executable adoption deferred to #13 |
| [Protocol v0.2](./protocol/v0.2/XRAY_RESEARCH_PROTOCOL_v0.2.md) | Frozen historical protocol used for the manual protocol-evolution runs |
| [Protocol v0.1](./protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md) | Frozen historical protocol used for XRAY-KE-001 comparability |

The protocol is the **method**; the architecture is the **system that
enforces it**. Invariants exist because a protocol principle needed to hold
regardless of which model executes it
([ADR-0005](./adr/0005-epistemic-invariants-outside-prompts.md)).

Protocol v0.1 and v0.2 remain preserved as historical evidence. Protocol v0.3
is the current manual-investigation contract.

The central v0.3 addition is:

> **Before using a record as evidence, establish who produced it, from what
> position, under what power relationship, for what purpose, how they could
> know, and what proposition the record can directly establish.**

v0.3 keeps Source Position, Knowledge Basis, Proposition Provenance, and
Source Dependency conceptually distinct. Whether and how those distinctions
become canonical graph artifacts is intentionally deferred to #13.

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

**→ [`calibration/`](./calibration/README.md)** — six executable worked cases
and six failure modes.

The protocol says what to do. The invariants say what is representable and what
is forbidden. Calibration says **which answer is right when the rule permits
two**.

| | |
| --- | --- |
| [cases/](./calibration/cases) | CAL-001 … CAL-006, each grounded in canonical XRAY-KE-001 ids |
| [failure-modes/](./calibration/failure-modes) | FM-001 … FM-006, written to recur outside this benchmark |
| [v0.3 candidates](./protocol/v0.3/CALIBRATION_CANDIDATES_v0.3.md) | PCAL-007 … PCAL-016; protocol-side candidates awaiting #13 architecture decisions |

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
| [build-order.md](./engineering/build-order.md) | Original build order and definition of done |

Current execution authority is GitHub issue
[#1 — Forge: X-Ray v1 execution tracker](https://github.com/OndiekOchieng/x-ray/issues/1),
which supersedes stale prose sequencing when the two differ.

---

## Documentation map

```text
docs/
├── README.md                   ← you are here
├── architecture/               System Architecture v0.1, pending #13 reconciliation
├── protocol/v0.3/              Current manual research contract
├── protocol/v0.2/              Frozen protocol-evolution contract
├── protocol/v0.1/              Frozen XRAY-KE-001 research method
├── adr/                        ADR-0001 … ADR-0009
├── benchmarks/XRAY-KE-001/     Reference benchmark + immutable raw runs
├── calibration/                Existing executable judgment corpus
└── engineering/                Acceptance design and engineering evidence
```

---

## Conventions

**Versioning.** Architecture and protocol version independently.
Protocol v0.1 and v0.2 are frozen historical evidence. Protocol v0.3 is current
for new manual investigations.

**Protocol / architecture boundary.** v0.3 records the research method learned
from repeated manual investigations. It does not silently mutate Architecture
v0.1. Issue #13 decides which source-position/evidentiary-reach semantics
belong in canonical domain state, Reviewer, Validator, pipeline contracts, and
persistence.

**Immutability.** Anything under `benchmarks/*/raw/` and released
`protocol/*/` is historical evidence: preserved, never rewritten after use as
a run contract. Corrections and later lessons belong in a new version.

**Status.** Architecture v0.1 remains the implemented/proposed architectural
baseline pending #13. Protocol v0.3 is the current manual research method.
