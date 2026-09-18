# ADR-0010 — Retrieval Is a Separate Boundary From Extraction

**ADR:** 0010
**Status:** Accepted
**Amended:** 2026-09-18 (see *Amendment* below)
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


---

## Amendment — 2026-09-18 · what the retrieved payload contains, and how long it lives

**Status:** Accepted. Specifies the payload; the decision above is unchanged.
**Source:** Human decision D18, recorded on #6.

The decision above says the adapter returns "retrieved document/source
material" without saying what that means concretely. Implementing 6b required
it, and the answer has consequences for #7 and for republication exposure, so
it is recorded here rather than left in code comments.

### What crosses

A provider-neutral retrieved-document payload:

- the source locator or canonical URL, where one exists;
- the retrieval outcome — the same five states as `SourceAccessibility`, which
  already enumerates exactly the outcomes this ADR requires and already forbids
  a `DOES_NOT_EXIST` member;
- a retrieval timestamp and observed document metadata;
- **bounded** inspected content: a normalized extract sufficient for `TRACE`,
  not an entire document, and flagged when it was clamped;
- a content digest, computed outside provider-controlled canonical identity;
- provider diagnostics as explicitly non-canonical execution data.

### What does not

Raw provider response envelopes, SDK objects, prompts and transport metadata.
None of it may reach canonical state.

### Lifetime

For #6, retrieved content is **in-memory execution material only**. 6b invents
no durable storage and no retention period; persistence and retention policy
are #7. Recording the boundary now keeps #7's question about artifacts rather
than about a document store.

### Why bounded, and why the stage hashes

The stage needs enough passage to decide whether something may be quoted and to
anchor `locationInSource` — not the whole record. `truncated` is not cosmetic:
a stage quoting from a partial extract must know it was reading part of a
record, because that is the difference between `RETRIEVED` and `PARTIAL`.

A provider-supplied digest is advisory. The stage may recompute it from the
extract it actually received, and that value is authoritative where both exist:
a digest is worth something only to whoever computed it.
