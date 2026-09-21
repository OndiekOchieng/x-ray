# Slice 10e — ATI action surface and integrated end-to-end gate

**Released from:** `d5b9051`
**Commits:** `3162eb2` routes → `ef44fad` surface → `ebf9a28` gate → `docs(ati)` closeout
**Gate:** `pnpm check:ati-surface` — **18/18** (covering the 42 released items)

---

## The loop, through the product's own routes

One executable lifecycle, every step an exported route handler with a real
`Request`:

```text
committed v2 · eligible gap
  POST   /ati/requests                              → draft, anchored to v2 · GAP
  POST   /ati/requests/{id}/revisions               → revision 2
  POST   /ati/requests/{id}/exports        {revision: 2}
  POST   /ati/requests/{id}/submission     {humanConfirmed, exportSequence}
  POST   /ati/requests/{id}/acknowledgements
  POST   /ati/requests/{id}/responses      → 2 records, ids allocated by X-Ray
  POST   /ati/intakes/{intakeId}/processing {material}
                                                    → v3 · SRC-023 · C001 re-graded
  POST   /ati/requests/{id}/closure
  POST   /ati/requests/{id}/responses               → late response, stays CLOSED
```

What that proves is transport, parsing, status codes and the DTOs the surface
renders — not the services underneath, which their own gates already cover.
Check 38 additionally asserts the page loader and the list route return
**byte-identical** surfaces, so the screen and the API cannot drift.

---

## The critical distinctions, and where each is held

| Distinction | Held by |
| --- | --- |
| `EXPORTED ≠ SUBMITTED` | check 7 — an export produces no `filedNote` and no `submittedAt`; check 8 — an unaffirmed submission is `400`; the not-filed notice is present at **every** stage, not only on a draft |
| response received ≠ claim established | check 33 — `confirms the claim` fails the wording scan (variant W2) |
| request `CLOSED` ≠ gap resolved | check 23/24/25/26 — no gap status moved at v2 after the whole lifecycle; every surface carries `says nothing about whether the gap is resolved` |
| intake ≠ Source | check 11/14 — `Received record` / `Awaiting research`, no `acceptedSourceIds` until research committed; check 19/20 — the label becomes `Researched into Source …` and the receipt is unchanged |
| inferred ≠ confirmed custody | check 4/5 — `Likely holder — inferred` vs `Holder — confirmed`; `the responsible office` is a forbidden phrase |
| mutable ATI state out of immutable public payloads | check 32 — the public v3 projection carries no request id, intake id, holder or custody field, and the public version route may not so much as name ATI state (variant W5) |

---

## §L is executable, and one judgment call in how

All copy is authored in `projections/ati-surface.ts`; the component writes none
of its own, which check `a11y` asserts by extracting rendered prose and
allowing only six structural headings. So the wording scan has one place to
look, and check 33 runs the eight forbidden implications — plus X-Ray-filed-it
and motive/blame/ranking — across every route body and every loaded surface.

**The judgment call.** The scan is sentence by sentence, and **a sentence that
denies a forbidden implication is the policy working, not a violation**.
`gapStatusNote` exists to say *"this says nothing about whether the gap is
resolved"* — which contains the very phrase it refuses. So a match fails unless
its own sentence negates it.

That is weaker than banning the phrase outright and stronger than not checking:
an affirmative claim has nowhere to hide, and a denial may use the words it
denies. The gate also asserts the positive statements are **present**, so copy
cannot pass by saying nothing — variant W3 replaces the not-filed notice with
`Request prepared.` and fails two checks.

**Two of my own patterns were over-broad on the first run**, which is the third
time this class of mistake has appeared in this project, so it is worth naming:
`/ati/i` matched *investig**ati**on*, and the gap-resolution pattern matched its
own denial. Both fixed, and the sentence-level design is the response to the
second.

### The gate bites

`verification/issue-10-10e/gate-bites.txt`:

| Variant | Result |
| --- | --- |
| **W1** copy turning non-response into refusal | check 33 fails — `"refused" implies the institution refused` |
| **W2** copy turning a response into a confirmed claim | check 33 fails |
| **W3** drop the not-filed notice | checks 3/4/6 **and** 33 fail |
| **W4** an export reports a filing | check 7 fails |
| **W5** the public version route names ATI state | check 32 fails |

---

## What no route exposes (§B, items 30–31)

Check 30/31 reads all nine route files **and** the transport module and asserts
none references `acceptIntakeSource`, `commitNextVersion`,
`claim_reevaluation_audit`, `recordExport(`, `recordResponse(db` or
`insertSnapshotRows`, and that no write body reads a `sourceId`.

