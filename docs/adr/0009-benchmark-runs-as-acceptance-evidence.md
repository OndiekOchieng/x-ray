# ADR-0009 — Benchmark Runs Are Acceptance Evidence

**ADR:** 0009 (v0.1: ADR-009)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-009; see also §3, §24, §34)
**Supersedes:** —

## Context

Two independent executions of the research protocol against the same Citizen
Digital article exist as Markdown outputs — one by Claude, one by GPT.

They could be treated as golden outputs to reproduce, or discarded as
anecdote. Neither is right. They converged on several important epistemic
behaviours and disagreed on one grade, and that disagreement is itself the
evidence that produced
[XR-INV-005](../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule).

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Claude/GPT Markdown outputs remain frozen raw benchmark artifacts; acceptance tests target their demonstrated epistemic behavior, not their prose.

Keep the Claude and GPT Markdown outputs as frozen raw benchmark artifacts.
Acceptance tests target their demonstrated **epistemic behaviour**, not their
prose.

The system is not required to reproduce either report word-for-word. It MUST
reproduce their important epistemic behaviour.

## Consequences

- Raw runs are immutable historical evidence and are never edited or
  regenerated — [benchmarks/XRAY-KE-001/raw/](../benchmarks/XRAY-KE-001/raw/).
- Acceptance is semantic rather than textual, expressed as `MUST` / `MUST NOT`
  / `MAY` rather than frozen conclusions
  ([acceptance-fixtures.md](../engineering/acceptance-fixtures.md)).
- A later model may legitimately produce a **stronger** finding if it retrieves
  stronger evidence, without failing the fixture.
- A documented model disagreement can become an architectural requirement
  instead of an unresolved prompt preference.
- Benchmark provenance must be preserved: research cutoff, protocol version
  and surface source are part of the fixture
  ([benchmark README](../benchmarks/XRAY-KE-001/README.md)).
