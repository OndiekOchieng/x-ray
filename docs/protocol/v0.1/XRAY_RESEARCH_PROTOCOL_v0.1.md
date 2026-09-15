# X-Ray Research Protocol

**Version:** 0.1.0  
**Status:** Experimental  
**Purpose:** Model-agnostic protocol for reconstructing the evidence beneath civic claims  
**Initial benchmark:** XRAY-KE-001  
**Designed for:** Human researchers, GPT, Claude, and other research-capable systems

---

## 1. Purpose

X-Ray is a research protocol for investigating civic information.

It begins with something a person has encountered in ordinary life:

- a news headline
- an article
- a government announcement
- a speech
- a social-media post
- a public claim
- a policy
- a law
- a budget statement
- a public project announcement

The protocol does not begin by asking whether the material is **true or false**.

It asks:

> **What exactly is being claimed, and what is each claim standing on?**

The job is to reconstruct the evidence beneath the surface statement, trace claims toward their origins, distinguish independent evidence from repetition, search deliberately for evidence that could overturn an emerging conclusion, expose contradictions and missing records, and show what the available evidence permits us to say.

### Constitutional principle

> **The system does not decide what the citizen should believe. It reconstructs what a civic claim is standing on.**

The receipt does the work.

The reader must remain free to inspect the evidence, disagree with the interpretation, identify where the investigation could be wrong, and reach their own conclusion.

---

# 2. Research principles

## 2.1 The surface source is the beginning, not the authority

An article, speech, post, or press release is evidence that a claim **was made**.

It is not automatically evidence that the claim is true.

If Citizen Digital reports that a road costs KSh 16.7 billion, Citizen Digital establishes that the figure was reported there.

The investigation must still ask where KSh 16.7 billion came from.

---

## 2.2 Decompose before researching

Never investigate a complex statement as one claim when its parts can independently be true or false.

For example:

> "The government completed a KSh 16.7 billion, 63-kilometre road."

contains at least three independently testable claims:

- the project value is KSh 16.7 billion;
- the road is 63 kilometres long;
- the road has been completed.

### Atomicity rule

> **If one part of a statement could be false while another remains true, split them.**

---

## 2.3 Separate observation, interpretation, and meaning

Every material claim must be classified as one of three layers.

### O — Observation

A checkable proposition that evidence could establish or contradict.

Example:

> The approved project value is KSh 16.7 billion.

### I — Interpretation

A reading of observations.

Example:

> The project appears significantly delayed.

### M — Meaning

A broader conclusion, judgment, implication, or point of view.

Example:

> The project represents wasteful public spending.

An interpretation or meaning must never be presented as though it carries the evidentiary certainty of an observation.

---

## 2.4 Go to the source, not merely the repetition

Whenever possible, trace claims toward the record that originated or directly establishes them.

Depending on the claim, this may include:

- legislation or gazette notices;
- budgets;
- procurement records;
- tender awards;
- signed contracts;
- financing agreements;
- official datasets;
- court judgments;
- parliamentary records;
- Auditor-General reports;
- implementation reports;
- institutional records;
- official statements.

News reports, explainers, social posts, and secondary commentary may provide leads and context, but repetition does not automatically constitute independent corroboration.

---

## 2.5 Provenance is part of the evidence

For every source, ask:

- Who produced it?
- When?
- Why?
- Is it primary or secondary?
- Is it the origin of this claim or repeating somebody else?
- Is it independent of the other evidence?
- What exactly does it establish?
- What does it **not** establish?

Search ranking is not an evidence hierarchy.

A highly ranked webpage is not necessarily authoritative.

An obscure document is not necessarily true because it is obscure.

Judge evidence by provenance and relevance.

---

## 2.6 Repetition is not corroboration

If five articles all derive a figure from the same government press release, record:

> **Five publications, one originating source.**

Do not record five independent confirmations.

The investigation should trace information dependencies whenever they can be established.

Example:

```text
Citizen ─┐
Nation  ─┼──► Government statement ──► Project record
Tuko    ─┘
```

The source graph matters as much as the source count.

---

## 2.7 Try to prove the emerging conclusion wrong

Every load-bearing finding must survive a deliberate disconfirmation pass.

The standing instruction is:

> **Assume the current conclusion is wrong. Find the strongest credible evidence against it.**

Search for:

