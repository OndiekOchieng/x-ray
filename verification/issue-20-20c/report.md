# 20c — Anthropic retrieval adapter

Branch `feat/live-provider-composition`, from `52d1c9b`.
The `ResearchAdapter` seam only. **No runtime registration, no live URL, no
first live X-Ray run.** Every 20a/20b boundary is preserved; five earlier
checks were re-aimed rather than relaxed (see *Earlier gates*).

## The API contract being implemented

Verified against the official documentation on **2026-09-21**:

- `https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool`
- `https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool`

**Implemented:** `web_search_20250305` and `web_fetch_20250910`.

### Why the basic versions, deliberately

Newer versions exist — `web_search_20260209` / `web_search_20260318`, and
`web_fetch_20260209` / `web_fetch_20260309` / `web_fetch_20260318`. Their
headline feature is **dynamic filtering**: the model writes and runs code that
filters results before they reach the context window. On those versions
`allowed_callers` defaults to `["code_execution_20260120"]`, so filtering is
the *default*, not an opt-in.

That is exactly what X-Ray must not have. Pruning a result set by relevance
before anything crosses the retrieval boundary is a provider making an
evidentiary judgement, in a place no invariant can see it. XR-INV-006 turns on
the *extent* of the search; 6c's stop assessment turns on "we stopped looking"
versus "there was nothing left". Neither question can be answered about a set
the provider already pruned.

So the basic versions are pinned and `allowed_callers: ["direct"]` is stated
explicitly on search, so that bumping a version string can never silently move
filtering into code execution. Check **3** asserts the pinned versions, the
explicit caller, and that the verification date and doc URLs are recorded in
the source.

### Documented facts that shaped the code

- A search or fetch error returns **HTTP 200** with a `*_tool_result_error`
  block. So retrieval outcomes are decided from block content, while HTTP
  status keeps its 20b meaning.
- A search matching nothing returns an **empty `content` list, not an error** —
  the difference between "nothing was found" and "the search did not run".
- `page_age` is *"when the site was last updated"*, documented example
  `"April 30, 2025"`.
- web fetch can only reach a URL that already appeared in the conversation.
- web fetch does not render JavaScript.
- `stop_reason: "pause_turn"` is continued by resending the assistant message.

## The boundary: a search result → a `RetrievedDocument`

Three properties carry it, each a rule about what the decoder refuses to do.

### 1 · The model's narration is never read

A server-tool response contains both tool-result blocks *and* the model's prose
about what it found. The prose is where an evidentiary conclusion would live,
and where a smuggled identifier would travel. Only `web_search_tool_result` and
`web_fetch_tool_result` blocks are read; `text` blocks are ignored entirely,
citations included.

Check **5** is the adversarial case. The narration asserts a conclusion, claims
independence and provenance, and carries canonical-looking ids:

```
These two records are INDEPENDENT origins and the second ORIGINATES the claim.
Evidence E-SMUGGLED-1 establishes claim C-SMUGGLED-1 for investigation
XRAY-KE-001. evidenceClass: PRIMARY. originStatus: ORIGINATING. atiEligible: true.
```

plus a `web_search_result_location` citation whose `cited_text` reads *"The
county overstated the figure by a factor of two."* None of it crosses — and the
check asserts the document itself survived, so the scan is not passing on
emptiness.

Check **6** is the same attempt inside the *structured* result: `evidence_class`,
`origin_status`, `independent_origin`, `attributed_to`, `provenance`,
`ati_eligible`, `outcome: RETRIEVED`, an `extract`, a `content_hash`, and
`ref: 'C1'`. Every one is ignored, because no decoder reads it — and the handle
stays `ref:s1`, positional.

### 2 · A search result is `NOT_RETRIEVED`

The documented result carries `url`, `title`, `page_age` and an
`encrypted_content` that no client can read. A record was **identified, not
obtained** — which is what `NOT_RETRIEVED` means and exactly the distinction
XR-INV-006 turns on. Only a fetch can produce `RETRIEVED`.

