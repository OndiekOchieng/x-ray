# Issue #20 — the Eastleigh Voice defects, fixed

Base `9c2c72b` (root causes). Both defects GREEN. No civic rerun.

---

## A · cross-realm errors

### The audit

Every production `instanceof` on a type this codebase defines, and what its
result decides:

| Site | Type(s) | Decides | Verdict |
|---|---|---|---|
| `pipeline/run.ts:439` | `AdapterFailure` | **retry** | **branded** |
| `capability.ts` `isTransient` | `AdapterFailure` | retry vocabulary | **branded** |
| `providers/material.ts:191` | `AdapterFailure` | retrieval note | **branded** |
| `application/assessment.ts:128` | `CandidateNotEligible`, `GraduationNotEligible` | eligibility / graduation | `instanceof` kept |
| `application/http.ts:73–98` | `BadRequest`, `InvalidSubmissionInput`, `InvestigationResourceNotFound`, `ExecutionNotRetryable`, `VersionConflict`, `HostNotConfigured` | HTTP mapping, conflict | `instanceof` kept |
| `application/ati-routes.ts:393,398` | `ATIActionRejected`, `IntakeProcessingRejected` | HTTP mapping | `instanceof` kept |
| `investigations.ts:86,181` | `InvestigationResourceNotFound` | read fallbacks | `instanceof` kept |
| `anthropic/transport.ts` | `StrictSchemaRejected` | request refusal | `instanceof` kept, **reclassified** |

**What licenses the ones that stay.** An error can only be built in the wrong
realm if the module that builds it is in the host bundle. Walking
`instrumentation.ts`'s **value** imports — `import type` is erased and puts no
class anywhere — the host bundle is 24 modules, and the only error-defining
ones are `capability.ts` and `strict-schema.ts`. `version-commit.ts`,
`graduation-service.ts`, `assessment.ts`, `http.ts`, `ati-service.ts`,
`ati-routes.ts`, `investigation-service.ts`, `inline-execution.ts` and
`investigations.ts` are **not reachable**, so nothing in the host can construct
a `VersionConflict` or a `BadRequest`, and `instanceof` is correct for them.

That is check 1 of the new gate, so it stays true: a future value import that
drags `version-commit.ts` into the host bundle fails the gate rather than
silently making `http.ts` return 500 for a conflict.

A first pass of that scan counted type-only imports and reported nine modules
as reachable. The refined scan is the honest one, and the difference is the
whole basis for not branding those types.

### The brand

`Symbol.for('xray.error.AdapterFailure')`, set on the instance by the
constructor, read by `isAdapterFailure` / `isPermanent` / `isTransient`. Same
mechanism the provider seam has used since #11b, applied to the other thing
that crosses. Not a name check: `err.name === 'AdapterFailure'` would also
cross and would also be true of anything that set the string.

`StrictSchemaRejected` is **not** branded — nothing classifies it — but
`callMessages` now converts it into a `PERMANENT` `AdapterFailure`. A schema
outside the subset cannot succeed on a second attempt, and before this it was
an unrecognised error the pipeline retried. The message is ours, naming the
offending path; no provider prose is in it.

### The gate — `pnpm check:realms`, 4/4

Three production builds, ~3 minutes. A same-module test cannot see this defect:
32 adapter checks, 35 runtime checks and 58 pipeline checks were green
throughout.

| # | Check |
|---|---|
| 1 | only two error-defining modules reach the host bundle |
| 2 | the branded predicate is a brand, not a name |
| 3 | a permanent failure built in the host bundle is not retried |
| 4 | control — constructor identity reproduces the two attempts |

Check 3, from the built application:

```json
{ "hostBundleIsSeparate": true,
  "hostFailureIsAppInstance": false,
  "appFailureIsAppInstance": true,
  "brandedPredicateSeesHostFailure": true,
  "permanentPredicateSeesHostFailure": true,
  "hostFailureDisposition": "PERMANENT",
  "attempts": ["DECOMPOSE:FAILED"] }
```

**Exactly one attempt.** Check 4 mutates the shipped `isPermanent` back to
`err instanceof AdapterFailure`, rebuilds, and requires **two** — it gets two,
then restores the source and rebuilds. The mutation is applied to the
production predicate rather than to a copy inside the gate, because the
question is whether the shipped decision depends on class identity.

The route the gate calls is 404 unless `XRAY_REALM_CHECK=1`, and
`instrumentation.ts` publishes the probe only under the same variable. An
ordinary deployment serves nothing and publishes nothing.

Found while writing it: the first control run reported no change, because
`next start` runs the server in a grandchild and killing the child left the
port held — so the control queried the *previous* build. The gate now kills the
process group and waits for the port. A control that silently tests the old
binary is worse than no control.

---

## B · the schemas

### DECOMPOSE, by stage ownership

`propose_claims` is now `{ claims: [{ text, sourcePassage }] }`, both required.
**0 optional parameters**, from 17.

The question was not "what can be cut" but "what does this stage own".
DECOMPOSE owns atomic extraction. `CLASSIFY` owns `layer`, `type`, `priority`,
`entities`, `ambiguities`, `measurement` and `timeScope`, runs immediately
after, and already replaces every one of them. Nothing runs between the two
stages, so no pre-CLASSIFY dependency exists and nothing was added back. The
stage code is unchanged: it already minted from provisional defaults when a
proposal omitted a field.

