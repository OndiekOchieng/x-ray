# ATI Implementation Plan — 10a to 10e

**Status:** Committed (plan only)
**Date:** 2026-09-21
**Issue:** #10 · proposed decisions D1–D10 reconciled
**Baseline:** `bb0fca8`

The lifecycle contract is fixed by
[ADR-0017](../adr/0017-ati-action-history-is-append-only.md),
[ADR-0018](../adr/0018-received-records-enter-research-as-intake.md) and
[ati-lifecycle.md](../architecture/ati-lifecycle.md).

**No migration, application command, route or runtime change is authorised by
this plan.** Five of the recorded conflicts below must be closed first.

---

## What reconciled cleanly

Every "already settled" item in the #10 investigation checks out against the
code:

| Claim | Verified |
| --- | --- |
| Eligibility derived from resolution path | `gaps` CHECK `ati_eligible = (resolution_path = 'PUBLIC_RECORD_REQUEST')`; composite FK from `ati_requests` with `origin_ati_eligible` constrained `true` |
| ATI lifecycle outside immutable snapshots | `writeInitialSnapshot` throws on `atiRequests`; #7's ATI boundary gate proves lifecycle mutation leaves v1 intact |
| `DRAFT`/`EXPORTED` are not `SUBMITTED` | ADR-0008 and the `ATIRequestStatus` doc comment both state it |
| Custody uncertainty is epistemic | `LikelyHolder.basis = CONFIRMED \| INFERRED` |
| New receipts produce a new version | `ATI_RESPONSE_RECEIVED` trigger exists; `EXTERNAL_RECORD_RESPONSE` re-evaluation reason exists |
| Closure is not resolution | Nothing couples request status to gap status |

The listed persistence gaps are also real: no `acknowledged_at`, no holder
office or custody basis on the request, no revision history, no export or
submission binding, no response rows, no intake identity.

Two hooks already exist and are unused: `claim_reevaluation_causes.ati_response_ref`
and `CausalReference` kind `ATI_RESPONSE`.

---

## Recorded conflicts — closed before, not during, implementation

These are recorded rather than resolved. Each changes what the schema must look
like.

### C1 · `receivedSourceIds` is validated one way and persisted another

`validation/referential.ts` checks every `ATIRequest.receivedSourceIds` entry
against the sources present in the graph, as a `DANGLING_REFERENCE` error.

`ati_requests.received_source_ids` is a JSON array with **no foreign key**, and
#7's ATI boundary gate deliberately writes `["SRC-LATER"]` — an id that does not
exist — and asserts the write succeeds.

Because snapshots exclude ATI requests, the validator rule is **unreachable
through any persisted path**: a reconstructed version always has
`atiRequests: []`.

So today one layer forbids what another layer's accepted gate requires, and
nothing notices because the two never meet. D5 points at the resolution but does
not say which side becomes authoritative.

**Question:** does the validator rule stand (and the gate's `SRC-LATER` case get
restated), or is `receivedSourceIds` version-qualified so it can be checked?

### C2 · A request and its accepted sources never coexist in one version

A request is anchored to the origin version's gap (`origin_version`). Sources
accepted from a response exist only in the **successor** version.

No single version's graph therefore contains both the request and the sources it
points at. Any referential check over `receivedSourceIds` is either checking
across versions or checking a graph nobody persists.

**Question:** is `receivedSourceIds` a `(version, sourceId)` pair, does the
request gain a second anchor at the accepting version, or is the link recorded
only on the response/intake side and never on the request?

### C3 · D1's single identity per gap has no constraint, and may be wrong

D1 anchors identity to `(investigation, originVersion, gap)`. The table's
uniqueness is `(investigation_id, ordinal)` — nothing prevents two requests
against one gap.

That may be correct behaviour rather than a gap: one missing record can be
requestable from two institutions, and forcing one request per gap would make
the second unrepresentable.

**Question:** is the constraint added, or is D1 restated as "one request
identity, many requests per gap permitted"?

### C4 · XR-INV-009 bounds how editable a draft revision is

`validation/epistemic.ts` rejects a request whose `requestedRecords` name a
record the gap does not. D2 says human editing remains allowed; both are true
only if editing is bounded.

Not a contradiction — a constraint D2 must state explicitly, or a revision will
be accepted at the application layer and rejected by the validator.

### C5 · Holder office and custody basis have no home on the request

D2 wants holding institution, office and `CustodyBasis` frozen in a revision.
`ATIRequest` carries only `holdingInstitution`; `LikelyHolder` — with office and
basis — lives on `Gap`, version-scoped.

Copying them into a revision duplicates gap state and can drift from it.
Referencing the origin gap's holder keeps one source of truth but means a
revision is not self-contained.

**Question:** copy and accept duplication, or reference and accept that an
exported artifact is not fully self-describing?

### C6 · No candidate can currently be seeded from a committed version

D8 requires "candidate cloned from latest committed version". No command does
this. `GraphAccumulator` accepts a seed and `readSnapshot` produces one, so it
is assemblable from existing parts — but #8's integrated lifecycle never needed
it, and 8d's C0 check records that #7 has no first-version promotion path
either.

This is the **largest unbuilt piece of #10** and it is execution machinery, not
ATI machinery. Recorded here so it is not discovered mid-slice.

