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

A request may request only records the gap names: *"A request may not invent
the name of a record the gap ledger has not established."*

---

## Where eligibility is enforced

**Recorded 2026-09-21 · #10 slice 10b.** The request half of `XR-INV-009` is
enforced at the **action command boundary** (`application/ati-service.ts`), not
in graph validation. `ATIRequest` is not part of `XRayGraph` (#10 C1/C2/C7), so
there was no collection left for a graph validator to inspect.

Every create and every revision loads the **exact immutable origin snapshot**
and resolves the exact gap:

```text
(investigationId, originVersion)  →  readSnapshot  →  gapId
```

and refuses the request when:

| Condition | Rejection |
| --- | --- |
| investigation or committed version absent | `ATI/ORIGIN_SNAPSHOT_NOT_FOUND` |
| gap absent from that exact snapshot | `ATI/ORIGIN_GAP_NOT_FOUND` |
| gap is not `PUBLIC_RECORD_REQUEST` / `atiEligible` | `XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP` |
| a requested record the gap does not name | `XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP` |
| no record requested at all | `ATI/NO_RECORDS_REQUESTED` |
| no holder context, and none supplied | `ATI/HOLDER_CONTEXT_MISSING` |
| human `CONFIRMED` custody with no stated basis | `ATI/CUSTODY_BASIS_RATIONALE_REQUIRED` |

The two `XR-INV-009/...` codes are the ones graph validation used for the same
two conditions. The invariant moved; it did not lapse.

**Anchored, not current.** Validation is against the request's own origin
version, never the latest committed state:

```text
request anchored to v2
v3 names one further resolving record
revise the old request to ask for it   → rejected
new request anchored to v3 asking for it → accepted
```

A later version cannot retroactively enlarge what an older request was allowed
to ask for (#10 C4). Membership is exact string membership in
`Gap.resolvingEvidence` — no normalization, no semantic matching. A human may
reword the prose around a request freely; the records it names are the gap
ledger's words.

**Holder context is derived, never invented.** A normal generated draft copies
institution, office and custody basis from `gap.likelyHolder`. Where the gap
names no holder the command refuses rather than addressing a plausible
ministry; explicit human-supplied context is the way forward, and a
human-supplied `CONFIRMED` basis must say on what basis custody was confirmed.

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

### Sequences the command boundary refuses

**Recorded 2026-09-21 · #10 slice 10b.** Append-only means no mutation; it does
not mean no sequel, so the database would happily record an acknowledgement of
a request nobody filed. That is the command layer's job:

- an `EXPORT` must name a revision that exists;
- a `SUBMIT` must name an event that was actually an `EXPORT`, and is never
  inferred from one — it takes an explicit human assertion;
- an `ACKNOWLEDGE` requires at least one `SUBMIT`;
- `CLOSE` is available only from a post-draft state, requires a stated reason,
  and nothing may follow it. Reopening is not designed, so a post-close
  revision, export, submission, acknowledgement or second close is refused.

Sequence is authoritative for ordering. Beyond that, only relationships the
system can prove are checked: an event may not be stamped before a predecessor
it names — a submission before its export, an export before the revision it
freezes, an acknowledgement before the submission it presupposes. No attempt is
made at global wall-clock truth.

### A transition is decided and applied under one lock

Requests are `UNIQUE (investigation_id, ordinal)` and every revision, event and
response sequence is `MAX(...) + 1`, which two concurrent callers can read
identically. So the caller never chooses one: a create allocates under a row
lock on the investigation, an append under a row lock on the request.

**The lock covers the decision, not only the write.** Every lifecycle rule
above is a statement about history, so a command that checked history before
taking the lock could be overtaken:

```text
B reads the history: open, an export is legal
A takes the lock, appends CLOSE, commits
B takes the lock — and appends the export it decided on before A ran
→ history reads  ... CLOSE → EXPORT
```

A perfectly behaving lock does not prevent that; the ordering does. So every
command runs as:

```text
BEGIN → lock the request row → re-read history → check → append → COMMIT
```

Closure, sequence allocation, predecessor lookup and chronology all operate on
the post-lock read. Nothing can change between the check and the append,
because nothing else can hold the row.

This relies on `READ COMMITTED`, PostgreSQL's default: once `FOR UPDATE`
returns, a later statement in the same transaction sees what the blocking
transaction committed. Under `REPEATABLE READ` the re-read would return the
pre-lock snapshot and this would have to become a serialization-failure retry.

**Honest limitation.** PGlite runs a single connection. The gates prove the
ordering — by landing another operator's `CLOSE` at the instant the lock is
acquired, which only a post-lock re-read can see — and prove the outcome
deterministic. They do **not** prove native concurrent row-lock behaviour;
that needs a real PostgreSQL gate, which remains unrun, the same limitation #7
and #9 record.

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
