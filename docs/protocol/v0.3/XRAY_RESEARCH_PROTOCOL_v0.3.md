# X-Ray Research Protocol

**Version:** 0.3.0  
**Status:** Experimental  
**Purpose:** Model-agnostic protocol for reconstructing the evidence beneath civic claims while preserving source position, proposition identity, provenance, and reversibility  
**Benchmark lineage:** XRAY-KE-001; XRAY-US-001; manual v0.2 cross-domain runs  
**Designed for:** Human researchers, GPT, Claude, and other research-capable systems

---

## 1. Purpose

X-Ray does not begin by asking whether a source is true or false.

It asks:

> **What exactly is being claimed, what is each claim standing on, who produced that evidence, from what position, how could they know, how did the information travel, and where does interpretation begin?**

The canonical research object is the evidence structure beneath a civic claim, not a generated verdict.

### Constitutional principle

> **The system does not decide what the citizen should believe. It reconstructs what a civic claim is standing on.**

The reader must remain free to inspect the evidence, challenge the reconstruction, see what is unresolved, and reach their own conclusion.

---

# 2. Epistemic spine

## 2.1 The surface source is the beginning, not the authority

A surface article, speech, post, press release, report, or essay establishes that a claim was made.

It does not corroborate its own underlying proposition.

---

## 2.2 Source position precedes interpretation

Before using a record as evidence, ask:

1. **Who produced this?**
2. **What was the producer's relationship to the subject, event, or institution?**
3. **What power, access, dependency, or vulnerability shaped that relationship?**
4. **Why was the record produced?**
5. **How could the producer know what the record claims?**
6. **What can this record directly establish?**
7. **What does it only characterize, attribute, infer, or allege?**

> **Source position changes evidentiary reach, not truth by fiat.**

A powerful source is not automatically unreliable. A marginalized source is not automatically reliable. Position explains access, limitations, incentives, and the propositions a record can directly establish.

---

## 2.3 A primary source is primary only for specific propositions

"Primary source" is not a universal trust label.

Examples:

- a ministry release is primary evidence for what the ministry formally stated;
- a company annual report is primary evidence for its reported financial figures, subject to the report's accounting/audit context;
- a colonial intelligence file is primary evidence for what colonial authorities recorded, believed, classified, ordered, or did;
- a witness statement is primary evidence for the witness's account and may also be direct evidence of events within the witness's actual field of observation.

A source's characterization of another actor or of underlying reality requires separate evaluation.

---

## 2.4 Keep Source Position, Knowledge Basis, Proposition Provenance, and Source Dependency distinct

These answer different questions.

### Source Position
Where was the producer standing relative to the subject or event?

### Knowledge Basis
How could the producer know?

Examples include direct observation, self-report, participant account, administrative record, measurement, expert interpretation, attributed briefing, or inference.

### Proposition Provenance
Where did the proposition-bearing information originate?

### Source Dependency
Which documents, publications, or records derive from which others?

Do not collapse these into one generic "source quality" field.

---

## 2.5 Decompose before researching

If one part of a statement could be false while another remains true, split them.

Claims must remain independently testable.

---

## 2.6 Separate Observation, Interpretation, and Meaning

### O — Observation
A checkable proposition that evidence could establish or contradict.

### I — Interpretation
A reading or explanation of observations.

### M — Meaning
A broader judgment, implication, thesis, or worldview-level conclusion.

Evidence appropriate to one layer must not silently establish another.

---

## 2.7 Proposition dimensions are part of claim identity

A proposition changes when a material dimension changes.

Preserve, where relevant:

- actor;
- subject;
- scope;
- population;
- measure;
- denominator;
- aggregation level;
- category;
- definition;
- geography;
- time;
- tense;
- modality;
- causal role;
- intent;
- outcome.

Examples:

`official language` != `national language`

`total remuneration` != `base salary`

`operational recovery` != `institutional recovery`

`reported by four people` != `four independent evidence origins`

`occurred under X` != `caused by X`

Changing one of these dimensions creates a new proposition.

---

## 2.8 Go to the record underneath the reporting

