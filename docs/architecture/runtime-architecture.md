# Runtime Architecture

**Source:** `X-Ray System Architecture v0.1` §20
**Architecture version:** 0.1
**Status:** Proposed

What X-Ray v1 actually runs on, and — equally normative — what it does not.

---

## Topology

For V1:

```text
┌──────────────────────────────────────┐
│               WEB                    │
│                                      │
│ Next.js                              │
│                                      │
│ URL input                            │
│ investigation progress               │
│ evidence graph                       │
│ gap cards                            │
│ ATI draft                            │
│ cached/public X-Ray                  │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│             X-RAY API                │
│                                      │
│ investigation lifecycle              │
│ pipeline orchestration               │
│ validation                           │
│ persistence                          │
└───────┬──────────────────────┬───────┘
        │                      │
        ▼                      ▼
┌───────────────┐       ┌───────────────┐
│ MODEL ADAPTER │       │SEARCH/RESEARCH│
│               │       │    ADAPTER    │
│ GPT initially │       │               │
└───────┬───────┘       └───────┬───────┘
        │                       │
        └───────────┬───────────┘
                    ▼
          ┌──────────────────┐
          │   PostgreSQL     │
          │                  │
          │ investigations   │
          │ claims           │
          │ sources          │
          │ evidence         │
          │ source_edges     │
          │ discrepancies    │
          │ disconfirmation  │
          │ findings         │
          │ gaps             │
          │ ati_requests     │
          │ stage_runs       │
          └──────────────────┘
```

No graph database is required for V1.

No microservices are required.

No message broker is required.

No multi-model orchestration is required.

---

## PostgreSQL first

Graph semantics are represented through IDs and edge tables in a relational
store. The evidence graph is a *graph by structure*, not by storage engine.

See [ADR-0003](../adr/0003-relational-store-first.md).

The tables listed above map to the artifacts in
[domain-model.md](./domain-model.md); `source_edges` is
[SourceDependency](./domain-model.md#sourcedependency).

---

## Implementation boundaries

These exclusions are decisions, not deferrals:

| Excluded from v1 | Because |
| --- | --- |
| Graph database | Edge tables in PostgreSQL are sufficient at v1 scale — [ADR-0003](../adr/0003-relational-store-first.md) |
| Microservices | One API surface; stages are persisted units of work, not services — [ADR-0002](../adr/0002-staged-research-pipeline.md) |
| Message broker | Stage orchestration is in-process and resumable from `StageRun` state |
| Multi-model orchestration | Methodology is model-agnostic; the runtime needs one provider behind an adapter — [ADR-0004](../adr/0004-model-adapter-boundary.md) |

The two adapter boundaries — model and search/research — are the only points
where provider-specific logic is permitted. The model interface is specified
in [research-pipeline.md](./research-pipeline.md#model-boundary).

The full product-level scope boundary is
[engineering/v0-scope.md](../engineering/v0-scope.md).

---

## Related

- [Research pipeline](./research-pipeline.md) — what the API orchestrates
- [Investigation versioning](./investigation-versioning.md) — what persistence must preserve
- [Publication and cache](./publication-and-cache.md) — what the web tier serves
