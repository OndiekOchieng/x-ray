/**
 * Authored instructions and declared answer shapes (#20 slice 20b).
 *
 * WHY PROMPTS LIVE HERE AND NOWHERE ELSE
 * ======================================
 * A prompt is an implementation detail of one provider. It is not an X-Ray
 * artifact, it never enters canonical graph state (#20 boundary 7), and no
 * stage, projection or persistence path can reach it — this module is imported
 * only by the two adapters. Keeping every instruction in one file is also what
 * makes "the protocol defines the method, not an ad-hoc instruction" auditable:
 * there is one place to read to know what was asked.
 *
 * WHAT THE INSTRUCTIONS MAY AND MAY NOT SAY
 * =========================================
 * They may explain the vocabulary and ask for judgment. They may not ask for
 * anything the architecture assigns to a stage — evidence provenance, source
 * independence, ATI eligibility, canonical identity. The tool schemas below
 * are the enforcement: a field that is not in the schema cannot be requested,
 * and `decode.ts` ignores it even if it arrives.
 *
 * `VOCABULARY` is imported rather than restated, so a domain union and the
 * instruction describing it cannot drift.
 *
 * PURITY: strings and schemas. No I/O, no SDK, no domain logic.
 */

import { VOCABULARY } from './decode'
import type { ToolSchema } from './transport'

/** The standing instruction every operation carries. */
const HOUSE_RULES = `
You are a research assistant inside X-Ray, a civic evidence engine. You
propose; X-Ray decides. Follow these rules exactly.

WHAT YOU MAY AND MAY NOT DO
- You may read the material given to you and propose structured judgments.
- You must not invent material. If the given material does not support an
  answer, return an empty list. An empty list is a correct, useful answer and
  is preferred over a speculative one.
- You must not claim that a record does not exist. Not finding something means
  it was not located, which is a different fact.
- You must not decide which record originated an assertion, whether two
  publications are independent, or whether a gap can be answered by an
  access-to-information request. Those are X-Ray's decisions, not yours.

HANDLES
- Material is labelled with handles like "ref:c1". When you refer to something,
  use exactly the handle given. Never invent a handle, never modify one, and
  never refer to anything you were not shown.

CITATION
- Every proposition you propose must be traceable to the material provided. If
  you quote, quote verbatim from the given text.
`.trim()

const list = (values: readonly string[]): string => values.join(' | ')

// ---------------------------------------------------------------------------
// Reusable schema fragments
// ---------------------------------------------------------------------------

const handle = (what: string) => ({
  type: 'string',
  description: `A handle exactly as given, e.g. "ref:c1". ${what}`,
})

const handles = (what: string) => ({ type: 'array', items: handle(what) })

const strings = (what: string) => ({ type: 'array', items: { type: 'string' }, description: what })

const enumOf = (values: readonly string[], description: string) => ({
  type: 'string', enum: [...values], description,
})

/**
 * An object schema, always closed.
 *
 * `additionalProperties: false` is required on **every** object in the strict
 * subset — a nested item schema inside an array is an object too. Authoring
 * every object through one helper is what stops the twenty-ninth one being
 * forgotten; `strict-schema.ts` still audits the result, because a helper
 * nobody used would be no guard at all.
 */
const obj = (
  properties: Readonly<Record<string, unknown>>,
  extra: Readonly<Record<string, unknown>> = {},
) => ({ type: 'object', properties, ...extra, additionalProperties: false })

const MEASUREMENT = obj({
  metric: { type: 'string' },
  value: { type: 'number' },
  unit: { type: 'string' },
  denominator: { type: 'string', description: 'What the value is a proportion of.' },
  scope: { type: 'string' },
}, { description: 'Present only if the text states a measurement. Omit otherwise.' })

const TIME_SCOPE = obj({
  from: { type: 'string' },
  to: { type: 'string' },
  asOf: { type: 'string' },
  description: { type: 'string', description: 'Use when the wording cannot be reduced to dates.' },
}, { description: 'The period the statement covers. Dates must be ISO 8601 (YYYY-MM-DD).' })

const CLAIM_FIELDS = {
  text: { type: 'string', description: 'The single assertion, stated plainly.' },
  sourcePassage: { type: 'string', description: 'The passage it was read from, verbatim.' },
  layer: enumOf(VOCABULARY.claimLayer,
    'OBSERVATION: directly observable. INTERPRETATION: a reading of observations. '
    + 'MEANING: significance attributed to them.'),
  type: enumOf(VOCABULARY.claimType, 'Subject matter of the assertion.'),
  priority: enumOf(VOCABULARY.rank, 'How much the investigation turns on it.'),
  entities: strings('Named people, institutions or places in the assertion.'),
  ambiguities: strings('What is unclear or underspecified in the wording.'),
  measurement: MEASUREMENT,
  timeScope: TIME_SCOPE,
}

