# 20e — first light

Branch `feat/live-provider-composition`, from `751f09a`.
**The first genuinely live X-Ray run happened.** One fresh public civic-news
URL, real Anthropic providers, real PostgreSQL, the real application path. It
got through `INGEST → DECOMPOSE → CLASSIFY → PLAN → TRACE → DISCONFIRM` and
failed at `RECONCILE`.

No architecture was changed to make it complete. Nothing was patched around.

## The run

| | |
|---|---|
| URL | `https://www.standardmedia.co.ke/national/article/2001512734/audit-shame-of-counties-blowing-millions-on-bogus-projects-travel` |
| Investigation | `XRAY-38a5f60c-68ba-49ca-9b3c-ea56851d6643` |
| Execution run | `RUN-9afec379-5ab5-4455-95d5-a45761e716e7` |
| Status | `STAGE_FAILED` at `RECONCILE` |
| Wall clock | 329 s |
| Providers | `anthropic:claude-sonnet-5` (research), `anthropic:web:claude-sonnet-5` (retrieval), `anthropic:claude-sonnet-5` (reviewer) |
| Database | PostgreSQL 16, 13 migrations, **empty before the run** |

`verification/issue-20-20e/` holds the runner, the raw run log, the durable
re-inspection, and the contamination scan.

## Pre-flight, before spending anything

`.env` defined **only** `ANTHROPIC_API_KEY`. None of the five `XRAY_*`
selection variables, and no database URL — so the composition resolved
`INCOMPLETE` with all three slots `NOT_SELECTED`, exactly as 20a's contract
says it should. 20a forbids X-Ray choosing a model id, so I stopped and asked
rather than defaulting one and spending your money on a model you had not
chosen. You chose `claude-sonnet-5` for all three, and real PostgreSQL.

**No PostgreSQL was running.** Nothing on 5432/5433/5434 inside or outside the
sandbox, no `postgres` process, no data directory; the only Postgres container
on the machine belongs to an unrelated project and exited seven days ago. So
rather than silently substituting PGlite for the option you picked, I started a
**disposable** container (`xray-20e-postgres`, port 55432, `postgres:16-alpine`)
and stopped and removed it after capture. Schema migrations only — **no demo
seed**, because benchmark content must not exist in a first-light database.

Egress was verified with one unauthenticated `POST /v1/messages` — HTTP 401,
which costs nothing and proves the path.

## Nothing was substituted

The database held **0 rows** in `investigations`, `claims`, `sources`,
`evidence` and `findings` before submission. The candidate graph was then
scanned for every benchmark token:

```
XRAY-KE-001  absent      Kisumu    absent      five-day tour  absent
inside-ruto  absent      Siaya     absent      resurfaced 42  absent
Ruto         absent      Migori    absent      520ecf67fe     absent
Homa Bay     absent
```

Every source carries a real external URL and a stage-computed digest. This
research happened.

## Stage journal

```
[0] STAGE INGEST       SUCCEEDED
[1] STAGE DECOMPOSE    SUCCEEDED
[2] STAGE CLASSIFY     SUCCEEDED
[3] STAGE PLAN         SUCCEEDED
[4] STAGE TRACE        SUCCEEDED
[5] CAPABILITY provenance:lineage [NOT_SUPPORTED]
[6] STAGE PROVENANCE   PENDING
[7] STAGE DISCONFIRM   SUCCEEDED
[8] STAGE RECONCILE    FAILED
```

Candidate: 6 sources, 11 claims (2 surface, 9 discovered), 3 evidence, 14
disconfirmations, 0 discrepancies, 0 findings, 0 gaps. No gates ran — the run
failed before `VALIDATE`, so there is no FULL validation and no review round,
and `GRADE`/`GAPS` never executed.

## Finding 1 — `RECONCILE` failed on the provider's answer shape

```
The provider's reconcile answer is not usable: discrepancies is a string
rather than an array.
```

The tool schema declares `discrepancies` as an array and `tool_choice` forces
that tool. The model answered with a string there anyway. 20b's decoder
rejected it as `PERMANENT` — retrying produces the same shape — and named the
exact path, which is what 20b predicted a schema mismatch would look like.

