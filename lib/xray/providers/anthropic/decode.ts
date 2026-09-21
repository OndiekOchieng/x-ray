/**
 * Validating provider output into proposals (#20 slice 20b).
 *
 * WHY THIS FILE IS THE POINT OF THE SLICE
 * =======================================
 * A declared tool schema is a request, not a guarantee. What actually arrives
 * is `unknown`, and between `unknown` and a typed proposal sits every boundary
 * #20 cares about:
 *
 *   - a proposal may carry judgment, never canonical identity (#20 boundary 2);
 *   - a proposal may reference only handles the stage issued, so a provider
 *     cannot mint a cross-reference or address an artifact it was not shown;
 *   - a field ADR-0010 assigns to a stage — evidence provenance, source
 *     independence, ATI eligibility — has no way in, because no decoder reads
 *     one (#20 boundary 3);
 *   - a raw envelope, prompt, request id or token count never becomes part of
 *     a proposal (#20 boundary 7), because a proposal is built field by field
 *     from validated values and nothing is passed through wholesale.
 *
 * The last point is why nothing the provider sent is ever spread into a
 * proposal. Every field is read by name from the raw object; copying that
 * object wholesale is how an unexpected key travels. The spreads that do
 * appear below are over values this file has already validated — `opt(...)`
 * and `claimFields(...)` — never over provider data.
 *
 * WHAT A REJECTION IS
 * ===================
 * A `PERMANENT` `AdapterFailure`. `capability.ts` argues the case already:
 * retrying a malformed response five times produces five malformed responses
 * and a longer journal. A rejection names the path and the reason, never the
 * material — and truncates any quoted token, because a provider can put
 * anything in a string.
 *
 * PURITY: no I/O, no SDK, no prompt text, no clock.
 */

import { AdapterFailure } from '@/lib/xray/capability'
import type {
  ClaimLayer, ClaimType, Confidence, CustodyBasis, DisconfirmationResult,
  DiscrepancyClassification, EvidenceRelationship, EvidenceStrength, FindingStatus,
  GapStatus, KnowledgeBasis, LikelyHolder, Measurement, Priority, ResolutionPath,
  SourcePositionBasis, SourcePositionRelationship, TimeScope,
} from '@/lib/xray/domain'
import type {
  ClaimClassificationProposal, ClaimProposal, DisconfirmationProposal,
  DiscoveredClaimProposal, DiscrepancyProposal, EvidenceProposal, FindingProposal,
  GapProposal, ProposalRef, SourcePositionProposal,
} from '@/lib/xray/pipeline/proposals'
import type { ModelJudgment } from '@/lib/xray/review'
import type { ReviewSeverity, ReviewTarget, ReviewTargetKind } from '@/lib/xray/review'

// ---------------------------------------------------------------------------
// The vocabularies, kept from drifting by the compiler
// ---------------------------------------------------------------------------

/*
 * The domain declares these as type-only unions, so a runtime validator has to
 * restate the members. `satisfies` plus an exhaustiveness guard makes that
 * restatement checked in both directions: a member the domain adds and this
 * file misses is a compile error, and a member this file invents is too.
 */

const CLAIM_LAYERS = ['OBSERVATION', 'INTERPRETATION', 'MEANING'] as const
const CLAIM_TYPES = ['QUANTITATIVE', 'FINANCIAL', 'GEOGRAPHIC', 'DELIVERY', 'TIMELINE',
  'ATTRIBUTION', 'LEGAL', 'OTHER'] as const
const RANKS = ['HIGH', 'MEDIUM', 'LOW'] as const
const EVIDENCE_RELATIONSHIPS = ['SUPPORTS', 'CHALLENGES', 'CONTRADICTS', 'CONTEXTUALIZES'] as const
const EVIDENCE_STRENGTHS = ['DIRECT', 'STRONG_INDIRECT', 'CONTEXTUAL', 'WEAK'] as const
const KNOWLEDGE_BASES = ['DIRECT_OBSERVATION', 'SELF_REPORT', 'PARTICIPANT_ACCOUNT',
  'MEASUREMENT', 'ADMINISTRATIVE_RECORD', 'INSTITUTIONAL_CHARACTERIZATION',
  'ATTRIBUTED_SOURCE', 'EXPERT_INTERPRETATION', 'SECONDARY_SYNTHESIS', 'INFERENCE',
  'UNKNOWN'] as const
