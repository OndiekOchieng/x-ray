# Issue #20 — two defects from the Eastleigh Voice run

Run `RUN-35b466fc-2c9f-44c5-bbd4-a6c02c78a318`, surface record
`eastleighvoice.co.ke/africa/402329/south-africa-reports-18-confirmed-mpox-cases-calls-for-vigilance`.

**Root causes only. No production code changed yet.**

---

## Defect A — the 400 is our tool schema, not the article

### What the provider actually said

The transport reports `HTTP 400 (invalid_request_error)` and deliberately does
not surface the message: provider prose can quote the request, and the request
carries the material under investigation. That rule stays. So the message was
read in a local diagnostic harness
(`decompose-probe.ts`) that prints `error.type` and a redacted, 300-character
`error.message`, and never prints the body, the headers or the key.

Every variant used a **three-sentence synthetic record**, which is what
separates the two candidate causes:

| Variant | Result |
|---|---|
| DECOMPOSE schema, `strict: true` — what production sends | **400 `invalid_request_error`: "Schema is too complex."** |
| the identical schema with `strict` removed | 200, `propose_claims` answered |

A tiny document still fails. **The article's size is not the cause**, and
`strict: true` — added at `c754754` for Finding 1 — is the trigger.

### It is not one tool, and not one limit

`complexity-probe.ts` sent all seven authored tools with `strict: true`:

| Tool | objects | properties | optional | Result |
|---|---|---|---|---|
| CLASSIFY | 4 | 18 | 13 | accepted |
| **DECOMPOSE** | 4 | 19 | 17 | **"Schema is too complex."** |
| DISCONFIRM | 2 | 9 | 3 | accepted |
| GRADE | 2 | 10 | 4 | accepted |
| IDENTIFY_GAPS | 3 | 14 | 5 | accepted |
| RECONCILE | 2 | 7 | 1 | accepted |
| **TRACE** | 10 | 59 | 43 | **"Schemas contains too many optional parameters (43), which would make grammar compilation inefficient. Reduce the number of optional parameters in your tool schemas (limit: 24)."** |

Two distinct refusals, and the run never reached TRACE only because DECOMPOSE
failed first. **TRACE would have failed too.** So this is general, and a fix
aimed at DECOMPOSE would leave the next stage broken.

Two things worth noting about that TRACE message:

- It states a limit — **24 optional parameters** — that appears in no
  documentation I can find, including the two pages `strict-schema.ts` cites.
- The number 43 is **exactly** what our own scan computes for TRACE, counting
  properties absent from `required`, summed over every object. So the provider
  counts optionality the way we would, and the count is checkable locally.

`DECOMPOSE` has 17 optional — comfortably under 24 — and is still refused, by a
second limit that does not name itself.

### What the unnamed limit responds to

`limit-probe.ts` and `budget-probe.txt`, at `max_tokens: 16` so a refusal costs
nothing and an acceptance costs sixteen tokens:

| Shape | optional | Result |
|---|---|---|
| one flat object, 14 properties, all required | 0 | accepted |
| one flat object, 15 properties, all required | 0 | **too complex** |
| array item, 9 properties, 1 required, no sub-objects | 8 | accepted |
| array item, 13 properties, 1 required, no sub-objects | 12 | **too complex** |
| array item, 5 properties, 1 required, two 4-property sub-objects | 14 | accepted |
| array item, 7 properties, 1 required, two 4-property sub-objects | 16 | **too complex** |

The limit is **per object, not per schema**: 12 optional properties on one
object is refused while 14 optional spread across three objects is accepted.
Required properties cost something too — fifteen of them on one object is
refused — but optional ones cost more, which is what grammar-constrained
sampling would predict: an optional property multiplies the paths the grammar
must admit.

So the measured envelope is roughly **≤14 properties and well under ~12
optional on any single object**, with the provider's stated **24 optional
across the whole schema**. DECOMPOSE's claim item — 9 properties, 1 required,
plus two all-optional sub-objects of 5 and 4 — sits just outside it.

### Why our own validator passed all three

`strict-schema.ts` audits the *documented* subset — unsupported keywords,
formats, enum scalars, `minItems`, `additionalProperties: false` on every
object. It says DECOMPOSE, TRACE and RECONCILE are all compliant, and by the
documented rules they are. **The limits that refused us are not in the
documentation**; they exist only in the error messages. That is the gap: a
validator built from the docs cannot refuse what the docs do not mention.

### What I have not concluded

Whether these thresholds are stable across models or versions. They were
measured today against `claude-sonnet-5`. A budget calibrated from them is a
*conservative local guard*, not a specification, and it should be written as
one — with the probe kept so the numbers can be re-measured rather than
trusted.

