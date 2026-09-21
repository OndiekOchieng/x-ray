# Slice 10d — research bridge from ATI intake to immutable successor version

**Released from:** `25e26c7`
**Commits:** `5df8944` persistence → `75f2635` execution primitive → `6cf3357` bridge → `bc04331` gate → `docs(ati)`
**Gate:** `pnpm check:ati-research` — **28/28**
**Migration:** `0013_ati_response_identity_and_execution_cause`

---

## Read this first — one blocker, proven three ways

**New evidence bearing on an already-graded claim cannot cross a stage
boundary.** Found while building this slice, and it blocks the release's own
central acceptance rule (§K/§M items 17, 20, 21).

The pipeline validates the graph after every stage and fails the stage on any
error it introduced. When `TRACE` adds evidence bearing on a claim the
predecessor already graded, the inherited finding no longer mirrors
`Evidence.relationship`, so:

```text
stage TRACE introduced 1 validation error(s): XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH
```

`TRACE` cannot repair it, because `STAGE_OUTPUTS` does not give it `findings`:

```text
stage TRACE wrote 'findings', which it does not own
  (owns: claims, sources, evidence, sourcePositions)
```

And only `TRACE` and `DISCONFIRM` may write evidence; neither may write
findings. So **no single stage can add evidence to a graded claim and leave the
mirror true**, and the run never reaches `GRADE`, which is the stage that would
fix it.

Checks **B1**, **B2** and **B3** assert exactly this. B3 also asserts that the
claim in question really is present and graded at the committed version, so the
empty audit set is the blocker's consequence and not a missing fixture.

**Why it never appeared before.** On a first research run there are no findings
when `TRACE` runs, so the mirror check has nothing to check. It only bites on a
run seeded from a *graded predecessor* — which is what a re-evaluation is, and
which nothing before 10d did. **It therefore affects every re-evaluation
trigger**, not only `ATI_RESPONSE_RECEIVED`: `NEW_SOURCE_RECEIVED` has the same
problem.

**What I did not do.** The remediation is one more narrow `STAGED` exemption in
`pipeline/run.ts`, beside the one 6a already added there:

```ts
// existing, 6a
stage === 'GRADE' && journal.staleStages().includes('GAPS')
  && v.code === 'XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP'

// proposed shape, same reasoning: the stage that will fix it has not run yet
stage === 'TRACE' && /* GRADE still pending in this pass */
  && v.code === 'XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH'
```

That is #6's validation transition rule, not 10d's, and the same kind of
decision as D15 and the rejected `GRADE`/`GAPS` reordering. I have not changed
it. Everything not downstream of it is delivered and proven below.

### What this costs, precisely

| Released item | Status |
| --- | --- |
| 17 · changed claim outside origin gap included | **unprovable today** — no run can change an existing claim |
| 20 · re-evaluated claim gets `EXTERNAL_RECORD_RESPONSE` | proven at the **persistence** layer (check 20/21/22), vacuous through the pipeline |
| 21 · cause references the exact durable response | same |
| 16, 18, 19 · gap claims not used; unchanged gap claim absent; discovered claim not re-evaluated | **proven** — and strongly, because the gap names claims and the recorded set is empty |

The committed happy path works: a received record becomes a canonical `Source`,
a new version commits with `ATI_RESPONSE_RECEIVED`, and the acceptance mapping
is written inside the commit. What it cannot yet do is re-grade a claim that
already had a grade.

---

## A. One generic re-evaluation primitive

`InlineExecutionService.startReevaluation(request)` — an execution capability,
not ATI machinery. It takes an investigation, an exact expected predecessor, a
trigger, and an **opaque** cause. Nothing in it references ATI, and
`ATI_RESPONSE_RECEIVED` is one trigger among `NEW_SOURCE_RECEIVED`,
`RE_EVALUATION` and `CORRECTION`.

Before any stage runs:

1. the expected predecessor must be **currently** latest, else `VersionConflict`
   — seeding from a superseded version is the silent rebase the no-rebase rule
   forbids, and would only surface at commit;
2. that exact snapshot is read through the same `readSnapshot` every other
   reader uses;