The honest consequence: a run whose `CLASSIFY` is capability-blocked now leaves
claims fully provisional rather than partly. That was already the documented
20d limitation for `layer`/`type`/`priority`; it now extends to entities and
measurement.

### TRACE, split — after `$defs` was measured and rejected

Time-boxed as instructed. `$defs`/`$ref` sharing **lowers the counted total**
— the provider counts a `$def` once, confirmed by its own numbers — but the
schema is still refused:

```
inlined subs=5x5  ->  too many optional parameters (32) … limit: 24
$ref    subs=5x5  ->  Schema is too complex.
inlined subs=6x5  ->  too many optional parameters (38) … limit: 24
$ref    subs=6x5  ->  Schema is too complex.
```

It changes which limit fires, not whether one does. So `$ref` does not preserve
one TRACE call, and the request is split instead.

**Three narrow tools, grouped by proposal family:**

| Tool | Carries | optional |
|---|---|---|
| `propose_evidence` | evidence, with `measurement` and `timeScope` intact | 14 |
| `propose_discovered_claims` | discovered claims + their classification | 6 |
| `propose_positions` | source positions + suggested queries | 10 |

Fewest that fit: two families in one call exceeds what was measured to be
accepted, and each call is also a better question than asking for four kinds of
proposal at once.

**The contract did not move.** `ResearchModel.trace()` is one operation,
`TRACE` is one stage, and the split lives inside the Anthropic adapter. The
three calls run concurrently, share one `RefScope`, and are decoded by the same
`decodeTrace` that read the combined answer — so every family is validated
exactly as before, each taken only from the call that asked for it. The stage
applies invariants and identity unchanged. A capability gap in any of the three
is the operation's gap: a trace missing its evidence is not a partial trace, it
is not a trace.

**No semantic field was made required to fit**, and evidence keeps
`measurement` and `timeScope` — same-measure reconciliation depends on them.

**One thing I did drop, and want on the record:** `measurement` and `timeScope`
are gone from *discovered claims* (they remain on evidence). A discovered claim
arrives at TRACE, after CLASSIFY has run, so no stage owns its measurement in
this pass; the evidence carrying the same figure keeps its own, which is what
RECONCILE compares. If you would rather keep them, discovered claims need a
fourth call or a CLASSIFY rerun over them, and I would rather you choose than
assume.

### `strict-schema.ts` — narrowed, and one constant

The module's claim now says what it is: it validates **the documented subset
plus known local budgets**, and passing it is not acceptance. DECOMPOSE and
TRACE passed it and were both refused.

Encoded: `MAX_OPTIONAL_PARAMETERS = 24`, with `optionalParameters()` counting
properties absent from `required` across every object. The provider states the
number in its own refusal and its count matched ours exactly at 26, 32, 38 and
43 across four probe schemas — a stated limit with a reproducible definition.

**Not encoded:** the bare "Schema is too complex." threshold. It has no stated
number and what was measured does not reduce to one — 15 all-required
properties on one object refused, 14 optional across three objects accepted. A
constant guessed from that would refuse schemas the API accepts with the same
confidence as it accepted ones the API refuses.

### Acceptance coverage — `pnpm check:schema-acceptance`, 10/10

Every shipped tool, enumerated from the module rather than hand-listed, sent
under `strict: true` at `max_tokens: 16` with one synthetic sentence:

```
ok  CLASSIFY         propose_classifications   optional=13
ok  DECOMPOSE        propose_claims            optional= 0
ok  DISCONFIRM       propose_disconfirmation   optional= 3
ok  GRADE            propose_findings          optional= 4
ok  IDENTIFY_GAPS    propose_gaps              optional= 5
ok  RECONCILE        propose_discrepancies     optional= 1
ok  TRACE_DISCOVERED propose_discovered_claims optional= 6
ok  TRACE_EVIDENCE   propose_evidence          optional=14
ok  TRACE_POSITIONS  propose_positions         optional=10
ok  REVIEW           answer_review_question    optional= 0
```

**DECOMPOSE and all three TRACE tools are demonstrated accepted.** Without a
key the gate says so and runs only the local audit — an absent key is not a
failing schema.

---

## Gates

| Gate | Result |
|---|---|
| `check:realms` | 4/4 (three production builds) |
| `check:schema-acceptance` | 10/10 live |
| `check:anthropic-adapters` | 32/32 |
| `check:live-runtime` | 35/35 |
| `check:pipeline` | 58/58 |
| `check:query-plan` | 11/11 |
| `check:lifecycle` | 21/21 |
| `check:providers` | 22/22 |
| full sweep | every suite green |

`check:persistence-postgres-concurrency` was run against the real database with
`--env-file=.env` and passes both cases. `check:rendered` needs a dev server on
:3160 and is the only suite that did not run.

Adapter check 14c now enumerates the tools from `prompts.ts` instead of a hand
list — the TRACE split added two tools in one commit, and a hand list is a list
somebody forgets to extend. 14b drives all three TRACE tools and requires
`strict` on each: a split that dropped it from one would have left that family
unguarded while the other two looked fine.

## Still outstanding

- The civic rerun. Both defects are GREEN; it is the next thing worth doing.
- **11e** — demo script / integrated gate / tag readiness.
