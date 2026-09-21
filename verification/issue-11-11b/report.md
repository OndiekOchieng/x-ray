# Issue #11 slice 11b — seeded demo host and honest fresh path

**Released from:** `f2bec0b`
**Gate:** `pnpm check:demo-host` — **13/13**
**Live evidence:** `verification/issue-11-11b/live-journey.txt` (Next production build against PostgreSQL 17.11)
**Database choice:** PostgreSQL for the deployment; PGlite for local reproduction

---

## One released item is RED

**Item 19 — "with no research adapter, execution ends `CAPABILITY_BLOCKED`" — is not met.**
It ends `GATE_BLOCKED`, and the reason is architectural rather than incidental.

`runPipeline` decides its terminal status in a fixed order. `CAPABILITY_BLOCKED`
is reached in two places: when a revision left stages stale, and at the very end
if any capability gap was recorded. In between, the control gates run. With no
adapter every stage reports a capability gap, so the graph is empty, the
`VALIDATE` gate legitimately refuses it, and the run returns `GATE_BLOCKED`
before the final capability check is ever consulted.

```text
fresh submission, no provider
  10 stage runs, all PENDING (scheduled, never executed)
  status = GATE_BLOCKED
  committedVersion = null
  committed versions for the fresh investigation: 0
```

So the durable status says *a control gate refused the result* when the truth is
that **no result was produced**. That reads as a judgment about the graph, and
the graph is empty because nothing ran.

Changing that precedence is a #6 decision — the same class as the staged-debt
exemption — so I did not make it. The narrow shape would be: at the gate-blocked
return, prefer `CAPABILITY_BLOCKED` when every scheduled stage was
capability-blocked, on the grounds that a gate verdict over a graph no stage
produced is not a verdict about the graph.

**What I did instead, inside 11b's scope.** The surface tells the truth without
rewriting what the pipeline recorded. `executionStateView` derives
`blockedBeforeResearch` when no stage ran, and presents that run as *"Research
capability unavailable"* while keeping `outcome: 'GATE_BLOCKED'` untouched as the
durable fact. Proven live:

```text
ok  present: Research capability unavailable
ok  present: Scheduled and did not run
ok  present: no version committed
ok  present: no evidence was gathered
ok  present: says nothing about the submitted source
ok  absent : Inside Ruto
ok  absent : Repetition is not corroboration
```

Items 20, 21 and 22 are therefore green: the state is rendered truthfully, no
version was committed, and no benchmark graph was substituted.

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
| 19 | no adapter → `CAPABILITY_BLOCKED` | **RED** — see above |
| 20 | capability-blocked state rendered truthfully | live |
| 21 | no version committed for the blocked run | live (0 rows) |
| 22 | no benchmark substituted | live (absence asserted) |
| 23 | storage failure → non-leaking 503 | gate 23 |
| 24 | #9/#10 gates green | `final-gate.txt` |
| 25 | production build green | `final-gate.txt` |

---

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

- `verification/issue-11-11b/live-journey.txt` — provisioning, demo path, 404s and the fresh path against real PostgreSQL
- `verification/issue-11-11b/final-gate.txt` — 13/13 plus the regression sweep