3. the run's cause is durable.

It does not promote, assess or commit. Those stay `GraduationService`'s, on
#7's rules, unchanged. There is no ATI version writer.

## B/C. Seed shape, and what is deliberately not inherited

Check 8/9 asserts the plan was handed the committed v2 snapshot byte-for-byte,
and that all ten canonical collections reach the first stage unchanged.

Check 11 asserts run-owned state was reset: `currentVersion` = predecessor + 1,
`status` `RUNNING`, no `completedAt`, no `researchStop`, no stage runs — while
identity, `surfaceSourceId` and `protocolVersion` carry.

**This matters more than it looks.** `commitNextVersion` reads exactly
`status`, `completedAt` and `researchStop.reason === 'SATURATION'` to decide
whether research is complete. A candidate that inherited them would be a
finished run before doing anything. Variant A in `gate-bites.txt` inherits them
and check 11 catches it.

A consequence worth stating: because the stop is cleared, the run has to **earn
its own**. The gate's `DISCONFIRM` stage therefore covers every material claim
with no disconfirmation attempt, which the benchmark corpus does not fully carry
— its recorded `SATURATION` is history of whatever produced it, and
`assessResearchStop` does not re-derive it from the corpus alone. That is the
correct behaviour (6c: a single pass cannot prove saturation), not a workaround.

## D/E. Material is explicit, and bound before anything executes

`ATIIntakeMaterial` follows ADR-0010's retrieved-document boundary:
`boundedContent`, `truncated`, `mediaType?`, `contentDigest?`, `locator?`,
`observedMetadata?`. Check 12/13 asserts from the declaration's own source that
it carries **no** `evidenceClass`, `originStatus`, `accessibility`, `sourceId`,
`claimIds`, `relationship` or `proposition`.

| Binding condition | Rejection |
| --- | --- |
| intake unknown | `ATI/INTAKE_NOT_FOUND` |
| material names another intake | `ATI/INTAKE_WRONG_INVESTIGATION` |
| no material at all | `ATI/MATERIAL_MISSING` |
| receipt digest exists and differs | `ATI/MATERIAL_DIGEST_MISMATCH` |
| caller's stated digest differs from its own bytes | `ATI/MATERIAL_DIGEST_MISMATCH` |
| intake already accepted | `ATI/INTAKE_ALREADY_ACCEPTED` |

Check 3 asserts rejection happens **before** any run, workspace or cause row
exists. Check 4/5/6 asserts a `COMPUTED` receipt verifies, a `SUPPLIED` receipt
verifies **without its provenance being rewritten**, and an intake with no
stored digest is processable with a freshly computed execution digest while its
receipt row stays byte-identical.

What equality proves is bounded, and the code says so: correspondence to the
stored receipt claim. Not authenticity, not completeness, not what the document
shows.

## G/H/O. Causality that survives a run adding nothing

`ati_responses` gains a stable `id`; `claim_reevaluation_causes.ati_response_ref`
becomes a foreign key to it. The column had existed since 0003 as free-form text
with nothing behind it.

