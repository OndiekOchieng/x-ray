# Issue #9, slice 9c — public resolver trust boundary

ADR-0015 as executable code. No routes, status codes, redirects, tombstone copy,
cache configuration, library or search changes, or principal labels. 9d stays locked.

## What shipped

`lib/xray/application/public-resolver.ts` — a public resolver **beside** #8's
internal committed-state resolver. `getInvestigationGraph` is untouched and gains no
`PUBLISHED` branch; a check asserts that against its comment-stripped source.

```text
public address
    ↓
resolve slug ownership
    ↓
resolve publication history
    ├─ no slug / no history / never-published version → NOT_PUBLIC
    ├─ currently withdrawn                            → WITHDRAWN + tombstone metadata
    └─ currently published version N                  → read exact committed N → PUBLISHED
```

Three outcomes, and no internal storage state is exposed through them.

### NOT_PUBLIC is one value, not a family

`{ kind: 'NOT_PUBLIC' }` — frozen, field-free. No message, no id, no version pointer,
no reason code. The four leakage cases produce byte-identical output, which the gate
asserts by comparing serialized shapes rather than by inspecting them one at a time.

### The canonical read is injected

`CommittedVersionReader` is a one-method seam reaching
`InvestigationService.getCommittedVersion` — an exact version, named explicitly. Never
`getInvestigationGraph`, which would re-enter benchmark fallback and latest-version
behaviour that have no business answering a public request.

Injecting it is what makes the ordering *countable* rather than merely readable.

### What a tombstone carries

Slug, exact version, reason, withdrawn-at, the `ERRONEOUS` note when present, and the
event sequence. **No principal** — public display of one is a 9d decision — and no
canonical content, since content is the thing a withdrawal exists to stop presenting.

### Published results keep their authorization

`authorizingExecutionRunId` and `authorizingGraduationIndex`, so 9d can surface the
capability blockers of an eligible `BLOCKED`. The blockers are not copied or
recomputed here: what is disclosed must not drift from the assessment that produced it.

### Outage is not absence

Storage failures propagate. Only genuine absence maps to `NOT_PUBLIC` — the same
lesson as the 8c fixture-shadowing bug, where a catch-all turned an outage into a
confident answer.

## The adversarial ordering proof

The reader is instrumented with a counter and an ordered trace, and the database is
wrapped to mark publication lookups.

**Canonical reads stayed at zero** for all four `NOT_PUBLIC` cases and for the
`COMPELLED`, `PRIVACY_HARM` and `ERRONEOUS` tombstones — and for a committed
unpublished v3 while the alias served v2.

On the `PUBLISHED` path the trace is asserted directly: the first recorded operation
is `authorize`, and exactly one `canonical-read` follows it. A resolver that loaded
the graph and filtered afterwards would still produce a safe-looking DTO; only the
count and the order distinguish the two.

## Preserved failed verification

**`first-attempt.txt` — 21/23.** Both failures were over-broad assertions of mine, and
the second is worth keeping.

**16** matched the word "publication" in `lib/xray/investigations.ts` — in a *comment*
left by 8c explaining the boundary: *"Which investigations are public is a publication
decision, and publication is #9."* The check now strips comments, because matching a
file's own explanation of a rule is self-defeating.

**18** reported `PUBLISHED leaked a principal`. It had not. The word appears in the
**evidence graph**:

```
"The principal/main road corridor is approximately 63 km in length."
"Office of the Principal Secretary"
```

That is civic content about a road and a government office. It is also precisely the
collision that made `Principal` the name for the administrative identity rather than
`Actor` — the domain vocabulary was already occupied, in both directions.

The check now inspects the DTO's **own fields** with canonical content set aside,
asserts no field is principal-named, and additionally asserts the resolver source
never reads `principalId`. Attribution is absent structurally, not textually.

## Checks

23 scenarios in `pnpm check:public-resolver` (`final-gate.txt`), covering every
released proof: the four `NOT_PUBLIC` cases with zero reads and identical shape; the
alias resolving the selected head while a newer v3 is committed; exact-version reads;
v3 invisible while v2 serves; withdrawn head and withdrawn historical version; all
three withdrawal reasons carrying no content; deliberate rollback to v1;
republication after withdrawal; outage propagation; #8 untouched; no fixture answering
a public lookup; no principal in any output; `BLOCKED` linkage retained; and ordering
on both `PUBLISHED` paths.

## Regression

`check:publication`, `check:persistence-versioning`, `check:persistence-graduation`,
`check:persistence-workspace`, `check:persistence-audit`,
`check:persistence-durable-integration`, `check:lifecycle`, `check:api-routes`,
`check:inline-execution`, `check:investigation-service`, `check:fixtures`,
`tsc --noEmit` and `pnpm build`: all pass.

## Refactor note

The 9b and 9c gates now share `publication-check-support.ts` — lineage seeding,
migrations and version linkage — so the two cannot drift apart in how they construct
graduation linkage. `check:publication` was re-run after the extraction and remains
26/26.

## Not in 9c

No Next.js routes, no redirect or status-code behaviour, no tombstone UI or copy, no
Cache Components configuration, no library or search changes, no public principal
labels.
