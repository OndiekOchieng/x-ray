# ADR-0010 — Retrieval Is a Separate Boundary From Extraction

**ADR:** 0010
**Status:** Accepted
**Date:** 2026-09-18
**Source:** Pipeline pre-implementation investigation (#6, decision D7)
**Supersedes:** —

## Context

The runtime diagram names two adapters — a model adapter and a search/research
adapter — and the build order lists the research adapter as its own step. Only
the first has ever been specified. [ADR-0004](./0004-model-adapter-boundary.md)
governs what a model may return; nothing has governed what a *retrieval*
provider may return.

That gap matters more than it looks, because retrieval sits directly upstream of
the rule that most of the evidence model depends on.

`XR-INV-006` forbids treating a record X-Ray could not obtain as evidence that
the record does not exist, and the fixture rule derived from it is stricter
still: **evidence may only be extracted from a record actually obtained.** The
validator enforces this
(`XR-INV-006/EVIDENCE_FROM_UNOBTAINED_SOURCE`, an ERROR), and the whole
Source / Evidence / EvidenceProvenance separation established in #2 rests on it:
`Evidence.sourceId` is the record *inspected*, while the originating record it
derives from is carried by `EvidenceProvenance`.

If a retrieval provider were permitted to return extracted propositions, it
would decide — outside the trust boundary — which record a proposition came
from, whether that record was obtained, and what may be quoted from it. Three
invariants would then depend on a provider's good behaviour rather than on
validation: XR-INV-006 (missing is not negative), XR-INV-004 (repetition is not
corroboration), and XR-INV-001 (the surface source does not corroborate itself).

## Decision

**Retrieval and extraction are separate boundaries. A research/search adapter
discovers and retrieves source material. It never mints Evidence.**

The adapter returns retrieved material plus honest retrieval metadata:

- what was asked for;
- what was found, as documents or document references;
- for each, whether it was actually obtained, partially obtained, identified but
  not obtained, searched for and not located, or a dead link;
- where it came from and when it was retrieved.

The executable stage that requested the retrieval — `TRACE` for evidence,
`PROVENANCE` for lineage — then decides:

- whether a proposition may be drawn from the material at all;
- which canonical `Source` the material becomes, and its `evidenceClass`,
  `originStatus` and `accessibility`;
- whether a passage may be quoted;
- what `EvidenceProvenance` records about the originating record.

A provider reports **what it reached**. The stage decides **what that means**.

This is the same shape as ADR-0004's amendment, applied to the other adapter:
providers produce raw material and honest metadata; stages produce canonical
artifacts.

## Consequences

- `XR-INV-006` stays enforceable, because whether a record was obtained is
  reported as retrieval metadata and checked by the stage, not asserted by a
  provider that has an incentive to appear productive.
- A provider cannot cause `Evidence` to exist for a record nobody read, and
  cannot attach a quoted passage to an unobtained source — both are validator
  ERRORs, and the boundary keeps them reachable.
- `EvidenceProvenance` is decided by the stage, so XR-INV-004's independence
  accounting is not delegated. A provider cannot declare two publications
  independent.
- The adapter may return material the stage then declines to use. That is a
  normal outcome, not a failure — and it is how a `NOT_LOCATED` search becomes a
  `Gap` rather than disappearing.
- Search providers become swappable on the same terms as model providers: the
  domain contracts do not move.
- The adapter is permitted to be non-deterministic. Determinism where it matters
  — canonical identity under retry — is a stage property (D5), not a provider
  property.
- `#6` defines this interface and ships no implementation of it. Provider wiring
  is out of scope for the slice that defines the boundary, exactly as with
  `ReviewerModel` in #4.
