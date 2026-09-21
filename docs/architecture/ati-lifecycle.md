# ATI Lifecycle

**Source:** `X-Ray System Architecture v0.1` §37 (ADR-008), XR-INV-006, XR-INV-009
**Architecture version:** 0.1
**Status:** Specified · formalized 2026-09-21 for [#10](https://github.com/OndiekOchieng/x-ray/issues/10)

How an evidence gap becomes a public-record request, and how a received record
becomes evidence — without letting either step rewrite research history.

See [ADR-0008](../adr/0008-ati-resolution-adapter.md),
[ADR-0017](../adr/0017-ati-action-history-is-append-only.md) and
[ADR-0018](../adr/0018-received-records-enter-research-as-intake.md).

---

## The loop

```text
investigation → gap → ATI request → response → intake → evidence graph
                                                    ↓
                                   affected claims → new immutable version
```

Two halves, deliberately separated:

**Action** is what people did — drafted, exported, filed, chased, closed. It is
append-only, sits outside immutable research state, and interprets nothing.

**Research** is what the evidence establishes. It runs the normal pipeline and
produces a new version. Nothing in the action half can move a grade.

---

## Eligibility

```text
atiEligible = resolutionPath === PUBLIC_RECORD_REQUEST
```

Derived, never asserted. A request may target only an eligible gap, and only at
the exact version that gap belongs to — the composite foreign key on
`ati_requests` enforces `(investigation, origin version, gap, eligible)`, and
the `origin_ati_eligible` column is constrained `true` so an ineligible gap
cannot be reached through it.

A request may request only records the gap names. `XR-INV-009` makes this a
validator `ERROR`: *"A request may not invent the name of a record the gap
ledger has not established."*

---

## Action state

Status is derived from an ordered, append-only event history. It is not the
record.

| Event | Means |
| --- | --- |
| `DRAFT` revision | An editable draft exists at an exact revision |
| `EXPORT` | One exact revision was rendered for a human to file |
| `SUBMIT` | A human asserts they filed that exact revision externally |
| `ACKNOWLEDGE` | The institution acknowledged receipt |
| `RESPONSE` | Something arrived; zero or more records with it |
| `CLOSE` | The action thread is closed |

**`EXPORTED` is not `SUBMITTED`.** X-Ray does not file requests. No transition
past `EXPORTED` happens without a human action, and no surface may present a
draft as a filed request.

An export freezes an exact revision, so editing after export produces a new
revision rather than changing what was already sent.

---

## Custody stays epistemic

`LikelyHolder.basis` is `CONFIRMED | INFERRED`, and an inferred holder must
remain visibly inferred on every surface. "We believe this ministry holds it" is
not "this ministry holds it", and an action surface that flattened the two would
be asserting custody the evidence has not established.

---

## Intake is not evidence

A response may carry records. A record that arrived is **not** a canonical
`Source`.

```text
response event → received record (intake) → [ INGEST · TRACE · PROVENANCE · … ] → Source / Evidence
```

This is the same boundary [ADR-0010](../adr/0010-research-retrieval-boundary.md)
draws for retrieval: a provider — or a ministry — delivers material, and the
*stage* decides accessibility, evidence class, origin status and provenance. A
record has no more authority for having been formally requested.

One response yields zero, one or many sources. An acknowledgement letter may
yield none; an archive may yield several; a document already in the graph yields
none new.

`ATIRequest.receivedSourceIds` means canonical source ids **accepted** from
responses — never intake identifiers, and never an id minted before the source
exists.

---

## Re-evaluation

Affected claims come from what the new evidence bears on, computed by #7's
`changedClaimIds` — not from the origin gap's claim list. The gap explains why
the record was wanted; it does not license what the record proves.

Each re-evaluated claim records reason `EXTERNAL_RECORD_RESPONSE`, with a causal
reference of kind `ATI_RESPONSE`. The version carries trigger
`ATI_RESPONSE_RECEIVED`.

Ingestion runs as a normal execution against the latest committed predecessor —
the #6 stages and both control gates, then graduation and commit. There is no
ATI write path around #7.

---

## Closure is administrative

`CLOSED` means the action thread ended. It does not mean the institution
answered, that what arrived was reliable, that the gap is resolved, or that a
finding changed. A closed request with no useful response leaves its gap exactly
where research leaves it — `OPEN`, `REQUESTED` or `UNRESOLVABLE`.

Gap status changes only in a newly graduated version, on the evidence.

---

## Language

The action surface reports recorded events and interprets none of them
(XR-INV-006):

| Recorded | Does **not** mean |
| --- | --- |
| Not received | The record does not exist |
| No response recorded | The institution refused |
| Custody inferred | The institution is the confirmed holder |
| Request closed | The gap is resolved |
| Response received | The claim is established |

An ATI draft is generated prose and sits below the projection boundary with
share cards, bound by responsible sharing: an unresolved gap must not become an
implication of wrongdoing.

---

## Related

- [ADR-0008](../adr/0008-ati-resolution-adapter.md) — eligibility
- [ADR-0017](../adr/0017-ati-action-history-is-append-only.md) — action history
- [ADR-0018](../adr/0018-received-records-enter-research-as-intake.md) — intake
- [Investigation versioning](./investigation-versioning.md) — what a response produces
- [Domain model](./domain-model.md#atirequest) — the canonical type
