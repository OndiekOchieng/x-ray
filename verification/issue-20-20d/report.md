# 20d — the live `ExecutionRuntime`, composed

Branch `feat/live-provider-composition`, from `751e1a8`.
The three implemented ports become a runtime the application already knows how
to drive. **No real civic URL was used; every call went to `127.0.0.1` or to a
hand-written port stub.**

> **Amendment (review response), in two rounds.** The composed reviewer was
> dead capability. Round one wired it into a host seam and made
> `GraduationService.assess` collect judgments as data. **Round two found the
> chain still stopped at the seam** — nothing read `getReviewerModel()` — and
> added the consuming hop. `INGEST`'s `retrievedAt`, which fell back to an
> investigation id, now falls back to an injected clock. See *Amendment* below.
> **Round three** fixed a registration-lifecycle bug: an incomplete
> composition returned without *clearing* previously installed seams, so a
> re-registration could leave a stale runtime and reviewer live. First
> submission `9703c06`; round one `5df69b8`; round two `eade206`.

## What was added

| File | Role |
|---|---|
| `providers/material.ts` | search → retrieve sequencing. The only place the two are joined. |
| `providers/live-stages.ts` | the ten research stages, over #6's ports, provider-neutral |
| `providers/live-runtime.ts` | `ComposedProviders` → `ExecutionRuntime`; conditional registration |
| `providers/runtime-checks.ts` | the gate (`pnpm check:live-runtime`) |
| `anthropic/transport.ts` | bounded `pause_turn` continuation |
| `instrumentation.ts` | registers the runtime through the existing seam |

The provider layer now has **two tiers**, and check 15b holds them apart:
`anthropic/**` is provider-specific; `material.ts`, `live-stages.ts` and
`live-runtime.ts` are provider-neutral composition over the ports. The neutral
tier may not name a vendor — otherwise "swapping a provider changes only
composition" stops being true.

## Amendment

### 1 · The reviewer was dead capability — twice

Accepted both times, and the second catch was the important one: I fixed the
symptom's two lower layers and left the top one missing, then reported it as
wired.

**Round one.** Two failures compounding:

`composeLiveRuntime` constructed a `ReviewerModel` and returned it, and
`registerLiveRuntime` installed only the `ExecutionRuntime`. No production path
consumed the reviewer at all.

And underneath that, `GraduationService.assess` passed `model` into
`assessGraduation` → `reviewXRayGraph`, which is **synchronous**. Per the
existing contract that does not collect judgments — the option's own docblock
says so — so every model-assisted check stayed `NOT_EVALUATED`. A fully
configured deployment would have reported the capability and never asked
anything.

The chain now runs end to end:

```
ReviewerModel
  -> registerLiveProviders installs it via setReviewerModelProvider
  -> GraduationService.assess: collectModelJudgments(candidate, model)
  -> assessGraduation(candidate, { model, judgments })
  -> reviewXRayGraph(graph, { validation, model, judgments })   // pure
```

`judgments` is threaded through `GraduationOptions` as **data**, so assessment
stays a pure function of a graph and a set of judgments and a recorded
assessment can be reproduced without asking a model again. No network call
happens inside the pure reviewer.

**Its own seam, not `StageAdapters`.** `StageAdapters` deliberately has no
reviewer member — a research stage must not be handed a reviewer — so
`setReviewerModelProvider` sits beside the database and runtime seams on the
same `globalThis` slot. Check **18** still asserts `StageAdapters` carries no
reviewer.

**Round two: installed is not consumed.** Round one composed the reviewer,
registered it through `setReviewerModelProvider`, exposed `getReviewerModel()`
— and **nothing called it**. `GraduationService.assess` collected judgments
correctly *when given a model*, and no production path ever gave it one. The
chain stopped at the host seam and the observable symptom was unchanged: a
fully configured deployment still left every model-assisted check
`NOT_EVALUATED`.

My round-one gate could not see this because every check injected the model
directly. It proved the machinery worked when handed a reviewer, which was
never the thing in doubt.

The missing hop is now `lib/xray/application/assessment.ts`:

```ts
export async function assessCandidate(graduation, investigationId, executionRunId, options) {
  const model = options.model ?? await getReviewerModel()
  return graduation.assess(investigationId, executionRunId, { ...options, ...(model && { model }) })
}
```

