# X-Ray Architecture

System Architecture **v0.1** — status: Proposed · reference benchmark:
[XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md)

This directory is the canonical architecture. It replaces the single
`X-Ray System Architecture v0.1.md` document, split by concern with its
meaning preserved.

## Read in this order

| # | Document | Answers |
| --- | --- | --- |
| 1 | [system-overview.md](./system-overview.md) | What is X-Ray, what is the thesis, what is out of scope |
| 2 | [evidence-graph.md](./evidence-graph.md) | What the canonical state *is*; Source vs Evidence; provenance; measurement |
| 3 | [domain-model.md](./domain-model.md) | Every canonical artifact and its exact shape |
| 4 | [research-pipeline.md](./research-pipeline.md) | How that state is produced; stage contracts; saturation; model boundary |
| 5 | [validation-and-invariants.md](./validation-and-invariants.md) | XR-INV-001 … XR-INV-012 and the three validation classes |
| 6 | [runtime-architecture.md](./runtime-architecture.md) | Web / API / adapters / PostgreSQL; implementation boundaries |
| 7 | [investigation-versioning.md](./investigation-versioning.md) | Immutable snapshots; new receipts; affected-claim re-evaluation |
| 8 | [publication-and-cache.md](./publication-and-cache.md) | Cached public X-Rays; the synthesis boundary |

If you read only two: **evidence-graph.md** and
**validation-and-invariants.md**. They carry the architecture's actual
commitments.

## Where the rest lives

- **Decisions** — [../adr/](../adr/README.md) (ADR-0001 … ADR-0009)
- **Research method** — [../protocol/v0.1/](../protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md)
- **Benchmark evidence** — [../benchmarks/XRAY-KE-001/](../benchmarks/XRAY-KE-001/README.md)
- **Acceptance / scope / build order** — [../engineering/](../engineering/acceptance-fixtures.md)

## Amendments to v0.1

Scaffold reconciliation on 2026-09-15 produced five clarifications to v0.1.
They are recorded inline where they apply and indexed in
[validation-and-invariants.md § Architecture v0.1 clarifications](./validation-and-invariants.md#architecture-v01-clarifications):

1. `Gap.likelyHolder.basis: CONFIRMED | INFERRED`
2. Responsible sharing as a synthesis constraint
3. ATI `DRAFT`/`EXPORTED` visibly distinct from `SUBMITTED`; human-editable
4. `Gap.identifiers[]` for public-record request specificity
5. Correction: `Finding.confidence` stays `HIGH | MEDIUM | LOW`

Slice 2 (2026-09-15) ratified three further v0.1 clarifications, recorded in
[domain-model.md](./domain-model.md):

6. `Source.accessibility` carries `NOT_LOCATED` alongside `NOT_RETRIEVED`;
   `DOES_NOT_EXIST` is not representable
7. `TimeScope` — provisional lean shape (`from` / `to` / `asOf` / `description`)
8. `InvestigationVersion` — provisional record derived from §22 behaviour

These are v0.1 clarifications. They are **not** Protocol v0.2.

---

## Source document provenance

These documents are the split of a single predecessor file,
`X-Ray System Architecture v0.1.md`, whose header is preserved verbatim:

> # X-Ray System Architecture v0.1
> 
> **Status:** Proposed  
> **Date:** 2026-09-14  
> **System:** X-Ray Civic Evidence Engine  
> **Architecture version:** 0.1  
> **Protocol target:** X-Ray Research Protocol v0.2  
> **Reference benchmark:** XRAY-KE-001
> 
> > **Verdicts expire. Receipts compound.**
> 

The predecessor file was removed once every substantive line had a
destination in this directory. Nothing was dropped.
