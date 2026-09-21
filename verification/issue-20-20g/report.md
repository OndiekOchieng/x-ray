# 20 — Anthropic strict tool use

Branch `feat/live-provider-composition`, from `6fd7438`.
Fixes first-light **Finding 1** only. The decoder is unchanged and malformed
output is still rejected.

## What first light showed

```
RECONCILE
  -> correct forced tool_use envelope
  -> discrepancies returned as a string
  -> decoder correctly rejected it (PERMANENT)
```

A declared schema was a *request*, not a guarantee. The decision was not to
loosen the decoder or reclassify malformed output as retryable, but to make the
guarantee real.

## The API contract, verified 2026-09-21

- `https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use`
- `https://platform.claude.com/docs/en/build-with-claude/structured-outputs`
  — the schema limitations live here; the strict page links to them
- `https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools`

**`strict: true`** is a **top-level property of a tool definition**, beside
`name`, `description` and `input_schema`. No beta header;
`anthropic-version: 2023-06-01` is unchanged. Documented guarantees: *"Tool
`input` strictly follows the `input_schema`"* and *"Tool `name` is always
valid"*, implemented by grammar-constrained sampling over a compiled schema.
It composes with forced selection, and forced `tool_choice` is **kept** —
strict guarantees the *shape*, not that a tool is called at all.

### The supported subset

| | |
|---|---|
| types | `object`, `array`, `string`, `integer`, `number`, `boolean`, `null` |
| values | `enum` over scalars/null only, `const`, `default` |
| combinators | `anyOf`, `allOf` (not `allOf` with `$ref`) |
| references | `$ref`, `$defs`, `definitions` — no external `$ref` |
| objects | `required`; **`additionalProperties` must be `false`** |
| formats | `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `uri`, `ipv4`, `ipv6`, `uuid` |
| arrays | `minItems`, and only `0` or `1` |

**Not supported:** recursive schemas · complex types in `enum` · external
`$ref` · numeric constraints (`minimum`, `maximum`, `multipleOf`) · string
constraints (`minLength`, `maxLength`) · array constraints beyond `minItems`
0/1 · `additionalProperties` set to anything but `false`. An unsupported
feature is a **400**.

## The audit, and what it found

This is why the instruction not to special-case `RECONCILE` mattered. Before
the fix, **all eight tools were non-compliant — 29 problems**, every one a
missing `additionalProperties: false`:

```
DECOMPOSE  4    CLASSIFY  4    TRACE  10    DISCONFIRM  2
RECONCILE  2    GRADE     2    IDENTIFY_GAPS 3    REVIEW  2
```

They included the shared `measurement` and `timeScope` fragments,
`likelyHolder`, `targets.items`, and **every array item object**. Fixing
`RECONCILE` alone would have addressed 2 of 29 and left the next live run to
400 somewhere else.

After: **0 problems in all eight.**

### A validator, not a normaliser

`strict-schema.ts` walks a schema and reports every departure from the subset,
with the path that carries it. It deliberately does **not** auto-insert
`additionalProperties: false`: that would hide an authoring mistake behind a
fix, and the mistake is the thing worth seeing. It returns *all* problems
rather than the first, because fixing one nested object at a time and re-running
is how the second one gets missed.

It runs in `callMessages` **before the request is sent**. The API's answer to
an unsupported keyword is a 400, and a 400 discovered in production is a 400
that cost a run; this is the same information at authoring time, naming the
path.

Authoring goes through one `obj()` helper so a new schema is closed by
construction — but the validator is the guard, because a helper nobody used
would be no guard at all.

## Scope held

- **Server tools are untouched.** `web_search` and `web_fetch` do not receive
  `strict`; 20c's retrieval path is unchanged.
- **Forced selection kept** wherever it was.
- **The decoder is unchanged.** Check 14e drives the exact first-light payload
  and asserts the same `PERMANENT` refusal with the same wording, plus a
  number, an object, `null` and a missing key — none coerced. A provider
  guarantee is still a provider's, and `decode.ts` is what makes a broken one
  visible rather than load-bearing.
- No SDK, no provider type outside composition, no pipeline or domain change.

## One minimal live call

Synthetic material only — two invented depot figures. No civic URL, no search,
no retrieval, no first-light rerun. `RECONCILE`, because that is the operation
that failed.

```
schema audit before sending:  0 problems
HTTP:                         accepted strict: true — no 400
stop_reason:                  tool_use
discrepancies:                returned as an ARRAY, decoded into 1 proposal
  classification=GENUINE_CONTRADICTION  resolved=false
  claimRefs=ref:c1,ref:c2   evidenceRefs=ref:e1,ref:e2
tokens:                       1894 in / 374 out · 7.5 s · one call
```

The operation first light failed on now returns a schema-valid answer from the
live API.

## Gate

`pnpm check:anthropic-adapters` — **32/32**.

| Check | |
|---|---|
| **14b** | every one of the seven `ResearchModel` operations **and** the reviewer sends `strict: true`, keeps forced selection, and sends a strict-compatible schema |
| **14c** | all eight authored schemas audit clean — plus eleven deliberately bad schemas the audit must reject, and `minItems` 0/1 it must accept |
| **14d** | an incompatible nested schema is refused **before any request**: `StrictSchemaRejected` naming `rows.items.additionalProperties`, and the stub received **nothing** |
| **14e** | `RECONCILE` still requires an array — the first-light payload, a number, an object, `null`, a missing key: all `PERMANENT`; a well-formed array still decodes |

### Negative controls

| Control | Result |
|---|---|
| AW · `strict: true` removed | FAIL 14b — *"decompose: strict is undefined"* |
| AX · a nested item object loses `additionalProperties` | FAIL 14c naming the path, **plus four checks that fail because the request is refused before being sent** |
| AY · the pre-request audit removed | FAIL 14d — the bad schema reached the wire |
| AZ · the decoder coerces a scalar to an array | FAIL 5 and 14e — proof the decoder is unchanged |

## Regression

Typecheck clean, **40 gates green**. `check:providers` 22/22,
`check:anthropic-retrieval` 29/29, `check:live-runtime` 35/35.

## Carried forward

- **Strict mode is a guarantee about shape, not about content.** A
  vocabulary-valid but wrong `classification`, or a handle the stage never
  offered, is still the decoder's to refuse — and it still does.
- **`enum` over scalars is the only constraint mechanism available.** Numeric
  and string constraints are unsupported, so bounds that matter (an ISO date,
  a bounded length) remain the decoder's job. `decode.ts` already checks the
  ISO shape; strict mode does not and cannot.
- **First light's other findings stand.** Query construction (3), the missing
  initial-run graduation path and reviewer reachability (5). Finding 4 was
  fixed in `ba6bdc3`/`6fd7438`.
- The full first-light URL has **not** been rerun.