const FINDING_STATUSES = ['ESTABLISHED', 'SUPPORTED', 'PARTIALLY_SUPPORTED', 'CONTESTED',
  'CONTRADICTED', 'UNRESOLVED', 'INSUFFICIENT_EVIDENCE'] as const
const GAP_STATUSES = ['OPEN', 'REQUESTED', 'RECEIVED', 'RESOLVED', 'UNRESOLVABLE'] as const
const RESOLUTION_PATHS = ['PUBLIC_RECORD_REQUEST', 'WAIT_FOR_RECORD', 'FIELD_VERIFICATION',
  'SOURCE_CLARIFICATION', 'DATASET_QUERY', 'EXPERT_INTERPRETATION', 'OTHER'] as const
const DISCONFIRMATION_RESULTS = ['SURVIVED', 'SURVIVED_WEAKENED', 'CHANGED', 'FAILED',
  'UNRESOLVED'] as const
const DISCREPANCY_CLASSIFICATIONS = ['DIFFERENT_DATE', 'DIFFERENT_SCOPE',
  'DIFFERENT_DEFINITION', 'DIFFERENT_PHASE', 'DIFFERENT_UNIT', 'REVISED_VALUE',
  'GENUINE_CONTRADICTION', 'PROBABLE_SOURCE_ERROR', 'UNRESOLVED'] as const
const POSITION_RELATIONSHIPS = ['SUBJECT', 'PARTICIPANT', 'WITNESS', 'GOVERNING_AUTHORITY',
  'REGULATOR', 'AUDITOR', 'INVESTIGATOR', 'DETENTION_OR_ENFORCEMENT_AUTHORITY',
  'EMPLOYER_OR_PRINCIPAL', 'EMPLOYEE_OR_AGENT', 'CONTRACTUAL_COUNTERPARTY', 'BENEFICIARY',
  'ADVERSARY', 'INTERMEDIARY', 'OTHER'] as const
const POSITION_BASES = ['DOCUMENTED', 'INFERRED'] as const
const CUSTODY_BASES = ['CONFIRMED', 'INFERRED'] as const
const REVIEW_SEVERITIES = ['BLOCKING', 'ADVISORY'] as const
const REVIEW_TARGET_KINDS = ['Claim', 'Source', 'SourcePosition', 'Evidence',
  'EvidenceProvenance', 'Discrepancy', 'Disconfirmation', 'Finding', 'Gap'] as const

// Both directions, per vocabulary: the list is exactly the union.
const _v1 = CLAIM_LAYERS satisfies readonly ClaimLayer[]
const _v2 = CLAIM_TYPES satisfies readonly ClaimType[]
const _v3 = RANKS satisfies readonly Confidence[] satisfies readonly Priority[]
const _v4 = EVIDENCE_RELATIONSHIPS satisfies readonly EvidenceRelationship[]
const _v5 = EVIDENCE_STRENGTHS satisfies readonly EvidenceStrength[]
const _v6 = KNOWLEDGE_BASES satisfies readonly KnowledgeBasis[]
const _v7 = FINDING_STATUSES satisfies readonly FindingStatus[]
const _v8 = GAP_STATUSES satisfies readonly GapStatus[]
const _v9 = RESOLUTION_PATHS satisfies readonly ResolutionPath[]
const _v10 = DISCONFIRMATION_RESULTS satisfies readonly DisconfirmationResult[]
const _v11 = DISCREPANCY_CLASSIFICATIONS satisfies readonly DiscrepancyClassification[]
const _v12 = POSITION_RELATIONSHIPS satisfies readonly SourcePositionRelationship[]
const _v13 = POSITION_BASES satisfies readonly SourcePositionBasis[]
const _v14 = CUSTODY_BASES satisfies readonly CustodyBasis[]
const _v15 = REVIEW_SEVERITIES satisfies readonly ReviewSeverity[]
const _v16 = REVIEW_TARGET_KINDS satisfies readonly ReviewTargetKind[]
void [_v1, _v2, _v3, _v4, _v5, _v6, _v7, _v8, _v9, _v10, _v11, _v12, _v13, _v14, _v15, _v16]

