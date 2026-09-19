# X-Ray Research Run

**Protocol target:** v0.3

## Inputs

**SOURCE_URL**

`{{SOURCE_URL}}`

**PROTOCOL_DOCUMENT**

`{{XRAY_RESEARCH_PROTOCOL}}`

**FOCUS — optional**

`{{FOCUS}}`

---

## Your task

Read the supplied X-Ray Research Protocol in full.

Investigate the material at `SOURCE_URL` by executing research stages 1–10 followed by VALIDATE and REVIEW.

Do not perform SYNTHESIZE or ACT / RESOLVE.

The objective is evidence reconstruction, not verdict production.

The surface source establishes what was published or claimed. It does not prove its own underlying propositions.

---

## Required research behaviour

Preserve the source faithfully, then:

- decompose load-bearing statements into atomic claims;
- separate Observation, Interpretation, and Meaning;
- preserve claim dimensions: actor, scope, measure, denominator, aggregation, category, geography, time, modality, causal role;
- before relying on a source, ask who produced it, from what position, under what relevant power/dependency relationship, for what purpose, and how they could know;
- distinguish what a record directly establishes from what it merely characterizes, attributes, alleges, or infers;
- treat "primary source" as proposition-specific, not as a universal authority label;
- distinguish Source Position, Knowledge Basis, Proposition Provenance, and Source Dependency;
- do not create bias/trust scores;
- trace claims toward their strongest available originating evidence;
- distinguish reported source plurality from confirmed independent origins;
- preserve unresolved independence as unresolved;
- treat institutional statements as evidence of what the institution stated/did/recorded at their actual strength;
- consider record-producing power when interpreting archive abundance or absence;
- never convert missing evidence into non-existence;
- never infer concealment merely from missing records;
- preserve relationship changes through time instead of projecting T1 into T2;
- test apparent contradictions only between proposition-compatible evidence;
- grade causal chains link by link;
- never let certainty inherit forward from precursor to cause, source, pathway, intent, or effect;
- distinguish contribution, primary cause, necessity, and sufficiency;
- distinguish influence, coordination, intent, and effect;
- do not infer a shared decision-maker merely because several mechanisms produce similar outcomes;
- preserve authentic-source / interpretation separation;
- perform a dedicated disconfirmation pass;
- for every material system-level explanation, state what observable evidence would count against it;
- preserve unresolved gaps;
- identify what evidence would change every load-bearing finding;
- ensure citizen-facing compression, if discussed at all, does not increase certainty.

Do not defend or attack a political actor, institution, publication, or worldview.

Do not choose a political conclusion for the reader.

---

## Source-position discipline

For each load-bearing source, record where knowable:

```text
producer
relation_to_subject_or_event
institutional_role
relevant_power_or_dependency
production_purpose
knowledge_basis
time_scope
directly_establishes
does_not_alone_establish
unknowns
```

Use `unknown` rather than inventing motive or hidden relationships.

Examples of knowledge basis may include:

- direct observation;
- self report;
- participant account;
- measurement;
- administrative record;
- institutional characterization;
- attributed source;
- expert interpretation;
- secondary synthesis;
- inference;
- unknown.

This vocabulary is protocol-side and provisional. Do not treat it as a canonical schema.

---

## Stop condition

Stop after stages 1–10 + VALIDATE + REVIEW when:

1. material claims have been decomposed;
2. source position has been assessed for load-bearing evidence where knowable;
3. proposition provenance and source dependencies have been traced reasonably;
4. preliminary findings have undergone disconfirmation;
5. causal links have separate evidence states;
6. discrepancies have been reconciled at matching proposition dimensions;
7. system-level explanations state what could falsify them;
8. unresolved evidence gaps remain explicit;
9. validator/reviewer failures remain visible.

If evidence remains unavailable, state exactly what remains unresolved.

---

# Required output

## 00 — RUN METADATA

- protocol version;
- source URL;
- focus;
- research date/time;
- researcher/model;
- limitations.

## 01 — SOURCE RECORD

Preserve the surface source and its initial source-position context.

## 02 — CLAIM LEDGER

For every material atomic claim include:

- claim ID;
- exact proposition;
- O / I / M;
- claim type;
- relevant proposition dimensions;
- ambiguities;
- verification priority.

## 03 — EVIDENCE LEDGER

For every material source include:

- source ID;
- title;
- publisher/institution;
- date;
- URL;
- source type;
- primary/secondary only as a descriptive relationship;
- originating/repeating status;
- claims supported/challenged/contextualized;
- relevant evidence;
- evidence strength.

## 04 — SOURCE POSITION / KNOWLEDGE-BASIS LEDGER

For every load-bearing source include:

- producer;
- relationship to subject/event;
- institutional role;
- relevant power/dependency;
- production purpose;
- knowledge basis;
- temporal scope of that relationship;
- what the source directly establishes;
- what it does not alone establish;
- unknowns.

Do not assign bias scores.

## 05 — PROVENANCE / INFORMATION-FLOW LEDGER

Include:

- proposition/evidence origin;
- REPRODUCES / QUOTES / ATTRIBUTES_TO / DERIVED_FROM relationship;
- reported source plurality;
- confirmed independent origins where knowable;
- unresolved independence;
- source dependency;
- origin → publication → repetition/amplification path;
- material framing transitions.

## 06 — DISCREPANCY LEDGER

Before contradiction, compare actor, scope, measure, denominator, aggregation, category, time, modality, and causal role.

## 07 — DISCONFIRMATION LOG

For every load-bearing finding state:

- preliminary hypothesis;
- strongest credible counter-hypothesis;
- research used to challenge it;
- strongest contrary evidence;
- effect on finding;
- what evidence would change the finding.

For system-level claims also state:

> **What observable evidence would falsify this explanation?**

## 08 — GAP LEDGER

Record:

- what is missing;
- why it matters;
- what would resolve it;
- likely holder where knowable;
- searches attempted;
- effect on finding;
- whether record-producing power affects interpretation of the gap.

## 09 — CLAIM GRADES

Use only:

- ESTABLISHED
- SUPPORTED
- PARTIALLY_SUPPORTED
- CONTESTED
- CONTRADICTED
- UNRESOLVED
- INSUFFICIENT_EVIDENCE

Confidence:

- HIGH
- MEDIUM
- LOW

Grade the exact proposition.

## 10 — REVIEW NOTES

Inspect explicitly for:

- atomicity failure;
- O/I/M collapse;
- source-position collapse;
- primary-source overreach;
- institutional characterization → underlying fact;
- record absence → negative evidence;
- record-producing-power blindness;
- relationship-time collapse;
- proposition-dimension drift;
- causal-link inheritance;
- contribution → primary cause / necessity / sufficiency;
- influence → coordination / intent / effect;
- common outcome → shared coordination;
- authentic source → false interpretation;
- aggregate → component inheritance;
- system claim with no falsifier;
- projection increasing certainty.

## 11 — GRADUATION SELF-AUDIT

Report every applicable check as:

`PASS`

`FAIL`

or

`NOT ESTABLISHED`

Do not mark PASS merely because the check was attempted.

---

## Final instruction

The quality of the run is measured by whether another researcher can see:

> **what was claimed → who produced the evidence → from what position → how they could know → where the proposition originated → what supports it → what challenges it → how it travelled → where interpretation begins → what remains missing → what would falsify or change the finding.**

Show the receipts.

Stop before synthesis.
