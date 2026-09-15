# X-Ray System Architecture v0.1

**Status:** Proposed  
**Date:** 2026-09-14  
**System:** X-Ray Civic Evidence Engine  
**Architecture version:** 0.1  
**Protocol target:** X-Ray Research Protocol v0.2  
**Reference benchmark:** XRAY-KE-001

> **Verdicts expire. Receipts compound.**

---

# 1. Purpose

X-Ray is a method engine for reconstructing the evidence beneath civic claims.

Given a surface source such as a news article, speech, report, or public statement, X-Ray:

1. preserves what was originally claimed;
2. decomposes the source into independently testable claims;
3. classifies ambiguities and evidence requirements;
4. traces claims toward primary or originating evidence;
5. records source provenance and dependency;
6. actively searches for disconfirming evidence;
7. reconciles apparently conflicting evidence;
8. grades what the evidence establishes;
9. exposes missing evidence;
10. identifies what would settle unresolved questions;
11. where appropriate, converts a missing public record into an actionable Access to Information request.

The system does not determine what a citizen should believe.

It reconstructs what a civic claim is standing on.

---

# 2. Architectural Thesis

The canonical state of an X-Ray investigation is **not generated prose**.

It is a versioned evidence graph composed of structured artifacts.

```text
Surface Source
      │
      ▼
    Claims
      │
      ▼
 Evidence Requirements
      │
      ▼
    Evidence ◄──────── Sources
      │                  │
      │             Provenance
      │                  │
      ├──────── Source Dependencies
      │
      ▼
 Discrepancies
      │
      ▼
Disconfirmation
      │
      ▼
   Findings
      │
      ▼
     Gaps
      │
      ▼
Resolution Paths
      │
      ├── PUBLIC_RECORD_REQUEST ──► ATI Draft
      ├── WAIT_FOR_RECORD
      ├── FIELD_VERIFICATION
      ├── DATASET_QUERY
      ├── SOURCE_CLARIFICATION
      ├── EXPERT_INTERPRETATION
      └── OTHER
```

Citizen-facing synthesis is a **projection of this graph**.

It MUST NOT become the canonical research record.

---

# 3. Evidence from XRAY-KE-001

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

# 4. System Invariants

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

# 5. Core Domain Model

## 5.1 Investigation

```ts
interface Investigation {
  id: string;
  protocolVersion: string;

  status:
    | "CREATED"
    | "RUNNING"
    | "RESEARCH_COMPLETE"
    | "SYNTHESIZED"
    | "PUBLISHED"
    | "FAILED";

  surfaceSourceId: string;

  focus?: string;

  createdAt: string;
  researchCutoffAt?: string;
  completedAt?: string;

  currentVersion: number;

  stageRuns: StageRun[];

  claimIds: string[];
  sourceIds: string[];
  evidenceIds: string[];
  discrepancyIds: string[];
  disconfirmationIds: string[];
  findingIds: string[];
  gapIds: string[];
}
```

---

# 6. Claim Model

```ts
type ClaimLayer =
  | "OBSERVATION"
  | "INTERPRETATION"
  | "MEANING";

type ClaimOrigin =
  | "SURFACE"
  | "DISCOVERED";

interface Claim {
  id: string;
  investigationId: string;

  origin: ClaimOrigin;

  text: string;

  sourcePassage?: string;

  layer: ClaimLayer;

  type:
    | "QUANTITATIVE"
    | "FINANCIAL"
    | "GEOGRAPHIC"
    | "DELIVERY"
    | "TIMELINE"
    | "ATTRIBUTION"
    | "LEGAL"
    | "OTHER";

  priority:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  entities: string[];

  ambiguities: string[];

  measurement?: Measurement;

  timeScope?: TimeScope;
}
```

---

# 7. Measurement Model

Measurement compatibility is a first-class system concept.

```ts
interface Measurement {
  metric?: string;

  value?: number;
  unit?: string;

  denominator?: string;

  scope?: string;

  definition?: string;
}
```

