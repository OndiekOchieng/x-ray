# ADR-0004 — Model Behind Adapter

**ADR:** 0004 (v0.1: ADR-004)
**Status:** Accepted
**Date:** 2026-09-14
**Source:** `X-Ray System Architecture v0.1` §37 (ADR-004; see also §21)
**Supersedes:** —

## Context

X-Ray methodology is model-agnostic. The v1 runtime does not need to be
multi-model, and multi-model orchestration is explicitly excluded from scope
(§36).

Two benchmark runs against the same source — one Claude, one GPT — produced
materially different grades for the same claim
([XRAY-KE-001](../benchmarks/XRAY-KE-001/README.md)). The system must be able
to change or compare providers without that being an architectural event.

## Decision

As stated in System Architecture v0.1 §37:

> **Decision:** Protocol remains provider-independent while V1 may use one provider.

Keep the research model behind a `ResearchModel` interface
([model boundary](../architecture/research-pipeline.md#model-boundary)) with one
method per pipeline stage. Provider-specific logic lives behind the adapter.

V1 may use a single provider.

## Consequences

- The protocol remains provider-independent while the runtime stays simple.
- Providers can be swapped or evaluated against the acceptance suite without
  changing pipeline, validation or persistence code.
- The adapter is one of only two permitted locations for provider-specific
  logic; the other is the search/research adapter
  ([runtime-architecture.md](../architecture/runtime-architecture.md)).
- Prompt-level differences between providers cannot be relied on to enforce
  correctness — which is precisely why ADR-0005 exists.
