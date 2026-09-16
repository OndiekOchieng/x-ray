# FM-005 — Temporal promotion

**ID:** FM-005
**Name:** Temporal promotion
**Invariant:** [XR-INV-001](../../architecture/validation-and-invariants.md#xr-inv-001--surface-source-isolation)
**Demonstrated by:** [CAL-005](../cases/CAL-005-scheduled-is-not-occurred.md)

---

## Error shape

A claim about a **planned, pledged, budgeted or scheduled** state is graded as
though it were a claim about a **realised** one.

```text
evidence establishes:   intended / scheduled / allocated / approved
finding asserts:        occurred  / delivered / spent    / operating
```

The two propositions are different claims, not weak and strong versions of one.

A second form runs backwards: a measurement is carried forward past its own
temporal scope, so a figure true at one date is presented as current.

Recurring instances: allocated budget reported as spent; a groundbreaking as a
completion; an announced policy as an implemented one; a signed MoU as a
delivered programme; a scheduled inspection as a conducted one; last year's
completion percentage quoted as today's.

## Why models and researchers fall into it

- **Announcements are abundant and outcomes are not.** The plan is documented;
  the delivery usually is not.
- **Source tense is slippery.** "Is expected to", "will", "is set to" compress
  into the past tense in any summary, and the compression is invisible once
  made.
- **Publication date is mistaken for observation date.** A report published in
  November carrying a June measurement reads as November news unless the two
  dates are modelled separately.
- **The plan is often reliable**, so the inference is usually harmless — which
  is what makes it habitual rather than considered.
- **A research cutoff is easy to forget.** Nothing in the text of a source
  announces that it precedes the event it describes.

## Detection signals

- A claim's `timeScope` places its event **after** the investigation's
  `researchCutoffAt`, while its finding asserts occurrence.
- Claim text and source passage differ in tense or modality — the passage says
  "expected to" and the claim says "did".
- Every supporting evidence record predates the event it is said to establish.
- Evidence carries no `timeScope` while its source's `publishedAt` is much later
  than the period the observation covers.
- Temporal information hiding in `Measurement.definition` or
  `Measurement.scope` instead of `timeScope` — the mixing is itself the smell.
- A finding improves as the calendar advances, with no new evidence attached.

## Harm if allowed

- Claims about delivery are exactly where civic accountability matters most.
  Promoting plan to outcome makes the engine an amplifier for announcements,
  which is the opposite of its purpose.
- The finding is falsified by ordinary events — a cancelled visit, a reordered
  itinerary — and cannot be defended.
- The genuine question, *did it actually happen*, stops being asked, because it
  appears answered.
- Stale figures presented as current make a project look better or worse than it
  is, and the error is undetectable downstream once the date is lost.

## Corrective behavior

1. **Scope the claim at decomposition.** Preserve the source's modality: if the
   passage says "expected to inspect", the claim says scheduled or expected.
   This is the decisive step — everything after it grades whatever proposition
   was written.
2. Record `timeScope` on the claim, including when the event falls after the
   research cutoff.
3. Record `timeScope` on evidence. When an observation is true of is not when
   its source was published, and `Measurement.definition` carries measurement
   semantics only — never dates.
4. Treat occurrence as a **separate proposition** with its own gap. Do not model
   it as an upgrade of the scheduling claim.
5. Route a post-event gap to `WAIT_FOR_RECORD`, not `PUBLIC_RECORD_REQUEST`. No
   information request can produce a record of an event that has not happened.
6. Never let time alone change a grade. A scheduled event whose occurrence was
   never recorded stays unestablished after its date passes.
7. Refuse post-cutoff evidence in historical investigations, and enforce it
   mechanically rather than by intention.

## Calibration cases demonstrating it

- [CAL-005 — Scheduled is not occurred](../cases/CAL-005-scheduled-is-not-occurred.md)
- [CAL-006](../cases/CAL-006-unexplained-financial-bridge-remains-unresolved.md) — a 2021 award sum is not a 2026 project value