Trace load-bearing claims toward their strongest available origins:

- legislation;
- contracts;
- budgets;
- procurement records;
- parliamentary records;
- court records;
- audit reports;
- datasets;
- scientific/technical reports;
- administrative records;
- direct testimony;
- contemporaneous records;
- other claim-appropriate evidence.

Secondary reporting remains useful for discovery, context, contradiction, and independent investigation.

---

## 2.9 Provenance is part of the evidence

For every material proposition, determine where the evidence actually originated.

Search ranking is not an evidence hierarchy.

Obscurity is not evidence of authenticity.

Institutional status is not self-proving truth.

---

## 2.10 Reported plurality does not establish independent origins

"Four officials said X" establishes the publication's reported source plurality.

It does not establish four independent evidence origins.

Record separately:

- reported human-source count;
- identifiable origins;
- confirmed independent origins;
- unresolved origin relationships.

Unknown remains unknown.

---

## 2.11 Institutional authority establishes statements at actual strength

An official record may strongly establish what an institution formally stated, ordered, measured, recorded, adopted, or did.

It does not automatically establish the institution's characterization of underlying reality.

Example:

> "Colonial authorities classified Kenyatta as a Mau Mau leader"

may be directly established by a colonial file.

That record alone does not establish:

> "Kenyatta operationally led Mau Mau."

The second proposition requires its own evidence.

---

## 2.12 Record-producing power affects the meaning of absence

Failure to locate a record never becomes proof of non-existence.

Additionally, the evidentiary meaning of absence depends on who had the power and incentive to produce, preserve, classify, destroy, exclude, or archive records.

Examples:

- absence of an African voice in a colonial archive does not establish absence of that view;
- absence of a police record does not independently establish that alleged police abuse did not occur;
- absence of a company record may mean non-occurrence, non-production, non-disclosure, loss, or restricted access.

Do not choose among these explanations without evidence.

> **Archive abundance is not the same thing as historical completeness.**

---

## 2.13 Repetition is not corroboration

Multiple publications deriving from one origin do not create multiple independent confirmations.

Trace both document lineage and proposition origins.

---

## 2.14 Represent every source at its actual strength

Do not sharpen weak evidence or soften strong evidence.

Examples:

`allocated` != `spent`

`announced` != `occurred`

`scheduled` != `completed`

`detected` != `caused`

`cause supported` != `source established`

`source established` != `exposure pathway established`

`influence` != `control`

`constraint` != `authorship`

`continuity` != `coordination`

---

## 2.15 Evidence does not inherit across causal links

Each material causal link requires its own evidence state.

A strongly established precursor does not transfer certainty forward.

Examples:

`cyanide detected`
!= `cyanide caused every death`
!= `pesticide was the source`
!= `tomatoes were the pathway`
!= `exposure was deliberate`

Likewise:

`company profitable under CEO`
!= `CEO caused profitability`
!= `profitability caused remuneration change`

---

## 2.16 Contribution, primary cause, necessity, and sufficiency are distinct

`X contributes to Y`
!= `X is the primary cause of Y`
!= `Y cannot occur without X`
!= `X is sufficient for Y`

Do not promote one causal strength into another.

---

## 2.17 Influence, coordination, intent, and effect remain separate

### Influence
Who or what materially shaped an information path or decision environment?

### Coordination
Did actors knowingly act together?

### Intent
What outcome were actors trying to produce?

### Effect
What measurable result occurred?

Evidence for one does not automatically establish another.

> **Common outcome does not establish common coordination.**

Several actors or institutions producing similar effects does not establish a shared decision-maker.

---

## 2.18 Relationship at T1 does not determine relationship at T2

Actor relationships may change.

A state may treat a person as an adversary at one time and later assess, negotiate with, accommodate, co-opt, ally with, or depend on that same person.

Do not project one relationship across the whole timeline.

Later accommodation does not prove earlier hostility was staged.

Earlier hostility does not prove later hostility.

---

## 2.19 Authentic source does not guarantee authentic interpretation

A genuine document, number, photograph, archive entry, or quote can be attached to the wrong:

- denominator;
- category;
- scope;
- actor;
- time;
- population;
- meaning.

Authenticity of the record and validity of the interpretation are separate questions.

---

## 2.20 Apparent contradiction requires mutual incompatibility

Evidence for A contradicts B only when A and B cannot both be true in the relevant dimensions.

A prison having ordinary infrastructure does not contradict evidence that mass killing occurred there.

A factory operating does not contradict unresolved liabilities.

A government calling a process transparent does not automatically contradict an audit identifying a specific documentation gap; compare the actual propositions.

---

## 2.21 Try to prove the emerging conclusion wrong

For every load-bearing finding:

1. state the current hypothesis;
2. formulate the strongest credible counter-hypothesis;
3. search specifically for evidence supporting it;
4. record the strongest challenge;
5. reassess the finding.

Finding disconfirming evidence is the protocol working.

---

## 2.22 Systems explanations must remain falsifiable

System-level narratives carry a high burden because they can absorb many events into one explanation.

For every material system claim ask:

> **What observable evidence would count against this explanation?**

A theory that interprets every possible outcome as confirmation is not being treated as a reversible research finding.

Distinguish:

- continuity from current control;
- common effect from coordination;
- structural constraint from authorship;
- institutional inheritance from present ownership;
- benefit from intent;
- pattern from mechanism.

---

## 2.23 Missing evidence remains missing

Never convert:

> "We could not find evidence of X"

into:

> "X did not happen."

Record what is missing, why it matters, what would settle it, who may hold it, and what was searched.

---

## 2.24 Counterfactual outcomes require their own evidence

Observed precursors do not establish what would have happened next.

Counterfactual or escalation claims require their own evidence.

---

## 2.25 Trace framing without turning framing into motive

Where material, reconstruct:

`Observation → Interpretation → Meaning`

and:

`origin → publication → repetition → amplification`

Framing, repetition, or amplification may justify further research.

They do not establish coordination, motive, intent, or effect by themselves.

---

## 2.26 Name the mechanism, not the moral

Prefer reconstructing measurable actions, relationships, constraints, records, and gaps over imposing a moral conclusion.

The citizen remains the decision-maker.

---

## 2.27 Citizen-facing projection cannot increase certainty

A receipt, summary, card, visualization, notification, or public projection may simplify presentation.

It may not increase:

- evidentiary strength;
- source independence;
- confidence;
- causal strength;
- intent;
- coordination;
- completeness;
- or certainty.

---

# 3. Research pipeline

Protocol v0.3 preserves the v0.2 stage machine.

Source Position is **not yet declared a new executable stage**. It is an early research obligation captured during INGEST/PLAN/TRACE and refined during PROVENANCE.

Whether it becomes a canonical stage or domain artifact is an architecture decision outside this protocol.

```text
INPUT
  ↓
1. INGEST
  ↓
2. DECOMPOSE
  ↓
3. CLASSIFY
  ↓
4. PLAN
  ↓
5. TRACE
  ↓
6. PROVENANCE
  ↓
7. DISCONFIRM
  ↓
8. RECONCILE
  ↓
9. GRADE
  ↓
10. IDENTIFY GAPS
  ↓
11. VALIDATE
  ↓
12. REVIEW
  ↓
RESEARCH STOP
```

Lifecycle work remains downstream:

`RESEARCH STOP → SYNTHESIZE → ACT / RESOLVE`

---

# 4. Stage 1 — INGEST

## Objective

Preserve the surface record before external research changes the investigator's understanding.

Capture the ordinary source metadata and relevant content.

Additionally perform a **surface source-position pass**:

```text
producer
producer_type
relationship_to_subject_or_event
institutional_role
relevant_power_or_dependency
production_purpose
knowledge_basis
time_scope_of_relationship
direct_establishment_boundary
unknowns
```

These fields are research semantics, not yet a canonical domain schema.

Do not invent hidden motive, bias, or intent.

Use `unknown` where position cannot be established.

---

# 5. Stage 2 — DECOMPOSE

Create atomic claims.

For each material claim, test proposition dimensions explicitly:

```text
actor
subject
scope
population
measure
aggregation
category
geography
time
modality
causal_role
```

Split claims when one dimension can vary independently.

Do not silently merge a source's institutional characterization with the underlying proposition it characterizes.

---

# 6. Stage 3 — CLASSIFY

Retain O / I / M.

Recommended claim types continue to include:

- financial;
- delivery;
- legal;
- timeline;
- attribution;
- funding;
- procurement;
- quantitative;
- geographic;
- causal;
- counterfactual;
- influence;
- coordination;
- intent;
- audience_effect;
- framing;
- political;
- service;
- other.

Record ambiguities and verification priority.

Where material, mark which proposition dimensions are load-bearing.

---

# 7. Stage 4 — PLAN

Before searching for confirming material, state what evidence would establish or challenge each load-bearing claim.

Also plan the source-position questions:

- whose records are likely to dominate the available archive?
- whose perspective may be structurally under-recorded?
- who had direct access?
- who had record-producing power?
- what independent evidence could test an institutional characterization?
- what evidence could distinguish influence from control, coordination, or intent?

Do not compensate for under-recorded perspectives by assuming their account is correct.

The purpose is to identify evidentiary asymmetry, not reverse the burden of proof.

---

# 8. Stage 5 — TRACE

Optimize for evidentiary reach, not source count.

For each material source, capture ordinary source metadata plus:

```text
source_position:
  producer
  relation_to_subject_or_event
  institutional_role
  relevant_power_or_dependency
  production_purpose
  time_scope

knowledge_basis:
  direct_observation | self_report | participant_account |
  measurement | administrative_record |
  institutional_characterization | attributed_source |
  expert_interpretation | secondary_synthesis |
  inference | unknown

directly_establishes
does_not_alone_establish
```

The vocabulary is protocol-side and provisional. Architecture #13 decides canonical representation.

Never convert source position into a scalar trust or bias score.

---

# 9. Stage 6 — PROVENANCE

TRACE asks:

> What evidence did we locate, who produced it, and how could they know?

PROVENANCE asks:

> Where did the proposition-bearing information originate, how did it travel, and how independent are the origins?

Retain v0.2 relationships:

```text
REPRODUCES
QUOTES
ATTRIBUTES_TO
DERIVED_FROM
```

and origin forms:

```text
SOURCE(source_id)
UNIDENTIFIED(description)
```

Keep source position orthogonal to proposition provenance.

Where relevant reconstruct:

`producer position → information origin → publication → repetition/amplification`

Do not infer coordination from a transmission pattern alone.

---

# 10. Stage 7 — DISCONFIRM

Attack both the claim and the investigator's source interpretation.

For each load-bearing finding ask:

- What if the source's institutional characterization is wrong?
- What if the apparently authoritative record is primary only for a narrower proposition?
- What if the archive is incomplete because of record-producing power?
- What if a later relationship differs from the earlier relationship?
- What if the causal chain breaks at an intermediate link?
- What evidence would falsify the broader system explanation?

Record the strongest credible counter-hypothesis and evidence.

---

# 11. Stage 8 — RECONCILE

Before contradiction, test:

- same actor?
- same measure?
- same denominator?
- same scope?
- same category?
- same time?
- same modality?
- same causal role?
- same aggregation level?

Also test whether apparently conflicting records simply come from different source positions.

Do not resolve disagreement by privileging one source type automatically.

---

# 12. Stage 9 — GRADE

Allowed finding statuses remain:

- ESTABLISHED
- SUPPORTED
- PARTIALLY_SUPPORTED
- CONTESTED
- CONTRADICTED
- UNRESOLVED
- INSUFFICIENT_EVIDENCE

Confidence remains:

- HIGH
- MEDIUM
- LOW

Grade the exact proposition, not a rhetorically adjacent one.

A finding about what an institution stated must not silently become a finding that the institution's characterization was true.

---

# 13. Stage 10 — IDENTIFY GAPS

Preserve gaps.

Source-position-aware gaps may include:

- missing independent confirmation of an institutional characterization;
- missing perspective from an actor structurally absent from the surviving archive;
- unknown knowledge basis;
- unknown record-production process;
- missing intermediate causal link;
- unresolved change in actor relationship over time;
- missing evidence that would falsify a system-level explanation.

Do not interpret archive silence as concealment without evidence.

---

# 14. Stage 11 — VALIDATE

Manual deterministic checks include the v0.2 rules plus:

- surface source does not corroborate itself;
- claim references remain atomic;
- O/I/M layers are preserved;
- proposition dimensions are not silently changed;
- dependent repetition is not counted as independent corroboration;
- missing evidence is not converted to negative evidence;
- synthesis/projection does not increase certainty.

Potential source-position invariants remain architecture candidates until #13 decides which are deterministic enough for software enforcement.

---

# 15. Stage 12 — REVIEW

Reviewer should explicitly inspect for:

- source-position collapse;
- institutional characterization promoted to underlying fact;
- primary-source label used as a universal authority claim;
- record absence interpreted without considering record-producing power;
- relationship at T1 projected across T2;
- proposition-dimension drift;
- causal-link inheritance;
- contribution promoted to necessity or sufficiency;
- influence promoted to coordination/intent/effect;
- common outcome promoted to common coordination;
- authentic record attached to the wrong scope/category/denominator;
- aggregate/component inheritance;
- system claim that cannot state what would falsify it;
- framing or projection that increases certainty.

Revision should route to the earliest research stage that can correct the problem.

---

# 16. Research stop

A manual v0.3 run may stop when:

- material claims are atomic and classified;
- source position is recorded for load-bearing evidence where knowable;
- reasonable originating/proposition provenance tracing has been attempted;
- independent origins are separated from repetition;
- load-bearing findings survived a disconfirmation pass;
- causal chains are graded link by link;
- material discrepancies are reconciled at matching proposition dimensions;
- gaps remain visible;
- system-level findings state what could falsify them;
- validation/review failures remain visible.

Do not synthesize away unresolved source-position or causal uncertainty.

---

# 17. Required research artifacts

A complete manual run should produce:

1. Source Record
2. Claim Ledger
3. Evidence Ledger
4. Source Position / Knowledge-Basis Ledger
5. Provenance / Information-Flow Ledger
6. Discrepancy Ledger
7. Disconfirmation Log
8. Gap Ledger
9. Claim Grades
10. Review Notes
11. Graduation Self-Audit

The Source Position ledger should answer, where material:

```text
source_id
producer
relation_to_subject_or_event
institutional_role
power_or_dependency
production_purpose
knowledge_basis
time_scope
directly_establishes
does_not_alone_establish
unknowns
```

---

# 18. Protocol calibration lessons carried into v0.3

v0.3 was justified by recurrence across unrelated manual runs.

The recurring lessons include:

- **Kenyatta/Maralal:** institutional characterization is not underlying fact; actor relationships change over time.
- **Burkina Faso language reform:** preserving the event does not excuse changing the legal category.
- **Muhoroni Sugar:** recovery in one dimension does not establish recovery in another.
- **Amboseli elephant deaths:** evidence of one causal link does not inherit forward.
- **Holocaust-denial post:** authentic records can be attached to false scope/interpretation; coexistence is not contradiction.
- **Kenya Power remuneration:** aggregate change does not imply equal component change; annual receipt does not establish recurring run-rate.
- **Afrika Wakens essays:** contribution does not establish necessity; continuity does not establish control; common outcome does not establish coordination; system narratives must remain falsifiable.

These are protocol lessons, not automatic verdicts in future investigations.

---

# 19. Protocol evolution rule

Do not change the protocol because one investigation produced an inconvenient result.

Change it when a recurring failure exposes a missing research rule.

For each future protocol change record:

```text
version
date
benchmark_or_run
failure_observed
protocol_change
reason
```

> **Try to break the protocol. Keep what survives.**

---

## Current status

**X-Ray Research Protocol v0.3.0**

Protocol v0.3 is the current manual-investigation contract.

Protocol v0.1 and v0.2 remain frozen historical evidence.

Architecture implications are intentionally deferred to #13.
