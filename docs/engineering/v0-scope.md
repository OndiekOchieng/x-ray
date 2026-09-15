# v0 Scope

**Source:** `X-Ray System Architecture v0.1` §36
**Status:** Normative boundary

The right-hand column is not a backlog. Items are excluded from v0 **by
decision**, and adding one is an architecture change, not a sprint choice.

---

## POC boundary

## Build

- URL ingestion
- claim decomposition
- structured research pipeline
- evidence graph
- provenance/source dependencies
- discrepancies
- disconfirmation
- findings
- gaps
- cached investigation
- evidence graph UI
- what-would-settle-it
- ATI draft for eligible public-record gaps
- XRAY-KE-001 acceptance suite

## Do Not Build

- accounts
- comments
- social network
- generic chatbot
- Kenya map
- What Changed?
- graph database
- microservices
- Kafka
- multi-model orchestration
- automated ATI submission
- broad multilingual infrastructure
- universal speech/video ingestion

---

## Why the exclusions hold

| Excluded | Reason | Reference |
| --- | --- | --- |
| Graph database, microservices, Kafka | PostgreSQL edge tables suffice at v1 scale; one API surface | [ADR-0003](../adr/0003-relational-store-first.md), [runtime](../architecture/runtime-architecture.md) |
| Multi-model orchestration | Methodology is model-agnostic; runtime needs one provider behind an adapter | [ADR-0004](../adr/0004-model-adapter-boundary.md) |
| Automated ATI submission | X-Ray drafts; a human files. `DRAFT`/`EXPORTED` must stay distinct from `SUBMITTED` | [ADR-0008](../adr/0008-ati-resolution-adapter.md) |
| Accounts, comments, social network | X-Ray is evidence infrastructure, not a platform | [north star](../architecture/system-overview.md#5-architectural-north-star) |
| Generic chatbot | The product is an inspectable chain, not a conversation | [ADR-0001](../adr/0001-evidence-graph-canonical-state.md) |

---

## The milestone that defines v0

The first end-to-end milestone is **not** "the website looks good". It is:

> A fresh XRAY-KE-001 run can traverse the pipeline, persist a valid evidence
> graph, and pass the benchmark-derived acceptance suite.

See [build-order.md](./build-order.md).

---

## Related

- [Build order and definition of done](./build-order.md)
- [Acceptance fixtures](./acceptance-fixtures.md)
- [System overview § system boundary](../architecture/system-overview.md#3-system-boundary)
