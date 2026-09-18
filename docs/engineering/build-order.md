# Build Order and Definition of Done

**Source:** `X-Ray System Architecture v0.1` §38, §39
**Status:** Design document

---

## Build order

```text
1. Freeze benchmark inputs/runs
             ↓
2. Protocol v0.2
             ↓
3. TypeScript domain types
             ↓
4. JSON schemas
             ↓
5. Fixture validator
             ↓
6. XRAY-KE-001 acceptance suite
             ↓
7. Pipeline interfaces
             ↓
8. Model adapter
             ↓
9. Research adapter
             ↓
10. Persistence
             ↓
11. Execute XRAY-KE-001
             ↓
12. Make acceptance suite green
             ↓
13. Evidence graph UI
             ↓
14. Cached public X-Ray
             ↓
15. Gap → ATI draft
```

The first end-to-end milestone is not:

> “The website looks good.”

It is:

> **A fresh XRAY-KE-001 run can traverse the pipeline, persist a valid evidence graph, and pass the benchmark-derived acceptance suite.**

Only then is the engine real.

### Sequencing amendment — 2026-09-18

The order above was written before the validator, Reviewer and graduation gate
existed. Those were built first, out of order, and that turned out to be the
right call: each one constrains what the pipeline is allowed to produce, and
building them afterwards would have meant retrofitting.

Two deliberate departures now stand:

- **Step 2, Protocol v0.2, is not being authored.** Execution runs against
  frozen Protocol v0.1, which is complete and stage-by-stage. Authoring v0.2 to
  unblock the pipeline would be documentation written to satisfy a sequence
  rather than a need. If executable work reveals protocol changes, they are
  specified explicitly rather than by rewriting a frozen document (#6, D12).
- **Steps 7–9 — pipeline interfaces, model adapter, research adapter — are
  sequenced as [6a–6d](./pipeline-implementation-plan.md)** rather than as three
  linear steps, because the adapter boundaries and the stage contracts have to
  be settled together to be coherent.

The dependency spine in issue #1 is the live sequencing authority.

### Where we are

Steps 1–2 are in progress. The benchmark inputs and both raw runs are frozen
under [benchmarks/XRAY-KE-001/raw/](../benchmarks/XRAY-KE-001/raw/) and
Protocol v0.1 is preserved under
[protocol/v0.1/](../protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md).

Note that step 13, *evidence graph UI*, comes **after** step 12, *make
acceptance suite green*. A UI scaffold exists ahead of that order; it is a
visual prototype, not an implementation of steps 3–12, and the canonical
domain types (step 3) have not been built.

---

## Definition of done — Engine v0.1

X-Ray Engine v0.1 is complete when:

1. a URL can create an Investigation;
2. claims are persisted independently from prose;
3. sources and extracted evidence are distinct objects;
4. source dependency can represent common origins;
5. discrepancies are reconciled before contradiction;
6. disconfirmation is recorded for load-bearing claims;
7. measurement incompatibility prevents invalid contradiction;
8. findings retain support, challenge, gaps and overturn conditions;
9. missing records remain explicit;
10. eligible gaps can produce an ATI draft;
11. completed investigations can be cached;
12. new evidence can produce a new investigation version;
13. XRAY-KE-001 acceptance fixtures pass;
14. the citizen-facing X-Ray can be generated entirely from canonical structured state.

### How each criterion is verified

| # | Criterion | Verified by |
| --- | --- | --- |
| 1 | URL creates an Investigation | pipeline INGEST stage run |
| 2 | Claims persisted independently of prose | [ADR-0001](../adr/0001-evidence-graph-canonical-state.md) |
| 3 | Sources and evidence are distinct objects | [evidence-graph.md](../architecture/evidence-graph.md#source-is-not-evidence) |
| 4 | Source dependency represents common origins | [source dependency fixture](./acceptance-fixtures.md#source-dependency-fixture) |
| 5 | Discrepancies reconciled before contradiction | [reconciliation fixture](./acceptance-fixtures.md#required-reconciliation-fixture) |
| 6 | Disconfirmation recorded for load-bearing claims | [saturation conditions](../architecture/research-pipeline.md#research-saturation) |
| 7 | Measurement incompatibility prevents invalid contradiction | [same-measure fixture](./acceptance-fixtures.md#same-measure-acceptance-fixture) |
| 8 | Findings retain support, challenge, gaps, overturn conditions | [XR-INV-007](../architecture/validation-and-invariants.md#xr-inv-007--findings-must-be-reversible) |
| 9 | Missing records remain explicit | [XR-INV-008](../architecture/validation-and-invariants.md#xr-inv-008--gap-preservation) |
| 10 | Eligible gaps produce an ATI draft | [ADR-0008](../adr/0008-ati-resolution-adapter.md) |
| 11 | Completed investigations can be cached | [publication-and-cache.md](../architecture/publication-and-cache.md) |
| 12 | New evidence produces a new version | [investigation-versioning.md](../architecture/investigation-versioning.md) |
| 13 | XRAY-KE-001 acceptance fixtures pass | [acceptance-fixtures.md](./acceptance-fixtures.md#first-acceptance-suite) |
| 14 | Citizen-facing X-Ray generated entirely from canonical state | [XR-INV-011](../architecture/validation-and-invariants.md#xr-inv-011--synthesis-cannot-mutate-evidence) |

---

## Related

- [v0 scope](./v0-scope.md) — what is deliberately not built
- [Acceptance fixtures](./acceptance-fixtures.md)
- [Research pipeline](../architecture/research-pipeline.md)
