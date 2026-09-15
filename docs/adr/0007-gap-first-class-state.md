# ADR-0007 — Gap Is First-Class Product State

**ADR:** 0007 (v0.1: ADR-007)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-007; see also §14, XR-INV-006, XR-INV-008)
**Supersedes:** —

## Context

When X-Ray cannot establish a claim, the reason is usually a specific missing
record. Two failure modes follow from treating that as an absence rather than
an object: the gap is hidden from the reader, or it is converted into a
negative finding.

Both are unacceptable. A missing record is a research result.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Missing evidence is persisted, displayed and potentially actionable.

Missing evidence is persisted, displayed and potentially actionable. `Gap` is
a first-class artifact with its own identity, claims, resolving evidence,
likely holder, status and resolution path
([Gap](../architecture/domain-model.md#gap)).

## Consequences

- Every unresolved material claim exposes the gap preventing resolution, and
  synthesis may not hide it
  ([XR-INV-008](../architecture/validation-and-invariants.md#xr-inv-008--gap-preservation)).
- Failure to locate a record is recorded as `NOT_LOCATED`, never as
  `DOES_NOT_EXIST`
  ([XR-INV-006](../architecture/validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence)).
- A gap carries what would settle it, which turns an absence into a next
  action and makes ADR-0008 possible.
- **v0.1 clarification (2026-09-15):** `likelyHolder` carries
  `basis: CONFIRMED | INFERRED`, and a gap may carry `identifiers[]` so a
  public-record request can be specific.
- **v0.1 clarification (2026-09-15):** an unresolved gap MUST NOT be
  transformed into an implication of wrongdoing by any sharing surface
  ([responsible sharing](../architecture/publication-and-cache.md#responsible-sharing)).
