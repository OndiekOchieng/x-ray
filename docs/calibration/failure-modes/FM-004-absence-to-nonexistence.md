# FM-004 — Absence promoted to nonexistence

**ID:** FM-004
**Name:** Absence promoted to nonexistence
**Invariant:** [XR-INV-006](../../architecture/validation-and-invariants.md#xr-inv-006--missing-evidence-is-not-negative-evidence)
**Demonstrated by:** [CAL-004](../cases/CAL-004-not-located-is-not-nonexistent.md)

---

## Error shape

A failed search is converted into a finding about the world.

```text
"we did not locate R"        a fact about the search
          ↓                  ← unearned
"R does not exist"           a fact about the world
          ↓
"the thing R would have authorised did not happen"
```

The third step is where the real damage occurs, because it is an allegation
wearing the clothes of a research result.

Recurring instances: no published contract → the contract is irregular; no
minutes → the meeting did not happen; no impact assessment → none was done; no
audit response → the query was ignored; no register entry → the entity is not
registered; no permit on the portal → construction is unpermitted.

## Why models and researchers fall into it

- **Language slides.** "We found no evidence of X" and "there is no X" are one
  clipped phrase apart, and the first compresses into the second in every
  summary.
- **A search feels exhaustive from the inside.** Having tried many queries, the
  absence feels like a property of the record rather than of the method.
- **Nonexistence is the interesting result.** "Could not locate" is a
  non-finding; "no such record exists" is a story, and the incentive gradient
  runs one way.
- **Publication is assumed to be complete.** Modern intuition says public
  records are online. Registries are offline, unindexed, paywalled, badly
  titled, or simply not published.
- **The negative is unfalsifiable in practice**, so it is rarely challenged
  until the subject produces the document.

## Detection signals

- A finding's rationale infers from a failed search to a state of the world.
- A gap exists for record R, and a finding simultaneously asserts something that
  only holds if R does not exist. The graph is contradicting itself.
- Any accessibility value beyond `RETRIEVED`, `PARTIAL`, `NOT_LOCATED`,
  `NOT_RETRIEVED`, `DEAD_LINK` — the union deliberately has no
  `DOES_NOT_EXIST` member, so an attempt to add one is the signal.
- `searchAlreadyAttempted` is empty on a gap whose absence is being treated as
  informative.
- Summary language: "no such", "never", "failed to", "was not done" where the
  evidence supports only "not located".
- The inverse form: an unobtained record treated as *confirming* what others say
  about it.

## Harm if allowed

- A civic accusation with no evidentiary basis, aimed at institutions and
  sometimes at named individuals.
- Instant, total reversal when the record surfaces — the subject produces one
  document and the finding collapses, taking the investigation's credibility
  with it.
- The gap closes by assertion, so nobody requests the record. The absence
  becomes permanent because it was declared resolved.
- It corrupts the action layer: an information request premised on a record not
  existing is incoherent, and the request that would have settled the question
  is never drafted.

## Corrective behavior

1. Keep the states distinct and never collapse them:
   - `NOT_RETRIEVED` — identified or referenced, contents not obtained;
   - `NOT_LOCATED` — reasonable tracing attempted, record not found;
   - neither is `DOES_NOT_EXIST`, which is not representable.
2. Record `searchAlreadyAttempted` on every gap. Without it, "not located" is an
   unfalsifiable shrug; with it, a reader can weigh how informative the absence
   is.
3. Grade the finding `UNRESOLVED` or `INSUFFICIENT_EVIDENCE` and keep the gap
   open.
4. Route the gap to a resolution path. An unfound public record is normally
   `PUBLIC_RECORD_REQUEST` — turning the absence into an action rather than a
   verdict.
5. Accept nonexistence only from **positive evidence**: a custodian record
   stating no such record exists, an audit finding, a register certified
   complete. Note the shape — a record asserting absence, not a failed search.
6. Police the language in every synthesis surface. A gap describes what is
   missing and what would settle it; it never implies wrongdoing.

## Calibration cases demonstrating it

- [CAL-004 — Not located is not nonexistent](../cases/CAL-004-not-located-is-not-nonexistent.md)
- [CAL-006](../cases/CAL-006-unexplained-financial-bridge-remains-unresolved.md) — the unfound variation order must not complete the arithmetic in either direction
- [CAL-005](../cases/CAL-005-scheduled-is-not-occurred.md) — no post-event record is not evidence the event did not occur