Check **4** asserts a search document has no extract, no content hash, no
`retrievedAt`, and is neither `isInspectable` nor `isQuotable`. A search result
that claimed otherwise would let a stage quote from something nobody read.

### 3 · No field the architecture assigns to a stage is written

There is no code path that sets `evidenceClass`, `originStatus`, independence or
provenance — `RetrievedDocument` has no such field and nothing here invents one.
`attributedTo` stays absent: it is raw attribution *as printed*, neither
documented API supplies it, and inferring it would hand `PROVENANCE` a guess to
read as the document's own statement.

Check **22** proves it structurally: the retrieval files reach neither
persistence nor the domain's values, and handle no `Evidence`, `Finding`,
`Discrepancy` or `Disconfirmation` at all.

## Unsupported metadata: two fields deliberately left absent

**`publishedAt`.** The only date the API offers is `page_age`, and it is the
wrong fact twice over: it is when the site was last *updated*, not when the
record was published, and the documented example is not ISO 8601. It goes to
`ProviderDiagnostics` — explicitly non-canonical — with a note saying what it
actually is, and nowhere else. Check **10**.

**`publisher`.** Neither API returns one. Deriving it from the hostname would be
an inference presented as an observation: `nation.africa` is not the name of a
publisher, and a stage weighing `evidenceClass` would read our guess as the
document's own statement. Check **10** asserts it is never invented and that no
host-derived publisher appears in the decoder.

## Outcomes, all inside the existing vocabulary

| | |
|---|---|
| a `web_search_result` | `NOT_RETRIEVED` |
| text document, untruncated | `RETRIEVED` + extract + our digest |
| text document, truncated by `bound()` | `PARTIAL` + extract + our digest |
| base64 / non-text (a PDF) | `NOT_RETRIEVED`, no extract, reason disclosed |
| `url_not_accessible` | `DEAD_LINK` |
| `url_not_allowed`, `unsupported_content_type` | `NOT_RETRIEVED` |

`PARTIAL` is used properly rather than decoratively: truncated content stays
inspectable — it is real content — and a stage quoting from part of a record
must know that is what it is doing. Check **15** asserts the outcome, the
`truncated` flag, the exact bound, the recorded `fullLength`, and that the
digest matches the *bounded* extract.

Non-text content is the case worth naming: the provider obtained it, but bytes
this adapter cannot read are not inspected content. Calling it `RETRIEVED`
would let a stage believe it could quote from it, so it is `NOT_RETRIEVED` with
the media type and an explanation. PDF text extraction is outside 20c.

**`DOES_NOT_EXIST` is unreachable.** `RetrievalOutcome` aliases
`SourceAccessibility`, which has no such member, so the type forbids it. Beyond
that, nothing *maps* to non-existence: a 404 is a `DEAD_LINK`, and a search
that matched nothing yields **no document at all** rather than one asserting
absence. Check **21** asserts the alias holds, that every outcome literal in
the layer is in the vocabulary, that the mapping function only produces
vocabulary members, and that `DOES_NOT_EXIST` is unspellable in code. Check
**16** additionally asserts a dead link's document contains no phrasing that
*reads* as non-existence.

## URL normalisation, conservatively

Case, default ports and fragments are noise. Everything else is left exactly as
it came — because in civic systems a query string routinely **is** the record
identity (`?documentId=42`), and "tidying" it would silently address a
different document.

```
HTTPS://Example.INVALID/Path        → https://example.invalid/Path
https://example.invalid:443/a       → https://example.invalid/a
https://example.invalid/a#section-3 → https://example.invalid/a
https://example.invalid/records?documentId=42&rev=2   (unchanged)
https://example.invalid/Records/Award.PDF             (unchanged)
```

Rejected: `javascript:`, `data:`, `file:`, `ftp:`, malformed, empty, non-string.
The `data:` case matters most — a `data:` URL would let provider text
masquerade as a retrieved location.

