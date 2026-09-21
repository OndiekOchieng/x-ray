# Issue #20 — first-light Finding 3: retrieval query construction

Base: `42f0d6c` (Finding 5 amendment, GREEN). Finding 3 only. No civic rerun.

## The rule, as implemented

    query = the claim's own terms + the anchors the surface record carries

`lib/xray/pipeline/query-plan.ts` is the whole of it: pure, provider-neutral,
no clock, no I/O. `PLAN` computes the anchors once per stage run — they are a
property of the investigation, not of a claim — and each claim's query narrows
the same context.

**What an anchor is:** a term read off a field that is either present or
absent. `AnchorOrigin` records *which field it came from*:

| Origin | Read from |
|---|---|
| `INVESTIGATION_FOCUS` | `Investigation.focus` |
| `SURFACE_RECURRING_ENTITY` | an entity **more than one** surface claim names |
| `SURFACE_INSTITUTION` | the surface `Source.institution` |
| `SURFACE_PUBLISHER` | the surface `Source.publisher` |
| `SURFACE_HOST` | the hostname of the surface locator |
| `SURFACE_PERIOD` | a year the surface claims are scoped to, or the record was published in |

That order is the rank order. At most **three** anchors reach `terms`; the rest
still narrow through `constraints`, which the port already documents as "the
narrowing the stage applied, e.g. a jurisdiction or publisher" and which the
Anthropic adapter already renders as `Restrict to: …`. The claim's terms come
first and are never trimmed to make room.

**What is deliberately absent.** No planning agent — anchors are read, not
asked for, and the model port still has no `plan` method (D17). No relevance
score — nothing in the implementation ranks a returned document. No gazetteer,
classifier or jurisdiction table: an anchor is not labelled `COUNTRY` or
`COUNTY`, because deciding that "Kisumu" is a county requires knowledge the
module would have to hard-code, and a hard-coded place list is exactly the
defect that would make X-Ray work for one country. No title dump: appending a
headline to every query is the other way to lose claim specificity.

Anchors are query context and nothing else. They mint no `Claim`, `Source`,
`Evidence`, `SourceDependency` or `Finding`, and decide no independence or
origin. `PLAN` still contributes no artifact.

## Inspectable, and non-canonical

`RunMaterial.queryPlans` now holds the **plan** per claim, not just the query:
the claim's terms, the anchors carried, the anchors the claim already named,
the anchors past the budget, and the query issued. First light could report the
four wrong countries it found but not the query that found them.

`LiveRuntimeOptions.observeQueryPlan` is a diagnostics seam so a host can log
each search as `PLAN` formulates it — `RunMaterial` is rebuilt on resume and
dropped when a run ends. It is not wrapped in a `try`: a diagnostics channel
that swallows its own errors is how a log quietly stops being written.

`query-preview.ts` in this directory runs the real planner over first light's
own recorded surface facts, offline, and prints before and after. Its output is
`query-preview.txt`.

## Checks — `pnpm check:query-plan`, 11/11

The fixture is first light's own shape: its recorded URL and title, the two
generic claims `DECOMPOSE` produced, and a corpus containing the exact four
documents it found — Ontario, Michigan, Guyana, the DCAA — plus the Kenyan
material the search should have reached.

| # | Check |
|---|---|
| 1 | the first-light shape carries investigation anchors into a generic query |
| 2 | the fixture reproduces first light, and the anchors change the result |
| 3 | the same generic claim in two jurisdictions produces two queries |
| 4 | claim specificity survives anchoring |
| 5 | the claim leads its own query and is never displaced |
| 6 | no anchors degrades to the claim query, and invents nothing |
| 7 | anchors mint nothing canonical |
| 8 | what was searched for is inspectable run state |
| 9 | the anchor budget holds, and the rest still narrows the search |
| 10 | tracing cannot re-anchor the investigation |
| 11 | no jurisdiction is hard-coded in planning or runtime code |

Check 2 calibrates the fixture before it uses it: the *unanchored* query must
return first light's four documents, so the corpus is not rigged in the fix's
favour. Check 7 uses a sentinel `focus` as a tracer — it must appear in every
query and in no canonical object, and the graph must be identical to a run
without it. Check 10 is the resume shape: `PLAN` runs again over a graph
already holding first light's Ontario discovered claim, and nothing anchors on
it. Check 11 strips comments before scanning `query-plan.ts`, `live-stages.ts`,
`live-runtime.ts`, `material.ts` and every Anthropic adapter file for sixteen
jurisdiction tokens, and separately refuses a place table in the planner.

### Negative controls

| Control | Result |
|---|---|
| CC · `plan()` stops passing the anchors | FAIL 1, 2, 3, 7, 8, 10 |
| CD · every entity anchors every query | FAIL 1, 3, 4, 8, 9 |

CC is the control the amendment asked for: with anchors dropped, check 2 fails
with the four off-topic URLs by name.

## A defect my own gate caught

**Entity anchors bled between claims.** My first implementation anchored on
every entity any surface claim named. The fixture has an audit claim and a
hospital claim, and the audit claim's search came back with the hospital
record — "do not dump every entity into every query", reproduced by the code
that was supposed to prevent it. An entity a single claim names is *that
claim's subject*, and it is already in that claim's terms; an entity two claims
name is context the record keeps returning to. Only recurring entities anchor
now, which is control CD.

Two of my own assertions were wrong before they were right: check 9 expected
"counties" to appear once when the claim's own text and entity list both name
it — pre-existing behaviour this slice does not touch — and check 3 expected no
shared anchor at all when two investigations published in the same year
legitimately share a year. Both now test what they meant to.

## What this does not establish

**The anchors first light's record actually yields are the publication and the
period.** `query-preview.txt` shows them: `The Standard`,
`standardmedia.co.ke`, `2026`, and `Auditor General` as a recurring entity the
claims already name. There is no "Kenya" and no county, because the record's
metadata carries no country and its two generic claims name none. Nothing
invents one.

So this slice proves the queries now carry the investigation's context and
differ by jurisdiction. **It does not prove the retrieval improves.** The
oracle in the gate is my construction — a stand-in that returns what the query
asks for — and it is evidence about the query, not about Anthropic's web
search. Only the civic rerun can settle whether publication and period context
is enough to pull Kenyan material, and that rerun is not in this slice.

**One tension worth naming.** A publisher anchor biases retrieval toward the
same publisher, and XR-INV-004 cares about exactly that: corroboration from
one publication is not independent corroboration. Three things hold it down —
the publisher ranks below the record's institution and the recurring entities,
at most three anchors reach the terms, and no `site:` operator or domain
restriction is ever issued. But it is a real trade against the thing that makes
the retrieval on-topic at all, and the rerun should be read with it in mind.
`PROVENANCE` remains the stage that decides independence, and it is untouched.

## Elsewhere

`check:query-plan` is new. Everything else is unchanged and green except two
environmental suites — `check:rendered` (dev server on :3160) and
`check:persistence-postgres-concurrency` (`XRAY_POSTGRES_URL`) — neither of
which ran. See `regression-sweep.txt`.

`RunMaterial.plannedQueries` became `RunMaterial.queryPlans`, holding the plan
rather than the bare query, so the query and the reasoning cannot drift apart.
`TRACE` reads the query from the plan.

## Still outstanding

- The civic first-light URL has not been rerun. It is now the thing that would
  tell us most.
- **11e** — demo script / integrated gate / tag readiness.
