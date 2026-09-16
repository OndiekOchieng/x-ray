# CAL-005 — Scheduled is not occurred

**ID:** CAL-005
**Name:** Scheduled is not occurred
**Anchor claim:** `C004`
**Governing invariant:** [XR-INV-001](../../architecture/validation-and-invariants.md#xr-inv-001--surface-source-isolation)
**Related failure mode:** [FM-005](../failure-modes/FM-005-temporal-promotion.md)

---

## Why this case exists

Announcements are evidence of announcements. The gap between a plan and an event
is obvious when stated and disappears the moment a claim is written in the past
tense.

`C004` makes it concrete and unusually clean: the inspection was scheduled for
**14 September 2026**, and the research cutoff is **13 September 2026**. The
event is one day beyond the edge of what this investigation can see. There is no
amount of careful reading of the located record that can establish it.

## Fixture references

| Kind | Ids |
| --- | --- |
| Claim | `C004` — worded as a scheduling proposition |
| Finding | `FND-C004` (`SUPPORTED / MEDIUM`) |
| Supporting evidence | `EV-033` |
| Contextual evidence | `EV-034` |
| Gap | `GAP-003` — `WAIT_FOR_RECORD`, `atiEligible: false` |
| Disconfirmation | `DCF-004` (`SURVIVED`) |
| Surface source | `SRC-001` — yields **no** evidence for its own claims |

## Situation

The surface source says the President *is expected to visit* a number of ongoing
projects, including this road. Independent contemporaneous itinerary reporting
says the same (`EV-033`).

The investigation's research cutoff is 2026-09-13. The visit is scheduled for
the following day.

The itineraries do not fully agree: one describes a four-day tour covering
13–17 September where the surface source describes five days, and county orders
differ (`EV-034`).

## Wrong instinct

Two versions, both wrong:

> **(a)** Multiple outlets report the inspection. The President inspected the
> road — grade it `SUPPORTED`.
>
> **(b)** The tour is well documented and the visit was clearly going ahead, so
> treat occurrence as established and move on.

Version (b) is the dangerous one, because it feels like reasonable inference
rather than a category error.

## Expected judgment

```text
C004        "The President was scheduled or expected to inspect the road
             project during the September 2026 Nyanza tour."

FND-C004    status:     SUPPORTED
            confidence: MEDIUM

GAP-003     post-event evidence of occurrence
            resolutionPath: WAIT_FOR_RECORD
            atiEligible:    false
```

The claim text is **scoped to scheduling**. Occurrence is not a stronger version
of this claim — it is a different proposition, and it has its own gap.

## Why the expected judgment follows

The located evidence attests to an itinerary. An itinerary is a statement of
intention by its publisher, and intentions are revised: visits are cancelled,
reordered, delegated, shortened. The corpus even shows the itineraries
disagreeing with each other about the tour's length and order (`EV-034`), which
is why confidence is `MEDIUM` rather than `HIGH`.

Nothing published on or before 2026-09-13 can report an event of 2026-09-14.
Grading occurrence would require evidence dated after the cutoff, which the
fixture forbids and an integrity check enforces.

### Scoping the claim is the real work

The decisive move happens at decomposition, not grading. The surface passage
says *expected to visit*; the claim preserves that. Had `C004` been written as
*the President inspected the road*, every subsequent stage would have been
grading the wrong proposition — and a `SUPPORTED` finding on it would have been
defensible on the evidence while being false.

This is why the fixture's claim text carries "scheduled or expected", and why
`timeScope` on `C004` records the visit date as **after** the cutoff.

### And it must not be upgraded by the calendar

`GAP-003` is `WAIT_FOR_RECORD`, not `PUBLIC_RECORD_REQUEST`, and therefore
`atiEligible: false`. No information request can produce a record of an event
that has not happened; materiality does not create eligibility
([XR-INV-009](../../architecture/validation-and-invariants.md#xr-inv-009--action-eligibility)).

Equally: when 14 September passes, the finding does not improve on its own. A
scheduled visit whose occurrence was never recorded stays unestablished — the
passage of time is not evidence.

### Related: the surface source proves only that the claim was made

`SRC-001` yields no Evidence for `C001`–`C004` anywhere in the fixture, enforced
by two integrity checks. The article establishes *that these things were
asserted*. `EV-033` comes from a separate outlet
([XR-INV-001](../../architecture/validation-and-invariants.md#xr-inv-001--surface-source-isolation)).

## What evidence would change the judgment

- A State House or PCS post-event release, a dated site-visit record, or dated
  imagery → establishes a **new** proposition (occurrence), closing `GAP-003`.
  It does not retroactively strengthen `C004`.
- An official programme for 14 September omitting the road → weakens the
  scheduling claim.
- A cancellation record → `C004` remains `SUPPORTED` as scheduling, and
  occurrence is settled negatively. Both can be true at once.

## Related failure modes

- [FM-005 — Temporal promotion](../failure-modes/FM-005-temporal-promotion.md)
- [FM-004 — Absence to nonexistence](../failure-modes/FM-004-absence-to-nonexistence.md) (no post-event record ≠ the visit did not happen)
