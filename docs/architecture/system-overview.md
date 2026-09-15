# System Overview

**Source:** `X-Ray System Architecture v0.1` §1, §2, §36, §40
**Architecture version:** 0.1
**Status:** Proposed
**Reference benchmark:** [XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md)

> **Verdicts expire. Receipts compound.**

This document states what X-Ray is, what it refuses to be, and the single
architectural commitment everything else follows from.

---

## 1. Purpose

X-Ray is a method engine for reconstructing the evidence beneath civic claims.

Given a surface source such as a news article, speech, report, or public statement, X-Ray:

1. preserves what was originally claimed;
2. decomposes the source into independently testable claims;
3. classifies ambiguities and evidence requirements;
4. traces claims toward primary or originating evidence;
5. records source provenance and dependency;
6. actively searches for disconfirming evidence;
7. reconciles apparently conflicting evidence;
8. grades what the evidence establishes;
9. exposes missing evidence;
10. identifies what would settle unresolved questions;
11. where appropriate, converts a missing public record into an actionable Access to Information request.

The system does not determine what a citizen should believe.

It reconstructs what a civic claim is standing on.

---

## 2. Architectural thesis

The canonical state of an X-Ray investigation is **not generated prose**.

It is a versioned evidence graph composed of structured artifacts.

```text
Surface Source
      │
      ▼
    Claims
      │
      ▼
 Evidence Requirements
      │
      ▼
    Evidence ◄──────── Sources
      │                  │
      │             Provenance
      │                  │
      ├──────── Source Dependencies
      │
      ▼
 Discrepancies
      │
      ▼
Disconfirmation
      │
      ▼
   Findings
      │
      ▼
     Gaps
      │
      ▼
Resolution Paths
      │
      ├── PUBLIC_RECORD_REQUEST ──► ATI Draft
      ├── WAIT_FOR_RECORD
      ├── FIELD_VERIFICATION
      ├── DATASET_QUERY
      ├── SOURCE_CLARIFICATION
      ├── EXPERT_INTERPRETATION
      └── OTHER
```

Citizen-facing synthesis is a **projection of this graph**.

It MUST NOT become the canonical research record.

The graph above is the normative shape of the system. Its node and edge
semantics — in particular the separation of `Source` from `Evidence` — are
specified in [evidence-graph.md](./evidence-graph.md).

---

## 3. System boundary

X-Ray v0 is deliberately small. The boundary is normative: items on the
right are not "later", they are **excluded from v0 by decision**.

| In scope (v0) | Explicitly not built |
| --- | --- |
| URL ingestion, claim decomposition | Accounts, comments, social features |
| Staged research pipeline | Generic chatbot |
| Evidence graph, provenance, discrepancies | Graph database, microservices, Kafka |
| Disconfirmation, findings, gaps | Multi-model orchestration |
| Cached public investigation + evidence graph UI | Automated ATI submission |
| ATI draft for eligible public-record gaps | Kenya map, "What Changed?" |
| XRAY-KE-001 acceptance suite | Broad multilingual / speech / video ingestion |

The authoritative list is [engineering/v0-scope.md](../engineering/v0-scope.md).

Three runtime exclusions are load-bearing enough to restate here: **no graph
database, no microservices, no message broker** — see
[runtime-architecture.md](./runtime-architecture.md).

---

## 4. High-level architecture

Four concerns, documented separately:

| Concern | Document |
| --- | --- |
| What the canonical state *is* | [evidence-graph.md](./evidence-graph.md), [domain-model.md](./domain-model.md) |
| How that state is *produced* | [research-pipeline.md](./research-pipeline.md) |
| What may never be *violated* | [validation-and-invariants.md](./validation-and-invariants.md) |
| What it *runs on* | [runtime-architecture.md](./runtime-architecture.md) |

State that has been produced then accumulates rather than being overwritten
([investigation-versioning.md](./investigation-versioning.md)) and is served
to the public as a projection
([publication-and-cache.md](./publication-and-cache.md)).

---

## 5. Architectural north star

X-Ray is not an AI that tells citizens whether a statement is true.

It is infrastructure for making the chain between a civic claim and its evidence inspectable.

The core loop is:

```text
CLAIM
  ↓
RECEIPTS
  ↓
PROVENANCE
  ↓
CHALLENGE
  ↓
RECONCILIATION
  ↓
WHAT CAN WE ESTABLISH?
  ↓
WHAT CAN'T WE ESTABLISH?
  ↓
WHAT WOULD SETTLE IT?
  ↓
ACT
```

And the long-term compounding loop is:

```text
INVESTIGATE
     ↓
PUBLISH X-RAY
     ↓
CACHE RECEIPTS
     ↓
EXPOSE GAP
     ↓
REQUEST RECORD
     ↓
NEW RECEIPT
     ↓
UPDATE GRAPH
     ↓
BETTER X-RAY
```

**Verdicts expire. Receipts compound.**

---

## Related

- [Domain model](./domain-model.md) — every canonical artifact
- [Evidence graph](./evidence-graph.md) — node and edge semantics
- [Validation and invariants](./validation-and-invariants.md) — XR-INV-001 … XR-INV-012
- [ADR index](../adr/README.md) — the nine decisions behind this design