---

## Defect B — `instanceof` does not cross a Next.js bundle boundary

### What the journal shows

Both DECOMPOSE attempts carry the message from `classifyHttpFailure`'s
`PERMANENT` branch, verbatim:

> Anthropic returned HTTP 400 (invalid_request_error) (request …). The request
> will not succeed unchanged.

So the failure *was* classified `PERMANENT`, and `run.ts:439` —
`if (err instanceof AdapterFailure && err.disposition === 'PERMANENT')` — still
let the loop run a second attempt. The first attempt took 95.8 s, the second
87.3 s: three minutes spent re-sending a request the provider had already
refused, which is precisely what that branch exists to prevent.

### Reproduced, in a production build

Not inferred. `pnpm build` + `next start`, with two temporary diagnostics since
reverted: `instrumentation.ts` published its own `AdapterFailure` class and a
factory for a `PERMANENT` instance; a route handler compared classes and drove
`runPipeline` with `maxAttempts: 2` over a stage that throws that instance.

```json
{
  "classIdentical": false,
  "instrumentationFailureIsRouteInstance": false,
  "routeFailureIsRouteInstance": true,
  "instrumentationFailureName": "AdapterFailure",
  "instrumentationFailureDisposition": "PERMANENT",
  "attempts": ["DECOMPOSE:FAILED", "DECOMPOSE:FAILED"]
}
```

Two `AdapterFailure` classes exist in one process. The error's `name` and
`disposition` are intact; only the identity check fails — and the retry
follows.

### Why there are two

Next compiles `instrumentation.ts` separately from the app's route handlers, so
each gets its own instance of `lib/xray/capability.ts`. **This repository
already knows that**, in `lib/xray/application/runtime.ts`:

> They were, and it did not work. Next bundles the server startup hook
> separately from the app's server components, so each got its **own
> instance** of this module … One slot on `globalThis`, keyed by a named
> symbol, is shared by every bundle in the process.

That was #11b. The seam was made cross-bundle with `Symbol.for`; the *error
classes* were not, and `instanceof` has no equivalent protection. The provider
adapters are constructed in the instrumentation realm, so every
`AdapterFailure` they throw is the wrong class for every `instanceof` in the
app realm.

The check harnesses cannot see this. They run in one Node process with one
module graph, where `instanceof` is correct — which is why 32 adapter checks,
35 runtime checks and the full pipeline suite are green against a defect that
fires on every live run.

### The blast radius is wider than the retry

Anywhere an error crosses that boundary and is classified by `instanceof`:

- `run.ts` — `AdapterFailure` / `PERMANENT`: retries what it must not.
- `capability.ts` — `isTransient`.
- `application/assessment.ts` — `CandidateNotEligible`,
  `GraduationNotEligible`, and by extension the `VersionConflict` rethrow that
  `42f0d6c` added two commits ago. A conflict raised in one realm and caught in
  another would miss every arm of that catch.
- `application/http.ts` — whatever it maps to status codes.

I have not yet audited every site; that is the first step of the fix.

---

## Proposed fixes, for review before I make them

**B.** Stop classifying our own errors by class identity across the realm
boundary. A brand — `Symbol.for('xray.capability.adapter-failure')` set in the
constructor — plus `isAdapterFailure(err)`, is cross-realm safe and is not
message matching: the brand is on the instance, chosen by us, and a foreign
object cannot acquire it by accident. Then a gate whose **bad control restores
`instanceof`** and is required to fail, proving exactly one attempt after the
fix — driven through a genuinely second module instance, so the harness
reproduces what a single module graph cannot.

**A.** Two parts, both general:

1. `strict-schema.ts` gains the measured limits — the provider's stated 24
   optional parameters per schema, and a conservative per-object budget — so a
   schema outside them is refused locally, naming the object, before a request
   is sent. Written as a calibrated guard with the probe as its evidence, not
   as a claim about Anthropic's specification.
2. DECOMPOSE and TRACE are brought inside the budget. This is the part with
   epistemic consequences and I would rather agree it than choose it: making
   properties required would force the model to emit a `measurement` for every
   claim, which is worse than omitting one. Dropping `measurement`/`timeScope`
   from DECOMPOSE looks safe — `CLASSIFY` owns both and proposes them
   immediately afterwards — but TRACE is 43 optional across four collections
   and cannot be trimmed without deciding what a proposition may carry.

`budget-probe.ts` is still measuring whether `$defs`/`$ref` sharing reduces the
cost of a sub-object used several times; if it does, TRACE may fit without
losing a field.