`ATIResearchBridge.processIntake` — the only production caller of `assess` —
goes through it. Dependency direction stays one-way and explicit:
**`GraduationService` never reads the seam.** It receives a `ReviewerModel`, so
its dependencies stay visible and a harness can drive it without arranging
process state. An explicit `options.model` still wins, because every existing
check harness injects one and a global that overrode an argument would make
those harnesses depend on state they never set.

Check **20** now drives the **registered seam**, not an injected model: it
registers a counting reviewer through `setReviewerModelProvider`, asserts
`getReviewerModel()` returns it and that clearing the seam clears it, then
calls `assessCandidate` with **no model option** against a real PGlite
checkpoint. It asserts `judge()` was called, `CLAIM_ATOMICITY` was among the
queries, model-assisted checks came back `EVALUATED`, and that the same path
with the seam **cleared** leaves them unevaluated with a lower
`checksEvaluated`.

Check **20b** is the structural half: exactly one application file reads the
seam (`assessment.ts`), `GraduationService` reads none, and the bridge does not
call `graduation.assess` directly. Control **AH** removes the seam read and
fails 20, 22 and 23 with *"judge() was never called"* — which is precisely the
state round one shipped in.

- **Check 21** — unconfigured reviewer: every model-assisted check
  `NOT_EVALUATED` *with a reason* and zero findings, `fullCapability` false,
  graduation `BLOCKED`, and a blocker naming the missing reviewer. There is no
  `PASS` to collapse into — `ReviewOutcome` is `EVALUATED | NOT_EVALUATED`,
  which is #4's design — so the silent-pass failure mode here is a check
  reported `EVALUATED` that nobody judged, and that is what the check asserts
  against.
- **Check 22** — refusal: the asked checks stay `NOT_EVALUATED` with a reason,
  no review finding is raised, and no graduation *reason about the graph*
  appears. A refusal is our capability gap, not the graph's fault.
- **Check 23** — outage: a throwing reviewer is deliberately **not** caught.
  `collectModelJudgments` documents that swallowing it would report an outage
  as something an operator cannot act on. The consequence is what matters: no
  assessment is appended, so `commit` refuses for want of one rather than
  committing on the strength of a review that never happened.
- **Check 24** — the seam is typed against the port, and no Anthropic reviewer
  type appears in `application/runtime.ts`, `graduation-service.ts`,
  `acceptance/runner.ts`, or the composition's public surface.

### 3 · Registration lifecycle: installed, or cleared

`registerLiveProviders` returned early on an incomplete composition **without
touching the seams**. From a fresh process that reads as correct — nothing was
installed yet — and my checks only ever exercised incomplete-from-clean. The
failure appears only on **re-registration**:

```
COMPOSED registration  ->  runtime + reviewer live
later INCOMPLETE       ->  early return, seams untouched
                       ->  the PREVIOUS runtime and reviewer are still live
```

A deployment whose key was revoked would have kept researching with the adapter
it built before, while the documented contract said the unconfigured path was
in force. Both halves of that contract were false at once.

Registration is now symmetric — every path out of it either installs both seams
or clears both:

| | |
|---|---|
| `COMPOSED` | both seams installed |
| `INCOMPLETE` | both seams **cleared** |
| composition throws | both seams **cleared**, then the error propagates |

`clear(seams)` sets both to `null`, which is exactly the state a process with
no provider configuration is in: `getExecutionRuntime()` returns
`unconfiguredResearchRuntime` and `getReviewerModel()` returns `undefined`.

**Check 3c** drives the real seams in the order that exposes it: register
complete → assert the reviewer is live and the plan carries adapters →
re-register incomplete → assert `getReviewerModel()` is `undefined`, the plan
carries **no** adapters, a fresh `runPipeline` reports one capability gap per
stage and zero canonical artifacts, and **the HTTP stub received no further
requests** — so neither old adapter was reachable.

**Check 3** now distinguishes an install from a clear, because both are calls
to the same setter and only the argument says which. It had been counting any
call as an install and started failing the moment clearing was introduced.

#### The untested branch I nearly shipped

Control AL removes the clearing on a thrown composition — and **passed the
whole gate**. The recovery branch had no coverage at all, because a throw was
unreachable through the public API.

So `LiveRuntimeOptions` gained a `registry` option, and check **3d** supplies a
registry whose reviewer factory throws. An untested recovery path is how a
recovery path turns out not to work, and the honest choice was to make it
reachable rather than to leave a defensive branch nobody had run.