Example A:

```json
{
  "metric": "physical_project_completion",
  "value": 28,
  "unit": "percent",
  "denominator": "contractual_work",
  "scope": "three-lot project"
}
```

Example B:

```json
{
  "metric": "surfaced_length",
  "unit": "percent",
  "denominator": "mainline_length",
  "scope": "Mamboleo-Kipsitet main carriageway"
}
```

These measurements are not automatically compatible.

---

# 8. Source Model

```ts
interface Source {
  id: string;

  title: string;
  publisher?: string;
  institution?: string;
  author?: string;

  url?: string;

  publishedAt?: string;
  retrievedAt: string;

  sourceType:
    | "LEGISLATION"
    | "GAZETTE"
    | "PROCUREMENT_RECORD"
    | "CONTRACT"
    | "BUDGET"
    | "AUDIT"
    | "PARLIAMENTARY_RECORD"
    | "COURT_RECORD"
    | "OFFICIAL_REPORT"
    | "OFFICIAL_STATEMENT"
    | "DATASET"
    | "NEWS"
    | "CONTRACTOR_RECORD"
    | "OTHER";

  evidenceClass:
    | "PRIMARY"
    | "PRIMARY_ADJACENT"
    | "ATTRIBUTED_ORIGIN_NOT_RETRIEVED"
    | "SECONDARY"
    | "TERTIARY";

  originStatus:
    | "ORIGINATING"
    | "REPEATING"
    | "UNKNOWN";

  accessibility:
    | "RETRIEVED"
    | "PARTIAL"
    | "NOT_RETRIEVED"
    | "DEAD_LINK";

  contentHash?: string;
}
```

---

# 9. Source Dependency

Source provenance is represented as graph edges.

```ts
interface SourceDependency {
  id: string;

  sourceId: string;
  dependsOnSourceId?: string;

  originDescription?: string;

  relationship:
    | "REPRODUCES"
    | "QUOTES"
    | "ATTRIBUTES_TO"
    | "DERIVED_FROM"
    | "SAME_EVENT"
    | "PROBABLE_COMMON_ORIGIN"
    | "UNKNOWN";

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";
}
```

This prevents repetition from becoming false corroboration.

---

# 10. Evidence Model

A Source is not Evidence.

Evidence is the material proposition extracted from a Source and connected to Claims.

```ts
interface Evidence {
  id: string;

  sourceId: string;

  proposition: string;

  relationship:
    | "SUPPORTS"
    | "CHALLENGES"
    | "CONTRADICTS"
    | "CONTEXTUALIZES";

  claimIds: string[];

  strength:
    | "DIRECT"
    | "STRONG_INDIRECT"
    | "CONTEXTUAL"
    | "WEAK";

  measurement?: Measurement;

  quotedPassage?: string;

  locationInSource?: string;
}
```

This distinction is important:

```text
Source
   │
   ├── Evidence A ──supports────► C001
   │
   ├── Evidence B ──challenges──► C002
   │
   └── Evidence C ──context─────► C005
```

---

# 11. Discrepancy Model

```ts
interface Discrepancy {
  id: string;

  claimIds: string[];
  evidenceIds: string[];

  description: string;

  classification:
    | "DIFFERENT_DATE"
    | "DIFFERENT_SCOPE"
    | "DIFFERENT_DEFINITION"
    | "DIFFERENT_PHASE"
    | "DIFFERENT_UNIT"
    | "REVISED_VALUE"
    | "GENUINE_CONTRADICTION"
    | "PROBABLE_SOURCE_ERROR"
    | "UNRESOLVED";

  reconciliation?: string;

  resolved: boolean;
}
```

The engine MUST attempt classification before permitting `GENUINE_CONTRADICTION`.

---

# 12. Disconfirmation Model