type Missing =
  | Exclude<ClaimLayer, (typeof CLAIM_LAYERS)[number]>
  | Exclude<ClaimType, (typeof CLAIM_TYPES)[number]>
  | Exclude<Confidence, (typeof RANKS)[number]>
  | Exclude<Priority, (typeof RANKS)[number]>
  | Exclude<EvidenceRelationship, (typeof EVIDENCE_RELATIONSHIPS)[number]>
  | Exclude<EvidenceStrength, (typeof EVIDENCE_STRENGTHS)[number]>
  | Exclude<KnowledgeBasis, (typeof KNOWLEDGE_BASES)[number]>
  | Exclude<FindingStatus, (typeof FINDING_STATUSES)[number]>
  | Exclude<GapStatus, (typeof GAP_STATUSES)[number]>
  | Exclude<ResolutionPath, (typeof RESOLUTION_PATHS)[number]>
  | Exclude<DisconfirmationResult, (typeof DISCONFIRMATION_RESULTS)[number]>
  | Exclude<DiscrepancyClassification, (typeof DISCREPANCY_CLASSIFICATIONS)[number]>
  | Exclude<SourcePositionRelationship, (typeof POSITION_RELATIONSHIPS)[number]>
  | Exclude<SourcePositionBasis, (typeof POSITION_BASES)[number]>
  | Exclude<CustodyBasis, (typeof CUSTODY_BASES)[number]>
  | Exclude<ReviewSeverity, (typeof REVIEW_SEVERITIES)[number]>
  | Exclude<ReviewTargetKind, (typeof REVIEW_TARGET_KINDS)[number]>
const _vocabulariesComplete: Missing extends never ? true : never = true
void _vocabulariesComplete

/** Every vocabulary, so the prompt layer can state them without restating them. */
export const VOCABULARY = {
  claimLayer: CLAIM_LAYERS,
  claimType: CLAIM_TYPES,
  rank: RANKS,
  evidenceRelationship: EVIDENCE_RELATIONSHIPS,
  evidenceStrength: EVIDENCE_STRENGTHS,
  knowledgeBasis: KNOWLEDGE_BASES,
  findingStatus: FINDING_STATUSES,
  gapStatus: GAP_STATUSES,
  resolutionPath: RESOLUTION_PATHS,
  disconfirmationResult: DISCONFIRMATION_RESULTS,
  discrepancyClassification: DISCREPANCY_CLASSIFICATIONS,
  positionRelationship: POSITION_RELATIONSHIPS,
  positionBasis: POSITION_BASES,
  custodyBasis: CUSTODY_BASES,
  reviewSeverity: REVIEW_SEVERITIES,
  reviewTargetKind: REVIEW_TARGET_KINDS,
} as const

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

/**
 * What the stage offered, and therefore what may be referenced.
 *
 * A decoder rejects any handle outside this set. That is the mechanism behind
 * "providers propose, X-Ray owns identity": a proposal that could name
 * `ref:anything` would let a provider address artifacts it was never shown, or
 * invent cross-references the stage then has to disprove.
 */
export interface RefScope {
  readonly claims?: ReadonlySet<string>
  readonly evidence?: ReadonlySet<string>
  readonly sources?: ReadonlySet<string>
  readonly documents?: ReadonlySet<string>
  readonly discrepancies?: ReadonlySet<string>
  readonly positions?: ReadonlySet<string>
  readonly gaps?: ReadonlySet<string>
  readonly findings?: ReadonlySet<string>
}

type RefKind = keyof RefScope

class Reader {
  // Fields declared rather than taken as parameter properties: Node's
  // type-stripping does not support those, and this project runs checks under
  // it directly.
  private readonly operation: string
  private readonly scope: RefScope

  constructor(operation: string, scope: RefScope) {
    this.operation = operation
    this.scope = scope
  }

  reject(path: string, reason: string): never {
    throw new AdapterFailure(
      this.operation, 'PERMANENT',
      `The provider's ${this.operation} answer is not usable: ${path} ${reason}.`,
    )
  }

