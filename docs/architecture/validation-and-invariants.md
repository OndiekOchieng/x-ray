# Validation and Invariants

**Source:** `X-Ray System Architecture v0.1` §4, §18
**Architecture version:** 0.1
**Status:** Proposed

These rules are enforced by the engine **independently of synthesis wording**.
They are the point at which the research protocol becomes software.

See [ADR-0005](../adr/0005-epistemic-invariants-outside-prompts.md).

**Invariants:**
[001](#xr-inv-001--surface-source-isolation) ·
[002](#xr-inv-002--atomic-claim-requirement) ·
[003](#xr-inv-003--observation--interpretation--meaning-separation) ·
[004](#xr-inv-004--source-independence) ·
[005](#xr-inv-005--same-measure-contradiction-rule) ·
[006](#xr-inv-006--missing-evidence-is-not-negative-evidence) ·
[007](#xr-inv-007--findings-must-be-reversible) ·
[008](#xr-inv-008--gap-preservation) ·
[009](#xr-inv-009--action-eligibility) ·
[010](#xr-inv-010--historical-preservation) ·
[011](#xr-inv-011--synthesis-cannot-mutate-evidence) ·
[012](#xr-inv-012--discovered-claims-are-separate)

---

# System Invariants

These invariants are enforced by the engine independently of synthesis wording.

## XR-INV-001 — Surface Source Isolation

A surface source establishes that a claim was made.

It MUST NOT, merely by asserting that claim, establish the underlying proposition as true.

---

## XR-INV-002 — Atomic Claim Requirement

A material finding MUST reference an independently testable claim.

Compound surface statements MUST be decomposed before grading.

---

## XR-INV-003 — Observation / Interpretation / Meaning Separation

Claims MUST carry their epistemic layer:

```text
OBSERVATION
INTERPRETATION
MEANING
```

Evidence appropriate to one layer MUST NOT silently establish another.

---

## XR-INV-004 — Source Independence

Multiple publications derived from the same originating record MUST NOT be treated as multiple independent confirmations.

Example:

```text
                    Ministry status dataset
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        People Daily   Radio47     The Star

independent observations = 1
publications = 3
```

---

## XR-INV-005 — Same-Measure Contradiction Rule

A finding MUST NOT be graded `CONTRADICTED` solely from evidence measuring a materially different quantity, scope, denominator, definition, or time period.

Before contradiction, the engine MUST evaluate measurement compatibility.

Example:

```text
Claim:
"Most road sections are tarmacked."

Evidence:
"Project is 28% complete."

measurementCompatible = false
```

The latter may challenge or contextualize the former.

It does not logically contradict it without additional evidence.

This invariant is introduced because of the Claude/GPT XRAY-KE-001 disagreement.

---

## XR-INV-006 — Missing Evidence Is Not Negative Evidence

Failure to locate a record MUST NOT be converted into evidence that the record or event does not exist.

The graph records:

```text
NOT_LOCATED
```

not:

```text
DOES_NOT_EXIST
```

---

## XR-INV-007 — Findings Must Be Reversible

Every material finding MUST record:

- supporting evidence;
- challenging evidence;
- unresolved gaps;
- rationale;
- evidence that would change the finding.

A conclusion that cannot describe how it could be overturned is invalid.

> ### Amendment — bounded staged debt during successor re-evaluation
>
> **Recorded:** 2026-09-21 · #10 slice 10d
>
> The validator is unchanged. Both `STAGED` and `FULL` still report
> `XR-INV-007/FINDING_EVIDENCE_LIST_MISMATCH` as an `ERROR`, and the `VALIDATE`
> gate's FULL pass sees the final state with no exemption at all.
>
> What changed is a **pipeline transition rule**. A successor candidate is
> seeded with the predecessor's already-graded findings. The moment a
> pre-`GRADE` stage adds evidence bearing on one of those claims, the inherited
> finding stops mirroring `Evidence.relationship` — and no stage before `GRADE`
> can repair it, because `STAGE_OUTPUTS` gives `findings` to `GRADE` and `GAPS`
> only. Before this amendment, adding evidence to an already-graded
> investigation was unrepresentable: `TRACE` failed on the mismatch it had just
> created, for every re-evaluation trigger and not only ATI.
>
> So `runPipeline` permits that one mismatch as explicit debt, bounded on every
> side:
>
> | Bound | |
> | --- | --- |
> | successor re-evaluation only | a first run has no graded findings to owe against |
> | before `GRADE` only | `GRADE` itself gets no exemption |
> | `GRADE` scheduled and still to run | nothing to repair it means it is a defect, not debt |
> | this one code only | every other violation still fails its stage |
>
> The debt therefore exists from the first pre-`GRADE` evidence change until
> `GRADE` takes its turn, and not one boundary longer. If `GRADE` does not
> repair the finding, `GRADE` fails.
>
> This is the second such exemption, and it is deliberately the same shape as
> the first: 6a already permits `GRADE` to leave
> `XR-INV-008/UNRESOLVED_FINDING_WITHOUT_GAP` standing while `GAPS` is still
> pending. Both say the same thing — a stage may not be failed for debt the
> stage that will pay it has not yet had a turn to pay.
>
> Both live in one predicate, `isStagedDebt` in `pipeline/run.ts`.
>
> **The run mode is durable.** `successorReevaluation` is reconstructed from the
> run's own `execution_run_causes` row, by one helper that every path starting a
> pipeline calls — start and resume alike. It is never inferred from graph
> shape: a candidate carrying graded findings, or a `currentVersion` above 1,
> says nothing about what the run was started to do.
>
> This is not a detail. A re-evaluation interrupted after `TRACE` checkpoints a
> state that is legal *only* under these rules. If the resumed pipeline did not
> know what kind of run it was, it would fail at `PROVENANCE` on debt that was
> perfectly legal when it was written — a checkpoint that cannot be restored.

---

## XR-INV-008 — Gap Preservation

A material unresolved claim MUST expose the evidence gap preventing resolution.

The synthesis layer MUST NOT hide that gap.

---

## XR-INV-009 — Action Eligibility

A Gap MUST NOT automatically generate an ATI request.

It first receives a `resolutionPath`.

Only:

```text
PUBLIC_RECORD_REQUEST
```

makes the gap eligible for ATI generation.

> ### Amendment — the invariant is enforced in two places
>
> **Recorded:** 2026-09-21 · #10 slice 10b
>
> XR-INV-009 has two halves and they are no longer enforced by the same layer.
>
> **The gap half** — `atiEligible` holds exactly when `resolutionPath` is
> `PUBLIC_RECORD_REQUEST` — stays in graph validation
> (`validation/epistemic.ts`, `XR-INV-009/ATI_ELIGIBILITY_MISMATCH`).
> Eligibility is a property of a gap, and gaps are version-scoped research
> state. The domain also binds the two fields in a discriminated union, so a
> mismatched gap does not typecheck.
>
> **The request half** — a request may only target an eligible gap, and may
> only ask for records that gap names — moved to the ATI action command
> boundary (`application/ati-service.ts`), where it is checked against the
> exact frozen origin snapshot `(investigationId, originVersion)`:
>
> ```text
> XR-INV-009/ATI_REQUEST_ON_INELIGIBLE_GAP
> XR-INV-009/ATI_REQUESTED_RECORD_NOT_IN_GAP
> ```
>
> The codes are deliberately unchanged, so the invariant reads as relocated
> rather than lapsed.
>
> It moved because the graph stopped carrying requests at all (#10 C1/C2/C7,
> ADR-0017). A request is an action taken *about* a frozen version and its own
> state keeps changing after that version is frozen, so it was never
> version-scoped research state — and a validator over a collection nothing
> populates enforces nothing.
>
> Membership is **exact string membership** in `Gap.resolvingEvidence`. No
> normalization and no semantic matching: a reworded record name is a record
> the gap ledger has not established.
>
> Validation is anchored, not current. A request anchored to v2 is validated
> against v2 even after v3 exists, so a later version cannot retroactively
> enlarge what an older request was allowed to ask for. Asking for a record v3
> introduced requires a new request anchored to v3.

---

## XR-INV-010 — Historical Preservation

New evidence MUST NOT destroy previous investigation state.

An X-Ray is versioned.

```text
Investigation v1
     │
new receipt
     ▼
Investigation v2
```

The system retains what was known, missing, and concluded at each version.

---

## XR-INV-011 — Synthesis Cannot Mutate Evidence

Translation, simplification, cards, summaries and citizen-facing prose MUST operate downstream of grading.

They MUST NOT alter claims, evidence relationships, grades, gaps, or provenance.

---

## XR-INV-012 — Discovered Claims Are Separate

Benchmark/core claims and claims discovered during tracing MUST occupy different namespaces.

```text
C001  controlled/core claim
C002
...

DC001 discovered claim
DC002
...
```

Research discovery MUST NOT overwrite or occupy reserved benchmark claim identifiers.

---

# Validation Layer

LLM output does not directly enter canonical state.

```text
MODEL OUTPUT
     │
     ▼
SCHEMA VALIDATION
     │
     ▼
INVARIANT VALIDATION
     │
     ▼
GRAPH VALIDATION
     │
     ▼
ACCEPT / REJECT / REPAIR
```

Three classes of validation exist.

## Structural

Does output conform to schema?

## Referential

Do referenced claim/source/evidence IDs exist?

## Epistemic

Does the proposed graph violate an invariant?

Example:

```text
Finding:
CONTRADICTED

Claim measurement:
surfaced_length / mainline

Contradicting evidence:
physical_project_completion / total contractual work

→ XR-INV-005 violation
→ reject grade
```

This is where protocol becomes software.

---

# Architecture v0.1 clarifications

Recorded 2026-09-15 from scaffold reconciliation. These are **clarifications
of v0.1**, not Protocol v0.2 and not new decisions.

## Responsible sharing is a synthesis constraint

An unresolved gap **MUST NOT** be transformed, by any synthesis or sharing
surface, into an implication of wrongdoing.

A Gap states what is missing and what would settle it. It does not state that
anyone concealed, misused, or misreported anything. Share cards, summaries,
social previews and exported text are bound by this as strictly as the
investigation page is.

This falls within the scope of
[XR-INV-011](#xr-inv-011--synthesis-cannot-mutate-evidence): converting a
missing record into an allegation is a mutation of what the evidence
establishes, performed downstream of grading. It is stated separately here
because XR-INV-011 as written addresses mutation of *stored* artifacts, and
this failure mode mutates *meaning* without touching storage.

> Whether this becomes its own numbered invariant is a Protocol v0.2 /
> Architecture v0.2 decision. It is binding on v0 synthesis regardless.

Enforcement surface: [publication-and-cache.md](./publication-and-cache.md#responsible-sharing).

## Source accessibility: `NOT_LOCATED` vs `NOT_RETRIEVED`

Ratified 2026-09-15. `Source.accessibility` carries five values.
`NOT_RETRIEVED` means a record was identified or referenced but its contents
could not be obtained; `NOT_LOCATED` means reasonable tracing was attempted
and the record was not found.

**Neither means the record does not exist.** `DOES_NOT_EXIST` is not a member
of the union and MUST NOT be introduced — see
[domain-model.md](./domain-model.md#source). This is the structural form of
[XR-INV-006](#xr-inv-006--missing-evidence-is-not-negative-evidence).

## Independence is evaluated at the proposition level

Ratified 2026-09-16, clarifying
[XR-INV-004](#xr-inv-004--source-independence) without renumbering it.

Source-level provenance (`SourceDependency`) is useful and stays canonical, but
it is **insufficient for claim-level corroboration when a source is
multi-origin**. A publication carrying propositions from two originating
records depends on both as a document; a claim resting on only one of them must
not inherit the other.

So:

```text
source count  ≠  publication count  ≠  independent evidence-origin count
```

Claim-level independence is therefore computed from `EvidenceProvenance` —
proposition to origin — not from document lineage. See
[domain-model.md](./domain-model.md#evidence) and
[CAL-003](../calibration/cases/CAL-003-repetition-is-not-corroboration.md).

Two corollaries, both about not inventing independence:

- **Absent provenance is not independence.** Evidence with no provenance record
  is independent only if its own source is `ORIGINATING`. Otherwise its
  independence is unresolved, and unresolved is not counted.
- **`UNIDENTIFIED` is not independence.** A proposition known to be derivative
  from a record nobody identified is not an independent observation. Where any
  origin is unresolved or unidentified, no precise independence count is
  reported at all — a partially-resolved number would be falsely precise.

## Finding evidence traceability is total

Ratified 2026-09-16. Evidence reaches a Finding through three lists, mapped
from the canonical `Evidence.relationship`:

```text
SUPPORTS       → supportingEvidenceIds
CHALLENGES     → challengingEvidenceIds
CONTRADICTS    → challengingEvidenceIds
CONTEXTUALIZES → contextualEvidenceIds
```

Every Evidence record bearing on the claim appears in exactly one list; no list
contains an id whose relationship maps elsewhere. There is no
`contradictingEvidenceIds` — the canonical distinction stays on the Evidence.

This makes [XR-INV-007](#xr-inv-007--findings-must-be-reversible) checkable
rather than aspirational: a finding whose rationale rests on contextualizing
evidence can now name it. See
[domain-model.md](./domain-model.md#finding).

## Evidence carries its own temporal scope

Ratified 2026-09-16. `Evidence.timeScope` records when an observation or
measurement is true of. `Source.publishedAt` records when its source was
published. These routinely differ, and conflating them makes a stale
measurement indistinguishable from a current one.

Temporal scope MUST NOT be encoded inside `Measurement.definition`, which is
reserved for measurement-definition semantics. Where a record gives no
measurement date, that is stated rather than supplied. See
[domain-model.md](./domain-model.md#evidence).

## GapStatus does not gain `WAITING`

Ratified 2026-09-16, closing a question left open by scaffold reconciliation.
The v0 UI scaffold carried a `WAITING` gap status. It is **not** adopted.

`GapStatus` and `ResolutionPath` answer different questions — *is this gap
closed* and *how would it close*. A gap awaiting a record that does not yet
exist is:

```ts
status: "OPEN"
resolutionPath: "WAIT_FOR_RECORD"
```

Adding `WAITING` would encode the resolution path a second time in the status,
and the two could then disagree.

## `Claim.type` remains single-valued

Ratified 2026-09-16. Architecture v0.1 keeps one `ClaimType` per claim.

Both benchmark runs classified the road-length claim as
"quantitative/geographic", so the limitation is real: a single axis cannot
express subject matter and form at once. A multi-axis claim taxonomy is
**deferred**, not rejected — it would change decomposition and classification
contracts that are not yet executable. Until then the testable assertion
governs the type, and secondary aspects are carried in `entities`.

## Custody basis must be explicit

`Gap.likelyHolder.basis: CONFIRMED | INFERRED` — see
[domain-model.md](./domain-model.md#gap). Applies
[XR-INV-006](#xr-inv-006--missing-evidence-is-not-negative-evidence) to the
action layer.

## Finding confidence is ordinal

`HIGH | MEDIUM | LOW`. Numeric pseudo-probability MUST NOT be introduced —
see [domain-model.md](./domain-model.md#finding).

## Draft is not submitted

`DRAFT` / `EXPORTED` MUST remain visibly distinct from `SUBMITTED` — see
[domain-model.md](./domain-model.md#atirequest).

---

## Where invariants end and judgment begins

These rules say what the graph may never assert. They do not say which of two
permitted answers is right — whether a particular measurement is compatible,
whether a particular reconciliation is reasonable.

That judgment is recorded in the [calibration corpus](../calibration/README.md):
six worked cases at the boundaries these invariants create, and six recurring
failure modes. XR-INV-005 exists *because* two benchmark runs judged one such
boundary differently; [CAL-001](../calibration/cases/CAL-001-different-measurement-is-not-contradiction.md)
is the worked example of applying it.

Deterministic validation rejects graphs that cannot be right. A calibrated
adversarial review of whether a graph *is* right is future work — see
[calibration/README.md](../calibration/README.md#where-calibration-is-headed).
No reviewer is implemented.

---

## Related

- [Calibration corpus](../calibration/README.md) — judgment at the boundaries these rules create
- [Domain model](./domain-model.md) — the artifacts these rules constrain
- [Evidence graph](./evidence-graph.md) — XR-INV-004 and XR-INV-005 in context
- [Acceptance fixtures](../engineering/acceptance-fixtures.md) — how these are regression-tested