```ts
interface Disconfirmation {
  id: string;

  claimId: string;

  preliminaryHypothesis: string;
  counterHypothesis: string;

  searchStrategy: string[];

  strongestSupportingEvidenceIds: string[];
  strongestOpposingEvidenceIds: string[];

  result:
    | "SURVIVED"
    | "SURVIVED_WEAKENED"
    | "CHANGED"
    | "FAILED"
    | "UNRESOLVED";

  effectOnFinding: string;
}
```

Disconfirmation is a pipeline stage, not a prose instruction.

A load-bearing claim cannot graduate without a disconfirmation record.

---

# 13. Finding Model

```ts
type FindingStatus =
  | "ESTABLISHED"
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "CONTESTED"
  | "CONTRADICTED"
  | "UNRESOLVED"
  | "INSUFFICIENT_EVIDENCE";

interface Finding {
  id: string;

  claimId: string;

  status: FindingStatus;

  confidence:
    | "HIGH"
    | "MEDIUM"
    | "LOW";

  rationale: string;

  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];

  discrepancyIds: string[];
  gapIds: string[];

  wouldChangeFinding: string[];

  gradedAt: string;
}
```

---

# 14. Gap Model

```ts
type ResolutionPath =
  | "PUBLIC_RECORD_REQUEST"
  | "WAIT_FOR_RECORD"
  | "FIELD_VERIFICATION"
  | "SOURCE_CLARIFICATION"
  | "DATASET_QUERY"
  | "EXPERT_INTERPRETATION"
  | "OTHER";

interface Gap {
  id: string;

  claimIds: string[];

  missingEvidence: string;

  whyItMatters: string;

  resolvingEvidence: string[];

  likelyHolder?: {
    institution: string;
    office?: string;
  };

  searchAlreadyAttempted: string[];

  status:
    | "OPEN"
    | "REQUESTED"
    | "RECEIVED"
    | "RESOLVED"
    | "UNRESOLVABLE";

  effectOnFinding: string;

  resolutionPath: ResolutionPath;

  atiEligible: boolean;
}
```

Invariant:

```text
atiEligible =
resolutionPath === PUBLIC_RECORD_REQUEST
```

---

# 15. ATI Request

```ts
interface ATIRequest {
  id: string;

  gapId: string;

  jurisdiction: "KE";

  holdingInstitution: string;

  requestedRecords: string[];

  publicInterestContext: string;

  investigationUrl?: string;

  status:
    | "DRAFT"
    | "EXPORTED"
    | "SUBMITTED"
    | "ACKNOWLEDGED"
    | "RESPONDED"
    | "CLOSED";

  draftedAt: string;
  submittedAt?: string;
  respondedAt?: string;

  receivedSourceIds: string[];
}
```

ATI generation occurs after evidence grading.

The language model MAY draft the request.

The language model MUST NOT invent the name of a record the Gap Ledger has not established or reasonably described.

---

# 16. Pipeline Architecture

```text
                    ┌─────────────┐
                    │    INPUT    │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │   INGEST    │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │ DECOMPOSE   │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │  CLASSIFY   │
                    └──────┬──────┘
                           ▼
                    ┌─────────────┐
                    │    PLAN     │
                    └──────┬──────┘
                           ▼
                  ┌─────────────────┐
                  │      TRACE      │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │   PROVENANCE    │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │  DISCONFIRM     │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │   RECONCILE     │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │      GRADE      │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │      GAPS       │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │    VALIDATE     │
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │     PERSIST     │
                  └────────┬────────┘
                           │
               ┌───────────┴──────────┐
               ▼                      ▼
        ┌──────────────┐       ┌──────────────┐
        │  SYNTHESIZE  │       │    RESOLVE   │
        └──────────────┘       └───────┬──────┘
                                       ▼
                                  ATI / OTHER
```

Stages 1–9 generate canonical research state.

Synthesis and Action are downstream consumers.

---

# 17. Stage Contract

Every stage execution is persisted.