- later records;
- earlier records;
- revised figures;
- counterexamples;
- contrary datasets;
- official disputes;
- corrections;
- amendments;
- different definitions;
- changes in scope;
- changes over time;
- evidence from an interested party that complicates the current finding.

Finding strong disconfirming evidence is not failure.

It is the protocol working.

---

## 2.8 Missing evidence remains missing

Never convert:

> "We could not find evidence of X."

into:

> "X did not happen."

Never fill an evidentiary gap using plausibility, political assumptions, model knowledge, or narrative convenience.

Instead, record the missing piece explicitly.

A missing record can itself be useful civic information if the investigation explains:

- what is missing;
- why it matters;
- what document or evidence could resolve it;
- who is likely to hold that information;
- what was searched;
- how the gap affects the finding.

---

## 2.9 Represent every source at its actual strength

Do not sharpen weak evidence.

Do not soften strong evidence.

Examples:

`allocated` ≠ `spent`

`contracted` ≠ `paid`

`announced` ≠ `started`

`started` ≠ `completed`

`completed` ≠ `operational`

`project value` ≠ `government expenditure`

`government funded` ≠ `entirely government funded`

`could not locate` ≠ `does not exist`

These distinctions are load-bearing.

---

## 2.10 Name the mechanism, not the moral

The investigation should show what happened in the records.

It should not unnecessarily instruct the citizen how to feel about it.

Prefer:

> KSh 800 million was allocated.  
> KSh 710 million had been paid by the latest report located.  
> Recorded completion was 42%.  
> The contractual completion date was March 2026.

over:

> This proves massive government corruption.

The evidence may support further investigation or serious questions. Let those conclusions be earned.

---

# 3. Pipeline

The complete X-Ray pipeline is:

```text
INPUT
  │
  ▼
1. INGEST
  │
  ▼
2. DECOMPOSE
  │
  ▼
3. CLASSIFY
  │
  ▼
4. PLAN
  │
  ▼
5. TRACE
  │
  ▼
6. DISCONFIRM
  │
  ▼
7. RECONCILE
  │
  ▼
8. GRADE
  │
  ▼
9. IDENTIFY GAPS
  │
  ▼
10. SYNTHESIZE
  │
  ▼
11. ACT
```

For research benchmarks, stages 1–9 should be completed before citizen-facing synthesis is allowed.

---

# 4. Stage 1 — Ingest

## Objective

Preserve what the original source actually says before external research changes the investigator's understanding of it.

## Capture

At minimum:

```text
source_id
source_type
title
publisher
author
url
published_at
updated_at
retrieved_at
relevant_content
```

Also extract obvious:

- people;
- organizations;
- institutions;
- locations;
- dates;
- money amounts;
- percentages;
- distances;
- quantities;
- project names;
- laws/policies;
- other named entities.

## Rule

Do not correct or reconcile claims during ingestion.

The purpose is to establish the surface record faithfully.

---

# 5. Stage 2 — Decompose

## Objective

Create a ledger of atomic claims contained in the source.

Each material claim receives a stable identifier:

```text
C001
C002
C003
...
```

## Claim record

```text
claim_id
claim_text
source_passage
source_id
```

## Atomicity test

Ask:

> Could one component be false while the rest remains true?

If yes, split the claim.

## Materiality

Prioritize claims involving:

- public money;
- delivery/status;
- laws or rights;
- dates and deadlines;
- quantities;
- institutional responsibility;
- public services;
- funding;
- procurement;
- named actors;
- causal assertions;
- outcomes;
- claims likely to affect citizen decisions.

Do not create unnecessary claim records for stylistic or trivial statements.

---

# 6. Stage 3 — Classify

Each claim receives structured metadata.

Recommended schema:

```text
claim_id
claim_text
source_passage

layer:
  O | I | M

claim_type:
  financial
  delivery
  legal
  timeline
  attribution
  funding
  procurement
  quantitative
  geographic
  causal
  political
  service
  other

entities
locations
time_scope

ambiguities

verification_priority:
  high
  medium
  low
```

## Ambiguity pass

Before researching, identify language that could conceal multiple meanings.

Example:

> "The project is worth KSh 16.7 billion."

Possible ambiguity:

Does "worth" mean:

- original contract value?
- revised contract value?
- total programme value?
- budget allocation?
- financing envelope?
- amount committed?
- amount already spent?

Do not silently choose one interpretation.

---

# 7. Stage 4 — Plan the investigation

## Objective