**One design note.** §N asked for "response id is identity, sequence is
position". I added the column with `NOT NULL UNIQUE` and **no** CHECK pinning
its form. `atiResponseRef()` mints `ATI_RESPONSE:{request}:{sequence}` for v0,
which is deterministic and reconstructable (§G's suggested form), and a future
opaque id changes that one function rather than the schema. The alternative —
a CHECK tying the id to `(request, sequence)` — would have made identity and
position the same thing, which is what §N separates. The tradeoff: today the id
*is* derived from position, so reconstructability is an application guarantee
rather than a schema one. Check 20/21/22 asserts the stored id resolves to the
response the run answered.

The backfill had to `DISABLE TRIGGER append_only_ati_responses` for exactly one
`UPDATE` — the trigger rejects every update on that table, which is also what
makes the id immutable once written.

`execution_run_causes` records, before the run executes: seeded from vN, exists
because intake I of response R was processed, intended trigger
`ATI_RESPONSE_RECEIVED`, with FKs to both. Generic by `kind`, append-only,
durable execution audit rather than canonical state. Check 7 asserts the exact
links, the reconstructable chain via `runsForIntake`, and that the row cannot be
edited afterwards.

Without this table the chain was only reconstructable *backwards* from the
acceptance mapping — which does not exist while a run is going, and
legitimately never exists for a run that adds nothing.

## I/J. Entry at the retrieval boundary, and every stage runs

`intakeResearchAdapter` presents the material as one already-obtained
`RetrievedDocument`. Check 12/13 asserts the returned object carries no
`evidenceClass`, `originStatus`, `accessibility`, `sourceType`, `claimIds` or
`relationship`, and that the committed `Source`'s determinations came from the
stage. `ResearchAdapter` has no operation that could yield `Evidence` at all.

Check 14 asserts all seven planned research stages ran in order and that both
`VALIDATE` and `REVIEW` gate entries are in the journal with a recorded valid
result. A ministry-supplied document is not exempt from `PROVENANCE`,
`DISCONFIRM`, `RECONCILE`, `GRADE` or `GAPS`.

Check 15 asserts the added `Source` id is `SRC-nnn` from `ctx.ids.source()` and
contains neither the intake id, the locator, nor `.pdf`.

## K/L/M/N. The audit set

Check 16/18/19 is the strongest form available today: the origin gap **does**
name claims, none of them changed, and the recorded set is **empty**. A gap
whose claims were used would have produced a non-empty set; using them would
also have broken the commit outright, which variant B in `gate-bites.txt`
demonstrates (`Every re-evaluated claim requires exactly one reason record`).
The same check asserts the newly discovered claim is absent from the set —
`changedClaimIds` filters to claims present in the predecessor, so a discovered
claim gets its first evaluation.

Check 20/21/22 drives the `EXTERNAL_RECORD_RESPONSE` + exact-cause path at the
persistence layer, reads it back through `readReEvaluationAudit`, and proves
relational integrity where it matters: a commit whose audit names
`ATI_RESPONSE:NOBODY:1` is refused by the deferred foreign key and takes the
whole version with it. (An earlier attempt to prove the FK by direct insert was
refused first by the version-immutability guard — a better protection, but not
the proof asked for, so the check goes through the commit path instead.)

## Q/R/S. Zero-change, and acceptance inside the commit

Check 30: a duplicate record yields `NO_CANONICAL_CHANGE` — no version, no
acceptance, and the run and cause still readable with `committedVersion: null`,
so the outcome is legible as a research result rather than an absence. The
intake stays received and unaccepted.

Acceptance participates in `commitNextVersion`'s own transaction, written
**after** the pointer advances. I chose §S's recommendation, implemented
declaratively rather than as a callback: `intakeAcceptances?: {intakeId,
sourceId, acceptedAt}[]`. A hook taking code would let any caller mutate
canonical state inside #7's commit; a caller stating links cannot. Each named
source must be one this version added — checked in `commitNextVersion` and
again by 0011's trigger.

**The ordering is load-bearing, not cosmetic.** Variant C in `gate-bites.txt`
moves the acceptance write before the pointer advance and the happy path fails
with 0010's own words: *"version 3 of XRAY-ATI-RESEARCH is not committed yet;
acceptance requires a committed version."*

There is therefore **no partial-failure window** to reason about: check 29/34
asserts a conflicted commit writes neither a version nor an acceptance, so an
acceptance cannot outlive the version it points at.

## T/U. No rebase, and history preserved

Check 29/34 commits a competing version between `assess` and `commit`, and
asserts the stale commit fails while the version count and acceptance count are
both unchanged. Nothing replays against the new latest.

Check 28/38 asserts v1 and v2 are byte-identical after the ATI commit, that v2's
findings are still addressable at v2, and that v3 carries its own. Check 39
asserts research changed no revision, event, status or timestamp on any ATI
request — the only difference on the processed request is the acceptance mapping
research itself produced.

## P. Duplicate processing

Check 35: an intake with committed acceptances is refused a second pass
(`ATI/INTAKE_ALREADY_ACCEPTED`) — a second run would produce a second version
from one record with an indistinguishable cause. Check 36: a run that failed to
reach a committable state writes no acceptance and leaves the intake
processable; a second attempt commits, and `runsForIntake` shows two runs with
exactly one committed.

---

## Verification — the released list

| # | Requirement | Check |
| --- | --- | --- |
| 1 | unknown intake rejected before execution | 1 |
| 2 | wrong-investigation intake rejected | 2 |
| 3 | digest mismatch rejected before execution | 3 |
| 4 | matching COMPUTED receipt accepted | 4/5/6 |
| 5 | matching SUPPLIED accepted, provenance intact | 4/5/6 |
| 6 | no stored digest → processed, receipt untouched | 4/5/6 |
| 7 | durable cause linked to exact intake + response | 7 |
| 8 | seeded from exact latest committed predecessor | 8/9 |
| 9 | candidate inherits predecessor collections exactly | 8/9 |
| 10 | version metadata predecessor+1 / supersedes / ATI trigger | 23 |
| 11 | predecessor completion state not carried | 11 |
| 12 | material enters at the retrieval boundary | 12/13 |
| 13 | adapter cannot mint Evidence | 12/13 |
| 14 | required downstream stages run | 14 |
| 15 | Source ids from stage output | 15 |
| 16 | origin gap claim ids not used | 16/18/19 |
| 17 | changed claim outside origin gap included | **BLOCKED** — B1/B2/B3 |
| 18 | unchanged origin-gap claim absent | 16/18/19 |
| 19 | discovered claim not marked re-evaluated | 16/18/19 |
| 20 | re-evaluated claim gets EXTERNAL_RECORD_RESPONSE | 20/21/22 (persistence layer) |
| 21 | cause references exact durable response | 20/21/22 |
| 22 | cause has relational integrity | 20/21/22 |
| 23 | trigger is ATI_RESPONSE_RECEIVED | 23 |
| 24 | VALIDATE runs | 14 |
| 25 | REVIEW runs | 14 |
| 26 | graduation required before commit | 26/27 |
| 27 | PASS / eligible BLOCKED unchanged | 26/27 |
| 28 | predecessor byte-identical | 28/38 |
| 29 | stale predecessor → conflict, nothing written | 29/34 |
| 30 | zero-new-Source commits no version | 30 |
| 31 | one added Source → one acceptance | 31 |
| 32 | several added Sources → all and only those | 32 |
| 33 | inherited Source cannot be accepted | 33 |
| 34 | acceptance atomic with commit | 29/34 + variant C |
| 35 | duplicate after accepted rejected | 35 |
| 36 | failed prior run does not poison the intake | 36 |
| 37 | execution audit restart/resume compatible | 37 |
| 38 | historical findings addressable | 28/38 |
| 39 | ATI lifecycle rows unchanged | 39 |
| 40 | 10a/10b/10c gates green | 28/28, 32/32, 25/25 |
| 41 | #7/#8/#9 regressions green | 31 gates in `final-gate.txt` |
| 42, 43 | `tsc --noEmit`, `pnpm build` | `final-gate.txt` |

---

## Changes to existing green gates

One, mechanical: `commitFurtherVersion` in `publication-check-support.ts` takes
an optional `reEvaluationAudit` override, so a gate can exercise a specific
reason and cause. The claim ids must still match what the candidate changed;
`commitNextVersion` checks that itself.

## Stop line (release §W) — nothing added

No public ATI pages or forms, no operator UI, no automated filing, no
notification delivery, no publication changes, no demo workflow.

## Carried forward

- **The stage-boundary blocker above.** Needs a #6 decision.
- Native PostgreSQL concurrent commit remains unproven —
  `check:persistence-postgres-concurrency` is recorded **NOT RUN**.
  Predecessor conflict is proven deterministically by committing a competing
  version first; row-lock scheduling is not.
- No actor or authorisation layer.

## Files

- `verification/issue-10-10d/gate-bites.txt` — three adversarial runs, one per released constraint
- `verification/issue-10-10d/final-gate.txt` — 28/28 plus the full sweep
