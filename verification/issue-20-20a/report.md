# 20a — provider registry + configuration contract

Branch `feat/live-provider-composition`, from `46932b4`.
Composition only. No provider network call exists, because no factory exists.

> **Amendment (review response).** The factory configuration boundary is
> narrowed, the resolution slot now uses `ProviderSlot` and preserves the exact
> absent slot, and the "Five states" comment says six. See *Amendment* below.
> First submission `6d9b01d`; amendment ``a4e2b51``.

## What was added

| File | Role |
|---|---|
| `lib/xray/providers/config.ts` | The only place provider selection is read from the environment. |
| `lib/xray/providers/registry.ts` | Registry of provider entries, and `composeProviders`. |
| `lib/xray/providers/composition-checks.ts` | The gate (`pnpm check:providers`). |

Nothing else changed except `package.json` (one script) and `.gitignore`
(see *Defect found*).

## Amendment

### The blocker: factories received the whole environment

Accepted without qualification. `ModelProviderConfig.env` and
`RetrievalProviderConfig.env` handed every factory a full `Environment`, which
made `requires: ['ANTHROPIC_API_KEY']` a comment rather than a boundary — 20b's
Anthropic adapter could have read `OPENAI_API_KEY` or `XRAY_POSTGRES_URL` and
nothing would have objected.

Both `env` members are gone. A factory now receives a `ProviderConfiguration`
built by `narrowEnvironment(env, declaredNames(entry))`:

```ts
export interface ProviderConfiguration {
  readonly declared: Readonly<Record<string, string>>   // frozen, prototype-less
  readonly declaredNames: readonly string[]             // names only
  require(name: string): string                         // throws for undeclared
  optional(name: string): string | undefined            // throws for undeclared
}
```

Three properties matter, and the gate proves each:

1. **The narrowing happens before anything the factory can touch exists.**
   `narrowEnvironment` reads `env` inside its own body and the object it
   returns does not capture it — the accessors close over the *narrowed* record
   only. So there is no closure to walk back through, not merely no property to
   read. Check 12c collects every string reachable from the config object, to a
   depth of 8, and asserts no foreign value appears by any path.
2. **Undeclared access fails loudly.** `require`/`optional` throw for a name
   the entry did not declare, and the message names the declaration and the
   requested variable — never a value. A missing *declared* secret throws a
   different message, because "the registry entry is wrong" and "the operator
   has not set the key" are different faults and should not look alike.
3. **Widening is a registry edit.** `requires` ∪ `optional` is the
   declaration; `requires` additionally gates `CONFIGURATION_INCOMPLETE` while
   `optional` never does. `optional` exists so 20b can declare a base-URL
   override in the registry, where it is reviewable, rather than reaching
   around the boundary. No `DEFAULT_REGISTRY` entry uses it in 20a.

Observed (`composition-gate.txt`):

```
what an entry declaring only ANTHROPIC_API_KEY receives
  environment holds:  ANTHROPIC_API_KEY, OPENAI_API_KEY, XRAY_POSTGRES_URL, XRAY_UNRELATED_SENTINEL
  declaredNames:      ANTHROPIC_API_KEY
  declared keys:      ANTHROPIC_API_KEY
  prototype:          null
  frozen:             true
  require(OPENAI_API_KEY) → This provider entry declares ANTHROPIC_API_KEY and may not read
                            OPENAI_API_KEY. Declare it on the registry entry to use it.
  require(XRAY_POSTGRES_URL) → …
  require(XRAY_UNRELATED_SENTINEL) → …
```

Check **12c** is the adversarial gate: an Anthropic entry declaring only
`ANTHROPIC_API_KEY`, composed against an environment that also holds
`OPENAI_API_KEY`, a database URL and `XRAY_UNRELATED_SENTINEL`. It asserts the
entry *can* read its own key (the boundary narrows, it does not blind), that
`declaredNames` has length 1, that each foreign name is absent by `in`, by
index, and from the reachable-string scan, that `require` and `optional` both
throw for each, that the thrown messages carry no value, that `declared` is
frozen with a null prototype, and that no config key is named `env` /
`environment` / `process` / `secrets`. It also asserts the declared key *is*
reachable — otherwise the negative scan would prove nothing.