```ts
interface StageRun {
  id: string;

  investigationId: string;

  stage:
    | "INGEST"
    | "DECOMPOSE"
    | "CLASSIFY"
    | "PLAN"
    | "TRACE"
    | "PROVENANCE"
    | "DISCONFIRM"
    | "RECONCILE"
    | "GRADE"
    | "GAPS"
    | "VALIDATE"
    | "SYNTHESIZE"
    | "RESOLVE";

  status:
    | "PENDING"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED";

  inputArtifactVersion: number;

  outputArtifactVersion?: number;

  model?: string;

  startedAt?: string;
  completedAt?: string;

  error?: string;
}
```

This permits stage-level retries.

TRACE failure does not require DECOMPOSE to rerun.

---

# 18. Validation Layer

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

# 19. Research Saturation

Research MUST NOT stop merely because the model says it is finished.

A run may graduate when:

```text
materialClaimsDecomposed = true

AND

loadBearingClaimsHaveOriginTracing = true

AND

loadBearingClaimsHaveDisconfirmation = true

AND

materialDiscrepanciesClassified = true

AND

materialClaimsGraded = true

AND

unresolvedMaterialClaimsHaveGaps = true

AND

noNewHighPriorityLeadDiscoveredWithinBudget = true
```

The last condition is budget-aware rather than pretending research can be exhaustive.

The engine records why it stopped.

```ts
interface ResearchStop {
  reason:
    | "SATURATION"
    | "TIME_BUDGET"
    | "SOURCE_EXHAUSTION"
    | "COST_BUDGET"
    | "MANUAL_STOP"
    | "ERROR";

  unresolvedHighPriorityLeads: string[];
}
```

---

# 20. Runtime Architecture

For V1:

```text
┌──────────────────────────────────────┐
│               WEB                    │
│                                      │
│ Next.js                              │
│                                      │
│ URL input                            │
│ investigation progress               │
│ evidence graph                       │
│ gap cards                            │
│ ATI draft                            │
│ cached/public X-Ray                  │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│             X-RAY API                │
│                                      │
│ investigation lifecycle              │
│ pipeline orchestration               │
│ validation                           │
│ persistence                          │
└───────┬──────────────────────┬───────┘
        │                      │
        ▼                      ▼
┌───────────────┐       ┌───────────────┐
│ MODEL ADAPTER │       │SEARCH/RESEARCH│
│               │       │    ADAPTER    │
│ GPT initially │       │               │
└───────┬───────┘       └───────┬───────┘
        │                       │
        └───────────┬───────────┘
                    ▼
          ┌──────────────────┐
          │   PostgreSQL     │
          │                  │
          │ investigations   │
          │ claims           │
          │ sources          │
          │ evidence         │
          │ source_edges     │
          │ discrepancies    │
          │ disconfirmation  │
          │ findings         │
          │ gaps             │
          │ ati_requests     │
          │ stage_runs       │
          └──────────────────┘
```

No graph database is required for V1.

No microservices are required.

No message broker is required.

No multi-model orchestration is required.

---

# 21. Model Boundary

X-Ray methodology is model-agnostic.

X-Ray V1 runtime does not need to be multi-model.

```ts
interface ResearchModel {
  decompose(input: DecomposeInput): Promise<Claim[]>;
  classify(input: ClassifyInput): Promise<ClassifiedClaim[]>;
  plan(input: PlanInput): Promise<ResearchPlan>;
  trace(input: TraceInput): Promise<TraceResult>;
  disconfirm(input: DisconfirmInput): Promise<Disconfirmation>;
  reconcile(input: ReconcileInput): Promise<Discrepancy[]>;
  grade(input: GradeInput): Promise<Finding[]>;
  identifyGaps(input: GapInput): Promise<Gap[]>;
}
```

Provider-specific logic lives behind the adapter.

---

# 22. Investigation Versioning

Completed investigations are immutable snapshots.

```text
XRAY-KE-001
│
├── v1
│    ├── evidence
│    ├── findings
│    └── gaps
│
├── new source received
│
▼
v2
     ├── inherited receipts
     ├── new receipt
     ├── affected claims re-evaluated
     ├── updated findings
     └── resolved/open gaps
```

