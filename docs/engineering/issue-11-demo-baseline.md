# Issue #11 slice 11a — demo baseline audit

**Status:** Investigation only. No redesign, no demo implementation.
**Evidence:** `verification/issue-11-11a/baseline-observations.txt`, captured from a
production build (`pnpm build && pnpm start`) with no host wiring.
**Audited at:** `6e5f3e9`

---

## The finding that outranks everything else

**The route a judge would start on is blank today.**

`/` returns HTTP 200 and 7,166 bytes in which the hero never renders. `app/page.tsx`
calls `featuredPublication()`, which calls `getDatabase()` unguarded, and **no host
registers a database provider anywhere in `app/`**. The page throws
`HostNotConfigured` after Partial Prerendering has already flushed the shell, so the
status is 200 and the body is empty.

```text
⨯ HostNotConfigured: No database is configured for this build   (×13 while serving / and /library)
```

`/library` fails the same way: 200, 7,546 bytes, no cards.

Everything downstream of that is a consequence:

| Surface | Today | Cause |
| --- | --- | --- |
| `/` landing | **200, empty** | `featuredPublication()` → no database |
| `/library` | **200, empty** | `publishedLibrary()` → no database |
| `/xray/{slug}` and `/v{n}` and `/history` | **503** `This page temporarily unavailable.` | publication resolution needs a database |
| every `/api/**` route | **503** `This deployment cannot serve investigation data.` | `getDatabase()` |
| `/investigations/XRAY-KE-001` | **200, 317 KB, rich** | falls through to the frozen benchmark |
| `/investigation/XRAY-KE-001` | **200, 61 KB** | progress screen, fixture-backed |
| `/gap/GAP-001` | **200, 28 KB** | fixture-backed |

The 503s are *well-built* failures — authored message, no leakage, correct status.
The two 200s are not: they are indistinguishable from a working page that has
nothing to show.

---

## Answers to the required baseline questions

**What exact route should a judge start on?**
`/investigations/XRAY-KE-001`. Not `/`, which is blank, and not `/library`, which is
blank. This is a defect to fix in 11b, not a recommendation to keep.

**Can the full demo complete today without any live network or model dependency?**
The *evidence* half can: explorer, claims, evidence, provenance, discrepancies,
findings, gaps and the ATI draft all render from the frozen benchmark with no
network. The *lifecycle* half cannot: no published version, no library, no ATI
action history, no execution.

**Which step first requires a provider?**
None — and that is the real answer. `SourceInput` never calls the API. It resolves
the URL locally through `resolveSourceSubmission` and either routes to the benchmark
or says so:

> "This build opens the one investigation X-Ray has already completed. Live research
> on an arbitrary URL is not available yet."

So the first step that requires a *database* is the landing page, and the first step
that would require a *model or search provider* is unreachable from the UI. #8's
`POST /api/investigations` and #10's nine ATI routes exist and are gated, but nothing
on screen calls them.

**Which existing committed/published investigation is the strongest demo candidate?**
`XRAY-KE-001`, the frozen benchmark — and it is the only candidate. Nothing is
published (publication needs a database), and `BENCHMARKS` registers exactly one id.

**Can that investigation visibly demonstrate CAL-001 … CAL-006?** Yes, on the data.
All six cases are bound to fixture ids that XRAY-KE-001 contains, and two are already
visible as rendered headings on the explorer: *"Repetition is not corroboration"*
(CAL-003) and *"Different scope"* (CAL-002).

**CAL-007 … CAL-016 carry no `fixtureIds` at all** — they are prose cases with no
executable binding. Recorded here rather than treated as a gap to fill: the release
asks only for CAL-001–006.

**Can the UI distinguish publication count from independent evidence origin count?**
Yes, and well. Rendered on the explorer:

> "2 publications trace to 1 apparent originating record. Counting the publications
> would count the same observation twice."
> "Across this claim: 8 records traced · 3 of them repeat another record"
> "8 independent originating observations behind this claim"

See the legibility finding below about the third line.