### Requirements correspond to *consumed* capabilities

The rule, in the terminology the final amendment asked for: registration is not
consumption. A slot that is required and installed but never **read** is still
a dead token — the deployment looks configured, the operator supplies a key,
and nothing changes about what runs. That was true of the reviewer twice over:
first never installed, then installed into a seam nobody read.

Check **3b** now asserts consumption, not registration: the reviewer is
installed, the seam **resolves** it, and an application path exists that reads
it. Check **3** asserts an incomplete composition installs neither seam and a
complete one installs both. Control **AF** removes the installation (fails 3b),
and control **AH** removes the *read* (fails 20/22/23) — the two halves of the
same rule, each with its own control.

### 2 · `INGEST`'s `retrievedAt`

```ts
retrievedAt: document.retrievedAt ?? ctx.correlation.investigationId   // wrong
```

An investigation id where a timestamp belongs. It typechecked because both are
strings, and **the gate never caught it because every fixture supplied a
`retrievedAt`**, so the fallback never ran.

It is now `observedAt(document.retrievedAt, options.now)`:

- a provider value that is a **real ISO instant** is used;
- anything else — absent, or unparseable — falls back to the **injected
  clock**. `retrievedAt` is what a reader relies on to know how current a
  record was when it was read, so an unparseable string there is worse than an
  honest observation of when we looked.

`now` is a required member of `LiveStageOptions`, threaded from the runtime's
clock, so a stage cannot reach for a global. `TRACE`'s `sourceFrom` had the
same bug class — a `'1970-01-01T00:00:00Z'` placeholder — and uses the same
function.

Check **25** drives a readable document with **no** `retrievedAt` and asserts
the canonical `Source` carries the injected instant, contains no `XRAY` id, and
is not a placeholder epoch. It then drives a document whose `retrievedAt` is
`'last Tuesday'` and asserts the clock wins.

**Verified backstop:** with the bad fallback restored, `INGEST` fails
`STRUCTURAL/NON_ISO_TIMESTAMP` and no source is minted. So the bug was *latent*
rather than silently corrupting — but it would have failed any live run where a
provider omitted the timestamp, which is every search result before retrieval.
I checked this directly rather than claiming it.

## Composition, and truthful failure

| | |
|---|---|
| every slot `AVAILABLE` | `COMPOSED`; runtime registered; summary logged, names only |
| any slot not `AVAILABLE` | `INCOMPLETE`; **nothing registered**; each missing slot named with its reason |
| no submitted URL | all ten stages report one capability gap each |
| re-evaluation | deliberately not implemented |

**No silent fallback, and this is the case that matters.** A deployment with a
research model and no retrieval could decompose a record and then find nothing
— which looks exactly like an exhaustive search that came up empty. Refusing to
compose is what keeps those two apart. Check **2** drives that configuration
and asserts only `RETRIEVAL` is reported missing, then drives a selected-but-
unkeyed Anthropic and asserts every reason names `ANTHROPIC_API_KEY` rather
than substituting a provider that is configured.

When composition is incomplete, `getExecutionRuntime()` keeps returning
`unconfiguredResearchRuntime` — so a fresh run ends `CAPABILITY_BLOCKED` with
its gaps journalled, which is the behaviour every #6–#11 gate is written
against. The sweep confirms those gates are unchanged.

Startup never fails for a configuration problem and never silently succeeds:
it logs which slots resolved and, when they did not, why — **variable and
provider names only, never a value**. Check **19** asserts no secret reaches a
composition summary, a plan, or a graph.

`reevaluation` is left undefined on purpose. A live plan for a successor
version needs material bound to the *reason* for re-evaluating — #10's bridge
supplies exactly that binding — not a fresh web search of the original URL.
Leaving it undefined makes `startReevaluation` say a re-evaluation cannot be
planned, which is true, instead of re-researching from scratch and calling the
result a successor version. Check **4**.

## Search → retrieve sequencing

A search result is not material. 20c maps `web_search_result` to
`NOT_RETRIEVED` because it carries a url, a title and an opaque
`encrypted_content` no client can read. Handing that to `TRACE` as readable
would let a stage draw a proposition from a record nobody read.

So `gatherMaterial` discovers, then fetches each discovered locator — keeping
the **search's** handle, so a proposal citing `ref:s3` means the third thing
the search found, before and after it was fetched. Every document that leaves
is either inspectable with an extract, or honestly unobtained with none.

