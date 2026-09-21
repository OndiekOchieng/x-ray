# Slice 10c — response command and durable intake boundary

**Released from:** `f4b3869`
**Commits:** `988f2da` `feat(ati): record submitted-request responses` → `f25ee78` `test(ati): preserve intake as pre-research material` → `docs(ati): define post-close response semantics`
**Gate:** `pnpm check:ati-responses` — **25/25**
**Migration:** `0012_ati_intake_digest_provenance`

---

## A. The command lives on the ATI application boundary

`ATIActionService.recordResponseReceived(requestId, assertion)`, following
10b's accepted pattern exactly:

```text
BEGIN → FOR UPDATE the request row → re-read lifecycle
      → validate submitted state + chronology
      → allocate response sequence and intake ids
      → write the response and every intake
      → COMMIT
```

`recordResponse` (10a) gained an `inTransaction` option so the whole thing is
one unit of work — same convention as `createRequest` and `workspace.ts`. No
persistence primitive is exposed as the application API.

---

## B. A response requires a request that was actually filed

At least one `SUBMIT`. `DRAFT` and `EXPORTED` are refused with
`ATI/RESPONSE_REQUIRES_SUBMISSION`, and check 2 also asserts no response row
was written.

This is `EXPORTED ≠ SUBMITTED` applied to the receiving end. Without it a
document found by other means could acquire ATI provenance because a draft
happened to exist. An acknowledgement is not required — institutions answer
without one (check 4 asserts the response lands *and* that no acknowledgement
was invented).

---

## C. A response may arrive after `CLOSE`

Implemented as released, and it is the one act not refused on a closed request.

| After `CLOSE` | |
| --- | --- |
| revise, export, submit, acknowledge, second close | refused (`ATI/REQUEST_CLOSED`) |
| record a received response | allowed |

Check 6 proves it is not a reopen in disguise:

- the response is recorded and visible;
- derived status stays `CLOSED`;
- `closedAt` does not move;
- the **event count is unchanged** — nothing was appended to the lifecycle at
  all, so there is no transition to mistake for one.

`deriveStatus` already ordered `CLOSE` ahead of `RESPONDED` in 10a, so no
persistence change was needed; the gate now pins that ordering as a released
decision rather than an implementation detail.

Check 7 then shows a late response unlocks nothing else, and that a *second*
late response is still permitted — §C is about responses only.

A late response may also be stamped before the close. It genuinely arrived then
and was entered later; the close is an administrative act, not an event the
response answers. The only chronology refused is a response predating the
submission (check 19, and same-instant arrival is accepted).

---

## D. Completeness records what was stated

`PARTIAL` / `FINAL` / `UNSTATED`, preserved byte-exact (check 8/9).

**`completeness` is a required field and never defaulted.** `UNSTATED` is a
choice the caller makes out loud, because the honest reading of silence is "we
were not told", and a command that filled it in would be inferring the one thing
ADR-0018 forbids. Check 10 asserts this from the interface source *and*
behaviourally — a response carrying exactly one record stays `UNSTATED`; one
arriving file does not make a response final.

---

## E. Zero, one or many records

Check 11/12/13 records three responses on one request with record counts
`[0, 1, 3]` and asserts exactly that. Check 14 asserts sequences `[1,2,3]`,
arrival order, and that `respondedAt` stays the *first* response — a later
partial does not rewrite it. Zero records is asserted not to imply completeness.

---

## F/G. Intake records arrival facts only, and nothing is retained

`ATIIntakeView` carries `intakeId`, `receivedAt`, `describedAs`, `mediaType?`,
`hasIntegrityDigest`, `digestOrigin?`, `acceptedSourceIds`.

Check 16 asserts, on a live view object, that the only key matching `/source/i`
is `acceptedSourceIds`, and that **no** key matches evidence class, origin
status, accessibility, relationship, provenance, finding or verified. Not a
comment about intent — an assertion over the object's own keys.

**No document store.** Durable intake state is identity + arrival metadata +
optional digest. The caller may pass `material`, which is hashed and discarded;
check D2 asserts the intake table has no column matching
`body|content(?!_hash)|blob|bytes|file_data|payload`.

**Identity is X-Ray's.** Allocated under the lock as
`{requestId}/R{sequence}/I{n}`. Check 15 sends two records both described as
`scan.pdf` and asserts two distinct ids, neither containing the filename, both
prefixed by the request, stable between write and read — and that
`IntakeAssertion` has no `intakeId` field for a caller to set.

The 10d seam this leaves possible is documented in ADR-0018 and
`ati-lifecycle.md`: load the durable intake, verify the material corresponds,
require a digest match where one exists, refuse material that cannot be tied to
the intake.

---

## H. Digest semantics — one migration, and why it was needed

The release said to add the smallest metadata necessary if the schema cannot
distinguish computed from supplied and that distinction materially affects 10d.
It does: 10d must "require digest match where available", and a match means
something different when X-Ray hashed bytes it held than when an institution
stated a digest in a covering letter. `0009` had a bare `content_hash text`, so
the two were indistinguishable and a stated digest was silently readable as a
verified one.

`0012_ati_intake_digest_provenance` adds exactly three things:

| | |
| --- | --- |
| `content_hash_origin` | `COMPUTED` \| `SUPPLIED` |
| `digest_states_its_provenance` | `(content_hash IS NULL) = (content_hash_origin IS NULL)` |
| `digest_is_normalized` | `content_hash ~ '^sha256:[0-9a-f]{64}$'` |

Command behaviour (checks D2, D3):