The absence *is* the enforcement. There is no endpoint that writes an
intake→Source link, because that link is a result of research committing a
version rather than something an operator declares. Similarly, intake ids are
refused from the caller (`400`) — identity is allocated under the request lock,
because two institutions both send `scan.pdf`.

A request or intake addressed under the wrong investigation is `404`, not
`403`: saying "wrong owner" would confirm it exists somewhere else.

---

## Processing, honestly (§I, §J)

The receipt is all 10c kept, so the surface asks for the material rather than
offering a button that would fabricate a `Source`. Check 17/18:

- no material → `400`, and the message says *X-Ray keeps a receipt for this
  record, not the record*;
- wrong material → `422 ATI/MATERIAL_DIGEST_MISMATCH`, and **no execution run
  was created**.

The three outcomes read distinctly. Check 21 drives `NO_CANONICAL_CHANGE` end to
end and asserts no `committedVersion` and no `addedSourceIds` appear, no version
row was written, the copy says *a research result, not a failure*, and the run
is still readable through `GET …/processing` — so the outcome is legible as a
result rather than as an absence.

---

## Verification — the released list

| # | Requirement | Check |
| --- | --- | --- |
| 1, 2, 34 | eligible gap offers the draft; other paths do not | 1/2/34 |
| 3 | exact origin version and gap named | 3/4/6 |
| 4, 5 | inferred renders inferred; confirmed renders confirmed | 4/5 |
| 6 | DRAFT states it is not filed | 3/4/6 |
| 7 | export shows exact revision, not submitted | 7 |
| 8, 9 | explicit human submission; unsupplied metadata absent | 8/9 |
| 10 | acknowledgement is an event | 10 |
| 11 | PARTIAL/FINAL/UNSTATED exactly as recorded | 11/14/15/16 |
| 12, 13 | late response visible, status CLOSED, nothing unlocked | 12/13 |
| 14 | intake not called Source/Evidence/proof | 11/14/15/16 |
| 15, 16 | supplied digest not verified; computed distinguishable | 11/14/15/16 |
| 17, 18 | no material → refused; mismatch → no run | 17/18 |
| 19, 20 | COMMITTED links the version; Sources appear only then | 19/20 |
| 21 | NO_CANONICAL_CHANGE shows no version, no Source | 21 |
| 22 | NOT_COMMITTABLE implies nothing about the record | 33 (`Nothing was concluded about the material itself.`) |
| 23, 24, 25, 26 | no action changed a gap; only the new version may | 23/24/25/26 |
| 27, 28, 29 | v2 byte-identical; history readable; exported revision recoverable | 27/28/29 |
| 30, 31 | no acceptance route; no version-commit route | 30/31 |
| 32 | no public payload embeds ATI state | 32 |
| 33, 35, 36, 37 | forbidden implications absent from rendered copy | 33/35/36/37 |
| 38 | full loop through routes and the page's own loader | the loop, and 38 |
| 39 | 10a–10d gates green | 28/28, 32/32, 25/25, 35/35 |
| 40 | #7/#8/#9 regressions green | 31 gates in `final-gate.txt` |
| 41, 42 | `tsc --noEmit`, `pnpm build` | `final-gate.txt` |

---

## Limitations, stated rather than implied

**Accessibility is asserted structurally.** Node's type-stripping cannot execute
JSX and this repository has no renderer in its harnesses, so the `a11y` check
reads the component source: an accessible section name, native `<button>`
controls (so keyboard-reachable), `aria-disabled` with an `aria-describedby`
reason rendered **in text**, and every coloured state also carrying a word. That
is weaker than rendering and asserting against a DOM. #11 owns the full
responsive and accessibility audit.

**No production authentication.** Out of scope for #10 by instruction. Mutation
routes follow #8's application boundary conventions and are not reachable
through the public immutable resolver, but the trusted-host assumption is
exactly what it was before 10e. 10e did not solve it and does not pretend to.

**Native PostgreSQL concurrency remains unproven.**
`check:persistence-postgres-concurrency` is recorded **NOT RUN** —
`XRAY_POSTGRES_URL` is unset.

**Scope kept narrow.** One panel component, one projection, nine routes, one
loader, and a section on the existing explorer. No redesign, no demo scripting,
no low-bandwidth work, no claims/evidence journey — those are #11's.

## Files

- `verification/issue-10-10e/gate-bites.txt` — five adversarial runs
- `verification/issue-10-10e/final-gate.txt` — 18/18 plus the full sweep
