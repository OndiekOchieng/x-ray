# ADR-0003 — Relational Store First

**ADR:** 0003 (v0.1: ADR-003)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-003; see also §20)
**Supersedes:** —

## Context

The evidence graph is a graph. That does not settle what stores it.

A graph database would match the domain vocabulary, but adds operational
surface, a second query language, and a dependency the team would carry from
day one. The v1 runtime (§20) is explicit that no graph database, no
microservices and no message broker are required.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Use PostgreSQL; graph semantics are represented through IDs and edge tables.

Use PostgreSQL. Represent graph semantics through IDs and edge tables —
`source_edges` for source dependency, id arrays and join tables for
claim/evidence/finding/gap relationships.

## Consequences

- The evidence graph is a graph **by structure**, not by storage engine.
- Referential validation reduces to foreign keys and explicit id checks.
- Transactional writes across artifacts in one investigation version are
  straightforward.
- Deep multi-hop traversal is more awkward than in a native graph store. At
  v1 investigation sizes this is acceptable; revisit only with evidence of a
  real query problem.
- Migration to a graph store later is not precluded, because the domain model
  ([domain-model.md](../architecture/domain-model.md)) is defined independently
  of storage.
