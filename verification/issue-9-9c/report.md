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

25 scenarios in `pnpm check:public-resolver` (`final-gate.txt`), covering every
released proof: the four `NOT_PUBLIC` cases with zero reads and identical shape; the
alias resolving the selected head while a newer v3 is committed; exact-version reads;
v3 invisible while v2 serves; withdrawn head and withdrawn historical version; all
three withdrawal reasons carrying no content; deliberate rollback to v1;
republication after withdrawal; outage propagation; #8 untouched; no fixture answering
a public lookup; no principal in any output; `BLOCKED` linkage retained; and ordering
on both `PUBLISHED` paths.

## Remediation — the draft probe was not probing a draft

Review found scenario 2 weak, and it was. It called:

```ts
resolver.resolveAlias('any-plausible-slug-abcdef0123')
```

That string has no relationship to the `DRAFT` lineage the gate had just committed, so
cases 1 and 2 proved the same thing twice — *an unknown slug returns NOT_PUBLIC* —
while the released requirement is stronger: **a committed draft whose future public
address is deterministically knowable must stay unobservable until that address is
allocated.**

That requirement exists because 9b deliberately made the address computable before
publication. `deterministicSlug(investigationId, title)` is a pure function of things
an adversary may know, so the address is exactly what someone would probe. Computing
it is not the leak; answering it would be.

Scenario 2 now computes the real would-be slug from `DRAFT`'s own investigation id and
its committed surface title, and asserts:

- byte-identical `NOT_PUBLIC` for both the alias and the exact-version form;
- zero canonical reads;
- `resolveSlug` still finds no owner for that address;
- `readSlug(DRAFT)` is still absent;
- the `investigation_slugs` row count is unchanged — **probing allocates nothing.**

A complement was added alongside it: publishing `DRAFT` v2 mints *that exact
predicted slug*, and the same address then resolves `PUBLISHED`. Without it, the
`NOT_PUBLIC` could have been a statement about the slug being wrong rather than about
publication not having happened.

**No runtime change was required.** That was the review's expectation and it held, but
it was verified rather than assumed — the strengthened scenario was written and run
against the existing resolver unchanged.

The original `first-attempt.txt` evidence is untouched; this is an additional
verification, not a rewrite.

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
