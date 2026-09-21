# ADR-0017 — ATI Action History Is Append-Only, and Outside Research State

**ADR:** 0017
**Status:** Accepted
**Date:** 2026-09-21
**Source:** Proposed decisions D1–D4, D9, D10 on #10, reconciled against the existing ATI boundary
**Supersedes:** —

## Context

`ati_requests` stores one mutable row per request: a status, three timestamps
(`drafted_at`, `submitted_at`, `responded_at`) and a JSON array of received
source ids. The composite foreign key already binds a request to an exact
`(investigation, origin version, eligible gap)`, and #7's ATI boundary gate
proves that mutating a request does not rewrite a committed version.

What the row cannot represent is the thing an ATI request mostly *is*: a
sequence of human actions over time.

`status = 'RESPONDED'` does not say what text was exported, which exported
revision a person actually filed, whether the institution acknowledged, whether
there were two partial responses, or what happened on the way. Overwriting
`status` destroys the record of every earlier step.

Three concrete absences make this structural rather than cosmetic:

- there is no `acknowledged_at`, so the `ACKNOWLEDGED` status cannot be placed
  in time at all;
- `ATIRequest` carries no holder office and no `CustodyBasis` — `LikelyHolder`
  with its `CONFIRMED | INFERRED` basis lives on `Gap`, not on the request that
  acts on it;
- nothing records *which* draft text was exported, so "what we sent" is
  whatever the editable row happens to say now.

## Decision

**A request has stable identity. Everything that happens to it is append-only.**

### Current state is derived, not stored as the record

The authoritative history is an ordered sequence of action events. A status may
be kept as a derived convenience pointer, but it is never the record — the same
relationship #9 established between publication events and the presentation
head.

### Draft content is revisioned; export freezes an exact revision

Human editing stays. An edit creates a new immutable draft revision rather than
rewriting an artifact that was already exported or filed.

```text
DRAFT rev1 → edit → DRAFT rev2 → export rev2 → EXPORTED(rev2)
           → edit → DRAFT rev3 → export rev3 → EXPORTED(rev3)
```

An export references one exact revision, so "what was exported" never depends
on the currently editable row.

**Editability is bounded by XR-INV-009.** The validator already refuses a
request whose `requestedRecords` name a record the gap does not
(`validation/epistemic.ts`). A revision is free text within that bound and no
further: a human may reword, but may not add a record the gap ledger has not
established.

### SUBMITTED is a human assertion about an exact exported revision

X-Ray does not file requests (ADR-0008), so submission is never inferred from
an export or a download. A submission event names the exact revision a person
says they filed, and records only supplied facts — time, method, external
reference, destination, each verbatim or absent. **No contact, office, date or
reference is ever invented.** Without a human assertion the state stays
`DRAFT` or `EXPORTED`.

### Acknowledgement and response are events, not timestamps

A request may receive zero or more acknowledgements and zero or more responses,
including partial ones. `RESPONDED` means at least one response was recorded —
nothing more.

### Closure is administrative, never epistemic

`CLOSED` closes the action thread. It does not mean the institution answered,
that what arrived was reliable, that the gap is resolved, or that any claim
moved. Gap status changes only in a newly graduated version, on the evidence.

### The action surface reports events; it never interprets them

Inheriting XR-INV-006: *not received* is not *does not exist*; *no response
recorded* is not *the institution refused*; *custody inferred* is not
*confirmed holder*; *request closed* is not *gap resolved*; *response received*
is not *claim established*. Interpretation belongs to the evidence graph after
research, and an action surface that editorialised would be the accusation
XR-INV-006 exists to prevent.

## Consequences

- The history answers "what did we actually send, and when" — which a mutable
  status column cannot.
- `#7`'s rule holds unchanged: ATI action history is not an investigation
  version, and cannot rewrite one.
- Two things the domain type does not yet carry must be decided before schema:
  where holder office and `CustodyBasis` live (see the recorded conflicts in
  [the #10 plan](../engineering/issue-10-ati-plan.md)), and whether the
  `ATIRequest` domain type keeps its three timestamps once events are
  authoritative.
- `ACKNOWLEDGED` becomes representable for the first time.

This ADR fixes the lifecycle model. It authorises no schema, command, route or
runtime change.
