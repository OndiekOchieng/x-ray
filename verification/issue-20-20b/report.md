# 20b — Anthropic `ResearchModel` + `ReviewerModel`

Branch `feat/live-provider-composition`, from `2cf6a28`.
Both model adapters are implemented. **No retrieval, no runtime registration,
no live URL.** Every 20a boundary is preserved; three 20a checks were re-aimed
rather than relaxed (see *The 20a gate*).

## What was added

| File | Role |
|---|---|
| `anthropic/transport.ts` | The **only** file in the layer that performs HTTP. Messages API + failure classification. |
| `anthropic/prompts.ts` | Authored instructions and declared tool schemas. The only place a prompt exists. |
| `anthropic/decode.ts` | `unknown` → typed proposals. The boundary the slice is about. |
| `anthropic/present.ts` | What the provider is shown — content, never canonical identity. |
| `anthropic/research-model.ts` | `ResearchModel`, all seven operations. |
| `anthropic/reviewer-model.ts` | `ReviewerModel`, all six query kinds. |
| `anthropic/index.ts` | The two factories. |
| `anthropic/adapter-checks.ts` | The gate (`pnpm check:anthropic-adapters`). |

`registry.ts` gained `create` on the two Anthropic **model** rows and nothing
else. No new dependency: the Messages API is called over global `fetch`.

20a's prediction held exactly — a configuration that resolved
`NOT_IMPLEMENTED` now resolves `AVAILABLE`, and nothing that consumes the
registry changed to make that happen.

## The five boundaries, and how each is held

### 1 · Providers propose; X-Ray owns identity

`Offered<T>` carries the whole canonical artifact, id included, so honouring
`model-port.ts`'s "it never learns a canonical id it could later assert" is the
adapter's job. `present.ts` names every content field it shows and omits `id`,
`investigationId`, and every cross-reference id array.

Check **9** is the adversarial proof: every fixture carries a recognisable
canonical id, all seven operations are driven, and the stub's recorded bytes
are scanned. It also asserts handles *were* sent — otherwise the scan would
pass on an empty request.

Withheld for the same reason: `atiEligible`, `originStatus`, `evidenceClass`. A
provider shown the stage's own XR-INV-009 answer could learn to hand it back.

### 2 · Only handles the stage issued

`decode.ts` builds a `RefScope` per operation and rejects any handle outside
it — separating "not a handle at all" from "a handle for something you were
not offered", because the second is a provider addressing canonical state out
of turn and one generic message would hide it.

Check **8** covers an invented handle, a canonical id used as a handle, a
document not retrieved for this claim, evidence and discrepancies the grade was
not offered, and a claim handle used where a document belongs.

### 3 · Nothing a stage owns can be asserted

Provenance, source independence and ATI eligibility have **no decoder**, so
there is no path to assert one. Check **10** proves it structurally: those
field names appear nowhere in the decoder and no tool schema requests them.
Same check asserts `DOES_NOT_EXIST` is unspellable anywhere in the layer, so
`NOT_LOCATED` cannot be promoted.

### 4 · Validated before becoming a proposal

A declared tool schema is a request, not a guarantee. `decode.ts` reads every
field by name; nothing the provider sent is ever spread into a proposal, which
is how an unexpected key would travel.

The vocabularies are restated for runtime use and pinned in both directions —
`satisfies readonly ClaimLayer[]` plus an `Exclude<…> extends never` guard — so
a member the domain adds and this file misses is a compile error, and so is one
this file invents.

Checks **5**, **6** and **7**: eleven malformed shapes, nine invalid vocabulary
values across every slot that has one, and XR-INV-007's non-empty
`wouldChangeFinding` enforced at the boundary so the failure is attributable to
the provider rather than surfacing later as a graph defect. Check **3** proves
a good answer survives intact; check **4** proves an *empty* answer is accepted
— forcing a provider to invent something is how a fabricated claim enters a
graph.

### 5 · Transient vs permanent, in the vocabulary that already exists

Three outcomes, not two. `capability.ts` already draws the line: "a function
that may lack capability returns `CapabilityResult<T>`; a function that may
break throws."