**Is proposition-level provenance understandable without reading raw JSON?** Yes.
`provenance-cluster.tsx` renders clusters by originating record with prose, and
withholds a count entirely when origin independence is unresolved — three of six
claims currently say *"origin independence unresolved for 1 evidence point"* rather
than printing a falsely precise number.

**Is the measurement-mismatch example visible?** Yes — `h3: Different scope` under
*"Discrepancies around this claim"* on the explorer.

**Is the unresolved financial bridge visible?** Yes — CAL-006 is bound to `GAP-001`,
whose gap page renders *"A record showing how KSh 16.7 billion is derived…"*.

**Does each gap visibly say what would settle it?** Yes. `/gap/GAP-001` renders
`h2: X-Ray could not locate a record` and the resolving-evidence list.

**Are `PUBLIC_RECORD_REQUEST` and `WAIT_FOR_RECORD` visibly different?** Yes.
`/gap/GAP-001` renders `h2: Public record request` and the draft; a
`WAIT_FOR_RECORD` gap renders a different next step *(“waiting rather than
requesting”)* and no draft action. 10e's gate already holds this.

**Are StageRun states shown truthfully, including blocked and
capability-unavailable runs?** The progress screen renders all thirteen stages with
`h4` headings. **Unverified at runtime**: with no execution ever running, no
capability-blocked or failed StageRun exists to render. This is the largest untested
surface in the demo and is called out as an open decision below.

**What happens on slow load, missing provider, 404, failed execution, unavailable
publication?** See the failure-mode table.

**What breaks on narrow viewport?** Three unprefixed multi-column grids, listed
below. Materially less than expected — most components already carry `sm:`/`md:`
variants.

**What keyboard/screen-reader semantics are verifiable with current tooling?**
Structure only. Node's type-stripping cannot execute JSX and this repository has no
renderer in its harnesses, so `aria-*`, heading order and focus styles are
verifiable by source and by served HTML; computed focus order and screen-reader
output are not.

---

## Route and state map

```text
/                        landing · dynamic (instant=false, connection())
                         needs: published library        → BLANK today
  └─ SourceInput         no API call; routes to the benchmark or declines honestly

/investigation/{id}      progress screen · fixture or DB
                         13 stage rows; no live execution exists to show

/investigations/{id}     explorer · dynamic
                         needs: graph (DB → else benchmark) + ATI surfaces (DB → [])
  └─ AtiRequestPanel     rendered only when a DB yields requests → hidden today

/gap/{gapId}             gap detail · fixture-only, synchronous
                         resolution path, what would settle it, ATI draft

/library                 published library · dynamic, DB-only  → BLANK today
/xray/{slug}             public alias      · DB-only           → 503 today
/xray/{slug}/v{n}        exact version     · DB-only           → 503 today
/xray/{slug}/history     lineage           · DB-only           → 503 today

/api/investigations/**   #8 + #10 routes, all DB-gated         → 503 today
```

### Provider dependency map

| Dependency | Needed by | Present today |
| --- | --- | --- |
| Database (`setDatabaseProvider`) | `/`, `/library`, all `/xray/**`, all `/api/**`, ATI panel, execution | **no** |
| Execution runtime (`setExecutionRuntimeProvider`) | starting or resuming a run | **no** — defaults to every stage reporting a capability gap |
| Model / search adapter | a run that actually researches | **no** |
| Frozen benchmark fixture | explorer, progress, gap pages | yes |

The default runtime is honest by construction: with no adapters a run completes
`CAPABILITY_BLOCKED` with its gaps journalled, rather than failing or succeeding at
nothing. That is the right foundation for the fresh path.

---

## DEMO PATH versus FRESH PATH

```text
DEMO PATH — known-good canonical state, no live provider
  entry      /investigations/XRAY-KE-001
  source     frozen benchmark fixture (no DB, no network)
  covers     claims · evidence · provenance · independence · discrepancies ·
             findings · gaps · ATI draft · CAL-001…006
  missing    published version, library, ATI action history, any execution state

FRESH PATH — real new investigation, provider-dependent, allowed to fail honestly
  entry      /  (paste a URL)
  status     DOES NOT EXIST TODAY. The form never calls the API.
  when built POST /api/investigations → execution → CAPABILITY_BLOCKED with
             journalled gaps when no adapter is configured
```

