# ADR-0008 — ATI Is a Resolution Adapter

**ADR:** 0008 (v0.1: ADR-008)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-008; see also §14, §15, XR-INV-009)
**Supersedes:** —

## Context

Not every gap is answerable by an access-to-information request. Some resolve
by waiting for a scheduled record, some by field verification, some by asking
a source what it meant, some by querying a dataset.

Generating an ATI request for every gap would produce unanswerable requests,
burden institutions, and misrepresent what X-Ray had actually determined.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** ATI generation is triggered only by gaps classified `PUBLIC_RECORD_REQUEST`.

ATI generation is triggered only by gaps classified `PUBLIC_RECORD_REQUEST`.

A gap first receives a `resolutionPath`; eligibility is derived, not assumed:

```text
atiEligible = resolutionPath === PUBLIC_RECORD_REQUEST
```

ATI generation occurs after evidence grading. The model MAY draft the request;
it MUST NOT invent the name of a record the Gap Ledger has not established or
reasonably described.

## Consequences

- `ResolutionPath` is a required classification step, not an optional label
  ([XR-INV-009](../architecture/validation-and-invariants.md#xr-inv-009--action-eligibility)).
- ATI is one adapter among several resolution paths, and the others must be
  representable and presentable.
- The draft is generated prose and therefore sits below the synthesis boundary
  ([publication-and-cache.md](../architecture/publication-and-cache.md#ati-drafts-are-a-synthesis-surface-too)).
- **v0.1 clarification (2026-09-15):** `DRAFT` and `EXPORTED` are
  human-reviewable and human-editable, and MUST remain visibly distinct from
  `SUBMITTED`. X-Ray does not file requests — automated submission is out of
  scope ([v0-scope.md](../engineering/v0-scope.md)).