**Unobtained records are kept, not dropped.** A record that was found and could
not be read is a research fact: dropping it would make the search look
narrower than it was, and XR-INV-006 turns on the extent of the search. Check
**6** asserts the unobtainable record survives, is not inspectable, carries no
extract, and says nothing that reads as non-existence.

### The refusal, and why it throws

`TRACE` refuses to mint evidence from a non-inspectable document — and it
**throws** rather than skipping the proposition.

That was not the first implementation. The first one dropped the proposition
and returned the stage's other work, and check 7 caught it: `StageOutcome` is a
contribution **or** a capability gap and never both, so a stage that kept its
good evidence could not also report the refusal. The gap was silently
discarded because the contribution was non-empty. Silence is the one outcome
not allowed here, so the refusal is now an `AdapterFailure` — `PERMANENT`,
because the same request produces the same answer, and treated the way 20b's
decoder treats a handle that was never offered.

The cost is real and worth stating: one bad proposition fails the stage. The
alternative was a graph quietly containing less than the provider proposed,
with no record of what was dropped.

**Defence in depth, verified rather than assumed.** With that guard removed the
run still fails — STAGED validation catches it as
`XR-INV-006/EVIDENCE_FROM_UNOBTAINED_SOURCE`. I checked this directly rather
than claiming the guard is the only protection. What the guard adds is
attribution: the failure names the provider and the record, instead of
surfacing as a validation error one layer later.

## `pause_turn` continuation

Implemented where 20c recorded it should be: the Anthropic server-tool
transport boundary, not pipeline retry.

- One user message, sent **once**. Each continuation appends the paused
  assistant message **unchanged**, including every `encrypted_content`, which
  the API decrypts to restore the results already gathered.
- Blocks accumulate across turns, so earlier results are never discarded.
- Bounded at 4 continuations (5 requests). At the bound what was gathered is
  returned with `moreAvailable: true` and a note saying the turn was still
  paused — "we stopped continuing" never reads as "the search finished".

Check **14** drives two paused turns then a completion and asserts three
requests, exactly one user message in each, message counts of 1/2/3, all three
turns' results present in order, and both earlier `encrypted_content` values
present in the final request. Check **16** asserts the bound. Check **15**
drives the whole thing through the composed runtime — a real fetch for INGEST,
a paused-then-continued search for TRACE, then a fetch per discovered record
including one dead link — and asserts no evidence came from the dead link.

`moreAvailable` is still never `false`: absent means unknown, and `true` is
claimed only when the provider or the bound positively reports stopping early.

## What a stage decides

Check **9** asserts each of these against a driven run:

- **identity** is `ctx.ids`', in XR-INV-012's namespaces (`C…`/`DC…`,
  `FND-…`); no source id contains a locator;
- **`accessibility`** mirrors what retrieval reported reaching;
- **`originStatus`** is `UNKNOWN` on every source — whether a record
  originates its assertions is `PROVENANCE`'s decision and cannot be read off
  a URL;
- **`evidenceClass`** is `SECONDARY`, the conservative answer before lineage;
- **`atiEligible`** is derived from `resolutionPath`, never proposed — and the
  20b decoder has no field for it, so a provider could not have offered one.

Check **10** asserts a handle the stage never issued is ignored: the proposal
cites `ref:invented`, and no source, no evidence and nothing bearing that
string reaches canonical state.

### `PROVENANCE` reports a gap rather than deciding

ADR-0010 assigns lineage to this stage precisely so a provider cannot assert
it, and the model port has no `provenance` method for the same reason. What the
stage needs is what a document *prints* about its own sources —
`observed.attributedTo` — and 20c established that neither documented Anthropic
server tool supplies it.

So for a live Anthropic run this stage has nothing to decide from, and says so.
Inventing a `SourceDependency` from a shared hostname, or declaring two records
independent because their URLs differ, would be the assertion XR-INV-004 exists
to check, made by the code that is supposed to check it. Check **11** asserts
the gap is raised, names what is missing, is actionable, and that zero
dependencies and zero provenance records were invented.

**This means a live first run will be `CAPABILITY_BLOCKED` at `PROVENANCE`.**
That is the honest first-light result rather than a defect, and it is the most
important thing 20e will have to report.

## Gate