// ---------------------------------------------------------------------------
// One instruction and one schema per operation
// ---------------------------------------------------------------------------

export interface OperationPrompt {
  readonly system: string
  readonly tool: ToolSchema
  readonly maxTokens: number
}

const prompt = (
  task: string, tool: ToolSchema, maxTokens: number,
): OperationPrompt => ({ system: `${HOUSE_RULES}\n\nTASK\n${task.trim()}`, tool, maxTokens })

export const DECOMPOSE: OperationPrompt = prompt(
  `
Break the given record into atomic claims. An atomic claim states one thing
that could be checked on its own; if a sentence asserts two things, produce two
claims. Do not produce claims the record does not make. Do not merge, soften or
extend what it says.
`,
  {
    name: 'propose_claims',
    description: 'The atomic claims the record makes.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        claims: {
          type: 'array',
          items: obj(CLAIM_FIELDS, { required: ['text'] }),
        },
      },
      required: ['claims'],
    },
  },
  8_000,
)

export const CLASSIFY: OperationPrompt = prompt(
  `
Classify each claim you are given. Answer for every claim, using its handle.
Layer is the important one: an OBSERVATION asserts something observable, an
INTERPRETATION reads meaning into observations, and MEANING attributes
significance. A claim that looks factual but rests on a reading is an
INTERPRETATION.
`,
  {
    name: 'propose_classifications',
    description: 'A classification for each claim offered.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        classifications: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claimRef: handle('The claim being classified.'),
              layer: CLAIM_FIELDS.layer,
              type: CLAIM_FIELDS.type,
              priority: CLAIM_FIELDS.priority,
              entities: CLAIM_FIELDS.entities,
              ambiguities: CLAIM_FIELDS.ambiguities,
              measurement: MEASUREMENT,
              timeScope: TIME_SCOPE,
            },
            required: ['claimRef', 'layer', 'type', 'priority'],
          },
        },
      },
      required: ['classifications'],
    },
  },
  8_000,
)

export const TRACE: OperationPrompt = prompt(
  `
You are given one claim and the documents that were actually retrieved for it.
Propose the propositions those documents establish about the claim.

Every proposition must come from a document you were given, named by its
handle. Do not propose a proposition from a document with no content — a record
that was identified but not obtained supports nothing yet.

You may also report claims the documents make that the original record did not,
and further searches worth running. You may describe a source's position
relative to the claim (for example, that it is the subject or the regulator)
where the document shows it.

You may not state where a document's information originally came from, or
whether two documents are independent of each other. X-Ray decides that.
`,
  {
    name: 'propose_trace',
    description: 'Propositions, discovered claims and further searches.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        evidence: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceRef: handle('The document this came from.'),
              proposition: { type: 'string', description: 'What the document establishes.' },
              relationship: enumOf(VOCABULARY.evidenceRelationship,
                'How it bears on the claim.'),
              strength: enumOf(VOCABULARY.evidenceStrength,
                'DIRECT: addresses the claim itself. STRONG_INDIRECT: bears on it closely. '
                + 'CONTEXTUAL: background. WEAK: little probative force.'),
              knowledgeBasis: enumOf(VOCABULARY.knowledgeBasis,
                'How the document knows what it states.'),
              claimRefs: handles('Claims this bears on. At least one.'),
              quotedPassage: { type: 'string', description: 'Verbatim, if quoting.' },
              locationInSource: { type: 'string' },
              measurement: MEASUREMENT,
              timeScope: TIME_SCOPE,
            },
            required: ['sourceRef', 'proposition', 'relationship', 'strength', 'claimRefs'],
          },
        },
        discoveredClaims: {
          type: 'array',
          description: 'Claims the retrieved documents make that the original record did not.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { ...CLAIM_FIELDS, sourceRef: handle('The document it surfaced from.') },
            required: ['text', 'sourceRef'],
          },
        },
        sourcePositions: {
          type: 'array',
          description: "A source's position relative to the claim, where the document shows it.",
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceRef: handle('The document whose position this is.'),
              claimRefs: handles('Claims the position bears on.'),
              relationship: enumOf(VOCABULARY.positionRelationship,
                'The position this source occupies relative to the claim.'),
              relationshipDescription: { type: 'string' },
              powerOrDependency: strings(
                'Power or dependency relations the document shows, if any.'),
              productionPurpose: { type: 'string', description: 'Why the document was produced.' },
              basis: enumOf(VOCABULARY.positionBasis,
                'DOCUMENTED: the document states it. INFERRED: you are reading it off context.'),
              confidence: enumOf(VOCABULARY.rank, 'Your confidence in the position.'),
              basisDescription: { type: 'string' },
              supportingEvidenceRefs: handles('Evidence supporting the position, if offered.'),
              timeScope: TIME_SCOPE,
            },
            required: ['sourceRef', 'claimRefs', 'relationship', 'powerOrDependency',
              'basis', 'confidence'],
          },
        },
        suggestedQueries: {
          type: 'array',
          description: 'Further searches worth running. Advisory.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { terms: { type: 'string' }, constraints: strings('Narrowing to apply.') },
            required: ['terms'],
          },
        },
      },
      required: ['evidence', 'discoveredClaims'],
    },
  },
  12_000,
)