| Input | Stored |
| --- | --- |
| `material` | computed digest, `COMPUTED` |
| `suppliedDigest` only | normalized digest, `SUPPLIED` |
| both, agreeing | computed digest, `COMPUTED` |
| both, disagreeing | `ATI/DIGEST_MISMATCH` — a discrepancy to surface, not overwrite |
| neither | no digest, no provenance |
| malformed (`not-a-digest`, `md5:…`, 63 hex) | `ATI/DIGEST_MALFORMED` |
| bare or upper-case hex | normalized to `sha256:<lowercase>` |

v0 is sha256 only. Adding an algorithm is deliberately a migration rather than
an inference at read time.

D1 runs the focused migration test the release asked for: all four ATI
migrations up, **down newest-first**, up again, then asserts `content_hash_origin`
and both constraints survived. D3 additionally drives three malformed inserts
straight at the database — digest without provenance, provenance without
digest, unnormalized digest — and asserts each is refused, so the command is not
the only thing holding the shape.

**Digest equality is not epistemic identity.** D3 records two intakes with
identical material from different offices and asserts they remain two records.

---

## I/J/K. Identity, chronology, atomicity

Covered above and in checks 19–23. Two worth calling out:

**Check 22 — authorization reads post-lock state.** The interesting direction
here is the *permissive* one, because submission is append-only and cannot be
revoked. So: a `DRAFT` request whose export and submission land at the instant
the lock returns has its response **accepted**. Pre-lock state said `DRAFT` —
unauthorized — so only a post-lock read can authorize it. The same check then
asserts the chronology used the submission time that landed under the lock, by
refusing a response stamped before it: before the lock there was no submission
to compare against at all.

**Check 23 — atomicity at both layers.** Application level: one unusable record
(`describedAs: '   '`) refuses the whole response, and zero response and zero
intake rows survive. Database level: the response/intake transaction is driven
to a failing second insert (duplicate `intake_id`, which the command's own
allocation makes unreachable) and the response row is asserted gone. The first
proves the command refuses before writing; the second proves the rollback path
that would protect a partial write.

---

## L. No acceptance in 10c

Check 26 asserts the command boundary and the read model never reference
`acceptIntakeSource`, and that **no** command signature takes a `sourceId`. An
operator cannot say "make this intake SRC-123".

Check 18 asserts `receivedSourceIds` is empty and no acceptance row exists.
Check 25 then shows the mapping appearing only through 10a's guarded bridge
behind a committed version that actually added the source — and that acceptance
does not rewrite the receipt.

---

## Verification — the released list

| # | Requirement | Check |
| --- | --- | --- |
| 1 | unknown request rejected | 1 |
| 2 | DRAFT cannot receive | 2 (+ nothing written) |
| 3 | EXPORTED-unsubmitted cannot receive | 3 |
| 4 | SUBMITTED receives without ACKNOWLEDGE | 4 |
| 5 | ACKNOWLEDGED receives | 5 |
| 6 | response after CLOSE recorded, status stays CLOSED | 6 |
| 7 | post-close response permits nothing else | 7 |
| 8, 9 | PARTIAL and FINAL preserved exactly | 8/9 |
| 10 | completeness only per explicit contract | 10 |
| 11, 12, 13 | zero / one / several records | 11/12/13 |
| 14 | several responses, partial then later | 14 |
| 15 | intake ids X-Ray-owned, not filenames | 15 |
| 16 | no canonical Source id in table or read model | 16 |
| 17 | no Source, Evidence, Finding or version created | 17/24 |
| 18 | `receivedSourceIds` empty before acceptance | 18 |
| 19 | response before submission rejected | 19 |
| 20 | intake before its response rejected | 20 |
| 21 | state checked after acquiring the lock | 21 |
| 22 | stale pre-lock state cannot authorize | 22 |
| 23 | response + intake write atomic | 23 |
| 24 | snapshots and version pointer unchanged | 17/24 |
| 25 | read model separates intake from accepted Source | 25 |
| 26 | no command exposes `acceptIntakeSource` | 26 |
| 27 | 10a/10b gates green | `check:ati-lifecycle` 28/28, `check:ati-commands` 32/32 |
| 28 | #7/#8/#9 regressions green | 31 gates in `final-gate.txt` |
| 29, 30 | `tsc --noEmit`, `pnpm build` | `final-gate.txt` |
| — | digest provenance migration + integrity | D1, D2, D3 |

---

## Changes to existing green gates, stated plainly

Two, both mechanical:

1. `ATI_MIGRATIONS` moved to `publication-check-support.ts` as one exported
   list. Three private copies existed and all three broke the moment 0012
   landed; the 10a gate now round-trips four migrations instead of three.
2. `LockInterleavingDatabase` moved from `ati-command-checks.ts` to
   `ati-check-support.ts` so both gates share it rather than keeping two copies.

`check:ati-lifecycle` 28/28 and `check:ati-commands` 32/32 after both.

---

## Stop line (release §P) — nothing added

No raw-document or blob storage, no `Source` creation, no `Evidence`
extraction, no candidate workspace seeding, no execution runs for ATI
responses, no `ATI_RESPONSE_RECEIVED` version commits, no claim re-evaluation
causes, no public ATI routes or surfaces.

## Carried forward

- Native PostgreSQL concurrency remains unproven; `XRAY_POSTGRES_URL` unset, so
  `check:persistence-postgres-concurrency` is recorded **NOT RUN**. The gates
  prove ordering and deterministic shape, not row-lock scheduling.
- `claim_reevaluation_causes.ati_response_ref` still has no FK and no writer (10d).
- The generic committed-version → candidate-workspace primitive (#10 C6) is
  unbuilt (10d).
- No actor or authorisation layer.

## Files

- `verification/issue-10-10c/gate-bites.txt` — four adversarial runs, one per released decision
- `verification/issue-10-10c/final-gate.txt` — 25/25 plus the full sweep
