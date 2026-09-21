# Slice 10d — research bridge from ATI intake to immutable successor version

**Released from:** `25e26c7` · **blocker decided, remediated**
**Commits:** `5df8944` persistence → `75f2635` execution primitive → `6cf3357` bridge → `bc04331` gate → `bdbeb65` docs → `feat(pipeline)` staged debt + `test(ati)` bounds
**Gate:** `pnpm check:ati-research` — **35/35**
**Migration:** `0013_ati_response_identity_and_execution_cause`

---

## The blocker, and its approved resolution

**Found:** new evidence bearing on an already-graded claim could not cross a
stage boundary. A successor candidate is seeded with the predecessor's graded
findings; the moment a pre-`GRADE` stage adds evidence on one of those claims
the inherited finding stops mirroring `Evidence.relationship`, and no stage
before `GRADE` can repair it because `STAGE_OUTPUTS` gives `findings` to `GRADE`
and `GAPS` only. Generic to every re-evaluation trigger, not ATI-specific.

```text
stage TRACE introduced 1 validation error(s): XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH
stage TRACE wrote 'findings', which it does not own
  (owns: claims, sources, evidence, sourcePositions)
```

**Decided:** the mismatch is permitted as explicit staged debt during a
successor-version re-evaluation, from the first pre-`GRADE` evidence change
until `GRADE` takes its turn. Implemented as `isStagedDebt` in
`pipeline/run.ts`, beside the `GRADE`/`GAPS` exemption 6a already put there —
both say the same thing: a stage may not be failed for debt the stage that will
pay it has not yet had a turn to pay.

**The decision widened the fix I had proposed, and correctly.** I had suggested
a `TRACE`-only exemption. That would have failed one stage later:
`PROVENANCE`'s own boundary check sees the same inherited mismatch, because
nothing between `TRACE` and `GRADE` repairs it. Check **E4** exists for exactly
that, and asserts `PROVENANCE`, `DISCONFIRM` and `RECONCILE` all pass through
before `GRADE` repays.

### Each bound, and the check that holds it shut

| Bound | Check | What it asserts |
| --- | --- | --- |
| successor re-evaluation only | **E1** | the same stages and evidence without the flag still fail at `TRACE` |
| before `GRADE` only; debt ends at `GRADE` | **E2** | a `GRADE` that declines to repair the finding fails, at `GRADE` |
| `GRADE` scheduled and still to run | **E3** | with `GRADE` removed from the plan, `TRACE` fails as before |
| one code only; `FULL` untouched | **E5** | both `STAGED` and `FULL` still report the mismatch as `ERROR`; the code appears once in `run.ts`; all four guards present |
| nothing before `GRADE` fails on inherited debt | **E4** | `PROVENANCE`/`DISCONFIRM`/`RECONCILE` pass, and the FULL gate accepts the repaired graph |

`FULL` is untouched in the strongest sense: **no validator changed at all.**
E5 constructs the exact intermediate state and asserts `validateXRayGraph`
reports the mismatch as an `ERROR` in *both* modes. The exemption is a rule
about when a transition is acceptable, not about what is valid, and the
`VALIDATE` gate's FULL pass sees the final state with no exemption.

### The bounds are load-bearing, not decorative

`verification/issue-10-10d/exemption-bounds.txt` widens the exemption by one
bound at a time:

| Variant | Result |
| --- | --- |
| **W1** drop the successor bound | E1 fails — a first research run carries the debt |
| **W2** drop the before-`GRADE` bound | E2 fails — the run reaches `GATE_BLOCKED`, so FULL catches what the transition let through |
| **W3** drop the scheduled-`GRADE` bound | E3 fails — the failure merely moves to `GAPS` |
| **W4** widen to all `XR-INV-007` codes | E5 fails |
| **R1** remove the exemption entirely | 17/20/21, E2 and E4 fail — the pre-decision state |

**One honest limitation.** W4 is caught by the **structural** assertion in E5
only, not behaviourally: no other `XR-INV-007` violation arises in these runs,
so widening the code match is invisible to the run outcomes. The check asserts
the single code appears exactly once in `run.ts` and that all four guards are
present, which is a claim about the code rather than about behaviour.

### What the decision unblocked

| Released item | Before | Now |
| --- | --- | --- |
| 17 · changed claim outside origin gap included | unprovable | **proven** through the pipeline |
| 20 · re-evaluated claim gets `EXTERNAL_RECORD_RESPONSE` | persistence layer only | **proven** through the pipeline |
| 21 · cause references the exact durable response | persistence layer only | **proven** through the pipeline |

Check **17/20/21** now drives the whole path: evidence bearing on `C001`, which
v2 already graded; `GRADE` repairs the finding; the successor commits; `C001`
appears in `reEvaluatedClaimIds` with reason `EXTERNAL_RECORD_RESPONSE` and
cause `{ATI_RESPONSE, ATI_RESPONSE:ATI-D-REGRADE:1}`. It also asserts `C001` is
**not** in the origin gap's claim list, so this is simultaneously the
"outside the origin gap" case, and that the committed finding really does name
the evidence that arrived — `GRADE` paid the debt rather than the check merely
tolerating it.

Checks 16/18/19 still prove the converse on the discovered-claim path: the gap
names claims, none changed, the recorded set is empty, and the newly discovered
claim is absent from it.

---

## The second blocker: the run mode was not durable

