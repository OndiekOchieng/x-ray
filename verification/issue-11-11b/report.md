# Issue #11 slice 11b — seeded demo host and honest fresh path

**Released from:** `f2bec0b` · **remediated after independent review**
**Gate:** `pnpm check:demo-host` — **15/15**
**#6 proof:** `pnpm check:pipeline` — **58/58**, including A1–A10
**Live evidence:** `live-journey-refreshed.txt` (Next production build against PostgreSQL 17.11)
**Database choice:** PostgreSQL for the deployment; PGlite for local reproduction

---

## Item 19 — remediated per the #6 amendment

The review was right that this was a #6 regression rather than an 11b
shortcoming. `runPipeline` reached a gate verdict before its final capability
check, so with no adapter every stage was capability-blocked, the graph was
empty, `VALIDATE` legitimately refused it, and the run durably recorded
`GATE_BLOCKED` — attributing to the graph what belonged to work that was never
attempted, against D19's own rule.

**One narrow terminal-precedence rule, as amended:**

```ts
const producedNothing = journal.succeededStages().length === 0
const blockedOnCapability =
  journal.activeCapabilityEntries().length > 0 && producedNothing

if (journal.staleStages().length > 0 || blockedOnCapability) {
  → TERMINAL CAPABILITY_BLOCKED, no VALIDATE, no REVIEW
}
```

It sits beside the existing stale-stages branch because both say the same
thing: **there is no research candidate for a control gate to judge.**
`GATE_BLOCKED` means a produced candidate was refused.

Read from **execution history**, never from graph emptiness — a stage that
deliberately contributed nothing is not the same fact as a stage that never ran,
and only the journal can tell them apart. No `ResearchStop` is manufactured and
no `VALIDATE`/`REVIEW` record is written.

### The bound, and that it holds

| Run | Terminal status | Proof |
| --- | --- | --- |
| no stage succeeded, capability gaps | `CAPABILITY_BLOCKED`, zero gates | A1–A5 |
| some stage succeeded, invalid candidate | `GATE_BLOCKED` | A7–A9 |
| some stage succeeded, valid, capability gaps | `CAPABILITY_BLOCKED` | A7–A9 |
| no capability gaps, invalid candidate | `GATE_BLOCKED` | A10 |

A7–A9 is the one that matters most: `INGEST` succeeds and everything after it
reports a gap, so a candidate exists, a gate inspects it, FULL validation runs,
and the status follows from what FULL found. The rule is not "capability
outranks validation".

### The eleven required proofs

| # | Item | Where |
| --- | --- | --- |
| 1 | all stages capability-unavailable → `CAPABILITY_BLOCKED` | A1–A5, and live |
| 2 | no research stage `SUCCEEDED` | A1–A5 |
| 3 | zero control gates ran | A1–A5 — asserts `gateEntries().length === 0`, `validation` and `review` both absent |
| 4 | capability records remain inspectable | A1–A5 — 10 active records, 10 reported to the caller, 10 stage entries journalled `PENDING` |
| 5 | no `ResearchStop` invented | A1–A5 |
| 6 | no committed version can follow | A6 · live (0 rows) |
| 7 | one succeeded stage still reaches FULL | A7–A9 |
| 8 | invalid partial candidate stays `GATE_BLOCKED` | A7–A9 |
| 9 | FULL-valid partial with a gap ends `CAPABILITY_BLOCKED` | A7–A9 |
| 10 | ordinary invalid run with no gap stays `GATE_BLOCKED` | A10 |
| 11 | existing #6 replay/retry/resume gates green | `check:pipeline` 58/58, `check:replay` 21/21 |

### One existing gate assertion had to change, and why

`check:inline-execution` asserted `gateEntries().length === 2` for a run whose
only stage reported a capability gap. That encoded the pre-amendment behaviour:
the gates ran on the empty graph and the run reached `CAPABILITY_BLOCKED` only
at the final check. The amendment requires **zero** gate records — "do not
manufacture VALIDATE/REVIEW records when no research stage ran" — so the
assertion is now `0`, with the reason recorded beside it. This is the
amendment's intended consequence, not a regression: every other #8 assertion in
that gate is unchanged and green.

