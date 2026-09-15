# ADR-0002 — Pipeline Over Monolithic Agent

**ADR:** 0002 (v0.1: ADR-002)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-002; see also §16, §17)
**Supersedes:** —

## Context

Research could be executed as a single long-running agent call or as a series
of discrete stages.

A monolithic agent produces one opaque result. A failure anywhere means
re-running everything, intermediate reasoning is not inspectable, and there is
no point at which output can be validated before it becomes state.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Execute research as independently persisted stages.

Execute research as independently persisted stages.

Every stage execution is recorded as a `StageRun` with its own status, input
and output artifact versions, model, timing and error
([stage contract](../architecture/research-pipeline.md#stage-contract)).

## Consequences

- Stage-level retries become possible: a TRACE failure does not require
  DECOMPOSE to rerun.
- Each stage boundary is a validation point; model output passes through
  schema, referential and epistemic checks before entering canonical state
  ([validation](../architecture/validation-and-invariants.md)).
- Stages 1–9 generate canonical research state; SYNTHESIZE and RESOLVE are
  downstream consumers, which is what makes ADR-0001's boundary
  structurally real.
- Progress is inspectable and attributable to a stage.
- Cost: orchestration, per-stage persistence and artifact versioning must be
  built before the first end-to-end run.
