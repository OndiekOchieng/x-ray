# Protocol v0.3 Calibration Candidates

**Status:** Protocol-side candidates for #12.  
**Architecture/executable calibration adoption:** Deferred to #13.

These cases record recurring judgment boundaries exposed by manual v0.2 investigations. They do not yet renumber or modify the executable CAL-001…CAL-006 corpus.

---

## PCAL-007 — Institutional characterization is not underlying fact

### Pattern

A record produced by an institution characterizes a person, event, project, or outcome.

### Wrong move

```text
Colonial authority records:
"Kenyatta is a Mau Mau leader"

therefore

Kenyatta operationally led Mau Mau
```

### Correct move

The record can directly establish the colonial authority's classification/characterization. The underlying proposition requires evidence appropriate to that proposition.

### General form

`institution says X` != `X independently established`

---

## PCAL-008 — Relationship at T1 does not determine relationship at T2

### Pattern

Actors' relationships change over time.

### Wrong move

```text
Britain detained Kenyatta at T1
therefore
Britain remained purely adversarial at T2
```

or:

```text
Britain politically engaged Kenyatta at T2
therefore
T1 detention was staged
```

### Correct move

Model the relationship by time period. Later accommodation does not erase earlier hostility; earlier hostility does not determine later alignment.

---

## PCAL-009 — Proposition dimensions are identity

### Pattern

A real event or number is reported under the wrong actor, category, measure, scope, time, or aggregation level.

### Examples

- official language != national language;
- total remuneration != base salary;
- reported source count != independent-origin count;
- operational recovery != institutional recovery;
- Britain/France declared war != Churchill/de Gaulle personally caused the declaration at that time.

### Correct move

Treat the changed dimension as a changed proposition.

---

## PCAL-010 — Evidence does not inherit across a causal chain

### Pattern

One link is established strongly and later links inherit its confidence.

### Wrong move

```text
cyanide detected
→ pesticide source established
→ tomato pathway established
→ accidental exposure established
```

### Correct move

Grade each material link independently.

---

## PCAL-011 — Authentic source is not authentic interpretation

### Pattern

A genuine archive record, number, photograph, or document is attached to a proposition outside its actual scope.

### Example

A genuine narrow administrative death-certificate count is represented as a complete victim total.

### Correct move

Authenticate the record and separately validate the interpretation, denominator, scope, and population.

---

## PCAL-012 — Recovery in one dimension is not recovery in another

### Pattern

Operational, financial, institutional, legal, or social recovery is silently promoted across dimensions.

### Example

A factory restarting production does not independently establish that liabilities, governance, or local social outcomes have recovered.

---

## PCAL-013 — Aggregate change is not component change

### Pattern

A total changes substantially and the same percentage is rhetorically attached to one component.

### Example

Total remuneration rises 90%; base salary rises materially less because gratuity/allowances changed.

### Correct move

Preserve the aggregation level and component composition.

---

## PCAL-014 — Common outcome does not establish common coordination

### Pattern

Several institutions, policies, or actors produce effects pointing in a similar direction.

### Wrong move

Infer a single controlling actor or coordinated plan without evidence of coordination.

### Correct move

Represent each influence/mechanism separately and investigate coordination as its own proposition.

---

## PCAL-015 — System explanations require falsifiers

### Pattern

Every possible outcome is interpreted as confirmation of the same hidden system.

### Wrong move

```text
leader complies → system controls him
leader resists → system removes him
election changes policy → system absorbed change
election fails → system blocked change
```

### Correct move

Ask what observable evidence would count against the system explanation. If the answer is "nothing", the claim is not being treated as a reversible research finding.

---

## PCAL-016 — Record absence depends on record-producing power

### Pattern

One institution controlled production/preservation of records and the archive lacks another actor's voice.

### Wrong move

Infer non-existence of that view/event from archive silence.

### Correct move

Record the absence, the archival power relationship, alternative explanations for silence, and what independent evidence could resolve it.

This does not reverse the burden of proof or automatically validate the under-recorded claim.

---

## Candidate failure-mode families for #13

- source-position collapse;
- primary-source overreach;
- institutional-characterization promotion;
- record-producing-power blindness;
- proposition-dimension drift;
- causal-link inheritance;
- causal-strength promotion;
- common-outcome coordination inference;
- relationship-time collapse;
- authentic-record scope laundering;
- aggregate/component inheritance;
- unfalsifiable system narrative.

#13 should decide which become:

- deterministic invariants;
- Reviewer checks;
- executable calibration cases;
- research-only guidance.
