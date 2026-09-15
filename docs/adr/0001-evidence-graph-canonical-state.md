# ADR-0001 — Evidence Graph Is Canonical State

**ADR:** 0001 (v0.1: ADR-001)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-001; see also §2, §23)
**Supersedes:** —

## Context

The canonical state of an X-Ray investigation could be either the generated
report or the structured artifacts underneath it.

If generated prose is canonical, then every downstream question — what
supports this claim, which sources are independent, what is missing — can only
be answered by re-reading text. Findings cannot be recomputed when new
evidence arrives, provenance cannot be counted, and invariants cannot be
checked mechanically.

The architectural thesis (§2) states that canonical state is a versioned
evidence graph composed of structured artifacts, and that citizen-facing
synthesis is a projection of it.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Store structured evidence graph; generated reports are projections.

Store the structured evidence graph as canonical state. Generated reports are
projections of that graph.

Synthesis MUST NOT become the canonical research record.

## Consequences

- Claims, sources, evidence, discrepancies, findings and gaps persist as
  addressable objects, not as passages of text.
- Findings can be recomputed when a new receipt arrives, because their
  supporting and challenging evidence are referenced by id
  ([Finding](../architecture/domain-model.md#finding)).
- Provenance becomes countable, which is what makes
  [XR-INV-004](../architecture/validation-and-invariants.md#xr-inv-004--source-independence)
  enforceable.
- A synthesis boundary must be maintained and defended in the public tier —
  see [publication-and-cache.md](../architecture/publication-and-cache.md) and
  [XR-INV-011](../architecture/validation-and-invariants.md#xr-inv-011--synthesis-cannot-mutate-evidence).
- Cost: more schema, more validation, and more engineering than emitting a
  report. Accepted deliberately.