  object(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.reject(path, `is ${describe(value)} rather than an object`)
    }
    return value as Record<string, unknown>
  }

  array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) this.reject(path, `is ${describe(value)} rather than an array`)
    return value
  }

  /** A list that must be present, and whose emptiness the caller decides. */
  list<T>(value: unknown, path: string, item: (entry: unknown, at: string) => T): T[] {
    return this.array(value, path).map((entry, index) => item(entry, `${path}[${index}]`))
  }

  optionalList<T>(
    value: unknown, path: string, item: (entry: unknown, at: string) => T,
  ): T[] | undefined {
    return value === undefined || value === null ? undefined : this.list(value, path, item)
  }

  text(value: unknown, path: string): string {
    if (typeof value !== 'string') this.reject(path, `is ${describe(value)} rather than a string`)
    const trimmed = value.trim()
    if (trimmed === '') this.reject(path, 'is empty')
    return trimmed
  }

  optionalText(value: unknown, path: string): string | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'string') this.reject(path, `is ${describe(value)} rather than a string`)
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }

  boolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
      this.reject(path, `is ${describe(value)} rather than true or false`)
    }
    return value
  }

  number(value: unknown, path: string): number | undefined {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.reject(path, `is ${describe(value)} rather than a finite number`)
    }
    return value
  }

  member<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    const text = this.text(value, path)
    if (!(allowed as readonly string[]).includes(text)) {
      this.reject(path, `is "${clip(text)}", which is not one of ${allowed.join(', ')}`)
    }
    return text as T
  }

  optionalMember<T extends string>(
    value: unknown, path: string, allowed: readonly T[],
  ): T | undefined {
    return value === undefined || value === null ? undefined : this.member(value, path, allowed)
  }

  /**
   * A handle the stage issued, and nothing else.
   *
   * Two failures are separated deliberately: a value that is not a handle at
   * all, and a handle for something the provider was never offered. The second
   * is the interesting one — it is a provider addressing canonical state
   * outside its turn — and a single "invalid ref" message would hide it.
   */
  ref(value: unknown, path: string, kind: RefKind): ProposalRef {
    const text = this.text(value, path)
    if (!text.startsWith('ref:')) {
      this.reject(path, `is "${clip(text)}", which is not a stage-issued handle`)
    }
    const offered = this.scope[kind]
    if (offered === undefined) {
      this.reject(path, `references ${kind}, which this operation was not offered`)
    }
    if (!offered.has(text)) {
      this.reject(
        path,
        `references ${kind} handle "${clip(text)}", which was not offered to this operation`,
      )
    }
    return text as ProposalRef
  }

  refs(value: unknown, path: string, kind: RefKind): ProposalRef[] {
    return this.list(value, path, (entry, at) => this.ref(entry, at, kind))
  }

  /** A ref list that may be absent, treated as empty. */
  refsOrEmpty(value: unknown, path: string, kind: RefKind): ProposalRef[] {
    return value === undefined || value === null ? [] : this.refs(value, path, kind)
  }

  textsOrEmpty(value: unknown, path: string): string[] {
    return value === undefined || value === null
      ? [] : this.list(value, path, (entry, at) => this.text(entry, at))
  }

  nonEmpty<T>(items: readonly T[], path: string): readonly T[] {
    if (items.length === 0) this.reject(path, 'is empty, and at least one entry is required')
    return items
  }

  measurement(value: unknown, path: string): Measurement | undefined {
    if (value === undefined || value === null) return undefined
    const raw = this.object(value, path)
    const measurement: Measurement = {
      ...opt('metric', this.optionalText(raw['metric'], `${path}.metric`)),
      ...opt('value', this.number(raw['value'], `${path}.value`)),
      ...opt('unit', this.optionalText(raw['unit'], `${path}.unit`)),
      ...opt('denominator', this.optionalText(raw['denominator'], `${path}.denominator`)),
      ...opt('scope', this.optionalText(raw['scope'], `${path}.scope`)),
    }
    return Object.keys(measurement).length === 0 ? undefined : measurement
  }

  timeScope(value: unknown, path: string): TimeScope | undefined {
    if (value === undefined || value === null) return undefined
    const raw = this.object(value, path)
    const scope: TimeScope = {
      ...opt('from', this.isoDate(raw['from'], `${path}.from`)),
      ...opt('to', this.isoDate(raw['to'], `${path}.to`)),
      ...opt('asOf', this.isoDate(raw['asOf'], `${path}.asOf`)),
      ...opt('description', this.optionalText(raw['description'], `${path}.description`)),
    }
    return Object.keys(scope).length === 0 ? undefined : scope
  }

  /**
   * An ISO date, checked rather than trusted.
   *
   * `IsoDate` is a bare `string` in the domain, so nothing downstream would
   * catch `"last Tuesday"` — and a time scope is exactly where a plausible
   * non-date does real damage, because FM-005 is about temporal reach.
   */
  isoDate(value: unknown, path: string): string | undefined {
    const text = this.optionalText(value, path)
    if (text === undefined) return undefined
    if (!/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/.test(text)) {
      this.reject(path, `is "${clip(text)}", which is not an ISO 8601 date`)
    }
    return text
  }

  likelyHolder(value: unknown, path: string): LikelyHolder | undefined {
    if (value === undefined || value === null) return undefined
    const raw = this.object(value, path)
    // `basis` is required by the domain precisely because an unstated basis
    // reads as confirmed — so an absent one is a rejection, not a default.
    return {
      institution: this.text(raw['institution'], `${path}.institution`),
      ...opt('office', this.optionalText(raw['office'], `${path}.office`)),
      basis: this.member(raw['basis'], `${path}.basis`, CUSTODY_BASES),
    }
  }

  /** The shared claim fields, used by DECOMPOSE and by discovered claims. */
  claimFields(raw: Record<string, unknown>, path: string): ClaimProposal {
    return {
      text: this.text(raw['text'], `${path}.text`),
      ...opt('sourcePassage', this.optionalText(raw['sourcePassage'], `${path}.sourcePassage`)),
      ...opt('layer', this.optionalMember(raw['layer'], `${path}.layer`, CLAIM_LAYERS)),
      ...opt('type', this.optionalMember(raw['type'], `${path}.type`, CLAIM_TYPES)),
      ...opt('priority', this.optionalMember(raw['priority'], `${path}.priority`, RANKS)),
      ...opt('entities', this.optionalList(raw['entities'], `${path}.entities`,
        (entry, at) => this.text(entry, at))),
      ...opt('ambiguities', this.optionalList(raw['ambiguities'], `${path}.ambiguities`,
        (entry, at) => this.text(entry, at))),
      ...opt('measurement', this.measurement(raw['measurement'], `${path}.measurement`)),
      ...opt('timeScope', this.timeScope(raw['timeScope'], `${path}.timeScope`)),
    }
  }

  /** The array the forced tool call must carry, under a named key. */
  payload(structured: unknown, key: string): unknown[] {
    const root = this.object(structured, 'the answer')
    if (root[key] === undefined) this.reject(`the answer`, `has no "${key}" list`)
    return this.array(root[key], key)
  }
}