| HTTP / condition | Outcome | Reason / disposition |
|---|---|---|
| 401, 403 | `CapabilityUnavailable` | `NOT_CONFIGURED` |
| 404 — no such model | `CapabilityUnavailable` | `NOT_CONFIGURED` |
| 400 "credit balance is too low" | `CapabilityUnavailable` | `EXHAUSTED` |
| 413 / 422 | `CapabilityUnavailable` | `REFUSED_FOR_INPUT` |
| `stop_reason: refusal` | `CapabilityUnavailable` | `REFUSED_FOR_INPUT` |
| 429, 5xx, network, timeout, `max_tokens` | `AdapterFailure` | `TRANSIENT` |
| other 4xx, prose instead of a tool call, wrong tool, non-JSON 200, malformed answer, unoffered handle | `AdapterFailure` | `PERMANENT` |

Three judgement calls worth stating, since each could reasonably go the other
way:

- **An invalid key is configuration, not failure.** 401/403 becomes
  `NOT_CONFIGURED`, so the run reports `CAPABILITY_BLOCKED` — #20 boundary 6.
  An absent key and a wrong key are the same fault with different spellings.
- **A spent balance is not a rate limit.** No amount of waiting inside the run
  restores it, so it is `EXHAUSTED` rather than `TRANSIENT`. A rate limit *is*
  retryable and stays a `TRANSIENT` failure, because `runPipeline` is the right
  place to retry it.
- **A refusal is not evidence.** `resolvedBy` says so in words: "a refusal is
  not evidence about the claim." #20 boundary 4.

The adapter **never retries**. `run.ts:417` already re-attempts `TRANSIENT` and
refuses `PERMANENT`; a loop here would multiply with that one and hide how
transient a provider actually is. Check **14** drives two queued 429s and
asserts exactly one request was made, then asserts the transport contains no
loop, `setTimeout` or backoff.

## Secrets and diagnostics

The key reaches a request header and nothing else. Check **15** drives six
replies — including provider messages that quote the key back — and scans
whichever way each call ended: a returned proposal, a capability gap, or a
thrown failure.

Two deliberate narrowings in the transport:

- **Only the error `type` is read, never the `message`.** A provider message
  can echo the request, and the request carries the material under
  investigation. Check **16** puts a sentinel in the provider's message across
  five statuses and asserts it never comes back — otherwise a journal entry
  could end up holding a claim's text.
- **Only `err.name` is read from a transport error.** A `fetch` error message
  can contain the URL and, on some runtimes, the failing request's headers.

Diagnostics — request id, token counts, latency, stop reason — are kept on the
adapter instance, not on the port. `ResearchModel` gained no diagnostics
channel, so a stage cannot reach them even by accident. Check **17** asserts
they are recorded *and* absent from the proposal, and that the port still has
no diagnostics member. Where they are recorded outside the graph is 17e's.

## The reviewer, and why its boundary runs the other way

`ModelJudgment.targets` carries canonical ids: a reviewer that could not name
what it flagged would be unactionable. So unlike the research port, the review
port hands over real artifacts and this adapter presents their ids — and the
boundary is enforced on the way **back**. Every returned target must be an
artifact *that query* contained, with a matching kind.

Check **19** rejects an id not in the query, a mismatched kind, and a kind
outside the vocabulary — then proves the rule is "was it in front of you" by
driving a wider `EVIDENTIARY_REACH` query and asserting its three legitimate
targets are accepted.

Check **20** holds #4's promise: `collectModelJudgments` turns `UNAVAILABLE`
into NOT_EVALUATED with a reason, never a pass, so the adapter must report
capability gaps rather than inventing an unflagged judgment. A malformed
judgment fails; an honest `flagged: false` survives.

## Gate

`pnpm check:anthropic-adapters` — **23/23**, in `adapter-gate.txt`. Every call
goes to a stub on `127.0.0.1`, reached through the `ANTHROPIC_BASE_URL` the
registry entry declares. **No request left this machine.**

That variable is declared as `optional` on the entry rather than hidden in the
transport, which is what 20a's amendment made the only way to widen what a
provider sees. A test-only escape hatch would have been a second door into the
same room; the gate uses the same configuration boundary an operator would.

### Negative controls