Check **12d** is the static companion: `ModelProviderConfig` and
`RetrievalProviderConfig` declare no `env` and mention no `Environment`, and
the registry hands `env` to no factory. 12c proves this instance is clean; 12d
proves the shape is, so 20b cannot re-add the handle without deleting a line
that says why.

### The limit of what this proves

The boundary governs what this layer **hands over**. It cannot stop a module
from importing `process` directly — that is not a property any object graph
can enforce. So the gate holds a second line instead: inside
`lib/xray/providers/`, **only `config.ts` may name `process.env`** (check 13).
That is what actually keeps a future adapter going through its declared
configuration rather than around it.

Making that line true required one change: `composeProviders` defaulted its
`env` parameter to `process.env`, so `registry.ts` named it too. It now
defaults to `hostEnvironment()` from `config.ts`, which is the single door.
Check 13 caught this — it is negative control D below.

### Slot vocabulary

`ProviderResolution.slot` was `string` and `NOT_SELECTED` returned a generic
`'MODEL'`, which erased *which* model slot was absent. It is now `ProviderSlot`
(`MODEL_ID_REQUIRED` narrows further to `ModelSlot`, since retrieval names no
model), and `resolveModel` takes the slot as a parameter so an absent selection
still reports it:

```
research selected, reviewer absent (the exact absent slot)
  RESEARCH_MODEL NOT_IMPLEMENTED   …
  REVIEWER_MODEL NOT_SELECTED      …
  RETRIEVAL      NOT_SELECTED      …
```

Check **12b** asserts every resolution in every state carries its exact slot
from the `ProviderSlot` vocabulary, and that all six states were actually
exercised while doing so — so the check cannot pass by never reaching the
interesting ones.

### Comment

"Five states" → "Six states" in `registry.ts`, with a sentence on why
`NOT_SELECTED` carries its exact slot.

### Negative controls

Every new check was verified to fail when the property it claims is removed,
then reverted (`composition-gate.txt`):

| Control | Result |
|---|---|
| A · `narrowEnvironment` widened to every env key | FAIL 12c — `declares [ANTHROPIC_API_KEY, OPENAI_API_KEY, XRAY_POSTGRES_URL, …]` |
| B · `env` re-added to `ModelProviderConfig` | FAIL 12c *and* 12d |
| C · `NOT_SELECTED` reverted to a generic slot | FAIL 12b — `absent research slot RETRIEVAL` |
| D · `composeProviders` defaulting to `process.env` | FAIL 13 — `registry.ts reads process.env directly` |

### Three defects in my own gate, found while amending

- `main()` was invoked at the top of the file, so the first factory call hit the
  temporal dead zone on the test ports. `main()` now runs at the bottom.
- Worse: check 12c discarded the factory promise with `void`. Because
  `AVAILABLE.create` is `async`, the TDZ error became a rejected promise — so
  **the check reported ok on a factory that had thrown**, and the process died
  after printing a pass. The check now awaits `create()` and asserts it
  returned its port, and the gate installs an `unhandledRejection` handler that
  fails loudly rather than letting one escape.
- Check 12's test registry was rebuilt around shared module-level ports so 12c
  can assert identity on what a factory returned.

Nothing in the amendment expands scope: no HTTP, no SDK, no prompt, no adapter,
no runtime registration, no UI change. `DEFAULT_REGISTRY` still gives no entry
a `create`.

## The configuration contract

Five variables, read only here:

```
XRAY_RESEARCH_MODEL       XRAY_RESEARCH_MODEL_ID
XRAY_REVIEWER_MODEL       XRAY_REVIEWER_MODEL_ID
XRAY_RETRIEVAL_PROVIDER
```