/** Only include a key when the value exists, so no `undefined` is written. */
const opt = <K extends string, T>(key: K, value: T | undefined):
  Record<K, T> | Record<string, never> =>
  (value === undefined ? {} : { [key]: value } as Record<K, T>)

const describe = (value: unknown): string =>
  value === null ? 'null'
    : Array.isArray(value) ? 'an array'
      : value === undefined ? 'absent' : `a ${typeof value}`

/** A provider can put anything in a string; a message quotes only a little. */
const clip = (text: string): string => text.length <= 60 ? text : `${text.slice(0, 57)}…`

// ---------------------------------------------------------------------------
// One decoder per operation
// ---------------------------------------------------------------------------

export function decodeClaims(
  operation: string, structured: unknown, scope: RefScope,
): readonly ClaimProposal[] {
  const reader = new Reader(operation, scope)
  return reader.payload(structured, 'claims').map((entry, index) => {
    const path = `claims[${index}]`
    return reader.claimFields(reader.object(entry, path), path)
  })
}

export function decodeClassifications(
  operation: string, structured: unknown, scope: RefScope,
): readonly ClaimClassificationProposal[] {
  const reader = new Reader(operation, scope)
  return reader.payload(structured, 'classifications').map((entry, index) => {
    const path = `classifications[${index}]`
    const raw = reader.object(entry, path)
    return {
      claimRef: reader.ref(raw['claimRef'], `${path}.claimRef`, 'claims'),
      layer: reader.member(raw['layer'], `${path}.layer`, CLAIM_LAYERS),
      type: reader.member(raw['type'], `${path}.type`, CLAIM_TYPES),
      priority: reader.member(raw['priority'], `${path}.priority`, RANKS),
      ...opt('entities', reader.optionalList(raw['entities'], `${path}.entities`,
        (item, at) => reader.text(item, at))),
      ...opt('ambiguities', reader.optionalList(raw['ambiguities'], `${path}.ambiguities`,
        (item, at) => reader.text(item, at))),
      ...opt('measurement', reader.measurement(raw['measurement'], `${path}.measurement`)),
      ...opt('timeScope', reader.timeScope(raw['timeScope'], `${path}.timeScope`)),
    }
  })
}