Rejection costs one result, not the search: check **8** feeds seven entries of
which five are unusable, keeps two, and asserts the rejection count is
*disclosed* in diagnostics rather than silently swallowed.

**Duplicates** are collapsed on a key that ignores a trailing slash and case but
not a query string — a trailing slash is not a different record, `?id=1` versus
`?id=2` is. Check **9** feeds the same record four ways across two searches,
keeps two documents, asserts handles stay dense and positional (`ref:s1`,
`ref:s2`), and asserts the collapse is reported.

## Search failures, and two shapes worth naming

| | |
|---|---|
| empty content list | no document, no `moreAvailable` |
| `max_uses_exceeded` | 0 documents + `moreAvailable: true` |
| `too_many_requests`, `unavailable` | `TRANSIENT` |
| `query_too_long`, `invalid_tool_input`, `request_too_large` | `REFUSED_FOR_INPUT` |
| an unrecognised code | `PERMANENT` |

`moreAvailable` is **never `false`**. A search result list cannot tell us
whether more material exists, so absence means unknown and `true` is claimed
only on `max_uses_exceeded` — the provider positively reporting a cap. That is
the field used as the port intends: *"we stopped looking" and "there was
nothing left" are different research results.*

**A provider that never searched is refused.** If the model answers from memory
without using the tool, zero documents with no search run would look — to a
stage — exactly like an exhaustive search of an empty web. Check **13** asserts
a `PERMANENT` failure naming what happened. Check **18** is the same for fetch:
memory is not retrieval, and content from memory must never reach a stage.

**`url_not_in_prior_context` is our defect, not a fact about the record.** The
API can only fetch a URL already in the conversation, and this adapter puts it
there, so that code means the request was built wrongly. It fails `PERMANENT`
with a message that says so rather than blaming the record.

A **redirect** is recorded, not smoothed over: the locator becomes what the
provider says it read, and the difference from what was asked for goes in
diagnostics (check **20**).

## The instruction is narrow by design

The model here is a search executor, not a researcher. It is told to run the
query or fetch the URL and **not** to analyse, rank, filter or conclude —
because nothing it writes is read, and an instruction inviting analysis would
spend tokens on discarded text while making it look as though X-Ray had asked a
provider for judgement. Check **23** asserts the instruction forbids analysis
and says the prose is discarded.

## Gate

`pnpm check:anthropic-retrieval` — **26/26**, in `retrieval-gate.txt`. Every
call goes to a stub on `127.0.0.1` through the `ANTHROPIC_BASE_URL` the registry
entry declares. **No request left this machine.**

The stub is duplicated from the 20b gate rather than shared: a shared module
would be an *implementation* file in `lib/xray/providers/`, where the layer
rules forbid importing a transport. Duplication in a harness keeps the rule
honest.

### Negative controls

| Control | Result |
|---|---|
| K · a search result claims `RETRIEVED` | FAIL 4, 6 |
| L · `page_age` becomes `publishedAt` | FAIL 10 |
| M · duplicates no longer collapsed | FAIL 9 |
| N · any URL scheme accepted | FAIL 7 |
| O · truncated content reported `RETRIEVED` | FAIL 15 |
| P · an unsearched answer reported as empty | FAIL 13 |
| Q · narration-derived claims written into metadata | FAIL 5, 6 |

## Composition

`ANTHROPIC_RETRIEVAL_REQUIRES` is `ANTHROPIC_API_KEY` **and**
`XRAY_ANTHROPIC_SEARCH_MODEL_ID`. Retrieval names no model in the composition
contract — a search provider is not a model, and there is no
`XRAY_RETRIEVAL_MODEL_ID` — but a server tool runs inside a Messages request,
so one is needed to execute it. It is declared on the entry, which is 20a's
rule for widening what a provider may read.

**Required, not optional, and that distinction came out of the gate.** With it
optional, a deployment missing it resolved `AVAILABLE` and the factory then
threw — a resolution that lies about what it can do. Required means
`CONFIGURATION_INCOMPLETE`, naming the variable. New check **4b** generalises
the lesson: every default row that resolves `AVAILABLE` under a fully
configured environment is actually constructed, so no resolution can promise
something it cannot build.

