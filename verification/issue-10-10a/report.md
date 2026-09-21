# Issue #10, slice 10a — ATI lifecycle persistence

Persistence only. No application command, route or runtime change. 10b not started.

## Scope boundary, stated because it matters

The C1/C2/C7 resolution removes `atiRequests` from `XRayGraph` and moves XR-INV-009
request validation to the action command boundary. **The released slice gate assigns
that move to 10b**, so 10a changes neither `XRayGraph` nor `validation/`.

That is deliberate: removing the graph-level check in 10a while the command-level check
arrives in 10b would leave a slice with no enforcement of "a request may not invent the
name of a record the gap ledger has not established". Enforcement never lapses.

## Migration 0009

Six concerns, kept apart.

| Table | Holds |
|---|---|
| `ati_requests` *(existing)* | stable identity and exact origin |
| `ati_request_revisions` | immutable draft snapshots with frozen holder context |
| `ati_request_events` | append-only `EXPORT`/`SUBMIT`/`ACKNOWLEDGE`/`CLOSE` |
| `ati_responses` | append-only response events |
| `ati_response_intakes` | records that arrived — **not** Sources |
| `ati_intake_source_acceptances` | the one bridge to canonical research |

The mutable columns on `ati_requests` — `status`, `drafted_at`,
`holding_institution`, `requested_records`, `public_interest_context`,
`received_source_ids` — are relaxed to nullable rather than dropped, so existing rows
and #7's accepted ATI boundary gate stay valid. **The new runtime never writes them**,
and a check asserts that.

### Constraints that carry the semantics

`(investigation, origin version, gap, ati_eligible)` composite FK with
`origin_ati_eligible` constrained `true` — an ineligible gap is unreachable.

**No unique constraint on `(investigation, origin version, gap)`** — per C3, one missing
record may be sought from two institutions, and forcing one request per gap would make
the second unrepresentable. A check asserts no such constraint exists.

`export_names_a_revision` and `submit_names_an_export` bind each act to exactly what it
acts on, plus a trigger asserting the referenced act really was an `EXPORT` — a foreign
key alone cannot say which kind of event was referenced.

`filing_metadata_only_on_submit` keeps method, reference and destination on the act of
filing and nowhere else.

`confirmed_custody_needs_stated_basis` is the C5 rule in SQL: a **human-supplied**
`CONFIRMED` custody basis requires a stated rationale. Confirmed custody carried from
the origin gap is already accounted for there. An inferred holder cannot be silently
upgraded.

`ati_response_intakes` has **no source column at all**, so an intake cannot name a
Source, imaginary or otherwise.

`ati_intake_source_acceptances`'s foreign key to the version-scoped `sources` row is
**not deferrable**. The commit that created the Source must already have happened. That
is what "no imaginary SourceIds" means in storage rather than in a comment.

Five triggers reject `UPDATE` and `DELETE` across every history table. Migration
up/down/up round-trips inside the gate.

## Derived, not stored

`status`, `draftedAt`, `submittedAt`, `respondedAt` and `receivedSourceIds` are computed
from history by `readRequestLifecycle`. The progression is asserted directly:

```
DRAFT → EXPORTED → SUBMITTED → ACKNOWLEDGED → RESPONDED → CLOSED
```

with closure winning over everything, because the thread ends whatever else happened.

`receivedSourceIds` returns canonical source ids from accepted intake mappings only —
never intake identifiers.

## Checks

23 scenarios in `pnpm check:ati-lifecycle` (`final-gate.txt`), green on the first run;
`first-attempt.txt` records that run. It covers all eight released proofs:

- exact eligible origin, and four rejected origins (ineligible gap, wrong version,
  unknown gap, wrong investigation);
- two requests against one gap, with no constraint forbidding it;
- holder institution, office and custody basis frozen per revision, with provenance;
  a silent `INFERRED → CONFIRMED` upgrade refused and a stated one permitted; revision 1
  unchanged by revision 2;
- an export naming an exact revision; a phantom revision refused; `EXPORTED` producing
  no submission time; a submission refused against an acknowledgement and against
  nothing; unsupplied destination staying absent; filing metadata refused on a
  non-submission act;
- a response with no records; one response with several; several responses;
- intakes structurally unable to hold a source id;
- acceptance refused for a nonexistent source and for a source in an uncommitted
  version; accepted against an exact committed source; one intake accepted as two
  sources;
- every history table rejecting `UPDATE` and `DELETE`; closure changing no gap; both
  snapshots byte-identical and the version pointer unmoved after all ATI activity;
- the module touching no canonical table and no graph aggregate.

## Regression

`check:persistence-ati` (#7's boundary gate), the four other #7 gates, `check:publication`,
`check:public-resolver`, `check:public-routes`, `check:public-library`,
`check:version-lineage`, `check:lifecycle`, `check:api-routes`,
`check:investigation-service`, `check:inline-execution`, `check:fixtures`,
`tsc --noEmit` and `pnpm build`: all pass.

## Carried forward

`claim_reevaluation_causes.ati_response_ref` still has no foreign key and no writer. 10d
will write it against an exact response; 10a does not touch it.

The generic committed-version → candidate-workspace execution primitive (C6) remains
unbuilt and is 10d's.

## Not in 10a

No application commands, no XR-INV-009 move, no `XRayGraph` change, no routes, no
surfaces, no Source creation, no version commit.
