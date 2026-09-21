# 20 — initial-run REVIEW and first-version graduation

Branch `feat/live-provider-composition`, from `c754754`.
Fixes first-light **Finding 5** only. The normal initial journey is now
reachable end to end:

```
research stages -> FULL VALIDATE -> live ReviewerModel judgments
  -> durable REVIEW -> graduation -> immutable version 1
```

## The five seams, as found

**1 · `runPipeline` REVIEW.** After the VALIDATE gate, it called
`reviewXRayGraph(graph, { validation, reviewedAt })` — pure and synchronous.
`RunOptions` carried **neither** a reviewer **nor** judgments, so the gate never
asked anything and every model-assisted check was `NOT_EVALUATED` in *every*
run. It journals a REVIEW gate whose result **references** the round by index
rather than copying it.

**2 · Durable `reviewHistory`.** Already solid. `execution-audit.ts` persists
rounds, cross-checks the gate's `roundIndex` against them, and is append-only —
it refuses a shrunk or divergent prefix. A review was already durable and
readable back; what was missing was a review to persist.

**3 · `GraduationService`.** `promote` builds the version envelope from
predecessor + candidate, `assess` collects judgments then calls
`assessGraduation`, `commit` reads the latest assessment and checkpoint and
calls `commitNextVersion`. All three had exactly one production caller:
`ATIResearchBridge.processIntake`.

**4 · `commitNextVersion`.** Strong, and entirely predecessor-shaped. Six
obstacles to a first version: the version arithmetic
(`expectedPredecessor + 1`); `readSnapshot` of the predecessor;
`assertVersionDiff` requiring one; `VersionConflict` typed to a number;
`supersedesVersion !== previous.currentVersion`; and the pointer advance
`latest_committed_version = $3`, which can never match a `NULL`.

**5 · First-version persistence.** `writeInitialSnapshot` exists and inserts a
v1 directly — with **no assessment, no graduation audit and no execution-run
link**. That is right for seeding a fixture and wrong for a version claiming to
have been researched. Using it for a live v1 would have been exactly the
parallel ad-hoc commit system the decision forbids.

So the gap was three things, not one: the gate could not ask, no application
path graduated an initial candidate, and persistence could not express "no
predecessor".

## What changed

### Decision 1 — the reviewer stays out of `StageAdapters`

`RunOptions.reviewer` is a new field, and `StageAdapters` still carries
`{ model?, research? }` and nothing else. A research stage cannot ask for a
judgment about the graph it is building, because `ctx.adapters` is the only
thing it sees. `inline-execution` resolves the host seam and passes the
reviewer to `runPipeline`; the gate then does

```
ReviewerModel -> collectModelJudgments -> judgments as data -> pure reviewXRayGraph
```

Check **9** asserts all of it structurally; controls BA and BB break each half.

### Decision 2 — the same review is not performed twice

`GraduationOptions.review` accepts a review already performed on *this* graph,
and `assessGraduation` checks the fingerprint before using it — so a review of
a different graph cannot be passed off as this one's. `GraduationService.assess`
looks for a durable round whose fingerprint matches the candidate and reuses
it; when none matches it asks afresh.

This is not an optimisation for its own sake. Asking the same model the same
questions about the same graph costs money and minutes — and a model is not a
function, so the second answer could differ, leaving "the review that
authorised this version" ambiguous.

Control **BD** removes the reuse: *"graduation asked 30 more question(s)."*
Control **BC** removes the fingerprint check and `assessGraduation`'s own guard
catches it.

### Decision 3 — persistence generalised, not duplicated

`CommitVersionOptions.expectedPredecessor` is now `number | null`, and
everything `commitNextVersion` checks — eligibility, the assessment
fingerprint, workspace staleness, the run link, the pointer race — applies to
v1 exactly as to v2. `assertFirstVersion` is the predecessor's counterpart:
v1, supersedes **nothing** (absent, not zero), adds every `Source` and every
`Evidence`, re-evaluates nothing. The pointer advance uses `IS NULL` for the
first version, because `NULL = NULL` never matches in SQL.

`assertVersionDiff` is untouched, and `check:persistence-versioning`,
`check:persistence-graduation`, `check:persistence-durable-integration` and
`check:ati-research` (35/35) all stay green.

**The canonical fixture is itself a v1** — `supersedesVersion` absent,
`addedSourceIds` covering all 22 sources, no re-evaluated claims. Check **10**
asserts the rule against it, which is the strongest available evidence that
"first version" was described as v1 really looks rather than as convenient for
this gate.

### Decision 4 — capability semantics unchanged