**Two of my own assertions were wrong first**, and the fix is worth recording:
A1–A5 and A6 initially asserted "no research stop was invented" against the
benchmark's *own* investigation record, which arrives `RESEARCH_COMPLETE` with a
`completedAt` and a recorded `SATURATION` stop. That tested the fixture, not the
pipeline. Both now run against a fresh-run investigation shape — `RUNNING`, no
`completedAt`, no stop, no stage runs — which is also the faithful scenario.

### Durable, not merely presented

Gate item 19 now drives a real submission and a real run through the default
unconfigured runtime and asserts the **`execution_runs` row**, not the DTO and
not the projection. Live, against PostgreSQL:

```text
run:          status=CAPABILITY_BLOCKED committedVersion=None stageRuns=10 allPending=True
durable row:  CAPABILITY_BLOCKED | committed_version=null
committed versions: 0
progress page: ok present: Research capability unavailable
               ok present: Scheduled and did not run
               ok present: no version committed
               ok present: no evidence was gathered
               ok present: says nothing about the submitted source
               ok absent : control gate
               ok absent : Inside Ruto
```

`control gate` is now **absent** from the rendered page — the run no longer has
a gate verdict to report, so the copy no longer has to explain one away.

**Historical rows are not rewritten.** Check 20b keeps the compatibility rule
the review allowed: an all-`PENDING` `GATE_BLOCKED` run persisted before the
amendment still renders as *Research capability unavailable*, while
`outcome: 'GATE_BLOCKED'` stays untouched as the durable fact.

---

## The biggest rule holds

**Pasting an arbitrary URL never replays the benchmark.** A new URL produces a
new investigation id (`XRAY-0abd35be-…`), its own execution run, and a progress
screen carrying none of the benchmark's content — asserted by *absence* of
`Inside Ruto` and `Repetition is not corroboration` in the rendered page, not
only by data shape.

**The known demo URL is explicit, not magical.** It says *"We already have a
completed X-Ray for this source. Nothing new will be researched."* and offers
the completed X-Ray. It starts no execution and animates no stages. Before 11b
this form called no API at all; it was honest, but there was no fresh path to be
honest *in*.

---

## Host wiring

`instrumentation.ts` registers one database provider per server process.
Provisioning and serving stay separate: it does not migrate and does not seed, so
a reader hitting `/` can never cause data to be created.

### Two real bugs found while wiring it

**1 · The seam was per-bundle, so registration never reached the pages.**
`runtime.ts` held its providers in module-level variables. Next bundles the
startup hook separately from the app's server components, so each got its own
instance: `instrumentation.ts` registered a database into one copy and every page
read `null` from another. The symptom was exactly the 11a symptom it was meant to
fix — `/` and `/library` reporting storage unreachable while a working connection
sat in the other bundle. The providers now live in one `Symbol.for`-keyed slot on
`globalThis`, shared by every bundle. The seam is unchanged.

**2 · My transaction guard did not guard, and my own gate caught it.**
`SnapshotDatabase` is one method and every transactional operation sends literal
`BEGIN`/`COMMIT` through it, which is incompatible with a connection pool — a
`BEGIN` on one connection and an `INSERT` on another would silently discard the
transaction. So the host holds one `pg.Client`. To make that safe against
concurrent requests I added an `AsyncLocalStorage` guard meant to tell the owning
flow from any other. The gate drove two interleaved flows through it:

```text
B wrote inside A's transaction: A:begin → B:wants → B:wrote → A:commit
```

`enterWith` mutates the *shared* context it is called from, so every flow saw the
same token, recognised itself as the owner, and wrote straight through the open
transaction. A guard that does not guard is worse than none, so it is gone.

**What remains is the honest statement:** one connection per process, safe for
**one writer at a time**. The real fix is a transaction *scope* on
`SnapshotDatabase` — `withTransaction(fn)` handing a bound connection to its
callback — which makes pooling safe and makes this compromise unnecessary. That
is a change across every persistence module and is not this slice's. **Required
follow-up before the demo has concurrent writers.** The gate now asserts the
limitation is stated and the follow-up named, rather than asserting a guarantee
that did not hold.

---

## Provisioning

```text
XRAY_POSTGRES_URL=postgres://…  pnpm demo:seed     deployment
XRAY_DEMO_PGLITE=1              pnpm demo:seed     local reproduction
```

Proven twice against a fresh PostgreSQL database:

| | migrations | seed | events |
| --- | --- | --- | --- |
| run 1 | 13 newly applied | `SEEDED` | 0 → 1 |
| run 2 | 0 newly applied | `ALREADY_SEEDED` | 1 → 1 |

**Idempotency is by inspection, not by exception handling.** The first version
caught "already exists" and carried on, which real PostgreSQL exposed
immediately: each migration file opens its own `BEGIN`, so the failing statement
aborted the transaction and left the connection in `current transaction is
aborted, commands ignored` for everything after it. Swallowing the error kept the
process running against a connection that could no longer do anything. Applied
migrations are now recorded in `xray_schema_migrations` and a recorded one is
skipped rather than re-run and rescued.

**The slug is pinned, not generated.** `DEMO_SEED.slug` asserts what #9 derives
from the investigation id and its surface title. The pin caught my own guess on
the first run — the real slug is
`inside-ruto-s-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-520ecf67fe` —
which is precisely what a pin is for.

**No test helpers in runtime code.** The seed calls `writeInitialSnapshot`,
`assessGraduation`, `saveCandidateCheckpoint`, `appendGraduationAudit` and
`publishVersion` directly. `graduation-check-support.ts` and
`publication-check-support.ts` are not imported.

**It is provisioning, not a research run.** No stage executes and nothing is
inferred; every artifact written is one the benchmark corpus already contains and
the acceptance gates already check. The run it creates exists only to carry the
authorizing assessment: named `SEED-PROVISION-XRAY-KE-001` so a reader of
`execution_runs` can tell it from research, with status `CAPABILITY_BLOCKED`
because that is true — no reviewer model was available, which is what the
recorded assessment (`BLOCKED`, 0 reasons, 6 capability blockers) says.

### One architectural gap the seed exposes

**#7 has no production path that links a first version to its authorizing
graduation assessment.** `commitNextVersion` does it for every successor;
`writeInitialSnapshot` deliberately does not. So the seed writes that link
itself, with an explicit `UPDATE execution_runs SET committed_version=1,
committed_graduation_index=0`. Recorded here rather than hidden as a detail: a
first-version promotion path belongs in #7, and until it exists any host that
wants to publish a v1 must do what this seed does.

---

## The demo path, live

| Route | Status | Marker |
| --- | --- | --- |
| `/` | 200, 17,817B | hero **and** `Featured Investigation` |
| `/library` | 200, 14,325B | the demo card (`Inside Ruto…`) |
| `/xray/{slug}` | **307** → `/v1` | #9's alias behaviour, unchanged |
| `/xray/{slug}/v1` | 200, 5,008B | the published version |
| `/xray/{slug}/history` | 200, 3,100B | the lineage |
| `/investigations/XRAY-KE-001` | 200, 316,893B | `Repetition is not corroboration` |
| `/gap/GAP-001` | 200, 28,212B | `Public record request` |

`temporarily unavailable` appears **zero** times on `/` or `/library` when
storage is healthy. The judge's entry is `/`.

### Degraded states, and the distinction that matters

`publishedLibraryAvailability()` separates three things the old code collapsed
into one empty page:

```text
UNAVAILABLE   storage could not be reached — say so
AVAILABLE []  nothing published yet — a different sentence
AVAILABLE [·] here it is
```

Only a **typed** host failure is converted. A projection bug or a corrupt row
still propagates, because reporting *"temporarily unavailable"* when the truth is
that something is wrong would be its own lie.

**Honest limitation:** a configured PostgreSQL that is *down* raises a driver
error, which is not in that list and will surface as a server error rather than a
degraded page. Mapping driver-level outages needs a typed failure at the host
boundary, which 11b did not add.

---

## Real 404s, and why they needed a proxy

`/investigations/NOPE` → **404**. `/gap/NOPE` → **404**. Verified at the HTTP
status line, not in the body.

This took three attempts, and the first two are worth recording because they
explain the shape of the fix:

1. `notFound()` in the component — still 200. Under `cacheComponents` the static
   shell is flushed before the dynamic holes resolve, so the status line is
   already sent when the loader answers.
2. `notFound()` in `generateMetadata` — still 200. Metadata streams too.
3. `dynamic = 'force-dynamic'` — rejected at build: *"Route segment config
   'dynamic' is not compatible with nextConfig.cacheComponents."*