`pnpm check:live-runtime` — **29/29**, in `runtime-gate.txt`. Two kinds of
stub, deliberately: hand-written ports exercise the provider-neutral
composition, and an HTTP stub on `127.0.0.1` exercises `pause_turn`, which is a
property of the transport and cannot be reached through a hand-written port.

Check **8** drives every one of the ten stages through the real `runPipeline`
and asserts all ten ran, that canonical state was produced, and that the model
port was called in protocol order.

### Negative controls

| Control | Result |
|---|---|
| W · composes despite missing slots | FAIL 1, 2, 3 |
| X · registration no longer conditional | FAIL 3 |
| Y · search results passed through without retrieval | FAIL 5, 6, 8, 15 |
| Z · unobtained records dropped after retrieval | FAIL 6, 7 |
| AA · TRACE accepts evidence from an unobtained record | FAIL 7 |
| AB · INGEST asserts `originStatus` before `PROVENANCE` | FAIL 9 |
| AC · continuation restarts instead of resuming | FAIL 14 |
| **AD · graduation stops collecting judgments** | **FAIL 20, 22, 23** — *"judge() was never called"*: the original defect, reproduced |
| **AE · `assessGraduation` drops the judgments it was given** | **FAIL 20** — *"all 6 model-assisted checks are still NOT_EVALUATED"* |
| **AF · the reviewer seam is never installed** | **FAIL 3, 3b** |
| **AG · `retrievedAt` falls back to a non-timestamp** | **FAIL 25** |
| **AH · the application path stops reading the seam** | **FAIL 20, 22, 23** — *"judge() was never called"*: round one's defect, reproduced |
| **AI · the production caller bypasses `assessCandidate`** | **FAIL 20b** |
| **AJ · `GraduationService` reaches for the host seam** | **FAIL 20b** |
| **AK · early return without clearing** | **FAIL 3, 3c** — *"the stale reviewer is still live after an incomplete re-registration"* |
| **AL · a thrown composition leaves the seams alone** | **FAIL 3d** — *passed the gate before check 3d existed* |
| **AM · only the runtime seam is cleared** | **FAIL 3, 3c, 3d** |

**Control Z's first attempt was worthless and I nearly reported it as
evidence.** It edited the `locator === undefined` branch, which the check's
fixture never reaches, so it passed 19/19 without testing anything. Corrected
to edit the branch that actually drops a record after retrieval, and re-run.
That is the second slice in a row where a control needed verifying before its
result meant anything.

## Earlier gates

Five checks asserted things 20d makes false by design. Re-aimed, not relaxed:

- **20a check 15** asserted nothing registers a runtime. It now asserts
  registration is *conditional*: `registerLiveRuntime` returns early unless
  `COMPOSED`, `setProvider` is called exactly once, an `INCOMPLETE` outcome
  exists, there is no fallback, and `application/runtime.ts` still holds the
  unconfigured runtime without importing the provider layer.
- **20a check 13 had a hole.** It matched only `from '…'`, so
  `await import('@/lib/xray/providers/live-runtime')` in `instrumentation.ts`
  slipped past a rule it should have triggered. It now matches dynamic imports
  too, and allows exactly one host entry point — `instrumentation.ts`, which
  exists to register a host.
- **20a stop line** banned canonical construction across the layer.
  `live-stages.ts` builds canonical artifacts because that is what a stage
  does, so the ban is scoped to the **vendor** tier, with new check 15b holding
  the two tiers apart and a separate assertion that neither tier reaches
  persistence.
- **20c check 26** asserted a paused turn produced one request. Split: "never
  retries a failed request" stays (two queued 429s → one request), and new
  checks 26b/26c cover continuation and its bound.
- **20a check 4** was already re-aimed in 20c; unchanged here.

`check:providers` **22/22** — check 15 was updated again for the amendment: it
now asserts **both** seams are passed from instrumentation, each installed
exactly once, and that `REQUIRED_SLOTS` declares all three.
`check:anthropic-adapters` **28/28**, `check:anthropic-retrieval` **29/29**.

## Regression

`regression-sweep.txt`: typecheck clean, **40 gates green**, and the
unconfigured path byte-identical — including `check:review` and
`check:acceptance`, which exercise the same code the amendment touched:

```
check:adapters   6 port-dependent checks, 2 capability gap(s) journalled
check:review     6 model-assisted NOT_EVALUATED (port unwired, #6)
check:acceptance BLOCKED (0 reason(s) against the graph, 6 capability blocker(s))
```

