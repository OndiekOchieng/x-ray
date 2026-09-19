# Calibration Corpus

**Status:** Reference · derived from XRAY-KE-001
**Scope:** reasoning behaviour at ambiguous boundaries

CAL-001…CAL-006 and FM-001…FM-006 come from XRAY-KE-001. CAL-007…CAL-016
and FM-007…FM-010 are v0.3 reasoning cases. Their Kenyatta/Maralal anchor is
synthetic and makes no historical assertion. The cases record *how a difficult
judgment should come out* — not what is true about any subject.

---

## Where this sits

X-Ray already has three kinds of document. Calibration is the fourth, and it
exists because the first three cannot do its job.

| Layer | Answers | Lives in |
| --- | --- | --- |
| **Protocol** | What do I *do*, in what order? | [protocol/v0.1/](../protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md) |
| **Domain & invariants** | What state is *representable*, and what is *forbidden*? | [architecture/domain-model.md](../architecture/domain-model.md), [architecture/validation-and-invariants.md](../architecture/validation-and-invariants.md) |
| **Calibration** | When the rule permits two answers, which is *right*? | this directory |
| **Failure modes** | What goes wrong *repeatedly*, and how would I notice? | [failure-modes/](./failure-modes) |

The protocol says *trace claims toward originating evidence*. The invariants say
*a finding MUST NOT be graded `CONTRADICTED` on measurement-incompatible
evidence*. Neither tells you that **28% project completion against a claim about
tarmacked road length is measurement-incompatible** — that is a judgment, and it
is the judgment two competent models disagreed on.

That disagreement is the reason this corpus exists. Calibration is where the
judgment gets written down.

---

## What these documents are not

**Calibration cases are not source-of-truth facts.**

They are regression examples for *reasoning behaviour*. A case says: given
evidence shaped like this, a finding shaped like that is correct — and the
obvious alternative is wrong, for a stated reason.

They carry no authority over evidence in a live investigation. If a future run
retrieves a certified surfaced-kilometre measurement, CAL-001's expected
judgment changes, and that is the system working. Every case therefore states
**what evidence would change the judgment**. A case that cannot say what would
overturn it is as invalid as a finding that cannot
([XR-INV-007](../architecture/validation-and-invariants.md#xr-inv-007--findings-must-be-reversible)).

They are also not a second protocol, not a scoring rubric, and not prompt text
to paste into a model.

---

## Cases

| ID | Judgment boundary | Anchor | Invariant |
| --- | --- | --- | --- |
| [CAL-001](./cases/CAL-001-different-measurement-is-not-contradiction.md) | Different measurement is not contradiction | C003 | XR-INV-005 |
| [CAL-002](./cases/CAL-002-different-scope-is-not-contradiction.md) | Different scope is not contradiction | C001 | XR-INV-005 |
| [CAL-003](./cases/CAL-003-repetition-is-not-corroboration.md) | Repetition is not corroboration | SRC-017 cluster | XR-INV-004 |
| [CAL-004](./cases/CAL-004-not-located-is-not-nonexistent.md) | Not located is not nonexistent | GAP-001, SRC-017 | XR-INV-006 |
| [CAL-005](./cases/CAL-005-scheduled-is-not-occurred.md) | Scheduled is not occurred | C004 | XR-INV-001 |
| [CAL-006](./cases/CAL-006-unexplained-financial-bridge-remains-unresolved.md) | Unexplained bridge stays unresolved | C002 | XR-INV-006, XR-INV-007 |

CAL-007…CAL-016 cover institutional characterization, changing relationships,
proposition dimensions, causal and agency chains, source scope, aggregate and
component claims, archive power, and falsifiability. Their metadata and exact
files are listed in [index.json](./index.json); executable mutations run through
`pnpm check:source-position-review`.

## Failure modes

| ID | Error shape | Demonstrated by |
| --- | --- | --- |
| [FM-001](./failure-modes/FM-001-proxy-measure-contradiction.md) | Proxy-measure contradiction | CAL-001 |
| [FM-002](./failure-modes/FM-002-scope-collapse.md) | Scope collapse | CAL-002 |
| [FM-003](./failure-modes/FM-003-source-count-inflation.md) | Source-count inflation | CAL-003 |
| [FM-004](./failure-modes/FM-004-absence-to-nonexistence.md) | Absence promoted to nonexistence | CAL-004 |
| [FM-005](./failure-modes/FM-005-temporal-promotion.md) | Temporal promotion | CAL-005 |
| [FM-006](./failure-modes/FM-006-premature-numeric-reconciliation.md) | Premature numeric reconciliation | CAL-006 |

Cases are grounded in specific canonical ids; failure modes are written to
recur anywhere. A failure mode that only makes sense for Kenyan road contracts
is not a failure mode.

---

## Where calibration is headed

Deterministic validation can reject a graph that *cannot* be right — a dangling
id, a `CONTRADICTED` grade over incompatible measurements, an ATI draft on a
`WAIT_FOR_RECORD` gap. It cannot judge whether a reconciliation is *reasonable*.

The intended shape, **conceptual — no implementation exists and none is added
here**:

```text
candidate graph
      │
      ▼
deterministic validation      ← invariants, schema, referential integrity
      │
      ▼
calibrated reviewer           ← adversarial pass using these cases and
      │                         failure modes
      ▼
revise ──┐
      │  │
      ▼  │
graduation
```

The reviewer is not built, not designed, and not scheduled by this document.
What is being built now is the corpus it would need to exist at all.

---

## Provenance

CAL-001…CAL-006 are grounded in the frozen benchmark corpus
([benchmarks/XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md)) and the
canonical fixture (`lib/xray/fixtures/xray-ke-001/`). CAL-007…CAL-016 use an
explicitly synthetic v0.3 calibration fixture. They add no historical finding
to the benchmark and no evidence dated after its **2026-09-13** cutoff.

Fixture ids cited here are checked against the fixture by
`pnpm check:fixtures`, so a case cannot silently outlive the record it
describes.
