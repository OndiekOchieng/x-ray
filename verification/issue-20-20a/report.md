# 20a — provider registry + configuration contract

Branch `feat/live-provider-composition`, from `46932b4`.
Composition only. No provider network call exists, because no factory exists.

## What was added

| File | Role |
|---|---|
| `lib/xray/providers/config.ts` | The only place provider selection is read from the environment. |
| `lib/xray/providers/registry.ts` | Registry of provider entries, and `composeProviders`. |
| `lib/xray/providers/composition-checks.ts` | The gate (`pnpm check:providers`). |

Nothing else changed except `package.json` (one script) and `.gitignore`
(see *Defect found*).

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

Secrets are named but never read into a returned value. `config.ts` reports
which *variable names* a selected provider requires and which of them are
unset; it never puts a value in a selection, a resolution, a description, or
an error.

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

`pnpm check:providers` — 16/16, in `composition-gate.txt`. Every check drives a
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
- No runtime registration, no adapter, no prompt, no UI change. 20b owns the
  Anthropic model and reviewer adapters against these same registry rows.