### C7 · The domain type's timestamps become ambiguous

Once events are authoritative, `ATIRequest.draftedAt`, `submittedAt` and
`respondedAt` are derived values living on a canonical domain type. Keeping them
invites the drift ADR-0017 exists to prevent; removing them changes a domain
type #7 already persists and #4's validator already reads.

**Question:** do they stay as derived conveniences, or does the domain type
shrink?

---

## 10a — Lifecycle schema

**Delivers** append-only action history and revisioned drafts.

- Migration adding request revisions, action events and response events, each
  insert-only with trigger-enforced immutability in the #7/#9 style.
- Intake records owned by a response, with their own identity and **no**
  reference to any canonical source id.
- `ati_requests` keeps stable identity and origin only; derived state is read
  from events.

**Blocked on:** C1, C2, C3, C5, C7.

**Verification gate.** UPDATE and DELETE rejected by the database; an export
binds an exact revision; a submission binds an exact export; acknowledgements
and responses are unbounded in number; an intake record cannot name a canonical
source; `XR-INV-009` still rejects an invented record name in a revision;
migration up/down/up clean; existing #7 ATI boundary gate still green.

---

## 10b — Action commands

**Delivers** the application commands over 10a.

- `draft`, `revise`, `export`, `confirmSubmission`, `acknowledge`,
  `recordResponse`, `close`.
- Every command refuses an ineligible gap and refuses to invent a contact,
  office, date or reference.
- `confirmSubmission` requires an exact prior export.
- Derived current state, replayed from events.

**Verification gate.** A non-`PUBLIC_RECORD_REQUEST` gap cannot produce a
request; `EXPORTED` never reports as `SUBMITTED`; submission without an export
is refused; closure changes no gap; unsupplied metadata stays absent rather than
being defaulted.

**Delivered 2026-09-21** — `application/ati-service.ts`,
`application/ati-read-model.ts`, `pnpm check:ati-commands` 30/30.

As released, 10b took on a second, coupled responsibility: removing ATI
lifecycle state from `XRayGraph` once equivalent command-level XR-INV-009
enforcement was proven. Both are done, ordered so enforcement never lapsed
(`feat(ati): add action command boundary` then `refactor(graph): remove ATI
lifecycle from evidence graph`); this closes **C1**, **C2**, **C4**, **C5** and
**C7**. `recordResponse` stayed a persistence primitive — the response-intake
command and API semantics are 10c's.

---

## 10c — Response intake

**Delivers** the intake boundary from ADR-0018.

- A response records zero or more intake records with arrival facts only.
- Intake identity is distinct from canonical source identity, structurally.
- Accepting an intake is a separate act from receiving it.

**Verification gate.** A response with no records is valid; one response yields
zero, one and many intakes across cases; no intake becomes a `Source` without an
execution run; `receivedSourceIds` is populated only from accepted canonical
sources.

**Delivered 2026-09-21** — `ATIActionService.recordResponseReceived`,
migration `0012_ati_intake_digest_provenance`, `pnpm check:ati-responses`
25/25.

Two semantics were made explicit at release: a response requires a request that
was actually `SUBMIT`ted, and a response may arrive after an administrative
`CLOSE` without reopening it (derived status stays `CLOSED`). One boundary was
tightened: durable intake state is identity + arrival metadata + optional
digest, and 10c does **not** add a document store — the material reaches
research explicitly in 10d against the intake identity, with digest matching
where available. So `response/intake ≠ Source ≠ Evidence` holds structurally,
and `acceptIntakeSource` stays unexposed to any application command.

---

## 10d — The research bridge

**Delivers** ingestion as a normal execution run.

- Seed a candidate workspace from the latest committed version (C6).
- Add accepted intake material and run the required stages and both gates.
- Graduate and commit with trigger `ATI_RESPONSE_RECEIVED`, per-claim reason
  `EXTERNAL_RECORD_RESPONSE`, and a causal reference of kind `ATI_RESPONSE`
  written into the existing `ati_response_ref` column.

**Blocked on:** C6.

**Verification gate.** Affected claims come from `changedClaimIds`, not from the
origin gap's claim list; no required epistemic step is bypassed; historical
findings remain addressable; the previous version is byte-identical afterwards;
a response yielding no new evidence commits no version.

---

## 10e — Surfaces and integrated gate

**Delivers** the action surface and the end-to-end proof.

- Draft, export, submission-confirmation and response surfaces that report
  events and interpret nothing.
- Inferred custody visibly inferred everywhere it appears.
- Integrated gate: gap → draft → export → submit → acknowledge → response →
  intake → accepted source → new version → gap status changed **by evidence**.

**Verification gate.** Every phrase in the ati-lifecycle language table is
absent from the rendered surfaces; a closed request with an unhelpful response
leaves its gap open; an unresolved gap is never rendered as an implication of
wrongdoing; the full loop passes.

---

## Sequencing

```text
10a ──► 10b ──► 10c ──► 10d ──► 10e
```

Strictly sequential. Each slice needs the durable model beneath it.

## Out of scope for #10

Automated filing, jurisdictions beyond `KE`, authentication or roles,
publication changes (#9 is closed), demo workflow (#11), and any path that
writes a version without going through #6/#7.
