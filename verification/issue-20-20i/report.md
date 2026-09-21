# Issue #20 — Finding 5 amendment: graduation must preserve run capability state

Base: `4b0ea8d` (Finding 5, accepted). Two blockers, both at the assessment /
graduation boundary. `PROVENANCE` untouched. No civic rerun.

## A · the assessment boundary dropped the run's capability state

`assessGraduation()` has always accepted `capabilityGaps` and `staleStages` and
turned each into a `BLOCKED` blocker. `GraduationService.assess()` never passed
them. The consequence was a false record: a run that ended
`CAPABILITY_BLOCKED` — first light's `provenance:lineage NOT_SUPPORTED` being
the case in point — could be *assessed* `PASS`, with only
`commitNextVersion`'s `assertCommittable` refusing it later. The assessment is
what `appendGraduationAudit` persists and what callers read back, so a PASS
there is wrong even when the commit refuses.

`assess()` now reads the durable execution audit it was already reading for
review reuse, and takes both from the journal:

    const capabilityGaps = (recorded?.journal.activeCapabilityEntries() ?? [])
      .map((entry) => entry.unavailable)
    const staleStages = recorded?.journal.staleStages() ?? []

`activeCapabilityEntries()` already discounts a gap a later successful rerun of
the same stage supersedes, and `staleStages()` already clears a stage its own
successful rerun repaired — so no new notion of currency was invented here.
Neither is reconstructed from graph state, deliberately: a gap is a fact about
what the run could not do, and the graph only shows what it did. "No source
positions" cannot tell you whether `PROVENANCE` was blocked or simply found
none. Review reuse by fingerprint is unchanged.

## B · `graduateRun` turned every error into `NOT_ELIGIBLE`

The catch was `error instanceof GraduationNotEligible || error instanceof
Error` — the second arm is every error there is. A `VersionConflict` (someone
committed first) came back as "not eligible yet", and so would a driver fault
or an invariant bug. A conflict reported as ineligibility is a conflict nobody
retries; a persistence fault reported that way is a fault nobody fixes.

Persistence expressed its eligibility refusals with bare `Error`, so the fix
needed a type at the authority that makes the decision rather than message
matching. `CandidateNotEligible` is now thrown by the four `assertCommittable`
refusals and by "Capability-blocked execution cannot assert PASS" in
`commitNextVersion` — all five are deliberate eligibility judgments about a
candidate. `graduateRun` catches `CandidateNotEligible ||
GraduationNotEligible` and rethrows everything else into the existing HTTP
error semantics, unchanged.

## Checks (`pnpm check:first-version`, 16/16)

| # | Check |
|---|---|
| 12 | a capability-blocked run assesses BLOCKED, never PASS |
| 13 | `graduateRun` reports that blocker and commits nothing |
| 14 | a stale stage reaches the assessment as a blocker |
| 15 | a `VersionConflict` is not reported as ineligibility |
| 16 | an injected persistence fault is not reported as ineligibility |

All five drive the real application path — `InvestigationService` →
`InlineExecutionService` → the registered reviewer seam → `assessCandidate` /
`graduateRun` — not direct service injection. 1–11 are unchanged and green.

Check 12 asserts the gap is durable (one active entry, `provenance:lineage`),
then that the verdict is `BLOCKED`, then that the blocker still carries first
light's own `detail` and `resolvedBy` verbatim, then that the *persisted*
assessment says `BLOCKED` on readback. Check 13 additionally asserts the remedy
text survives into what a caller is told, and that
`investigation_versions` is empty afterwards.

Check 15 produces a genuine conflict the way it actually happens: two runs of
the same investigation both hold a candidate for version 1, and the second
graduates after the first has committed, so `commitNextVersion` sees
`actual=1` against `expectedPredecessor=null`.

## Negative controls

| Control | Result |
|---|---|
| CA · `assess()` stops passing capability gaps / stale stages | FAIL 12, 13, 14 |
| CB · `graduateRun` restores the `instanceof Error` catch-all | FAIL 15, 16 |

## Reported, not patched around

**A capability-blocked run cannot also be saturated.** The amendment asked for
"one active `provenance:lineage` gap + otherwise valid/reviewed/saturated
graph". The first two hold — the probe in the gate log shows 0 validation
errors and 1 review round — but the run ends `CAPABILITY_BLOCKED` before the
stop transition, so no research stop is ever established and `RESEARCH_STOP`
blocks alongside the gap. That is the architecture being honest: a run that
could not finish has not established saturation. So checks 12 and 13 name the
`provenance:lineage` blocker specifically rather than settling for "not PASS" —
which matters, because under control CA the verdict is still `BLOCKED`, on
`RESEARCH_STOP` alone. **"Not PASS" would have been a false pass.** That is the
fourth check in #20 whose first form would have passed while testing an
adjacent path.

**The database refused my first attempt at a conflict.** Check 15 originally
forced `latest_committed_version = 7` by hand; 0001's
`advance_latest_committed_version` trigger rejected it — the pointer only moves
one step. The trigger is doing its job; the check now produces the conflict
through two real runs instead.

## Environment

`check:rendered` (needs a dev server on :3160) and
`check:persistence-postgres-concurrency` (needs `XRAY_POSTGRES_URL`) did not
run in this sweep — environmental, not regressions. Native PostgreSQL
predecessor locking and rollback were verified against a real database earlier
in this issue at `966cf92`. Every other suite is green; see
`regression-sweep.txt`.

## Still outstanding

- First-light **Finding 3** — query construction loses jurisdiction. Reported,
  untouched.
- The civic first-light URL has not been rerun.
- **11e** — demo script / integrated gate / tag readiness.
