# 20d — the live `ExecutionRuntime`, composed

Branch `feat/live-provider-composition`, from `751e1a8`.
The three implemented ports become a runtime the application already knows how
to drive. **No real civic URL was used; every call went to `127.0.0.1` or to a
hand-written port stub.**

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

`pnpm check:live-runtime` — **19/19**, in `runtime-gate.txt`. Two kinds of
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

`check:providers` **22/22**, `check:anthropic-adapters` **28/28**,
`check:anthropic-retrieval` **29/29**.

## Regression

`regression-sweep.txt`: typecheck clean, **39 gates green**, and the
unconfigured path byte-identical:

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
- No live URL, no first-light run. 20e owns that.