Define what evidence would establish or contradict the claim **before searching for supporting material**.

For every high-priority claim, record:

```text
claim_id
ideal_evidence
acceptable_evidence
weak_evidence
likely_institutions
search_questions
```

Example for a project-value claim:

```text
IDEAL

1. Signed contract
2. Procurement award
3. Official project record
4. Financing agreement

STRONG

5. Approved budget
6. Auditor-General report
7. Parliamentary record

CONTEXTUAL

8. Official press release
9. Credible journalism

INSUFFICIENT ALONE

10. Social media
11. Other articles repeating the same figure
```

Evidence hierarchy must be claim-specific.

---

# 8. Stage 5 — Trace

## Objective

Trace each load-bearing claim toward its evidentiary origin.

Do not optimize for the number of sources.

Optimize for:

- proximity to the underlying event or record;
- provenance;
- independence;
- relevance;
- temporal accuracy;
- directness.

## Evidence record

Every material source receives a stable identifier:

```text
S001
S002
S003
...
```

Recommended schema:

```text
source_id
title
publisher_or_institution
author
date
url

source_type
primary_or_secondary
originating_or_repeating
independence

claims_supported
claims_contradicted
claims_contextualized

relevant_extract

evidence_strength:
  direct
  strong_indirect
  contextual
  weak

notes
```

## Trace relationships

Record known source dependencies.

Example:

```text
S004 repeats S002
S005 cites S002
S002 appears to originate C003
```

Do not treat dependent sources as independent corroboration.

---

# 9. Stage 6 — Disconfirm

## Objective

Actively attack the preliminary finding.

This should be a distinct research pass.

For every load-bearing claim:

1. State the current hypothesis.
2. Assume it is wrong.
3. Search for the strongest credible contrary evidence.
4. Record what was found.
5. Reassess the hypothesis.

## Disconfirmation record

```text
claim_id
preliminary_hypothesis
counter_hypothesis
searches_attempted
contrary_sources
strongest_opposing_evidence
effect_on_finding
```

## Required question

For every major conclusion:

> **What evidence would change our mind?**

If the answer is "nothing", the conclusion is not being treated as a research finding.

---

# 10. Stage 7 — Reconcile

## Objective

Determine whether apparent conflicts are genuine contradictions or differences in context.

Never label two figures contradictory merely because they differ.

Test for:

- different dates;
- different scope;
- different definitions;
- original vs revised value;
- budget vs contract;
- contract vs expenditure;
- national vs local contribution;
- grant vs loan;
- different project phases;
- different geographic coverage;
- different units;
- currency conversion;
- nominal vs adjusted value;
- corrections;
- source errors.

## Discrepancy record

Every material discrepancy receives an identifier:

```text
D001
D002
D003
...
```

Recommended schema:

```text
discrepancy_id
claim_id
sources_involved
values_or_statements
classification

classification:
  different_date
  different_scope
  different_definition
  revised_value
  different_phase
  unit_or_currency
  genuine_contradiction
  probable_source_error
  unresolved

explanation
effect_on_finding
```

An unresolved discrepancy must remain unresolved.

---

# 11. Stage 8 — Grade

Only after tracing, disconfirmation, and reconciliation may a claim receive an evidence status.

## Evidence statuses

### ESTABLISHED

Direct, strong evidence establishes the claim with no material unresolved conflict.

### SUPPORTED

Credible evidence supports the claim, but relevant limitations remain.

### PARTIALLY SUPPORTED

One or more material components are established while others are not.

### CONTESTED

Credible evidence supports competing accounts or interpretations.

### CONTRADICTED

Strong evidence directly conflicts with the claim as stated.

### UNRESOLVED

Relevant evidence exists, but it does not currently settle the claim.

### INSUFFICIENT EVIDENCE

Too little credible evidence was located to make a responsible assessment.

## Confidence

Assign separately:

```text
HIGH
MEDIUM
LOW
```

Status and confidence are different dimensions.

For example:

> **UNRESOLVED — HIGH CONFIDENCE**

can mean the investigation strongly establishes that currently available evidence does not resolve the question.

## Grade record

```text
claim_id
status
confidence
rationale
strongest_support
strongest_challenge
unresolved_issues
```

---

# 12. Stage 9 — Identify gaps

Every material evidentiary gap receives an identifier:

```text
GAP-001
GAP-002
...
```

Recommended schema:

```text
gap_id
claim_ids

missing_information
why_it_matters

evidence_that_would_resolve_it
likely_holder

searches_attempted
search_status

effect_on_finding
```

Example:

```text
GAP-003

Missing:
Final expenditure for Project X

Why it matters:
Project value does not establish how much money
has actually been spent.

Would resolve it:
Latest certified expenditure or implementation report

Likely holder:
Implementing agency

Search status:
Not located

Effect:
C004 cannot currently be established.
```

A gap must never be silently filled by inference.

---

# 13. Stage 10 — Synthesize

This stage is forbidden until stages 1–9 are complete.

## Objective

Turn the investigation into plain language without changing the strength of the evidence.

Recommended citizen-facing structure:

### WHAT WAS CLAIMED

The original proposition.

### WHAT THE RECEIPTS ESTABLISH

The strongest established observations.

### WHAT COMPLICATES IT

Contradictions, revisions, scope differences, or relevant context.

### WHAT WE COULD NOT ESTABLISH

Evidence gaps.

### WHAT WOULD CHANGE THIS FINDING

The evidence that could materially alter the assessment.

### SOURCES

Original records and evidence graph.

## Prohibited synthesis behaviour

Do not:

- turn uncertainty into certainty;
- present interpretation as observation;
- hide contradictory evidence;
- inflate source counts through repetition;
- use absence of evidence as evidence of absence;
- convert "could not locate" into "does not exist";
- tell the citizen what political or moral conclusion they must reach.

---

# 14. Stage 11 — Act

Finding information is not the end of a civic investigation.

Where appropriate, the system should identify practical next steps.

Possible actions include:

- open the original document;
- inspect the source passage;
- see the responsible institution;
- check the latest project status;
- identify the office holding a missing record;
- request public information;
- compare records;
- inspect another claim;
- see related projects;
- share an evidence card.

Every action must follow from the investigation.

The system must not fabricate complaint channels, contacts, procedures, rights, or institutional responsibilities.

---

# 15. Required benchmark artifacts

For model evaluation, stages 1–9 must produce five primary artifacts.

## 01 — SOURCE RECORD

The original material and metadata.

## 02 — CLAIM LEDGER

Every material atomic claim and its classification.

## 03 — EVIDENCE LEDGER

Every material source, provenance assessment, dependency, and claim relationship.

## 04 — DISCREPANCY LEDGER

Every material conflict and its attempted reconciliation.

## 05 — GAP LEDGER

Every unresolved evidentiary hole and what could resolve it.

A sixth internal artifact may record the disconfirmation pass if useful:

## 06 — DISCONFIRMATION LOG

The strongest opposing evidence sought and found for each load-bearing finding.

---

# 16. Model benchmark rules

When comparing GPT, Claude, Gemini, another model, or a human researcher, every researcher should receive:

- the same protocol version;
- the same surface source;
- the same research scope;
- the same stopping conditions;
- the same required artifact schemas.

Do not primarily compare prose quality.

Compare research behaviour.

Recommended metrics:

```text
Atomic claims identified
Material claims missed
Claims incorrectly bundled
O/I/M classification agreement
Primary sources located
Original sources recovered
Dependent sources incorrectly counted as independent
Disconfirming evidence found
Material discrepancies identified
False contradictions created
Discrepancies successfully reconciled
Unsupported conclusions
Evidence gaps preserved
Evidence gaps incorrectly filled
Source-strength errors
Final grading agreement
```

## Human reference

Where possible, maintain a human-reviewed gold investigation.

Model agreement is not truth.

If two models agree and the primary record contradicts both, both models are wrong.

---

# 17. Handling disagreement between researchers

When researchers disagree, do not vote.

Example:

```text
GPT:
SUPPORTED

Claude:
ESTABLISHED

Human:
UNRESOLVED
```

Ask:

1. Which sources did each researcher use?
2. Did they use the same originating evidence?
3. Did one locate evidence the others missed?
4. Did one mistake repetition for corroboration?
5. Did one interpret a source more strongly than it permits?
6. Did they use different definitions or time scopes?
7. What evidence would settle the disagreement?

The disagreement itself becomes research data.

---

# 18. Benchmark Run XRAY-KE-001

**Date:** 2026-09-13

## Surface source

Citizen Digital article concerning President William Ruto's five-day tour of Kisumu, Siaya, Migori, and Homa Bay.

## Initial investigation subject

Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road.

## Initial claims

