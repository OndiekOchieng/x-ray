# ADR-0005 — Invariants Outside Prompt

**ADR:** 0005 (v0.1: ADR-005)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-005; see also §4, §18)
**Supersedes:** —

## Context

The benchmark runs demonstrated that two competent models, given the same
protocol, disagreed on a grade: Claude returned `CONTRADICTED / MEDIUM` and
GPT returned `INSUFFICIENT_EVIDENCE / HIGH` for the same claim — while both
independently identified the same underlying measurement problem.

If epistemic rules live only in prompt wording, compliance is a model
behaviour and varies per provider, per run, and per prompt revision. It cannot
be regression-tested.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Critical epistemic rules are validated programmatically where feasible.

Validate critical epistemic rules programmatically where feasible, outside the
prompt.

LLM output does not enter canonical state directly. It passes structural,
referential and epistemic validation, and may be accepted, rejected or
repaired ([validation layer](../architecture/validation-and-invariants.md#validation-layer)).

## Consequences

- XR-INV-001 … XR-INV-012 become software, not instructions.
- A grade of `CONTRADICTED` derived from measurement-incompatible evidence is
  rejected by the validator rather than argued with in a prompt
  ([XR-INV-005](../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)).
- Invariant compliance is regression-testable — see
  [acceptance-fixtures.md](../engineering/acceptance-fixtures.md).
- Requires the domain model to carry the fields invariants check against, most
  notably [Measurement](../architecture/domain-model.md#measurement) and
  [SourceDependency](../architecture/domain-model.md#sourcedependency). An
  invariant cannot be enforced over data the model does not represent.
- Some rules ("name the mechanism, not the moral") remain prompt-level. The
  decision is "where feasible", not "everywhere".
