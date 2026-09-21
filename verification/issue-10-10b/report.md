# Slice 10b — ATI action commands and graph-boundary cleanup

**Released from:** `03eaa5d` · **Delivered at:** `1d0cdde`
**Commits:** `40f9bc3` `feat(ati): add action command boundary` → `1d0cdde` `refactor(graph): remove ATI lifecycle from evidence graph`
**Gate:** `pnpm check:ati-commands` — **30/30**

---

## The enforcement handoff (release §L)

This was the slice's central constraint, so it is the first thing to check.

| Commit | Command-level XR-INV-009 | Graph-level XR-INV-009 (request half) |
| --- | --- | --- |
| `03eaa5d` (before) | absent | present |
| `40f9bc3` | **present, 28/28 proven** | present |
| `1d0cdde` (final) | **present, 30/30 proven** | removed |

There is no commit in which neither layer enforces it. `40f9bc3` is the
overlap, and the evidence for that moment is preserved verbatim in
[`both-layers-active.txt`](both-layers-active.txt): the grep output showing
`graph.atiRequests` and both violation codes still live in
`validation/epistemic.ts`, immediately above a 28/28 command gate.

The release also asked for failing evidence *if the first command
implementation accepted an invented requested record*. It did not — the
grounding check was in the first implementation. Rather than claim a proof that
did not happen, I produced the adversarial equivalent: the grounding test in
`buildContent` was short-circuited to `false` and the gate re-run.
[`command-enforcement-removed.txt`](command-enforcement-removed.txt) records
the result — **five** checks catch it (4, 9, 10, 22, 26), including the
XR-INV-009 code assertion. The gate is load-bearing, not decorative.

---

## A. ATI lifecycle state removed from `XRayGraph`

| Removed | Where |
| --- | --- |
| `atiRequests?` from `XRayGraphInput` | `selectors/graph.ts` |
| `atiRequests` from `XRayGraph` and its normalization | `selectors/graph.ts` |
| ATI request referential validation | `validation/referential.ts` |
| ATI request epistemic validation (the two request codes) | `validation/epistemic.ts` |
| ATI request structural shape checks | `validation/structural.ts` |
| Both snapshot-writer guards | `persistence/snapshot.ts` |
| `'atiRequests'` from the accumulator's exclusion union | `pipeline/accumulator.ts` |
| the fixture's empty `atiRequests` collection | `fixtures/xray-ke-001/{index,graph}.ts` |
| `atiRequests: []` from three check supports | `persistence/*-check*.ts` |

`validation/structural.ts` was not named in the release. It iterated
`graph.atiRequests` too, so it could not compile without the field; the shape
rules it enforced are covered by `ati_request_revisions`' own constraints
(non-blank institution, enumerated custody basis, rationale required for
confirmed custody) and by the command boundary's sequence rules.

The snapshot guards are gone rather than retained-and-loosened because they
guarded a field that no longer exists. Removing them is not a relaxation: a
request cannot reach a snapshot writer because there is nowhere in
`XRayGraphInput` to put one, which is a stronger statement than a runtime
throw.

**Kept**, per the release: the `ATIRequest` TypeScript type, now the derived
read model; the `'ATIRequest'` violation target kind; and both XR-INV-009
request codes in `ViolationCode`.

### XR-INV-009 is now split, and the registry says so

`INVARIANT_COVERAGE` records XR-INV-009 as `PARTIAL`:

- **enforced** — `atiEligible` holds exactly when `resolutionPath` is
  `PUBLIC_RECORD_REQUEST`. A property of a gap; gaps stay version-scoped.
- **notEnforced** — the request half, naming `application/ati-service.ts` as
  its owner and why it could not stay.

Check 25 proves both directions: no validator source mentions `atiRequests` or
either request code, *and* a gap whose eligibility contradicts its resolution
path still produces `XR-INV-009/ATI_ELIGIBILITY_MISMATCH` and only that code.

---

## B. The command service

`lib/xray/application/ati-service.ts` — `ATIActionService`, constructed with a
`SnapshotDatabase` and an injectable clock, in the same shape as
`GraduationService`.

| Command | Covers |
| --- | --- |
| `createDraft` | create draft |
| `reviseDraft` | revise draft |
| `exportRevision` | export revision |
| `confirmSubmitted` | confirm submission |
| `acknowledge` | record acknowledgement |
| `close` | close request |
| `readLifecycle` / `view` | read request lifecycle |
| `listRequestsForGap` | list requests for exact gap |

Every durable effect is a 10a primitive. No SQL is duplicated; the only
statements the service issues itself are the lock acquisitions, the ordinal
allocation, and the committed-pointer read.

`recordResponse` and `acceptIntakeSource` were deliberately **not** wrapped.
Response-intake command and API semantics are 10c's.

---

## C. Create-draft authorization against the exact origin snapshot

```text
(investigationId, originVersion) → readSnapshot → gapId
```

