# XRAY-KE-001 — Reference Benchmark

**Status:** Frozen historical evidence
**Protocol:** X-Ray Research Protocol v0.1.0
**Research cutoff:** 2026-09-13
**Runs:** 2 (Claude, GPT), stages 1–9 only — no synthesis, no verdict

---

## Purpose

XRAY-KE-001 is the benchmark that X-Ray Architecture v0.1 was derived from.

Two independent executions of the research protocol against the same surface
source produced the evidence for the system's invariants — most directly
[XR-INV-005](../../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule),
which exists because of a disagreement between these two runs.

The benchmark serves three ongoing functions:

1. **Acceptance evidence** — the runs define the epistemic behaviour a real
   engine must reproduce ([ADR-0009](../../adr/0009-benchmark-runs-as-acceptance-evidence.md)).
2. **Regression protection** — the forbidden-inference cases are drawn from
   what these runs got right.
3. **Design grounding** — the domain model exists to represent what these runs
   actually needed to express.

---

## Surface source

| Field | Value |
| --- | --- |
| Publisher | Citizen Digital (Royal Media Services) |
| Title | *Inside Ruto's five-day tour of Kisumu, Siaya, Migori and Homa Bay* |
| Author | Allan Obiero |
| URL | `https://citizen.digital/article/inside-rutos-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-n390083` |
| Published | 2026-09-13, 11:24 EAT |
| Focus | Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road |

