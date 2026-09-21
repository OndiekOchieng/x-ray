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

Six concerns, kept apart, with migration 0010 adding the three invariants review
found missing.

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
**not deferrable**, so the row must be visible at statement time — a bare invented id
has nothing to point at.

> **Corrected after review.** This report originally claimed the non-deferrable key
> meant "the commit that created the Source must already have happened". It does not.
> A non-deferrable key only requires the row to be *visible*, and #7 inserts
> version-scoped artifact rows before advancing the committed pointer — so a row inside
> the still-open commit transaction satisfies it. Migration 0010 adds the check that
> actually establishes commitment.

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

## Remediation — three invariants that were stated but not enforced

Review blocked 10a on three storage gaps. All three were reproduced before being fixed
(`three-invariants-failure.txt`, 23/26) and are closed by migration 0010.

### 1 · Origin was not actually immutable

0009 protected the history tables and left `ati_requests` freely updatable. The
composite gap foreign key blocks a move to another investigation, but probing showed
**`origin_version`, `gap_id` and `ordinal` all moved without complaint** — so one
`UPDATE` could re-point a request at a different version's gap while its whole history
still claimed to originate from the old one.

`immutable_ati_origin` now rejects any change to `id`, `investigation_id`,
`origin_version`, `gap_id`, `ordinal`, `origin_ati_eligible` or `jurisdiction`. The
superseded lifecycle columns stay writable, because #7's accepted boundary gate writes
them and 10a is not the slice that removes them.

### 2 · Acceptance could cross investigations

The foreign key proved a `Source` existed at `(investigation, version, id)` but tied
that investigation to nothing. A response to investigation A's gap could be accepted
against a perfectly valid committed Source in investigation B, and the read model would
then report B's source under A's request.

`check_ati_acceptance` resolves the owning investigation through
intake → response → request and rejects a mismatch.

### 3 · "Existing" was not "committed"

**This was a false claim in my own report, not only a missing check.** I wrote that the
non-deferrable foreign key meant the commit had already happened. It does not: the key
requires only that the row be visible at statement time, and #7 deliberately inserts
version-scoped rows before advancing `investigations.latest_committed_version`.

The proof constructs exactly that state — a `sources` row for version 3 inside an open
transaction while the pointer still reads 2 — and before remediation the acceptance
succeeded.

`check_ati_acceptance` now also requires
`investigations.latest_committed_version >= committed_version`, which makes the column
name true rather than aspirational. The same acceptance is then proved to succeed once
version 3 is genuinely committed.

## Checks

26 scenarios in `pnpm check:ati-lifecycle` (`final-gate.txt`). `first-attempt.txt`
records the original 23-scenario run; `three-invariants-failure.txt` records the three
remediation proofs failing before the fix. The gate covers all eight released proofs
plus the three remediation invariants:

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
- the module touching no canonical table and no graph aggregate;
- **R1** — `origin_version`, `gap_id` and `ordinal` rejected as immutable once history
  exists, with `investigation_id`, the eligibility flag, `jurisdiction` and `id` rejected
  too, and the superseded lifecycle columns still writable;
- **R2** — a valid committed Source from another investigation refused for this
  request's intake;
- **R3** — a Source visible inside an open commit transaction refused because its
  version is not yet committed, then accepted once it is;
- ATI writes moving neither the version pointer nor any committed snapshot, asserted by
  performing further ATI acts and re-reading.

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