export interface DecodedTrace {
  readonly evidence: readonly EvidenceProposal[]
  readonly sourcePositions?: readonly SourcePositionProposal[]
  readonly discoveredClaims: readonly DiscoveredClaimProposal[]
  readonly suggestedQueries?: readonly { terms: string; constraints?: readonly string[] }[]
}

export function decodeTrace(
  operation: string, structured: unknown, scope: RefScope,
): DecodedTrace {
  const reader = new Reader(operation, scope)
  const root = reader.object(structured, 'the answer')

  const evidence = reader.list(root['evidence'] ?? [], 'evidence', (entry, path) => {
    const raw = reader.object(entry, path)
    return {
      sourceRef: reader.ref(raw['sourceRef'], `${path}.sourceRef`, 'documents'),
      proposition: reader.text(raw['proposition'], `${path}.proposition`),
      relationship: reader.member(
        raw['relationship'], `${path}.relationship`, EVIDENCE_RELATIONSHIPS),
      strength: reader.member(raw['strength'], `${path}.strength`, EVIDENCE_STRENGTHS),
      ...opt('knowledgeBasis', reader.optionalMember(
        raw['knowledgeBasis'], `${path}.knowledgeBasis`, KNOWLEDGE_BASES)),
      claimRefs: reader.nonEmpty(
        reader.refs(raw['claimRefs'], `${path}.claimRefs`, 'claims'), `${path}.claimRefs`),
      ...opt('measurement', reader.measurement(raw['measurement'], `${path}.measurement`)),
      ...opt('timeScope', reader.timeScope(raw['timeScope'], `${path}.timeScope`)),
      ...opt('quotedPassage', reader.optionalText(
        raw['quotedPassage'], `${path}.quotedPassage`)),
      ...opt('locationInSource', reader.optionalText(
        raw['locationInSource'], `${path}.locationInSource`)),
    } satisfies EvidenceProposal
  })

  const discoveredClaims = reader.list(
    root['discoveredClaims'] ?? [], 'discoveredClaims', (entry, path) => {
      const raw = reader.object(entry, path)
      return {
        ...reader.claimFields(raw, path),
        sourceRef: reader.ref(raw['sourceRef'], `${path}.sourceRef`, 'documents'),
      } satisfies DiscoveredClaimProposal
    })

  const sourcePositions = reader.optionalList(
    root['sourcePositions'], 'sourcePositions', (entry, path) => {
      const raw = reader.object(entry, path)
      return {
        ...opt('positionRef', raw['positionRef'] === undefined ? undefined
          : reader.ref(raw['positionRef'], `${path}.positionRef`, 'positions')),
        sourceRef: reader.ref(raw['sourceRef'], `${path}.sourceRef`, 'documents'),
        claimRefs: reader.refs(raw['claimRefs'], `${path}.claimRefs`, 'claims'),
        relationship: reader.member(
          raw['relationship'], `${path}.relationship`, POSITION_RELATIONSHIPS),
        ...opt('relationshipDescription', reader.optionalText(
          raw['relationshipDescription'], `${path}.relationshipDescription`)),
        powerOrDependency: reader.textsOrEmpty(
          raw['powerOrDependency'], `${path}.powerOrDependency`),
        ...opt('productionPurpose', reader.optionalText(
          raw['productionPurpose'], `${path}.productionPurpose`)),
        ...opt('timeScope', reader.timeScope(raw['timeScope'], `${path}.timeScope`)),
        basis: reader.member(raw['basis'], `${path}.basis`, POSITION_BASES),
        confidence: reader.member(raw['confidence'], `${path}.confidence`, RANKS),
        supportingEvidenceRefs: reader.refsOrEmpty(
          raw['supportingEvidenceRefs'], `${path}.supportingEvidenceRefs`, 'evidence'),
        ...opt('basisDescription', reader.optionalText(
          raw['basisDescription'], `${path}.basisDescription`)),
      } satisfies SourcePositionProposal
    })

  const suggestedQueries = reader.optionalList(
    root['suggestedQueries'], 'suggestedQueries', (entry, path) => {
      const raw = reader.object(entry, path)
      return {
        terms: reader.text(raw['terms'], `${path}.terms`),
        ...opt('constraints', reader.optionalList(raw['constraints'], `${path}.constraints`,
          (item, at) => reader.text(item, at))),
      }
    })

  return {
    evidence,
    discoveredClaims,
    ...opt('sourcePositions', sourcePositions),
    ...opt('suggestedQueries', suggestedQueries),
  }
}