`readSnapshot` is the same primitive every other reader of committed research
state uses, so the gap authorized against is the one that version committed,
not a re-derivation of it.

| Condition | Rejection code |
| --- | --- |
| investigation absent, or version not committed | `ATI/ORIGIN_SNAPSHOT_NOT_FOUND` |
| gap absent from that exact snapshot | `ATI/ORIGIN_GAP_NOT_FOUND` |
| gap not `PUBLIC_RECORD_REQUEST` / `atiEligible` | `XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP` |
| requested record outside `resolvingEvidence` | `XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP` |

**One judgment call to flag.** The release said "investigation/version does not
exist". I implemented it as *"is not committed"*: the command reads
`investigations.latest_committed_version` and refuses an `originVersion` above
it. #7 inserts version-scoped rows before advancing that pointer, so a version
inside an open commit transaction has rows without being immutable yet — and
"the exact **immutable** origin snapshot" is not true of it. This is the same
reasoning as 10a acceptance condition 2. It is strictly narrower than what the
release asked for, never wider.

**A second, smaller one.** `requestedRecords: []` is a subset of anything, so
the literal scope rule permits it. A request that names no record cannot be
filed, so the command refuses it with `ATI/NO_RECORDS_REQUESTED`.

---

## D. Holder context derived, never invented

For a generated draft: institution from `gap.likelyHolder.institution`, office
from `.office`, custody basis from `.basis`, recorded as
`holderContextOrigin: 'ORIGIN_GAP'` with no rationale (the gap already accounts
for it).

Where the gap names **no** holder the command refuses with
`ATI/HOLDER_CONTEXT_MISSING`, preferring explicit human-supplied context. It
does not fall back to a plausible ministry, an unnamed "Information Access
Officer", or another gap's institution — a fabricated addressee would be
indistinguishable from a real one once frozen into a revision.

A human-supplied `CONFIRMED` basis requires a non-blank rationale
(`ATI/CUSTODY_BASIS_RATIONALE_REQUIRED`), which is the same rule 10a's
`confirmed_custody_needs_stated_basis` enforces from below. Saying it here too
means the caller gets a named rejection instead of a constraint violation.

The fixture contains no eligible gap without a `likelyHolder`, so check 7
constructs a second lineage (`XRAY-ATI-NOHOLDER`) whose eligible gaps have the
field stripped, and commits it through `writeInitialSnapshot`. The proof runs
against real committed state, not an asserted row.

---

## E/F. Scope stays frozen to the origin version

Exact string membership in `gap.resolvingEvidence`. Check 4 also rejects three
near-misses — lowercased, trailing-space, trailing-period-stripped — so
"exact" is asserted rather than assumed.

Check 9 is the release's §F scenario, run against real committed versions:

```text
ATI-A anchored to v2
v3 commits, adding "The Lot 3 variation order register, as tabled in 2026"
  to the same gap's resolvingEvidence
revise ATI-A to ask for it   → XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP
new request anchored to v3   → accepted
revise ATI-A within v2 scope → accepted (revision 2)
```

The check first asserts that v3 *does* name the record and v2 *does not*, so it
cannot pass vacuously. Revisions re-read the origin from the request's own row,
never from the caller, so a revision cannot re-anchor itself.

Committing that v3 required extending `reEvaluatedClaimIds` and the
re-evaluation audit with the gap's claims — #7 treats a changed gap as
re-evaluating the claims it blocks. Worth noting because it means the
architecture already regards "the gap ledger named one more record" as a
research event, which is exactly why an old request may not follow it.

---

## G/H. Sequences and chronology

Refused: an export naming a non-existent revision; a submission naming an event
that was not an export (including one naming the `SUBMIT` itself); an
acknowledgement with no prior submission — *including on an `EXPORTED`
request*; a close from `DRAFT`; a close with no stated reason; and any revise,
export, submit, acknowledge or second close after a close. Check 21 asserts the
event count is unchanged after all five post-close attempts.

Submission is never inferred. `SubmissionAssertion` requires a literal
`humanConfirmed: true`, so no orchestration reaches `SUBMITTED` as a
continuation of exporting, and check 14 asserts the service has exactly one
call site that writes a `SUBMIT` event.

Chronology is limited to relationships the system can prove — an event may not
predate a predecessor it names:

- submission before its referenced export → `ATI/RETROGRADE_EVENT`
- export before the revision it freezes → `ATI/RETROGRADE_EVENT`
- acknowledgement before the submission it presupposes → `ATI/RETROGRADE_EVENT`
- revision before the revision it follows → `ATI/RETROGRADE_EVENT`

No global wall-clock truth is attempted. Sequence remains authoritative.

---

## I/J. Allocation and concurrency

Ordinals and sequences are allocated by the service. `CreateDraftInput` has no
`ordinal` field; check 11 asserts that from the interface's own source text
(comments stripped) as well as from the allocated values being contiguous.