## Defects found while building

- **A swallowed refusal** — see *The refusal, and why it throws*. Found by the
  gate, not by reading.
- **Control Z tested nothing** — see *Negative controls*.
- **Check 13's dynamic-import hole** — my own new code walked through it.
- **`tsc` exit status masked by `head`, twice.** `npx tsc --noEmit | head` then
  `echo "tsc exit: $?"` reports `head`'s status, and the gates pass regardless
  because Node only strips types. Both occurrences reported a clean typecheck
  that had not happened; `tsc` is now run bare.
- **Check 14's message arithmetic was wrong** — I expected user/assistant pairs
  (`index * 2 + 1`); a continuation appends only the assistant message, so it
  is `index + 1`. The code was right and the check was wrong.
- **Check 22's first assertion was too strong.** It required *every*
  model-assisted check to be unevaluated under refusal, and failed — because a
  check the graph raises **no subject** for is legitimately `EVALUATED`
  ("nothing to judge"), and reporting it unevaluated would leave a permanent
  capability gap on graphs with no findings yet. It now scopes to the checks
  the reviewer was actually asked, resolved through `activePortChecks`.
- **A dead assertion**, again: check 21 compared `ReviewOutcome` against
  `'PASS'`/`'CLEAR'`, which the union does not contain. Replaced with the
  assertion that actually holds.
- **A second check that excluded harnesses by name, not convention.** 20a check
  13 skipped only `composition-checks.ts`, so `runtime-checks.ts` — which
  registers seams in order to *test* registration — was scanned as
  implementation and flagged. Now excluded by the `-checks.ts` suffix, as the
  other scans already do.
- **My round-one reviewer checks tested the wrong thing.** All four injected
  the model directly, so they proved the machinery works when handed a
  reviewer — which was never in doubt — and were blind to nothing ever handing
  it one. They now register through the seam and pass no model. The lesson is
  the same one control Z taught: a check has to exercise the path that is
  actually in question, not an adjacent one that is easier to set up.

## Carried forward

- **A live run will block at `PROVENANCE`.** Retrieval supplies no printed
  attribution, so lineage cannot be decided. This is the headline thing for
  20e to report, and the fix is a retrieval adapter that reports
  `observed.attributedTo` — not a weaker `PROVENANCE`.
- **Provisional classification.** `Claim.layer`/`.type`/`.priority` are
  required by the domain and optional on `ClaimProposal`, so `DECOMPOSE` mints
  with `INTERPRETATION`/`OTHER`/`MEDIUM` when a proposal omits them.
  `INTERPRETATION` rather than `OBSERVATION` because `OBSERVATION` asserts
  direct observability, which is the more damaging thing to get wrong. A
  complete run replaces all three at `CLASSIFY`; **a run where `CLASSIFY` is
  blocked leaves them**, and that is a real limitation rather than a tidy one.
- **`RunMaterial` is per-plan, in memory.** `INGEST` obtains the surface record
  and `DECOMPOSE` reads it, rather than fetching twice. A resumed run builds a
  fresh holder, so a resumed `DECOMPOSE` would re-fetch — correct, but it means
  a resume costs a fetch.
- **Only drawn-on records become `Source`s.** A discovered record no proposal
  cited is in the material and the journal but not in canonical state. Whether
  search extent should be recorded as `Source` rows with
  `accessibility: NOT_RETRIEVED` is a domain question, not this slice's.
- **`sourceType` is `NEWS` for the submitted record and `OTHER` for everything
  retrieved.** Neither is inferred from content; both are the conservative
  placeholder. Classifying a record's type from its text is model work nobody
  has asked for yet.
- **One bad proposition fails `TRACE`.** Deliberate; see above.
- **`GraduationService.assess` now makes provider calls.** It was synchronous
  work over durable state; with a reviewer configured it asks the model once
  per judgment subject, sequentially (which `collectModelJudgments` does on
  purpose, so the capability report is reproducible). An assessment of a large
  graph is now a slow, billable operation. Nothing about that is hidden, but it
  is new behaviour for a method that used to be cheap.
- **A reviewer outage aborts `assess`.** Deliberate, and the existing contract's
  choice rather than mine. The effect is that graduation cannot proceed and
  nothing is recorded — correct, but it means a flaky reviewer blocks
  graduation rather than degrading it.
- No live URL, no first-light run. 20e owns that.