export function decodeDisconfirmations(
  operation: string, structured: unknown, scope: RefScope,
): readonly DisconfirmationProposal[] {
  const reader = new Reader(operation, scope)
  return reader.payload(structured, 'disconfirmations').map((entry, index) => {
    const path = `disconfirmations[${index}]`
    const raw = reader.object(entry, path)
    return {
      claimRef: reader.ref(raw['claimRef'], `${path}.claimRef`, 'claims'),
      preliminaryHypothesis: reader.text(
        raw['preliminaryHypothesis'], `${path}.preliminaryHypothesis`),
      counterHypothesis: reader.text(raw['counterHypothesis'], `${path}.counterHypothesis`),
      searchStrategy: reader.textsOrEmpty(raw['searchStrategy'], `${path}.searchStrategy`),
      strongestSupportingEvidenceRefs: reader.refsOrEmpty(
        raw['strongestSupportingEvidenceRefs'],
        `${path}.strongestSupportingEvidenceRefs`, 'evidence'),
      strongestOpposingEvidenceRefs: reader.refsOrEmpty(
        raw['strongestOpposingEvidenceRefs'],
        `${path}.strongestOpposingEvidenceRefs`, 'evidence'),
      result: reader.member(raw['result'], `${path}.result`, DISCONFIRMATION_RESULTS),
      effectOnFinding: reader.text(raw['effectOnFinding'], `${path}.effectOnFinding`),
    } satisfies DisconfirmationProposal
  })
}

export function decodeDiscrepancies(
  operation: string, structured: unknown, scope: RefScope,
): readonly DiscrepancyProposal[] {
  const reader = new Reader(operation, scope)
  return reader.payload(structured, 'discrepancies').map((entry, index) => {
    const path = `discrepancies[${index}]`
    const raw = reader.object(entry, path)
    return {
      claimRefs: reader.nonEmpty(
        reader.refs(raw['claimRefs'], `${path}.claimRefs`, 'claims'), `${path}.claimRefs`),
      evidenceRefs: reader.nonEmpty(
        reader.refs(raw['evidenceRefs'], `${path}.evidenceRefs`, 'evidence'),
        `${path}.evidenceRefs`),
      description: reader.text(raw['description'], `${path}.description`),
      classification: reader.member(
        raw['classification'], `${path}.classification`, DISCREPANCY_CLASSIFICATIONS),
      ...opt('reconciliation', reader.optionalText(
        raw['reconciliation'], `${path}.reconciliation`)),
      resolvedCandidate: reader.boolean(
        raw['resolvedCandidate'], `${path}.resolvedCandidate`),
    } satisfies DiscrepancyProposal
  })
}

