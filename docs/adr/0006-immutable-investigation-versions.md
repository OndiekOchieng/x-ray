# ADR-0006 — Immutable Investigation Versions

**ADR:** 0006 (v0.1: ADR-006)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-006; see also §22, XR-INV-010)
**Supersedes:** —

## Context

A civic claim's evidence changes over time. Records are published late,
requests are answered, projects complete.

If new evidence rewrites the investigation in place, the system silently
destroys what was known and missing at the time of the original research — and
with it any ability to show that a conclusion was reasonable when it was made.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** New receipts create new investigation versions rather than rewriting historical state.

New receipts create new investigation versions rather than rewriting
historical state. Completed investigations are immutable snapshots.

## Consequences

- The graph accumulates evidence instead of overwriting history. This is the
  implementation meaning of *"Verdicts expire. Receipts compound."*
- What was known, missing and concluded at each version remains retrievable
  ([XR-INV-010](../architecture/validation-and-invariants.md#xr-inv-010--historical-preservation)).
- A new receipt triggers re-evaluation only of the claims it bears on; other
  findings carry forward unchanged
  ([investigation-versioning.md](../architecture/investigation-versioning.md)).
- The public tier must serve the latest version by default while keeping
  historical versions addressable
  ([publication-and-cache.md](../architecture/publication-and-cache.md)).
- Cost: storage grows monotonically, and every artifact needs version
  affiliation.