The graph therefore accumulates evidence instead of overwriting history.

This is the implementation meaning of:

> **Verdicts expire. Receipts compound.**

---

# 23. Cached Public Investigation

A published X-Ray is identified by a stable public slug.

```text
/xray/ke/mamboleo-miwani-road
```

The latest version is served by default.

Historical versions remain addressable.

The cached representation contains:

- source claim;
- claim tree;
- findings;
- receipts;
- source provenance;
- discrepancies;
- gaps;
- what-would-settle-it;
- resolution actions;
- investigation timestamp;
- protocol version.

The public page does not need to rerun research.

---

# 24. Acceptance Fixture Strategy

The two XRAY-KE-001 runs become **architecture acceptance fixtures**, not golden prose outputs.

The system is NOT required to reproduce either report word-for-word.

It MUST reproduce their important epistemic behavior.

Fixture directory:

```text
fixtures/
└── XRAY-KE-001/
    ├── README.md
    ├── input.json
    ├── expected-invariants.json
    ├── expected-core-claims.json
    ├── expected-evidence-patterns.json
    ├── expected-discrepancies.json
    ├── expected-gaps.json
    ├── forbidden-inferences.json
    └── raw/
        ├── claude-run.md
        └── gpt-run.md
```

---

# 25. Fixture Input

```json
{
  "fixture": "XRAY-KE-001",
  "surfaceSource": {
    "publisher": "Citizen Digital",
    "url": "https://citizen.digital/article/inside-rutos-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-n390083"
  },
  "focus": "Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road",
  "researchCutoff": "2026-09-13",
  "protocolBaseline": "0.1.0"
}
```

The research cutoff is important.

The fixture MUST NOT expect post-cutoff evidence.

---

# 26. Core Claim Acceptance Fixture

At minimum the engine must recover independently testable propositions equivalent to:

```json
[
  {
    "semanticKey": "road_length",
    "expectedValue": 63,
    "unit": "km"
  },
  {
    "semanticKey": "project_value",
    "expectedValue": 16.7,
    "unit": "KES_BILLION"
  },
  {
    "semanticKey": "most_sections_tarmacked"
  },
  {
    "semanticKey": "presidential_inspection_scheduled"
  }
]
```

Exact claim IDs and wording are not asserted.

Semantic equivalence is.

---

# 27. Required Reconciliation Fixture

The engine MUST discover that:

```text
63 km

and

122 km
```

are not automatically contradictory.

Acceptance:

```json
{
  "case": "road_length_scope",
  "mustNotClassifyAs": "GENUINE_CONTRADICTION",
  "acceptableClassifications": [
    "DIFFERENT_SCOPE",
    "DIFFERENT_DEFINITION"
  ],
  "requiredConcepts": [
    "main carriageway",
    "feeder or spur roads"
  ]
}
```

Both benchmark runs independently reached this reconciliation.

---

# 28. Financial Discrepancy Fixture

The engine MUST preserve materially different project-value representations rather than silently selecting one.

Expected evidence neighborhood includes approximately:

```text
KSh15.7B
KSh15.87/15.88B
KSh16.385B
KSh16.7B
```

Acceptance:

```json
{
  "case": "project_value",
  "requiredStatus": "UNRESOLVED",
  "forbiddenStatuses": [
    "ESTABLISHED"
  ],
  "mustIdentifyMissingBridge": true
}
```

The engine need not locate every number on every run.

It MUST NOT claim that KSh16.7B has been established unless a primary/revised-cost record actually supports it.

---

# 29. Source Dependency Fixture

Given multiple September publications carrying the same lot progress figures, the engine MUST detect likely common provenance.

Acceptance:

```json
{
  "case": "september_progress_reporting",
  "publicationCountMinimum": 2,
  "independentOriginCountMaximum": 1,
  "mustNotTreatAsIndependentCorroboration": true
}
```

---

# 30. Same-Measure Acceptance Fixture

This is the critical regression fixture introduced by the benchmark disagreement.

