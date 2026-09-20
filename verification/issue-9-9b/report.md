# Issue #9, slice 9b — publication event store and slug namespace

Persistence and application commands only. No resolver, routes, cache, tombstone
or library work. 9c remains locked.

## What shipped

**Migration `0008_publication_events`** — two tables, kept apart because they are
different kinds of fact.

`investigation_slugs` is lineage identity: one slug per investigation, unique across
the public namespace, with UPDATE and DELETE rejected by trigger. A slug cannot be
renamed, reassigned or released, and withdrawal does not free it.

`publication_events` is history: append-only against an exact committed version,
ordered by a per-lineage `sequence` rather than by any clock. UPDATE and DELETE are
rejected by trigger — append-only is a database invariant, not a TypeScript
convention.

Constraints carry the semantics rather than leaving them to code:

| Constraint | Enforces |
|---|---|
| `publication_act_reason` | `PUBLISH` carries no reason; `WITHDRAW` carries exactly one |
| `withdrawal_reason` CHECK | `ERRONEOUS \| COMPELLED \| PRIVACY_HARM \| OUT_OF_SCOPE` — `SUPERSEDED` is rejected by the database |
| `erroneous_requires_note` | A retraction for error must say what was wrong |
| `publish_requires_authorization` | Every publication names the eligibility record that authorized it |
| `principal_id` CHECK | No blank principal reaches storage |
| FK to `investigation_versions` | A candidate or workspace can never be published |

**`lib/xray/persistence/publication.ts`** — commands and derived reads.

`publishVersion` and `withdrawVersion` serialize per lineage with
`SELECT … FOR UPDATE` on the investigation row, not a process mutex. First
publication allocates the slug and appends the event in **one transaction**: two
coupled durable effects that could half-happen would leave a lineage with a
permanent public address and no publication, or a publication with no address.

### Slug minting

`{base}-{suffix}`, always suffixed. The base is Unicode-aware — NFKC, lowercased,
retaining `\p{L}` and `\p{N}` so a Kiswahili or accented title keeps its own
characters rather than being transliterated away — bounded to 64 characters, falling
back to `xray` when empty.

The suffix is `sha256(investigationId)` truncated to 10 hex characters. Deterministic
for the lineage, derived from identity rather than from publication order or a retry
counter, so **which principal happened to publish first cannot change the public
address.** The UNIQUE constraint stays authoritative, and a genuine conflict with
another lineage fails explicitly rather than silently mutating an address that was
already determined.

### Eligibility

Read, never recomputed. `readEligibility` joins the committed version to its producing
`execution_run` and that run's linked `run_graduations` row. `isEligibleAssessment`
was extracted from #7's `assertCommittable` and is now exported, so publication
applies the rule #7 already accepted rather than restating it — one rule, two callers.

An eligible `BLOCKED` publishes and the event stores `authorizing_execution_run_id`
and `authorizing_graduation_index`. The blockers are **referenced, not copied**, so
what 9d discloses cannot drift from the assessment that produced it.

### Presentation head

Replayed from event order. The head is the version named by the **latest deliberate
act**, with its state being that act — never `MAX(version)`, because that definition
cannot express a rollback to an earlier version. Exact-version state is derived from
that version's own events alone.

## Preserved failed verification

**`first-attempt.txt` — 20/25.** All five failures were test setup; the module and the
schema were right each time.

**10 and 12** hit `execution_runs_investigation_id_committed_version_key`: my helper
linked a second run to a version another run had already committed. The UNIQUE
constraint is correct — one run commits one version.

That exposed something worth recording: **#7 makes a committed `FAIL` or `REVISE`
unreachable**, because `commitNextVersion` refuses an ineligible assessment. Proof 12
therefore constructs the state directly and the unreachability is recorded, rather
than the proof being dropped or the constraint weakened.

**10 then failed again** with *"Capability-blocked execution cannot assert PASS"* —
#7 refusing to let a run that could not do its work claim full assurance. That is the
same honesty rule #5 built `BLOCKED` for, and the fix was to give the PASS lineage a
run that actually completed.

**19 and 20** passed an empty `graphFingerprint` into a constructed graduation record,
which `appendGraduationAudit` correctly rejected.

**22** attempted two genuinely simultaneous publications. Both failed, because PGlite
runs on a single connection and interleaving two `BEGIN`s corrupts both transactions.

## Concurrency — stated honestly

Proof 22 establishes the **outcome** the constraints guarantee: a second
first-publication attempt finds the work done and is refused `DUPLICATE_PUBLISH`,
with exactly one slug and one event surviving.

It does **not** prove native row-lock behaviour. `XRAY_POSTGRES_URL` is unset and no
native PostgreSQL server is available here, so simultaneous first publication on a
real server is **unproven and not claimed**. The mechanisms that make it safe — the
`FOR UPDATE` lineage lock and the slug uniqueness constraint — are each asserted
independently.

## Checks

25/25 in `pnpm check:publication` (`final-gate.txt`), covering all the released
proofs: atomic first publication, slug determinism across titles and lineages,
DB-enforced UPDATE/DELETE rejection, slug rename/reassign/reuse refusal, principal
absence, uncommitted and unlinked versions, `PASS` and eligible `BLOCKED` publishing
with blocker linkage retained, `FAIL`/`REVISE` refused, reason vocabulary, the
`ERRONEOUS` note requirement, no-confession withdrawal, unpublished withdrawal,
no-op refusal, full event retention, the released head sequence replayed exactly,
independent exact-version state, transactional rollback, and canonical state
untouched.

Proof 23 also asserts no `%principal%` column exists on any canonical table —
attribution stays out of the evidence graph structurally, not by convention.

## Regression

`check:persistence-versioning`, `check:persistence-graduation`,
`check:persistence-workspace`, `check:persistence-audit`,
`check:persistence-durable-integration`, `check:lifecycle`, `check:api-routes`,
`check:inline-execution`, `check:investigation-service`, `check:fixtures`,
`tsc --noEmit` and `pnpm build`: all pass.

Migration 0008 up / down / up round-trips cleanly inside the gate.

## Observed, not decided

Withdrawing a version that is **not** the current head moves the head to it, because
the released rule is that the head follows the latest deliberate act. The released
examples only cover withdrawing the current head. Flagged for review rather than
resolved by inventing a different rule.

## Not in 9b

No public resolver, no `NOT_PUBLIC`/`WITHDRAWN` DTOs, no routes, no 410, no cache
configuration, no library or search change, no principal display, no authentication
or authorization, no ATI behaviour.