**Found in review of `01a14bb`, and real.** `startReevaluation` set
`successorReevaluation: true`; `resumeExecution` did not. So a re-evaluation
interrupted after `TRACE` checkpointed a state that was legal when written, and
then failed on restart because the resumed pipeline no longer knew what kind of
run it was:

```text
stage PROVENANCE introduced 1 validation error(s): XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH
```

A checkpoint that cannot be restored. Preserved verbatim in
[`resume-loses-run-mode.txt`](resume-loses-run-mode.txt), which reverts
`resumeExecution` to the reviewed state and fails D1, D2 and D4.

**Fixed as directed: reconstructed from durable execution metadata.**
`isSuccessorReevaluation(executionRunId)` reads the run's own
`execution_run_causes` row and answers from its `intendedTrigger` — no row, or
`INITIAL_RESEARCH`, means a first research run.

Both paths that start a pipeline now call that one helper, and
`startReevaluation` **stopped asserting the flag** and reads it back from the
cause it just wrote. That is the structural half of the fix: the defect was two
call sites where one forgot, so there is no longer a literal to forget. D2
asserts `successorReevaluation: true` appears nowhere and the derived form
appears exactly twice.

**Never inferred from graph shape.** D2 also asserts the helper reads the cause
and inspects no `currentVersion`, no `findings`, no version number. A candidate
that happens to carry graded findings says nothing about what the run was
started to do, and inferring it would hand the exemption to anything that
looked similar enough.

### The required proofs

| Check | What it drives |
| --- | --- |
| **D1** | graded predecessor → `TRACE` banks the debt → `PROVENANCE` dies → checkpoint → **fresh `InlineExecutionService`** → resume → `PROVENANCE`/`DISCONFIRM`/`RECONCILE` pass → `GRADE` repairs → FULL clean → promotes with `C001` re-evaluated |
| **D3** | a run with **no** cause row, parked mid-flight over a graded seed, resumed: fails at `TRACE`. Not a re-evaluation however much its candidate looks like one |
| **D4** | `NEW_SOURCE_RECEIVED`, no intake and no ATI reference, interrupted and resumed: completes with FULL clean. The primitive is generic, so the rules that apply to it are too |

D1 first asserts the checkpoint genuinely carries the debt — `STAGED` reports
the mismatch on the parked graph, and `TRACE`'s new source is banked — so a
passing restart cannot be a run that simply had nothing to restore.

### One consequence worth flagging

Three gates now migrate the full chain through `0013` rather than a subset:
`check:inline-execution`, `check:api-routes`, `check:lifecycle`. The execution
layer's resume path genuinely reads `execution_run_causes`, so a gate
exercising resume must have the schema the code requires. I did **not** make
`readExecutionCause` tolerant of a missing table: swallowing that error would
return `false` and silently reintroduce exactly this class of bug.

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
| 17 | changed claim outside origin gap included | 17/20/21 |
| 18 | unchanged origin-gap claim absent | 16/18/19 |
| 19 | discovered claim not marked re-evaluated | 16/18/19 |
| 20 | re-evaluated claim gets EXTERNAL_RECORD_RESPONSE | 17/20/21 (pipeline) and 20/21/22 (persistence) |
| 21 | cause references exact durable response | 17/20/21 and 20/21/22 |
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
| 37 | execution audit restart/resume compatible | 37, and D1/D4 for the real restart |
| 38 | historical findings addressable | 28/38 |
| 39 | ATI lifecycle rows unchanged | 39 |
| 40 | 10a/10b/10c gates green | 28/28, 32/32, 25/25 |
| 41 | #7/#8/#9 regressions green | 31 gates in `final-gate.txt` |
| 42, 43 | `tsc --noEmit`, `pnpm build` | `final-gate.txt` |

---

## Changes to existing green gates

Three.

1. `pipeline/run.ts` — the approved staged-debt exemption. The two existing
   exemptions now live in one documented predicate, `isStagedDebt`, instead of
   an inline condition. `check:pipeline` 54/54 and `check:validation` 52/52
   after it, and no validator was modified.
2. `commitFurtherVersion` in `publication-check-support.ts` takes an optional
   `reEvaluationAudit` override, so a gate can exercise a specific reason and
   cause. The claim ids must still match what the candidate changed;
   `commitNextVersion` checks that itself.
3. `check:inline-execution`, `check:api-routes` and `check:lifecycle` migrate
   through `0013` instead of a subset, because `resumeExecution` reads
   `execution_run_causes`. All three green: `PASS`, 23/23, 21/21.

## Stop line (release §W) — nothing added

No public ATI pages or forms, no operator UI, no automated filing, no
notification delivery, no publication changes, no demo workflow.

## Carried forward

- Native PostgreSQL concurrent commit remains unproven —
  `check:persistence-postgres-concurrency` is recorded **NOT RUN**.
  Predecessor conflict is proven deterministically by committing a competing
  version first; row-lock scheduling is not.
- No actor or authorisation layer.

## Files

- `verification/issue-10-10d/resume-loses-run-mode.txt` — the reviewed state failing the restart proofs
- `verification/issue-10-10d/exemption-bounds.txt` — five runs widening or removing the staged-debt exemption
- `verification/issue-10-10d/gate-bites.txt` — three adversarial runs, one per released constraint
- `verification/issue-10-10d/final-gate.txt` — 35/35 plus the full sweep