export function decodeFindings(
  operation: string, structured: unknown, scope: RefScope,
): readonly FindingProposal[] {
  const reader = new Reader(operation, scope)
  return reader.payload(structured, 'findings').map((entry, index) => {
    const path = `findings[${index}]`
    const raw = reader.object(entry, path)
    return {
      claimRef: reader.ref(raw['claimRef'], `${path}.claimRef`, 'claims'),
      status: reader.member(raw['status'], `${path}.status`, FINDING_STATUSES),
      confidence: reader.member(raw['confidence'], `${path}.confidence`, RANKS),
      rationale: reader.text(raw['rationale'], `${path}.rationale`),
      supportingEvidenceRefs: reader.refsOrEmpty(
        raw['supportingEvidenceRefs'], `${path}.supportingEvidenceRefs`, 'evidence'),
      challengingEvidenceRefs: reader.refsOrEmpty(
        raw['challengingEvidenceRefs'], `${path}.challengingEvidenceRefs`, 'evidence'),
      contextualEvidenceRefs: reader.refsOrEmpty(
        raw['contextualEvidenceRefs'], `${path}.contextualEvidenceRefs`, 'evidence'),
      discrepancyRefs: reader.refsOrEmpty(
        raw['discrepancyRefs'], `${path}.discrepancyRefs`, 'discrepancies'),
      // XR-INV-007 requires this non-empty. Rejecting here rather than letting
      // the validator do it keeps the failure attributable to the provider.
      wouldChangeFinding: reader.nonEmpty(
        reader.textsOrEmpty(raw['wouldChangeFinding'], `${path}.wouldChangeFinding`),
        `${path}.wouldChangeFinding`),
    } satisfies FindingProposal
  })
}

export function decodeGaps(
  operation: string, structured: unknown, scope: RefScope,
): readonly GapProposal[] {
  const reader = new Reader(operation, scope)
  return reader.payload(structured, 'gaps').map((entry, index) => {
    const path = `gaps[${index}]`
    const raw = reader.object(entry, path)
    // `atiEligible` is not read, and there is no branch that could read it:
    // XR-INV-009 binds eligibility to `resolutionPath`, which the stage
    // derives. A provider offering the field is simply ignored.
    return {
      claimRefs: reader.nonEmpty(
        reader.refs(raw['claimRefs'], `${path}.claimRefs`, 'claims'), `${path}.claimRefs`),
      missingEvidence: reader.text(raw['missingEvidence'], `${path}.missingEvidence`),
      whyItMatters: reader.text(raw['whyItMatters'], `${path}.whyItMatters`),
      resolvingEvidence: reader.textsOrEmpty(
        raw['resolvingEvidence'], `${path}.resolvingEvidence`),
      ...opt('likelyHolder', reader.likelyHolder(raw['likelyHolder'], `${path}.likelyHolder`)),
      searchAlreadyAttempted: reader.textsOrEmpty(
        raw['searchAlreadyAttempted'], `${path}.searchAlreadyAttempted`),
      status: reader.member(raw['status'], `${path}.status`, GAP_STATUSES),
      effectOnFinding: reader.text(raw['effectOnFinding'], `${path}.effectOnFinding`),
      resolutionPath: reader.member(
        raw['resolutionPath'], `${path}.resolutionPath`, RESOLUTION_PATHS),
      ...opt('identifiers', reader.optionalList(raw['identifiers'], `${path}.identifiers`,
        (item, at) => reader.text(item, at))),
    } satisfies GapProposal
  })
}

/**
 * A reviewer judgment.
 *
 * `targets` carries canonical ids, not handles — the review port hands the
 * model real artifacts. So the boundary here is the mirror of `RefScope`: a
 * target must be one of the artifacts *this query* contained. A model that
 * could name any id could flag artifacts it never saw.
 */
export function decodeJudgment(
  operation: string, structured: unknown, offeredTargets: ReadonlyMap<string, ReviewTargetKind>,
): ModelJudgment {
  const reader = new Reader(operation, {})
  const raw = reader.object(structured, 'the answer')

  const targets = reader.list(raw['targets'] ?? [], 'targets', (entry, path) => {
    const target = reader.object(entry, path)
    const kind = reader.member(target['kind'], `${path}.kind`, REVIEW_TARGET_KINDS)
    const id = reader.text(target['id'], `${path}.id`)
    const offered = offeredTargets.get(id)
    if (offered === undefined) {
      reader.reject(`${path}.id`, `names "${clip(id)}", which was not part of this query`)
    }
    if (offered !== kind) {
      reader.reject(`${path}.kind`, `says ${kind} but "${clip(id)}" is a ${offered}`)
    }
    return { kind, id } satisfies ReviewTarget
  })

  return {
    flagged: reader.boolean(raw['flagged'], 'flagged'),
    severity: reader.member(raw['severity'], 'severity', REVIEW_SEVERITIES),
    rationale: reader.text(raw['rationale'], 'rationale'),
    requiredAction: reader.text(raw['requiredAction'], 'requiredAction'),
    targets,
  }
}