The two are already *honestly* separated, in the weakest possible way: the fresh path
is absent and the form says so. Nothing currently fakes fresh research — no
replay-dressed-as-live behaviour exists to remove. 11b's job is to keep that property
while making the demo path land somewhere that is not blank.

---

## Failure-mode table

| Condition | Today | Verdict |
| --- | --- | --- |
| No database, landing page | 200, empty body | **defect** — indistinguishable from "nothing to show" |
| No database, library | 200, empty body | **defect** — same |
| No database, public alias | 503, `This page is temporarily unavailable.` | good |
| No database, any API route | 503, `SERVICE_UNAVAILABLE`, no leakage | good |
| Unknown investigation id | **200**, not-found body streamed (`NEXT_HTTP_ERROR_FALLBACK;404` in the payload) | **defect** — PPR flushed the shell before `notFound()` |
| Unknown gap id | **200**, not-found body | **defect** — same |
| No model/search adapter | run completes `CAPABILITY_BLOCKED`, gaps journalled | good, **unrendered** |
| Failed execution | `STAGE_FAILED`, journalled | good, **unrendered** |
| Slow load | PPR shell then streamed content; no skeleton or status text on the explorer | **gap** |
| Withdrawn publication | 410 tombstone, never 404 (#9, gated) | good, unreachable today |

---

## UI legibility findings — high-impact only

**L1 · The landing page and library are blank.** Above. This is the whole first
impression.

**L2 · Unknown ids return HTTP 200.** A judge who mistypes a URL gets a 200 with a
not-found body. The `404` is in the streamed payload, not the status line.

**L3 · The explorer's opening claim is the worst example of the independence panel.**
Measured, per claim:

| Claim | traced | repeating | independent | resolved |
| --- | --- | --- | --- | --- |
| **C001** | 8 | 3 | **8** | yes |
| C002 | 9 | 5 | 4 | yes |
| C003 | 7 | 5 | — | no |
| C004 | 1 | 1 | — | no |
| DC001 | 4 | 2 | — | no |
| DC002 | 4 | 2 | 4 | yes |

C001 reads *"8 records traced · 3 of them repeat another record"* immediately above
*"8 independent originating observations"*. **This is not a correctness bug** — the
two numbers measure different axes: document-lineage repetition versus origin
resolved per proposition, and a repeating publication can still carry a proposition
whose own origin resolves independently. But the two sentences are adjacent, both
numeric, and read as a contradiction. C001 is the claim the explorer opens on, so a
judge meets the confusing case first. C002 (9 / 5 / 4) demonstrates the same idea
legibly.

**L4 · Two `<h1>` elements on the explorer** — the article title and the claim text.

**L5 · Three unprefixed multi-column grids**: `cached-xray-card.tsx` (`grid-cols-3`),
`completion-state.tsx` (`grid-cols-2`), `receipt-drawer.tsx` (`grid-cols-2`). Ten
components carry no responsive variant at all, including `ati-request-panel.tsx`.

**L6 · No source-position data is reachable.** `XRAY-KE-001` has **0**
`sourcePositions`. The only corpus with any is `kenyatta-maralal-calibration`, which
has 2 — and **declares `investigation.id === 'XRAY-KE-001'`, the same id**, while
`BENCHMARKS` maps that id to the other graph. So #13–#15's source-position and
evidentiary-reach work has no demo surface, and the id collision means it cannot
simply be registered alongside.

**L7 · No loading or error text on the explorer.** `role="status"` appears in exactly
one component (`source-input.tsx`).

---

## Accessibility findings

Structural, from source and served HTML. Verifiable now:

| Item | Finding |
| --- | --- |
| Heading hierarchy | two `<h1>` on the explorer (L4); `h2`/`h3`/`h4` otherwise ordered |
| Visible focus | **`focus:ring` in 1 file, `focus-visible` in 1 file**, across 20+ components — the single largest a11y gap |
| Accessible names | `aria-label` in 5 files, `aria-labelledby` in 1, `aria-describedby` in 2 |
| Status not colour-only | holds on the ATI panel (10e gated it); unverified elsewhere |
| Hover-only interaction | **none** — `onMouseEnter`/`onMouseOver` appear in 0 files |
| Screen-reader text | `sr-only` in 1 file |
| Loading/error text | `role="status"` in 1 file |

**Not verifiable with current tooling:** computed focus order, actual screen-reader
output, contrast ratios, real viewport reflow. A renderer or browser harness would be
needed. The release permits adding one *with evidence it is necessary* — the evidence
is L5 and the focus-ring gap, and the recommendation is in 11d below, scoped to the
primary journey only.

---

## Staged plan

### 11b — demo entry and a failure-safe fresh path

- Make `/` and `/library` degrade instead of blanking: `featuredPublication()` and
  `publishedLibrary()` must distinguish *no database* from *nothing published*, and
  the pages must render a stated reason.
- Fix the 200-on-not-found: unknown investigation and gap ids must return 404.
- Decide and implement the demo entry: either seed the frozen benchmark into a real
  database at startup so the whole lifecycle is reachable, or keep the fixture path
  and make the landing page point at it. **Human decision D1 below.**
- Wire the fresh path end to end against the real API, with the capability-blocked
  outcome rendered honestly. Nothing may present replayed state as live research.

### 11c — evidence, provenance and gap legibility

- Reorder or reframe the independence panel so the reader is not met by C001's
  apparent contradiction (L3). Wording change or claim ordering; **not** a change to
  either number.
- Resolve the single-`h1` rule on the explorer (L4).
- Surface a source-position example, contingent on D2 below (L6).

### 11d — responsive, accessibility, loading and error hardening

- A visible focus ring across interactive components (the focus gap).
- Responsive variants for the three unprefixed grids and the ten components with
  none.
- `role="status"` loading and error text on the explorer and progress screens.
- Add a minimal renderer harness — `react-dom/server` plus a JSX transform for the
  check runner — scoped to the primary journey, so a11y assertions stop being
  source-level. Justified by L5 and the focus gap; not a general testing stack.

### 11e — demo script, integrated gate, tag readiness

- One executable gate walking the judge's journey end to end and asserting the DEMO
  and FRESH paths stay distinguishable.
- Written script naming the exact routes, in order, with what each demonstrates.
- Verify CAL-001…006 are each reachable in the script.

---

## Open decisions — genuinely unresolved, for a human

**D1 · Does the demo run against a real database?**
Today nothing wires one, and that single fact causes the blank landing page, the
missing library, the 503 public surfaces and the hidden ATI panel. Two options, and
they lead to very different 11b work:

- **(a) Seed a database at startup** (PGlite in-process, or a real PostgreSQL), writing
  the frozen benchmark as a committed version and publishing it. The *whole* lifecycle
  becomes demonstrable — published version, library, lineage, ATI action history, the
  10d research loop. Cost: a startup seeding path that must not be mistakable for
  research, plus a decision about whether it ships in production builds.
- **(b) Keep the fixture path** and make the landing page and library honest about
  having no publication. Cheap and safe. Cost: #9's publication surfaces and #10's
  ATI action surface stay undemonstrable — two of the five slices this project just
  built would not appear in the demo.

I recommend **(a)**, but it is a product decision about what the demo is *for*, and
it determines most of 11b.

**D2 · Is a source-position demo worth a fixture change?**
The reachable corpus has zero source positions, and the corpus that has them collides
on `investigation.id` (L6). Options: give the Kenyatta/Maralal graph its own id and
register it as a second benchmark; add positions to XRAY-KE-001; or accept that
#13–#15's work is not in the demo. The release says to record a gap rather than invent
a demo fixture, so this is recorded rather than decided.

**D3 · Should capability-blocked and failed execution states be demonstrated at all?**
They are the most honest thing this system does and the least visible — no run has
ever rendered. Showing them means the demo deliberately includes a failure. Worth it,
but it is a judgment about the demo's story, not a technical question.

---

## Stop line respected

No redesign, no new epistemic model, no truth score, no accounts, no ATI semantics, no
publication changes. This slice changed no runtime code: the deliverables are this
document and the captured evidence beside it.