**This is not an envelope mismatch.** The Messages API envelope was correct: a
`tool_use` block arrived, the tool name matched, the transport was fine. What
differed was the *model's* answer inside a declared schema. So per your
instruction I have **not** touched the adapter. What to do about it is a
decision, not a patch:

- accept a scalar where an array is declared (loosens the boundary for every
  field, and 20b's whole argument is that the boundary is the point);
- retry once on a decode rejection with the schema restated (makes the
  rejection `TRANSIENT`, which contradicts `capability.ts`'s reasoning);
- leave it strict and let a malformed answer fail the stage, as now.

I recommend the third, because it is the only one that keeps "a provider
answered in a shape the protocol forbade" visible. But it means a live run's
completion depends on the model's schema compliance at every stage.

## Finding 2 — `PROVENANCE` produced exactly the predicted capability gap

```
CAPABILITY  provenance:lineage  [NOT_SUPPORTED]
  No record in this run reports what it is attributed to, so origin and
  independence cannot be decided. Nothing was assumed.
  resolvedBy: Configure a retrieval adapter that reports printed attribution
              (observed.attributedTo), or supply attribution for these records.
```

The stage was journalled `PENDING`, the run continued, and **zero**
`sourceDependencies` and **zero** `evidenceProvenance` were written. No
independence was derived from a hostname; no attribution was invented. 20d
predicted this and 20e confirms it live, unweakened.

Consequence to keep in view: every source is `originStatus: UNKNOWN` and
`evidenceClass: SECONDARY`, because those are `PROVENANCE`'s to revise and
`PROVENANCE` could not run.

## Finding 3 — the retrieval is topically wrong, and that is X-Ray's fault

This is the headline research-quality finding.

| Source | URL |
|---|---|
| SRC-002 | `auditor.on.ca` — Auditor General of **Ontario** |
| SRC-003 | `michigancapitolconfidential.com` — **Michigan** subsidy audits |
| SRC-004 | `chrisram.net` — a commentator on **Guyana's** Auditor General |
| SRC-005 | `govinfo.gov` — a **US Senate** hearing on the Defense Contract Audit Agency |

Six of the nine discovered claims are about Ontario, Michigan, Guyana and the
DCAA. They are real claims, from real documents, correctly attributed to real
URLs with real digests — and they have nothing to do with Kenyan county
spending.

The cause is mine, in `live-stages.ts`'s `plan()`. It builds a query from
`claim.text.slice(0, 180)` plus entities. The two surface claims
`DECOMPOSE` produced are generic —

> "The Auditor General has highlighted wastage of public funds by counties."

— so the query matched "auditor general performance audit" material worldwide.
No jurisdiction, no publisher, no date constraint survived into the search.

**No invariant was violated.** Nothing was fabricated, every receipt is real,
and the graph is internally honest. That is precisely why it is worth saying
plainly: X-Ray's guarantees are about *not lying*, and they held perfectly
while the research was poor. A run can be fully legal and still not be useful.

I have not changed `plan()`. Better query construction is design work — it
needs the investigation's own entities, jurisdiction and time scope, and
possibly a model-assisted planning step the port deliberately does not have
(D17 put query formulation on `TraceInput` instead). That is a slice, not a
first-light patch.

## Finding 4 — one record became two `Source`s. This is a real defect.

```
SRC-001 + SRC-006  ->  …/audit-shame-of-counties-blowing-millions-on-bogus-projects-travel
  SRC-001  28080 chars  hash=sha_fnv_f3e51598_lo0
  SRC-006  28080 chars  hash=sha_fnv_f3e51598_lo0      <- identical digest
```

`INGEST` minted `SRC-001` for the submitted URL. `TRACE`'s search then
rediscovered the same article, retrieved it again, and `sourceFrom` minted
`SRC-006` for it — same locator, same byte-identical extract, different
canonical id. And all three evidence items cite **SRC-006**, not the
`INGEST` record:

```
EV-001 -> SRC-006    EV-002 -> SRC-006    EV-003 -> SRC-006
```

Two `Source` rows for one record is exactly the shape XR-INV-004 exists to
catch: a later stage counting them as two independent records would inflate
corroboration. Nothing has done so yet — `PROVENANCE` never ran, and it is the
stage that would have decided independence — but the graph now contains the
precondition for it.

It also cost a second fetch of a 28 KB document for nothing.

**I have not fixed it**, because the fix is a decision I should not take
unreviewed:

- `TRACE` reuses the existing `Source` id when a retrieved locator already has
  one (needs a rule for what happens when the extract *differs* — the same URL
  re-fetched later is arguably a different observation);
- or `gatherMaterial` drops a discovered record whose locator is already the
  surface record (loses the fact that search independently found it);
- or the graph legitimately holds two observations of one URL and
  `PROVENANCE` collapses them via `SourceDependency`.

The third may be the architecturally correct answer, which is why this needs
your call rather than my patch.

## Finding 5 — a fresh initial run has no path to graduation

You asked me to determine this explicitly. It does not exist.

The only production caller of `promote`, `assessCandidate` and `commit` is
`ATIResearchBridge.processIntake`, which requires an ATI intake bound to an
already-committed version. The initial-run API surface is:

```
POST /api/investigations/{id}/executions          start
GET  /api/investigations/{id}/executions/{runId}  status
POST …/executions/{runId}/resume                  resume
GET  /api/investigations/{id}/candidate           read the candidate
GET  /api/investigations/{id}/versions            read committed versions
```

Nothing promotes, assesses or commits an initial candidate. So a first
investigation can reach a durable candidate and stop there, and the ATI bridge
is not a substitute — it needs the committed version that only graduation could
have produced. This is the `#7` gap my earlier notes recorded as "no production
first-version graduation-link path", now confirmed from the live end.

### And a second, larger consequence: the live reviewer cannot run at all yet

`pipeline/run.ts:573`:

```ts
const review = reviewXRayGraph(graph, { validation, reviewedAt: clock() })
```

`RunOptions` has neither `model` nor `judgments`. So the `REVIEW` gate **inside
every pipeline run** never asks a reviewer, and every model-assisted check is
`NOT_EVALUATED` in every run, live reviewer or not.

Combined with the missing graduation path, the reviewer 20d wired — correctly,
through its own seam, consumed by `assessCandidate` — has **no reachable
caller for an initial execution**. It runs only via `GraduationService.assess`,
and only the ATI bridge calls that.

This is a finding, not something I fixed. Passing a reviewer into `runPipeline`
would make the pipeline collect judgments, which is an architecture change, and
you said not to make one to force completion.

## Diagnostics

Partial, and honestly so. The adapters expose `diagnostics()` on the class
rather than the port, so only instances this process holds directly can be
asked — the research model and retrieval adapter live inside the runtime's plan
and are not reachable without widening a port. What is observable:

- 329 s wall clock for 8 stages;
- 6 documents fetched (one of them twice — Finding 4), 150 KB the largest;
- searches ran (the discovered records prove it), count not recoverable.

Token and cost totals for the run are **not** captured. Getting them needs a
non-canonical diagnostics sink the composition can read back, which is real
work and not a first-light patch.

## What was pushed

Verification artefacts only: this report, the runner, the raw log, the durable
re-inspection, the contamination scan. **No source change** — no fix was
justified without a decision, and the two candidates (Findings 3 and 4) are
design questions.

The disposable Postgres container was stopped and removed after capture.

## Recommended order for what follows

1. **Finding 4** (duplicate `Source`) — smallest, and it is the one with an
   invariant-shaped consequence.
2. **Finding 5** (initial-run graduation + reviewer reachability) — without it
   no live run can ever produce a version or a review, so the live journey
   cannot be completed at all.
3. **Finding 1** (schema strictness) — decide the policy; it gates how often a
   live run completes.
4. **Finding 3** (query construction) — the biggest research-quality lever, and
   the most design work.
