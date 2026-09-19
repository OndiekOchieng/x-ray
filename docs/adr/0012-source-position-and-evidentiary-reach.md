# ADR-0012 — Source Position and Evidentiary Reach Are First-Class Context

**ADR:** 0012  
**Status:** Accepted  
**Date:** 2026-09-19  
**Source:** Protocol v0.3 / Issue #13  
**Supersedes:** —

## Context

X-Ray already separates:

- Source from Evidence;
- SourceDependency from EvidenceProvenance;
- deterministic validation from calibrated review.

Protocol v0.3 exposed a missing dimension: two records carrying identical words may have materially different evidentiary reach because their producers stood in different relationships to the subject and knew the proposition in different ways.

Examples include:

- a colonial authority classifying a detainee;
- a company reporting its own financial figures;
- police describing a contested use-of-force event;
- an activist or witness describing an event they experienced;
- an auditor recording what supplied records did or did not establish.

Treating all of these merely as `PRIMARY` or `SECONDARY` loses the relationship and knowledge basis that make the evidence interpretable.

At the same time, source position must not become a disguised trust score. Institutional power does not make a source false; lack of power does not make a source true.

## Decision

### 1. Source Position becomes canonical contextual state

Add a canonical `SourcePosition` artifact scoped to:

- one Source;
- one or more relevant Claims;
- an optional time scope.

It records the producer's relevant relationship, documented/inferred power or dependency context, production purpose where established, basis, confidence, and supporting evidence/basis description.

It is a contextual relation, not an intrinsic Source property.

### 2. Knowledge Basis belongs to Evidence

Add proposition-specific `Evidence.knowledgeBasis`.

A single Source may contain Evidence based on direct observation, administrative records, attributed sources, institutional characterization, expert interpretation, or synthesis.

### 3. Evidence.proposition remains the direct-establishment boundary

No duplicate `directlyEstablishes` or `doesNotEstablish` fields are added.

If a record directly establishes only that an institution made a characterization, the Evidence proposition preserves that attribution.

### 4. Source Position, Knowledge Basis, EvidenceProvenance, and SourceDependency remain distinct

- SourcePosition — where the producer stood;
- KnowledgeBasis — how the source could know this proposition;
- EvidenceProvenance — where the proposition originated;
- SourceDependency — how documents depend on one another.

### 5. No trust/bias score

No scalar or categorical source trust ranking is introduced.

Source position changes evidentiary reach, not truth by fiat.

### 6. No Actor ontology in this change

Existing Source producer metadata plus contextual SourcePosition is sufficient for the v0.3 delta.

Actor/entity identity resolution is deferred.

### 7. No new research stage

Source position is captured/refined through existing stages.

TRACE may create SourcePosition and Evidence.knowledgeBasis; PROVENANCE may revise SourcePosition while owning lineage.

### 8. Historical snapshots are not backfilled

The new graph collection/field are additive and may be absent from historical InvestigationVersions.

A historical snapshot is never enriched in place.

## Consequences

- The canonical graph gains a new artifact collection.
- Evidence gains an optional historical-compatible field.
- TRACE/PROVENANCE proposal/ownership contracts require an additive delta.
- Validator gains structural/referential rules and a v0.3 FULL requirement for KnowledgeBasis on material Evidence.
- Reviewer gains semantic checks for source-position collapse and related v0.3 failure modes.
- Persistence requires a distinct additive migration before durable workspace work resumes.
- Public projections can eventually expose "who is speaking / how they know" without inventing a truth score.
- Existing SourceDependency and EvidenceProvenance semantics remain unchanged.
- XRAY-KE-001 historical versions remain exactly reconstructible.