### C001

The road/project is 63 kilometres long.

### C002

The project is worth KSh 16.7 billion.

### C003

Most sections of the road are already tarmacked.

### C004

The President is inspecting or commissioning the project during the September 2026 tour.

### C005

Reserved for the most material provenance, financing, timeline, or delivery question exposed by tracing C001–C004.

C005 must be discovered from the evidence rather than predetermined.

## Researchers

```text
Human / Ochieng
GPT
Claude
```

Other models may be added later.

## Objective

Reconstruct the evidence beneath the selected claims.

## Success is not agreement

Success means:

```text
correct decomposition
+
primary-source recovery
+
source provenance
+
independence detection
+
deliberate disconfirmation
+
discrepancy reconciliation
+
honest uncertainty
+
visible evidence gaps
+
no unsupported inference
```

---

# 19. Researcher execution instruction

The following instruction should be usable unchanged across research-capable models:

> You are participating in an evidence-reconstruction benchmark.
>
> Follow X-Ray Research Protocol v0.1 exactly.
>
> Your task is not to prove or disprove the supplied article, defend or attack any political actor, or produce a compelling narrative.
>
> Your task is to reconstruct what the selected claims are standing on.
>
> Execute stages 1 through 9.
>
> Decompose claims before researching them. Preserve the source wording. Distinguish observation, interpretation, and meaning. Plan what evidence would establish each load-bearing claim before searching.
>
> Trace claims toward originating and primary records. Do not count repeated reporting as independent corroboration when sources derive from the same origin.
>
> Run a separate disconfirmation pass against every load-bearing preliminary finding. Treat discrepancies as research questions before calling them contradictions. Preserve unresolved evidence as unresolved.
>
> Never infer that a record does not exist merely because you could not locate it.
>
> Never strengthen or soften a source beyond what it supports.
>
> Do not produce citizen-facing synthesis yet.
>
> Return the required structured research artifacts and enough source information that another researcher can audit every material finding.
>
> Optimize for an auditable investigation, not an impressive answer.

---

# 20. Graduation gate

An investigation cannot proceed to citizen-facing synthesis until the researcher can answer **yes** to all applicable checks.

### Decomposition

- [ ] Material claims have been split into independently testable units.
- [ ] Original source passages are preserved.

### Classification

- [ ] Observation, interpretation, and meaning have been separated.
- [ ] Material ambiguities have been identified.

### Evidence

- [ ] Load-bearing claims were traced toward primary/originating evidence.
- [ ] Source provenance is recorded.
- [ ] Repetition has not been mistaken for independent corroboration.
- [ ] Evidence strength matches the claims being made.

### Disconfirmation

- [ ] The strongest credible opposing case was actively sought.
- [ ] Evidence capable of changing the finding was identified.
- [ ] Contrary evidence was not hidden.

### Reconciliation

- [ ] Different figures were checked for differences in date, scope, definition, phase, and measurement before being called contradictory.
- [ ] Unresolved discrepancies remain unresolved.

### Gaps

- [ ] Missing evidence has not been filled by inference.
- [ ] Material missing pieces are named.
- [ ] Evidence that could resolve each important gap is identified where possible.

### Reader freedom

- [ ] The evidence does not force a moral or political verdict.
- [ ] A reasonable reader can see what is established.
- [ ] A reasonable reader can see where the investigation could be wrong.
- [ ] A reasonable reader can inspect the receipts themselves.

Only then may the investigation proceed to:

> **SYNTHESIZE → ACT**

---

# 21. Versioning

The protocol should change when benchmark runs expose a methodological failure.

Examples:

- a model repeatedly mistakes repeated reporting for independent corroboration;
- a source type requires a missing provenance field;
- models confuse budget allocation with expenditure;
- temporal discrepancies are repeatedly misclassified as contradictions;
- missing evidence is being converted into negative findings;
- the grading vocabulary cannot represent a recurring evidence state.

Do not change the protocol merely because a particular investigation produced an inconvenient result.

Version changes should record:

```text
version
date
benchmark_that_exposed_issue
failure_observed
protocol_change
reason
```

The protocol itself should therefore be subjected to the same principle as the investigations it governs:

> **Try to break it. Keep what survives.**

---

## Current status

**X-Ray Research Protocol v0.1.0**

Ready for first comparative benchmark:

**XRAY-KE-001**

Citizen Digital → Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road → GPT vs Claude vs human review.