Each boundary check was verified to fail when the property it claims is
removed, then reverted:

| Control | Result |
|---|---|
| A · `presentClaim` leaks the canonical id | FAIL 9 — `classify: a canonical id was sent to the provider` |
| B · the decoder stops checking the offered scope | FAIL 8 — `an invented claim handle: was accepted` |
| C · a rate limit stops being transient | FAIL 11 — `HTTP 429: PERMANENT, expected TRANSIENT` |
| D · the key is put in the prompt | FAIL 15 — `the key was in the request body` |
| E · a reviewer may target an artifact it was not shown | FAIL 19 — `an id that was not in the query: was accepted` |

## The 20a gate

Three 20a checks asserted "no provider implementation exists yet", which 20b
makes false by design. They were re-aimed, not relaxed:

- **Check 11** (no silent fallback) used Anthropic for its `NOT_IMPLEMENTED`
  case. It now uses `openai` — still registered, still without a factory — so
  the case remains real instead of vacuous.
- **Check 12** asserted the default registry implements nothing. It now
  asserts the whole table exactly: research `['anthropic']`, reviewer
  `['anthropic']`, retrieval `[]`. A row that quietly gains a factory —
  retrieval especially — fails here.
- **The stop line** forbade `fetch`, SDKs and prompts across the layer. It now
  asserts **exactly one** file reaches the network (`transport.ts`, by
  filename), no transport is imported, no provider SDK is installed, no file
  performs retrieval or implements `ResearchAdapter` — and a second check
  proves prompt reachability: only the two adapters import the prompt module,
  and `decode.ts` / `present.ts` / `transport.ts` do not import it at all, so
  no instruction text has a path into a proposal. Nothing outside the provider
  layer imports the Anthropic provider at all.

`pnpm check:providers` — **20/20**.

## Regression

`regression-sweep.txt`: typecheck clean and **37 gates green**. The
unconfigured path is byte-for-byte unchanged, which is required rather than
incidental — 20b registers no runtime:

```
check:adapters   Seam: 30 model queries …, 6 port-dependent checks, 2 capability gap(s) journalled
check:review     Capability: 11 deterministic evaluated, 6 model-assisted NOT_EVALUATED (port unwired, #6).
check:acceptance Canonical benchmark verdict: BLOCKED (0 reason(s) against the graph, 6 capability blocker(s))
```

## Defects found while building

- **Parameter properties.** Three classes used `constructor(private readonly
  x)`. `tsc` accepts them; Node 26's type-stripping does not, so only *running*
  the gate caught it. All three now declare fields explicitly.
- **The gate was named `checks.ts`,** but its own source scans skip harnesses
  by a `-checks.ts` suffix — so it failed its own `DOES_NOT_EXIST` scan on its
  own text. Renamed `adapter-checks.ts`, matching the convention the rest of
  the repo already uses.
- **Check 15 drove the same failing path twice** and assumed the second call
  returned rather than threw, so the check itself failed on the transient
  replies. Replaced with one `outcomeOf` helper that captures whichever of the
  three ways a call can end.
- **A dead assertion.** Check 2 compared two names the compiler already proves
  distinct. Removed rather than left as false comfort.

## Carried forward

- **Untested against the real API.** Every call in this gate went to a stub, so
  what is proven is the contract, the decoding and the failure mapping — *not*
  that Anthropic's current responses satisfy the declared schemas. The first
  real call happens in 20d/20e, and a schema mismatch there would surface as a
  `PERMANENT` rejection with a named path, which is the intended way to find
  out.
- **Budget detection is phrase-matched.** A spent balance arrives as a 400
  `invalid_request_error`, and the message is the only signal. The match is
  narrow (`credit balance is too low`, `insufficient credit|funds|quota`); if
  Anthropic rewords it, the case degrades to `PERMANENT` — visible, not silent.
- **`max_tokens` is treated as transient.** The same request can complete, but
  if a stage's material genuinely exceeds the budget it will retry and fail
  again. Per-operation `maxTokens` constants are authored, not configurable.
- No retrieval, no runtime registration, no live URL, no UI change. 20c owns
  the retrieval adapter; 20d composes the runtime.