Provider name and model id are independent. Selecting `anthropic` implies no
model: there is no default model id authored anywhere in this layer, and the
gate proves it by scanning both files for anything shaped like a model name.
An absent or blank value is absence, not a provider named `""`.

Secrets are named but never read into a resolution. `config.ts` reports which
*variable names* a selected provider requires and which of them are unset; it
never puts a value in a selection, a resolution, a description, or an error. A
value reaches exactly one place: the `ProviderConfiguration` handed to the
factory whose entry declared that name (see *Amendment*).

## Resolution semantics — six states, no fallback

```
NOT_SELECTED              nothing was asked for
UNKNOWN_PROVIDER          a name was asked for that is not registered
MODEL_ID_REQUIRED         a model slot was selected without a model id
CONFIGURATION_INCOMPLETE  registered, but a required secret is not set
NOT_IMPLEMENTED           registered and configured; no adapter yet (20a's normal answer)
AVAILABLE                 constructed
```

A selection that cannot be honoured stays unhonoured. The resolution names the
provider that was asked for, or nothing — never a substitute. Observed at the
host boundary (`composition-gate.txt`):

```
a fully configured Anthropic deployment
  research  NOT_IMPLEMENTED   Provider "anthropic" is registered and configured, but no adapter for it is implemented yet.
the same, with the key removed
  research  CONFIGURATION_INCOMPLETE  Provider "anthropic" is selected but ANTHROPIC_API_KEY is not set.
  reviewer  CONFIGURATION_INCOMPLETE  Provider "openai" is selected but OPENAI_API_KEY is not set.
```

`DEFAULT_REGISTRY` reserves research `anthropic`/`openai`, reviewer
`anthropic`/`openai`, retrieval `anthropic`/`custom`, and gives **none** of
them a `create`. So a fully-configured Anthropic deployment resolves
`NOT_IMPLEMENTED` today. That is the truthful answer for 20a and the reason
nothing can perform a provider call by accident: 20b and 20c add `create` to
these same rows.

The factories are typed against the existing ports — `ResearchModel`,
`ReviewerModel`, `ResearchAdapter` — and the gate builds a test registry
returning real instances of all three. That it typechecks *is* the proof that
the registry can return only existing port types.

## Gate

`pnpm check:providers` — 19/19, in `composition-gate.txt`. Every check drives a
supplied environment, never `process.env`, so no check can pass or fail
because of a shell export.

| Required item | Check |
|---|---|
| 1 empty env → no selections | 1 |
| 2 research w/o model id rejected | 2 |
| 3 reviewer w/o model id rejected | 3 |
| 4 retrieval needs no model id | 4 |
| 5–7 unknown provider rejected, each slot | 5/6/7 |
| 8 different providers per slot | 8/9 |
| 9 different model ids per slot | 8/9, 9b |
| 10 missing secret reported without leaking | 10, 10b |
| 11 no silent fallback | 11 |
| 12 only existing port types | 12 |
| 13 pipeline has no provider import or env | 13 |
| *amendment* factory sees only its declaration | 12c, 12d |
| *amendment* exact slot vocabulary | 12b |
| 14 canonical fixture unchanged | 14/§5 |
| 15 unconfigured fresh run unchanged | 15, plus the sweep |
| 16 typecheck | sweep |
| 17 existing gates green | sweep |

§5's four additional assertions:

- **`process.env` only at the composition boundary.** Check 13 scans *every*
  tracked `.ts`/`.tsx`/`.mjs` outside `lib/xray/providers/` and
  `lib/xray/host/` for the five variables and for both secret names, rather
  than an allowlist of directories — so a new directory cannot quietly acquire
  the right to read one. It also asserts `pipeline`, `domain`, `validation`,
  `projections`, `selectors`, `review` and `acceptance` read no `process.env`
  at all, and that the provider layer never registers or opens a host
  resource. The only other `process.env` readers in the repo are
  `app/layout.tsx` (`NODE_ENV`), `lib/xray/host/*` and one check harness
  (`XRAY_POSTGRES_URL`).