Input evidence:

```text
Claim:
Most sections of the road have already been tarmacked.

Evidence:
Lot progress = approximately 20.2%, 34%, 28%.
```

Expected:

```json
{
  "measurementCompatible": false,
  "forbiddenAutomaticFinding": "CONTRADICTED",
  "acceptableFindings": [
    "INSUFFICIENT_EVIDENCE",
    "UNRESOLVED",
    "PARTIALLY_SUPPORTED"
  ],
  "requiredGap": "surfaced kilometres or equivalent direct surfacing measurement"
}
```

A future run MAY legitimately return `CONTRADICTED` only if it retrieves measurement-compatible evidence showing that most relevant road sections were not tarmacked.

The fixture tests reasoning behavior, not a permanently frozen verdict.

---

# 31. Scheduled vs Occurred Fixture

Acceptance:

```json
{
  "case": "presidential_inspection",
  "researchCutoff": "2026-09-13",
  "mayEstablish": "scheduled_or_expected",
  "mustNotEstablish": "occurred"
}
```

The research date precedes the expected inspection.

Future evidence MUST NOT leak into this historical fixture.

---

# 32. Gap Fixture

The engine MUST expose at least the following unresolved evidence needs if they remain unlocated:

```text
derivation/current basis of KSh16.7B

current authoritative mainline vs feeder/spur scope

kilometres actually surfaced/tarmacked

originating recent project-status record

post-event proof of presidential inspection
```

Not every run must phrase them identically.

The semantic gaps must remain representable.

---

# 33. Forbidden Inference Fixture

XRAY-KE-001 MUST fail acceptance if the engine performs any of these transformations without new evidence:

```text
28% project completion
    →
28% of road tarmacked
```

```text
three newspapers repeat figure
    →
three independent confirmations
```

```text
record not located
    →
record does not exist
```

```text
scheduled inspection
    →
inspection occurred
```

```text
KSh15.88B original works contracts
    →
KSh16.7B is false
```

```text
122 km project scope
    →
63 km mainline figure is false
```

These are regression tests for epistemic behavior.

---

# 34. Fixture Evaluation

Acceptance is semantic rather than textual.

```ts
interface FixtureResult {
  structuralPass: boolean;
  invariantPass: boolean;
  semanticPass: boolean;

  violations: FixtureViolation[];
}
```

A model can discover additional legitimate evidence without failing the fixture.

A later model may produce a stronger finding if it retrieves stronger evidence.

Therefore fixtures distinguish:

```text
MUST
MUST NOT
MAY
```

rather than freezing every conclusion.

---

# 35. First Acceptance Suite

```text
XRAY-KE-001-A01
Surface source does not self-prove claims.

XRAY-KE-001-A02
63 km / 122 km undergo scope reconciliation.

XRAY-KE-001-A03
KSh16.7B remains unresolved absent missing bridge.

XRAY-KE-001-A04
Repeated September reports collapse toward common origin.

XRAY-KE-001-A05
Project completion % is not treated as surfaced-length %.

XRAY-KE-001-A06
Scheduled presidential inspection is not converted to occurred event.

XRAY-KE-001-A07
Missing primary record remains an explicit gap.

XRAY-KE-001-A08
Every load-bearing finding records evidence that could change it.

XRAY-KE-001-A09
Discovered claims remain separate from controlled claims.

XRAY-KE-001-A10
No citizen-facing synthesis mutates evidence state.
```

---

# 36. POC Boundary

## Build

- URL ingestion
- claim decomposition
- structured research pipeline
- evidence graph
- provenance/source dependencies
- discrepancies
- disconfirmation
- findings
- gaps
- cached investigation
- evidence graph UI
- what-would-settle-it
- ATI draft for eligible public-record gaps
- XRAY-KE-001 acceptance suite

## Do Not Build

- accounts
- comments
- social network
- generic chatbot
- Kenya map
- What Changed?
- graph database
- microservices
- Kafka
- multi-model orchestration
- automated ATI submission
- broad multilingual infrastructure
- universal speech/video ingestion