export const DISCONFIRM: OperationPrompt = prompt(
  `
Try to break the claim. State the hypothesis the evidence supports, then state
the strongest counter-hypothesis you can construct from the same evidence, and
say honestly which survived.

A claim that survives a weak attempt has not been tested. Name what you would
have needed in order to overturn it, and whether you had it.
`,
  {
    name: 'propose_disconfirmation',
    description: 'A disconfirmation attempt per claim.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        disconfirmations: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claimRef: handle('The claim tested.'),
              preliminaryHypothesis: { type: 'string' },
              counterHypothesis: { type: 'string', description: 'The strongest opposing reading.' },
              searchStrategy: strings('What you would search to test it further.'),
              strongestSupportingEvidenceRefs: handles('The strongest support offered.'),
              strongestOpposingEvidenceRefs: handles('The strongest opposition offered.'),
              result: enumOf(VOCABULARY.disconfirmationResult, 'What happened to the claim.'),
              effectOnFinding: { type: 'string', description: 'What this means for the finding.' },
            },
            required: ['claimRef', 'preliminaryHypothesis', 'counterHypothesis', 'result',
              'effectOnFinding'],
          },
        },
      },
      required: ['disconfirmations'],
    },
  },
  8_000,
)

export const RECONCILE: OperationPrompt = prompt(
  `
Find genuine discrepancies among the evidence you are given, and classify each.

Most apparent contradictions are not contradictions: two figures can differ
because they cover different dates, scopes, definitions, phases or units, or
because one is a revision of the other. Say which. Reserve
GENUINE_CONTRADICTION for evidence that cannot both be true as stated.
`,
  {
    name: 'propose_discrepancies',
    description: 'Discrepancies among the evidence, classified.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        discrepancies: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claimRefs: handles('Claims the discrepancy bears on.'),
              evidenceRefs: handles('The conflicting evidence.'),
              description: { type: 'string' },
              classification: enumOf(VOCABULARY.discrepancyClassification,
                'Why the evidence differs.'),
              reconciliation: { type: 'string', description: 'How it reconciles, if it does.' },
              resolvedCandidate: {
                type: 'boolean',
                description: 'True only if the reconciliation actually resolves it.',
              },
            },
            required: ['claimRefs', 'evidenceRefs', 'description', 'classification',
              'resolvedCandidate'],
          },
        },
      },
      required: ['discrepancies'],
    },
  },
  8_000,
)

export const GRADE: OperationPrompt = prompt(
  `
Grade the claim against the evidence you were given, and nothing else.

The grade must follow from the evidence offered. ESTABLISHED requires direct
evidence that addresses the claim itself; evidence that merely points in the
claim's direction is SUPPORTED or PARTIALLY_SUPPORTED. If the evidence does not
reach the claim, say INSUFFICIENT_EVIDENCE — that is a real finding, not a
failure.

State what would change the finding. This is required and must be specific: if
nothing you can name would change it, the grade is too strong.
`,
  {
    name: 'propose_findings',
    description: 'A graded finding per claim.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claimRef: handle('The claim graded.'),
              status: enumOf(VOCABULARY.findingStatus, 'The grade.'),
              confidence: enumOf(VOCABULARY.rank, 'Confidence in the grade.'),
              rationale: { type: 'string', description: 'Why the evidence supports this grade.' },
              supportingEvidenceRefs: handles('Evidence supporting the claim.'),
              challengingEvidenceRefs: handles('Evidence against it.'),
              contextualEvidenceRefs: handles('Background evidence.'),
              discrepancyRefs: handles('Discrepancies bearing on the grade.'),
              wouldChangeFinding: strings(
                'Specific things that would change this finding. At least one; required.'),
            },
            required: ['claimRef', 'status', 'confidence', 'rationale', 'wouldChangeFinding'],
          },
        },
      },
      required: ['findings'],
    },
  },
  8_000,
)