- **Selectors never enter canonical state.** Check 13b: the schema names no
  provider variable and has no `model_id` / `provider_name` / `research_model`
  column; the domain carries no `modelId` or `providerName`.
- **Secret values never appear anywhere.** Check 10b supplies a sentinel as
  `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`, then serializes all three
  resolutions plus the selections and asserts the sentinel is absent, likewise
  from every `describeResolution`. Resolutions deliberately carry no
  environment handle, so nothing can walk back to a value through one. No
  error message in the layer is built from the environment.
- **`.env*` ignored, no key committed.** Check 14/§5 asks `git check-ignore`
  about six filenames, then scans every tracked file for key *shape*
  (`sk-ant-…`, `sk-…`) rather than by variable name, so a key stored under an
  unexpected name is still caught. It also asserts `lib/xray/fixtures` is
  byte-clean.

Check 15 and the stop line prove the stop line itself: `instrumentation.ts`
composes no provider and registers no runtime; `unconfiguredResearchRuntime`
is still what an unconfigured deployment gets; no file in the layer contains a
`fetch`, an SDK import, a prompt, or a transport import; no provider SDK is
installed.

## Existing behaviour

`existing-gates-sweep.txt`: typecheck clean and 35 existing gates green,
including `check:adapters` ("6 port-dependent checks, 2 capability gap(s)
journalled in the blocked run"), `check:review` ("6 model-assisted
NOT_EVALUATED, port unwired"), `check:acceptance` ("BLOCKED … 6 capability
blocker(s)") and `check:inline-execution` ("submitted URL alone creates no
Source, Evidence or version row"). The unconfigured fresh run behaves exactly
as it did at `46932b4` — which is expected, since no runtime was registered.

## Defect found and fixed

`.envrc` was **not** git-ignored. `.gitignore` covered `.env` and `.env.*`,
which misses direnv's file — the most common place an operator would write
`export ANTHROPIC_API_KEY=…` while working on 20b. Added `.env*` and `.envrc`,
and check 14/§5 now asserts all six candidate filenames rather than assuming
the pattern is broad enough.

Two defects in my own gate, found by running it: check 11's fallback-smell
list began with `/|\|…/`, whose empty leading alternative matches every file,
so it failed against clean code; and the stop-line scan read its own source,
where the forbidden tokens appear as the literals that forbid them. The first
is now `/\|\|\s*'anthropic'/` and `/\?\?\s*'anthropic'/`; the second skips
only the gate file, and a separate assertion covers the gate too by forbidding
any `node:http`/`https`/`net`/`tls`/`dns` import anywhere in the layer.

The gate's secret sentinel was initially shaped like a real key
(`sk-ant-SENTINEL-…`), which forced the committed-secret scan to exempt the one
file whose whole subject is secret handling. The sentinel is now
`XRAY-SENTINEL-standing-in-for-a-secret-value` and the exemption is gone.

## Carried forward

- `NOT_IMPLEMENTED` is the answer for every registered provider until 20b/20c.
  A deployment can be fully configured and still have no capability; that is
  the intended 20a state, not a defect.
- Retrieval `custom` declares no required variable, so it resolves
  `NOT_IMPLEMENTED` even with nothing set. What an operator-supplied retrieval
  provider requires is 20c's to define.
- `readProviderSelections` defaults to `process.env` for host convenience. Every
  gate check passes an environment explicitly; no check reads the ambient one
  except the evidence script, deliberately.
- The narrowing boundary constrains what this layer hands a factory. It cannot
  prevent a module from importing `process` itself; the one-door rule in check
  13 is what covers that, and it is a lint-shaped guarantee rather than a
  structural one.
- `ProviderEntry.optional` is unused in 20a. It exists so 20b declares any
  extra configuration in the registry rather than widening the boundary.
- No runtime registration, no adapter, no prompt, no UI change. 20b owns the
  Anthropic model and reviewer adapters against these same registry rows, and
  must declare in `requires`/`optional` everything it intends to read.