- **creates** hold `SELECT id FROM investigations WHERE id=$1 FOR UPDATE`, then
  allocate and insert in one transaction. `createRequest` gained an
  `inTransaction` option to participate — the same convention `workspace.ts`
  already uses. No schema change.
- **appends** (revisions, events) hold
  `SELECT id FROM ati_requests WHERE id=$1 FOR UPDATE`.

`FOR UPDATE` on an existing row is the established style here (`version-commit.ts`,
`publication.ts`).

**HONEST LIMITATION, unchanged from #7 and #9.** PGlite runs a single
connection. These gates prove the lock is taken and the outcome deterministic;
they do **not** prove native concurrent row-lock behaviour. The native gate
(`check:persistence-postgres-concurrency`) remains unrun because
`XRAY_POSTGRES_URL` is unset — recorded as `NOT RUN` in `final-gate.txt`, not
as a pass.

---

## K. The derived read model

`lib/xray/application/ati-read-model.ts` projects `RequestLifecycle` into
`ATIRequestView extends ATIRequest`, adding what that shape cannot hold:
`originVersion`, current `revision`, `holdingOffice`, `custodyBasis`,
`holderContextOrigin`, `custodyBasisRationale`, `exportedAt`,
`acknowledgedAt`, `closedAt`, `revisions[]`.

Preserved: `DRAFT`/`EXPORTED` ≠ `SUBMITTED` — `submittedAt` is absent from an
exported-but-unfiled request, and check 22 asserts absence from the payload,
not merely an undefined read. Custody basis survives the projection. Nothing is
defaulted.

Content shown is the **latest** revision's, which is not necessarily what was
filed; the `EXPORT` event keeps the exact revision it froze, and check 22
asserts that too.

The projection lives in `application/`, not `projections/`, because it reads a
persistence type. It is not reachable from `XRayGraph`.

---

## Verification — all 30 released items

| # | Released requirement | Check |
| --- | --- | --- |
| 1 | eligible exact-origin gap creates a draft | 1 |
| 2 | non-ATI gap rejected | 2 |
| 3 | unknown gap / version / investigation rejected | 3 |
| 4 | requested record not in origin `resolvingEvidence` rejected | 4 (+ near-misses, + nothing persisted) |
| 5 | valid subset accepted | 5 (full set and one-record subset) |
| 6 | holder institution/office/basis copied from origin gap | 6 |
| 7 | missing holder context never invented | 7 |
| 8 | human `CONFIRMED` requires stated rationale | 8 (absent and blank) |
| 9 | revision bounded by frozen origin after a later version | 9 |
| 10 | several requests may target same gap | 10 |
| 11 | ordinal allocated by service, not caller | 11 |
| 12 | export exact revision succeeds | 12 |
| 13 | export unknown revision fails | 13, 13b, 13c |
| 14 | export does not imply submitted | 14 |
| 15 | submit succeeds only through explicit confirmation | 15 |
| 16 | submit non-export fails | 16 |
| 17 | submit before referenced export fails | 17 |
| 18 | acknowledgement before submission fails | 18, 18b |
| 19 | acknowledgement after submission succeeds | 19 |
| 20 | close is explicit and administrative | 20 |
| 21 | anything after close fails | 21 |
| 22 | derived read model correct | 22 |
| 23 | action writes leave snapshots byte-identical | 23 (v1, v2, v3 + canonical row count) |
| 24 | `XRayGraph` no longer carries ATI requests | 24 |
| 25 | graph validators no longer inspect ATI requests | 25 |
| 26 | XR-INV-009 invented-record rejection still passes | 26 |
| 27 | existing graph validation gates green | `check:validation` 52/52 |
| 28 | #7 ATI persistence gate green | `check:persistence-ati` PASS |
| 29 | #8/#9 regressions green | 31 gates in `final-gate.txt` |
| 30 | `tsc --noEmit` and `pnpm build` green | `final-gate.txt` |

Check 4b (no record requested) is the one addition beyond the released list.

---

## Stop line (release §N) — nothing added

No response upload or API orchestration, no intake file handling, no `Source`
creation from responses, no candidate-workspace seeding, no `ATI_RESPONSE`
re-evaluation causes, no new immutable versions, no public ATI surfaces or
routes. No new migration: 10b is code over 10a's schema.

## Carried forward, unchanged

- Native PostgreSQL simultaneous-write concurrency remains unproven.
- `claim_reevaluation_causes.ati_response_ref` still has no FK and no writer (10d).
- The generic committed-version → candidate-workspace primitive (#10 C6) is
  unbuilt (10d).
- No actor or authorisation layer. "A human did this" is a required literal in
  a command input; who that human is has no representation anywhere.

## Files

- `verification/issue-10-10b/both-layers-active.txt` — the handoff overlap at `40f9bc3`
- `verification/issue-10-10b/command-enforcement-removed.txt` — adversarial proof the gate bites
- `verification/issue-10-10b/final-gate.txt` — 30/30 plus the full sweep at `1d0cdde`