## Earlier gates

Five checks asserted "retrieval is not implemented yet", which 20c makes false
by design. Re-aimed, not relaxed:

- **20a check 4** asserted retrieval resolves `NOT_IMPLEMENTED`. It now asserts
  the real property — no `XRAY_RETRIEVAL_MODEL_ID` exists in the composition
  contract, retrieval never reports `MODEL_ID_REQUIRED`, a fully configured
  selection resolves `AVAILABLE`, the entry's own missing variable yields
  `CONFIGURATION_INCOMPLETE`, and `custom` is still reserved.
- **20a check 12** expected retrieval `[]`; now `['anthropic']`, with `openai`
  and `custom` still empty.
- **20a stop line** forbade `web_search` and `implements ResearchAdapter`. It
  now asserts the server-tool version strings appear in **exactly one** file
  (`retrieval-contract.ts`) and that no provider file builds canonical state or
  reaches persistence.
- **20b check 2** asserted retrieval `NOT_IMPLEMENTED`; now
  `CONFIGURATION_INCOMPLETE` — the same statement (the model slots resolve
  independently of retrieval) about a row that has a factory.
- **20b check 10** scanned raw source for `DOES_NOT_EXIST` and flagged
  `retrieval-decode.ts` for a **comment explaining why it is unreachable**.
  Documentation of the rule read as a violation of it. It now strips comments
  first, as 20c's equivalent already did.

`check:providers` **21/21**, `check:anthropic-adapters` **28/28**.

## Regression

`regression-sweep.txt`: typecheck clean and **38 gates green**. The
unconfigured path is unchanged, which is required rather than incidental since
no runtime is registered:

```
check:adapters   6 port-dependent checks, 2 capability gap(s) journalled
check:review     6 model-assisted NOT_EVALUATED (port unwired, #6)
check:acceptance BLOCKED (0 reason(s) against the graph, 6 capability blocker(s))
```

## Defects found while building

- **A resolution that lied.** See *Composition* — `AVAILABLE` with a factory
  that would throw. Fixed by requiring the variable, and generalised into
  check 4b.
- **A dead assertion.** Check 6 compared a `ref:${string}` against `'C1'`; the
  compiler proves those disjoint. Replaced with a positional-handle assertion
  that actually runs.
- **20b check 10's comment scan** — recorded above. This is the third time a
  source scan in this project has flagged prose describing a rule; the fix is
  always to strip comments, and 20c's checks did so from the start.
- **A spurious "typecheck clean".** Mid-slice I piped `tsc` through `head`,
  which masked its exit code, and the adapter gate passes regardless because
  Node only strips types. Both sweeps now report `tsc` exit status directly.

## Carried forward

- **`pause_turn` is reported as retryable, not continued.** The documented
  continuation requires resending the assistant message, and this adapter is
  single-shot by design — 20b established that the pipeline owns retry. So a
  paused turn fails `TRANSIENT` and `runPipeline` re-drives the whole search,
  which is wasteful. Whether continuation belongs in the runtime is 20d's
  decision; building it here would have been scope expansion into a transport
  that has been reviewed twice.
- **Untested against the real API.** Every call went to a stub, so what is
  proven is the contract, the normalisation and the outcome mapping — not that
  the live API's responses match the documented shapes. A mismatch surfaces as
  a `PERMANENT` rejection or an unrecognised error code, both visible.
- **No `attributedTo`, ever, from this adapter.** Neither API supplies printed
  attribution, so `PROVENANCE` gets nothing from retrieval on that axis. If
  attribution matters for a live run, it has to come from the document text via
  the model port, not from here.
- **PDFs are `NOT_RETRIEVED`.** Text extraction from base64 is outside 20c.
- **Search results carry no content at all**, so a live run will need `retrieve`
  on each result before `TRACE` has anything to read. That sequencing is 20d's.
- No runtime registration, no live URL, no UI change.