---

# 37. Architecture Decisions

### ADR-001 — Evidence Graph Is Canonical State

**Decision:** Store structured evidence graph; generated reports are projections.

### ADR-002 — Pipeline Over Monolithic Agent

**Decision:** Execute research as independently persisted stages.

### ADR-003 — Relational Store First

**Decision:** Use PostgreSQL; graph semantics are represented through IDs and edge tables.

### ADR-004 — Model Behind Adapter

**Decision:** Protocol remains provider-independent while V1 may use one provider.

### ADR-005 — Invariants Outside Prompt

**Decision:** Critical epistemic rules are validated programmatically where feasible.

### ADR-006 — Immutable Investigation Versions

**Decision:** New receipts create new investigation versions rather than rewriting historical state.

### ADR-007 — Gap Is First-Class Product State

**Decision:** Missing evidence is persisted, displayed and potentially actionable.

### ADR-008 — ATI Is a Resolution Adapter

**Decision:** ATI generation is triggered only by gaps classified `PUBLIC_RECORD_REQUEST`.

### ADR-009 — Benchmark Runs Are Acceptance Evidence

**Decision:** Claude/GPT Markdown outputs remain frozen raw benchmark artifacts; acceptance tests target their demonstrated epistemic behavior, not their prose.

---

# 38. Build Order

```text
1. Freeze benchmark inputs/runs
             ↓
2. Protocol v0.2
             ↓
3. TypeScript domain types
             ↓
4. JSON schemas
             ↓
5. Fixture validator
             ↓
6. XRAY-KE-001 acceptance suite
             ↓
7. Pipeline interfaces
             ↓
8. Model adapter
             ↓
9. Research adapter
             ↓
10. Persistence
             ↓
11. Execute XRAY-KE-001
             ↓
12. Make acceptance suite green
             ↓
13. Evidence graph UI
             ↓
14. Cached public X-Ray
             ↓
15. Gap → ATI draft
```

The first end-to-end milestone is not:

> “The website looks good.”

It is:

> **A fresh XRAY-KE-001 run can traverse the pipeline, persist a valid evidence graph, and pass the benchmark-derived acceptance suite.**

Only then is the engine real.

---

# 39. Definition of Done — Engine v0.1

X-Ray Engine v0.1 is complete when:

1. a URL can create an Investigation;
2. claims are persisted independently from prose;
3. sources and extracted evidence are distinct objects;
4. source dependency can represent common origins;
5. discrepancies are reconciled before contradiction;
6. disconfirmation is recorded for load-bearing claims;
7. measurement incompatibility prevents invalid contradiction;
8. findings retain support, challenge, gaps and overturn conditions;
9. missing records remain explicit;
10. eligible gaps can produce an ATI draft;
11. completed investigations can be cached;
12. new evidence can produce a new investigation version;
13. XRAY-KE-001 acceptance fixtures pass;
14. the citizen-facing X-Ray can be generated entirely from canonical structured state.

---

# 40. Architectural North Star

X-Ray is not an AI that tells citizens whether a statement is true.

It is infrastructure for making the chain between a civic claim and its evidence inspectable.

The core loop is:

```text
CLAIM
  ↓
RECEIPTS
  ↓
PROVENANCE
  ↓
CHALLENGE
  ↓
RECONCILIATION
  ↓
WHAT CAN WE ESTABLISH?
  ↓
WHAT CAN'T WE ESTABLISH?
  ↓
WHAT WOULD SETTLE IT?
  ↓
ACT
```

And the long-term compounding loop is:

```text
INVESTIGATE
     ↓
PUBLISH X-RAY
     ↓
CACHE RECEIPTS
     ↓
EXPOSE GAP
     ↓
REQUEST RECORD
     ↓
NEW RECEIPT
     ↓
UPDATE GRAPH
     ↓
BETTER X-RAY
```

**Verdicts expire. Receipts compound.**