So the decision has to happen before anything is committed, which is what
`proxy.ts` is for. It answers one question — does this id exist — for exactly two
routes, with one `SELECT` for an investigation and an in-memory lookup for a gap.
**A storage failure is not treated as absence:** if the probe cannot answer, the
request proceeds and the page reports unavailability itself. Turning an outage
into a 404 would tell a reader the investigation does not exist.

(`middleware.ts` is deprecated in Next 16.3 in favour of `proxy.ts`, and a proxy
rejects route segment config because it always runs on Node.)

---

## Verification

| # | Item | Result |
| --- | --- | --- |
| 1 | fresh database + seed → one lineage | gate 1 |
| 2 | second seed duplicates nothing | gate 2 · live run 2 |
| 3 | seeded version round-trips exactly | gate 3 |
| 4 | seeded publication discoverable | gate 4/5 |
| 5 | `/` 200 with hero + featured | gate 4/5 · live |
| 6 | `/library` 200 with the demo card | gate 6 · live |
| 7, 8, 9 | alias, exact version, history resolve | gate 7/8/9 · live |
| 10 | explorer resolves from storage, not fixture | gate 10 |
| 11 | ATI action availability visible from stored state | gate 11 |
| 12, 13 | storage unavailable authored, not blank or an empty-library lie | gate 12/13 |
| 14, 15 | unknown investigation and gap → HTTP 404 | live |
| 16 | known demo URL offers existing research, starts no execution | component phase machine; **not HTTP-tested** — it is a client-side decision |
| 17, 18 | arbitrary URL creates a real investigation and starts a real run | live |
| 19 | no adapter → `CAPABILITY_BLOCKED` | gate 19/21 (durable row) · live · A1–A5 |
| 20 | capability-blocked state rendered truthfully | gate 20 · 20b · live |
| 21 | no version committed for the blocked run | gate 19/21 · A6 · live (0 rows) |
| 22 | no benchmark substituted | live (absence asserted) |
| 23 | storage failure → non-leaking 503 | gate 23 |
| 24 | #9/#10 gates green | `final-gate.txt` |
| 25 | production build green | `final-gate.txt` |

---

## Two carried architecture gaps, as the review recorded them

**1 · Single shared PostgreSQL connection.** Accepted for the single-operator
hackathon demo only. Not concurrency-safe for multiple writers. Before broader
or public concurrent mutation, `SnapshotDatabase` needs a real transaction scope
— `withTransaction(fn)` or an equivalent bound-client API — so pooling is safe.
Stated in `lib/xray/host/database.ts` and asserted by the gate.

**2 · First-version graduation linkage.** The seed's explicit `UPDATE` is
provisioning glue, acceptable because #7 has no production first-version
commit/link operation. Documented in `demo-seed.ts` and here. **Not to be
generalized into application behaviour**: the seed is the only caller, and a
first-version promotion path belongs in #7.

Neither is authorization to start 11c.

## Stop line respected

No independence-panel copy changes, no source-position fixture changes, no broad
responsive or focus pass, no demo script or tagging, no provider integration.

Two changes outside the literal list, both forced: `runtime.ts`'s provider
storage (the wiring did not work without it) and `investigation-library.tsx`'s
prop widened to `readonly` (a type consequence of the availability type).

## Local reproduction

```bash
# local, in-process
XRAY_DEMO_PGLITE=1 pnpm demo:seed          # one process only; PGlite is per-process
pnpm check:demo-host                       # 13/13, PGlite

# deployment-shaped
initdb -D /tmp/xrpg -U xray --auth=trust
pg_ctl -D /tmp/xrpg -o "-p 5488 -h 127.0.0.1" start
psql "postgresql://xray@127.0.0.1:5488/postgres" -c "CREATE DATABASE xraydemo;"
export XRAY_POSTGRES_URL="postgresql://xray@127.0.0.1:5488/xraydemo"
pnpm demo:seed && pnpm build && pnpm start
```

PostgreSQL provisioning takes a couple of minutes: every artifact row is its own
round trip over one connection.

## Files

- `verification/issue-11-11b/live-journey.txt` — the pre-amendment journey, kept as the record of the `GATE_BLOCKED` finding
- `verification/issue-11-11b/live-journey-refreshed.txt` — the same journey after the amendment, with the durable status
- `verification/issue-11-11b/final-gate.txt` — 15/15, the #6 focused proof, and the regression sweep