- **No reviewer** → model-assisted checks `NOT_EVALUATED` with reasons,
  `fullCapability` false, graduation `BLOCKED`, a blocker naming the reviewer
  (check 6).
- **Refusal** → the asked checks stay `NOT_EVALUATED`; no review finding comes
  out of it (check 7).
- **Outage** → the gate is journalled `SKIPPED` with the reason, the run ends
  `GATE_BLOCKED`, **no round is appended**, no assessment is recorded and no
  version exists (check 8). Nothing fabricated, nothing passed.

`PROVENANCE` is untouched, and no acceptance rule was weakened. `graduateRun`
reports `NOT_ELIGIBLE` with the assessment's reasons rather than forcing a
commit — which matters because a live run whose `PROVENANCE` reported a
capability gap is exactly the case where that temptation appears.

### The application path

`graduateRun` in `application/assessment.ts` is the step that had no
production caller: promote → assess (through the seam) → commit. It is wired to
**`POST /api/investigations/{id}/versions`**, and `expectedPredecessor` comes
from **storage**, never from the request — a caller may say which run to
graduate, but not what it supersedes.

## Gate

`pnpm check:first-version` — **11/11**, driven through `InvestigationService`,
`InlineExecutionService`, the registered host seam and `graduateRun`. No
service is handed a reviewer directly, because that is what first light's
defect was.

The stages emit the canonical fixture's artifacts re-keyed to a fresh
investigation. Deliberate, and not benchmark substitution: the subject is the
plumbing, and a validator-clean graph is needed to reach graduation at all.

### Negative controls

| Control | Result |
|---|---|
| BA · the runtime stops passing the reviewer | FAIL 1, 3, 7, 8 |
| BB · the REVIEW gate stops collecting judgments | FAIL 1, 3, 7, 8, 9 |
| BC · review reuse ignores the fingerprint | FAIL 4 |
| BD · graduation never reuses the recorded review | FAIL 3 |
| BE · a first version may supersede something | FAIL 11 |

## Defects found while building

- **Check 3 was a false pass, and check 4 caught it.** Both called
  `graduation.assess(…)` directly with no model, so the reviewer was
  *unreachable* and "graduation asked nothing more" was trivially true — check
  3 passed while testing nothing. Check 4 failed for the same reason, which is
  the only way I noticed. Both now go through `assessCandidate`, which reads
  the seam. **Third false pass of this shape in #20.**
- **Control BE passed until check 11 existed.** `promote` never produces a v1
  carrying `supersedesVersion`, so that refusal was unreachable through the
  application path. `assertFirstVersion` is exported and check 11 drives all
  six refusals — same lesson as 20d's `clear()`-on-throw and 20f's backstop.
- **Two of my own fixtures were wrong before they were right.** Check 4 first
  used `promote` as the mutation, but `fingerprintGraph` hashes claims,
  evidence, findings and `currentVersion` — and for a first version
  `currentVersion` is 1 before and after, so nothing changed. Check 8 first
  demanded `NOT_ELIGIBLE` and failed on a throw that was correct behaviour; it
  now asserts the consequence (no assessment, no version) rather than the
  control flow.
- **`GRADE` cannot emit findings carrying `gapIds`.** My first stage fixture
  did, and the run failed with seven `REFERENTIAL/DANGLING_REFERENCE` errors —
  `Finding.gapIds` is a back-reference `GAPS` owns, exactly as `STAGE_OUTPUTS`
  documents. The fixture now emits findings without it at `GRADE` and re-emits
  them at `GAPS`, which is what `live-stages.ts` already does.
- **Two check exclusions lagged the convention, again.** The 20g live probe in
  `verification/` was flagged by the prompt stop-line, and `inline-execution`
  reading the reviewer seam was flagged by 20d's check 20b — the latter
  legitimately, so the allowed reader set is now two, both orchestration
  boundaries handing the reviewer *in*. That is the fourth such exclusion in
  this issue.

## Regression

Typecheck clean, **41 gates green**, including every persistence and ATI gate
over the code this changed.

## Carried forward

- **The first live run still will not reach v1**, because `PROVENANCE` reports
  a capability gap and `assertCommittable` requires an eligible assessment. The
  path now exists; the run still has to earn it. That is the correct order.
- **`graduateRun` is not called automatically.** A finished run does not
  graduate itself — a route call does. Whether completion should trigger it is
  a product decision, not this slice's.
- **The initial-run REVIEW now costs provider calls**, one per judgment
  subject, sequentially. A run that previously ended at VALIDATE now asks the
  reviewer ~30 questions on the canonical graph.
- First light's Finding 3 (query construction) is untouched.
- The civic first-light URL has **not** been rerun.
