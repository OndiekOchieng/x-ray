# CAL-004 — Not located is not nonexistent

**ID:** CAL-004
**Name:** Not located is not nonexistent
**Anchor:** `GAP-001` (variation orders), `SRC-017` (unobtained origin)
**Governing invariant:** [XR-INV-006](../../architecture/validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence)
**Related failure mode:** [FM-004](../failure-modes/FM-004-absence-to-nonexistence.md)

---

## Why this case exists

This is the failure with the worst consequences outside the system.

"We could not find the variation order" is a statement about a search. "No
variation order exists" is a statement about the world, and in a civic context
it is an accusation — of irregular procurement, of concealment, of a figure
invented from nothing. The step between them is one word long and entirely
unearned.

The domain makes the bad state unreachable: `SourceAccessibility` has no
`DOES_NOT_EXIST` member, and none may be added.

## Fixture references

| Kind | Ids |
| --- | --- |
| Gap | `GAP-001` — derivation of KSh 16.7bn; `searchAlreadyAttempted` lists five search avenues |
| Unobtained origins | `SRC-009`, `SRC-011`, `SRC-015`, `SRC-017` — all `NOT_RETRIEVED` |
| Related gaps | `GAP-002`, `GAP-004`, `GAP-005`, `GAP-006` |
| Finding | `FND-C002` (`UNRESOLVED / HIGH`) |
| Disconfirmation | `DCF-002` |

## Situation

Tracing `C002` required a record explaining how the project value reaches
KSh 16.7 billion. The runs searched KeNHA tender award notices across four
quarters, Auditor-General reports, Treasury estimates and sector reports, and
securitisation reporting by project.

No variation order, revised contract schedule or price-adjustment record was
found. Separately, a Lot 3 supervision contract — which would partly account for
the difference — was not found either.

Meanwhile four *originating* records were identified and quoted but never
obtained: a ministry scope statement (`SRC-009`), a KeNHA regional briefing
(`SRC-011`), a KeNHA statement to a parliamentary committee (`SRC-015`), and the
September status release (`SRC-017`).

## Wrong instinct

> We searched the procurement record thoroughly and found no variation order.
> Therefore no variation was approved, and the KSh 16.7bn figure has no
> contractual basis.

## Expected judgment

Three states, kept distinct, with a fourth that is not representable at all:

| State | Meaning | In the fixture |
| --- | --- | --- |
| `NOT_RETRIEVED` | The record is **identified or referenced** — cited, attributed, indexed — but its contents were not obtained. | `SRC-009`, `SRC-011`, `SRC-015`, `SRC-017` |
| `NOT_LOCATED` | Reasonable tracing was **attempted** and the record was not found. | representable on `Source`; in this fixture the unfound records are carried as `GAP-001` rather than as `Source` objects — see below |
| *(searched, nothing identified)* | No artifact to describe. | `Gap.missingEvidence` + `Gap.searchAlreadyAttempted` |
| `DOES_NOT_EXIST` | — | **Not representable. Never inferred.** |

`FND-C002` is `UNRESOLVED / HIGH` — high confidence that the evidence does not
settle the derivation, not confidence that the figure is baseless. `GAP-001`
stays open with its search recorded.

## Why the expected judgment follows

A failed search has two possible causes and the search cannot distinguish them:
the record does not exist, or the search did not reach it. Public records are
routinely unindexed, offline, paywalled, held in a registry with no web
presence, or simply not published. Both benchmark runs recorded reaching only
press reproductions of statements whose originals were public-facing —
`SRC-017` is a government release that nobody could obtain.

If a well-resourced search cannot reliably retrieve a release that certainly
exists, absence of retrieval is very weak evidence of absence.

`searchAlreadyAttempted` is what makes the gap honest in the other direction.
Without it, "not located" is an unfalsifiable shrug. With it, a reader can see
how far the search went and judge whether the absence is informative.

### Why the variation order has no `Source` here

A record that was never identified at all has nothing to put in a `Source`: no
title, no publisher, no URL, no retrieval attempt against a specific artifact.
The fixture therefore represents it where it belongs — as `GAP-001`'s
`missingEvidence` and `resolvingEvidence`, with the search in
`searchAlreadyAttempted`.

`NOT_LOCATED` on a `Source` is for the case where a record **is** identifiable —
a named register, a numbered notice, a cited report — and tracing still failed
to produce it. The distinction is whether you can name the artifact you did not
get.

> **Open modelling question.** Where exactly the boundary sits between "a named
> but unfound record deserves a `Source` with `NOT_LOCATED`" and "an unfound
> record is only a `Gap`" is not settled by the architecture. This fixture
> takes the conservative line: no `Source` without an identified artifact.

### The inverse error

Symmetrically: an unobtained record must not be treated as *confirming* what the
publications say about it. `SRC-017` is `NOT_RETRIEVED`, so the strength of
evidence derived from it is capped — see
[CAL-003](./CAL-003-repetition-is-not-corroboration.md).

## What evidence would change the judgment

- Locating an approved variation schedule or revised contract-price schedule →
  `GAP-001` closes and `C002` may become `SUPPORTED` or `ESTABLISHED`.
- An authoritative statement from the custodian that **no variation was
  approved** → this is positive evidence of absence, from a body in a position
  to know, and it legitimately establishes nonexistence. Note the shape: a
  *record asserting absence*, not a *failed search*.
- An Auditor-General finding that the figure lacks contractual basis → a far
  stronger claim than anything a search can support, and it would come from
  audit, not from retrieval failure.

## Related failure modes

- [FM-004 — Absence to nonexistence](../failure-modes/FM-004-absence-to-nonexistence.md)
- [FM-006 — Premature numeric reconciliation](../failure-modes/FM-006-premature-numeric-reconciliation.md)