The surface source establishes **that the claims were made**. It is not
treated as evidence that they are true — see
[XR-INV-001](../../architecture/validation-and-invariants.md#xr-inv-001--surface-source-isolation).

---

## Research cutoff

**2026-09-13.**

This matters and is enforced. The presidential inspection of the road was
scheduled for **14 September 2026** — the day *after* research. At cutoff, a
scheduled visit could be supported; an occurred visit could not.

Fixtures MUST NOT expect post-cutoff evidence, and future evidence MUST NOT
leak backwards into this benchmark
([acceptance-fixtures.md](../../engineering/acceptance-fixtures.md#scheduled-vs-occurred-fixture)).

---

## Controlled / core claims

The protocol pre-specifies C001–C004 and reserves C005 for a claim discovered
during tracing — the separation required by
[XR-INV-012](../../architecture/validation-and-invariants.md#xr-inv-012--discovered-claims-are-separate).

| ID | Claim | Type |
| --- | --- | --- |
| **C001** | The road is approximately 63 kilometres long. | quantitative / geographic |
| **C002** | The project is worth KSh 16.7 billion. | financial |
| **C003** | Most sections of the road are already tarmacked. | delivery |
| **C004** | The President is scheduled to inspect the road during the September 2026 tour. | timeline |
| **C005** | *(reserved — discovered during tracing)* | varies by run |

Acceptance is asserted on **semantic equivalence**, not on claim ids or
wording ([acceptance-fixtures.md](../../engineering/acceptance-fixtures.md#core-claim-acceptance-fixture)).

Note that C005 legitimately differs between the two runs: each discovered a
different material claim while tracing. That is expected behaviour, not a
defect — which is exactly why the discovered-claim namespace is reserved
rather than pre-filled.

---

## Why two models were run

To separate **method** from **model**.

If one model produced a result, there would be no way to tell which parts came
from the research protocol and which from that model's habits. Running the
same protocol through two independent researchers made three things visible:

**Where they converged** — the 63 km / wider-works scope reconciliation; the
inability to reconstruct KSh 16.7bn from underlying financial records; the
recognition that repeated publications can depend on one originating source;
and that a scheduled inspection cannot be graded as an occurred one. Converged
behaviour is attributable to the method, and became invariant.

**Where they disagreed** — the two runs graded C003 differently:

| Run | C003 status | Confidence |
| --- | --- | --- |
| Claude | `CONTRADICTED` | MEDIUM |
| GPT | `INSUFFICIENT EVIDENCE` | HIGH |

Both nevertheless identified the *same* underlying problem: overall project
completion percentage is not the percentage of road length surfaced. The
disagreement was therefore not noise — it was an unspecified rule. It became
[XR-INV-005](../../architecture/validation-and-invariants.md#xr-inv-005--same-measure-contradiction-rule)
and the
[same-measure regression fixture](../../engineering/acceptance-fixtures.md#same-measure-acceptance-fixture).

**What the model could not fix** — both runs hit the same missing records. A
gap that appears in two independent runs is a property of the public record,
not of the researcher.

---

## As recorded in System Architecture v0.1 §3

Preserved verbatim. This is the architecture's own account of what these
runs established, and the origin of XR-INV-005.


Architecture v0.1 is based on two independent executions of X-Ray Research Protocol v0.1 against the same Citizen Digital article.

Both runs converged on several important findings.

The 63 km description was supportable only after distinguishing the principal/main corridor from wider feeder/spur works.

The KSh16.7 billion description could not be reconstructed exactly from the underlying financial records.

Repeated news publications were sometimes dependent on one originating government source and therefore could not be counted as independent corroboration.

The presidential inspection could be supported as a scheduled event without establishing that it had occurred.

The runs materially disagreed over the claim that “most sections” were already tarmacked.

Claude graded the claim `CONTRADICTED / MEDIUM`.

GPT graded it `INSUFFICIENT_EVIDENCE / HIGH`.

Both nevertheless identified the same measurement problem:

```text
overall project completion %

        ≠

percentage of road length surfaced
```

This disagreement becomes an architectural requirement rather than an unresolved prompt preference.

---

## Raw artifacts

| File | Run | Contents |
| --- | --- | --- |
| [`raw/claude-run.md`](./raw/claude-run.md) | Claude (Anthropic) | Stages 1–9: run metadata, source record, claim ledger, investigation plan, evidence ledger, discrepancy ledger, gap ledger, disconfirmation log, claim grades, stop-condition check, graduation self-audit |
| [`raw/gpt-run.md`](./raw/gpt-run.md) | GPT-5.6 Sol | Stages 1–9, same ledger structure, plus an explicit source dependency graph |

Both runs executed **stages 1–9 only**. Neither performed synthesis or issued
a verdict — consistent with the pipeline boundary in
[research-pipeline.md](../../architecture/research-pipeline.md).

Each run records its own limitations in its metadata section. Read them: they
are part of the evidence, and they document which records were unreachable at
cutoff.

---

## These files are immutable

`raw/claude-run.md` and `raw/gpt-run.md` are **frozen historical evidence**.

They are never edited, reformatted, corrected, regenerated, or rewritten —
including when a later model would do better, and including when they contain
something now known to be wrong. Their value is that they record what was
concluded, from what evidence, at a fixed cutoff, under a stated protocol
version.

Errors in them are findings about the runs, recorded elsewhere. Corrections go
into analysis documents, never into the artifacts.

This mirrors the rule the system applies to its own investigations
([ADR-0006](../../adr/0006-immutable-investigation-versions.md)): history is
preserved, not overwritten.

---

## Acceptance targets behaviour, not prose

The engine is **not** required to reproduce either report word-for-word.

Acceptance is semantic. Fixtures are expressed as `MUST` / `MUST NOT` / `MAY`
rather than frozen conclusions, because:

- a later model may retrieve **stronger evidence** and legitimately produce a
  stronger finding;
- a run may discover additional legitimate evidence without failing;
- the fixtures test reasoning behaviour, not a permanently frozen verdict.

`CONTRADICTED` on C003, for example, is not permanently forbidden — it is
forbidden *absent measurement-compatible evidence*. A future run that actually
measures surfaced kilometres may legitimately return it.

Full specification:
[engineering/acceptance-fixtures.md](../../engineering/acceptance-fixtures.md).

---

## Not yet written

A full **Claude-vs-GPT comparison** is deliberately not in this directory. It
requires working through both evidence ledgers case by case and is a separate
evidence-backed task. The single disagreement recorded above is included only
because System Architecture v0.1 §3 already establishes it as the origin of
XR-INV-005.

---

## Related

- [ADR-0009 — Benchmark runs as acceptance evidence](../../adr/0009-benchmark-runs-as-acceptance-evidence.md)
- [Research Protocol v0.1](../../protocol/v0.1/XRAY_RESEARCH_PROTOCOL_v0.1.md) — the method both runs executed
- [Acceptance fixtures](../../engineering/acceptance-fixtures.md)