export const IDENTIFY_GAPS: OperationPrompt = prompt(
  `
Say what is missing. A gap is a specific record or measurement whose absence
limits what can be concluded — not a general wish for more information.

For each gap, name what would resolve it, who is likely to hold it, and say
whether that custody is CONFIRMED by something you were shown or merely
INFERRED. Do not state that a gap can be resolved by an information request;
describe the route and X-Ray will decide.

Do not repeat gaps already recorded.
`,
  {
    name: 'propose_gaps',
    description: 'Evidence gaps limiting the investigation.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        gaps: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              claimRefs: handles('Claims the gap limits.'),
              missingEvidence: { type: 'string', description: 'The specific record missing.' },
              whyItMatters: { type: 'string' },
              resolvingEvidence: strings('What would actually resolve it.'),
              likelyHolder: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  institution: { type: 'string' },
                  office: { type: 'string' },
                  basis: enumOf(VOCABULARY.custodyBasis,
                    'CONFIRMED only if the material shows this holder. Otherwise INFERRED.'),
                },
                required: ['institution', 'basis'],
              },
              searchAlreadyAttempted: strings('Where the investigation already looked.'),
              status: enumOf(VOCABULARY.gapStatus, 'Current state of the gap.'),
              effectOnFinding: { type: 'string' },
              resolutionPath: enumOf(VOCABULARY.resolutionPath, 'The route to resolution.'),
              identifiers: strings('Record numbers or identifiers that would locate it.'),
            },
            required: ['claimRefs', 'missingEvidence', 'whyItMatters', 'status',
              'effectOnFinding', 'resolutionPath'],
          },
        },
      },
      required: ['gaps'],
    },
  },
  8_000,
)

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * One reviewer instruction per query kind.
 *
 * Each states the question the calibration corpus asks, not a general
 * invitation to critique — the corpus defines what review means, and a
 * free-form "review this graph" instruction would quietly replace it.
 */
export const REVIEW_TASKS: Readonly<Record<string, string>> = {
  CLAIM_ATOMICITY:
    'Does this claim assert exactly one thing that could be checked on its own? '
    + 'Flag it if it bundles two assertions, or if checking it would require '
    + 'settling more than one question.',
  CROSS_LAYER_INFERENCE:
    'The claim sits at one epistemic layer. Does the finding treat evidence from a '
    + 'different layer as though it settled this one — for example, using a '
    + "participant's account to establish an observable fact? Flag it if so.",
  SEMANTIC_MEASUREMENT_COMPATIBILITY:
    'Do the claim and the evidence measure the same thing? Flag a silent unit '
    + 'conversion, a changed denominator, a different scope, or a different phase '
    + 'presented as the same measurement.',
  REVERSIBILITY_ADEQUACY:
    'Would the stated conditions actually overturn this finding if they occurred? '
    + 'Flag conditions that are unfalsifiable, trivially unlikely, or that would '
    + 'leave the finding standing.',
  RHETORICAL_OVERCLAIM:
    "Does the finding's language assert more than its evidence and grade support? "
    + 'Flag confident phrasing on a contested or partially supported finding.',
  EVIDENTIARY_REACH:
    'Does the evidence actually reach the claim as stated, given the sources and '
    + 'their positions? Flag evidence that establishes something narrower, or that '
    + "reaches the claim only through a source's own characterization of itself.",
}

export const REVIEW_TOOL: ToolSchema = {
  name: 'answer_review_question',
  description: 'One calibrated judgment about the material given.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      flagged: {
        type: 'boolean',
        description: 'True only if the state is genuinely suspect. False is the common answer.',
      },
      severity: enumOf(VOCABULARY.reviewSeverity,
        'BLOCKING: the graph should go back to a stage. ADVISORY: worth a human eye.'),
      rationale: { type: 'string', description: 'Why, in specific terms.' },
      requiredAction: { type: 'string', description: 'What should be done about it.' },
      targets: {
        type: 'array',
        description: 'The artifacts this concerns, by the ids given to you. Never invent an id.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: enumOf(VOCABULARY.reviewTargetKind, 'What sort of artifact.'),
            id: { type: 'string', description: 'Exactly as given.' },
          },
          required: ['kind', 'id'],
        },
      },
    },
    required: ['flagged', 'severity', 'rationale', 'requiredAction', 'targets'],
  },
}

export const REVIEW_SYSTEM = `${HOUSE_RULES}

TASK
You are answering one calibrated review question about material that has
already passed structural validation. You are not looking for anything you were
not asked about. Answer the question put to you, and flag only what genuinely
warrants it: a reviewer that flags everything is as useless as one that flags
nothing.`

export const REVIEW_MAX_TOKENS = 4_000
