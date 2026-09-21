/**
 * The twelve system invariants, and how much of each is deterministically
 * executable over a candidate graph.
 *
 * This table is the validator's own statement of its limits. An invariant
 * marked `REVIEWER` is not unenforced by oversight — it needs a judgment the
 * graph cannot supply, and pretending otherwise would make the validator a
 * bad Reviewer instead of a good validator.
 */

export type InvariantId =
  | 'XR-INV-001'
  | 'XR-INV-002'
  | 'XR-INV-003'
  | 'XR-INV-004'
  | 'XR-INV-005'
  | 'XR-INV-006'
  | 'XR-INV-007'
  | 'XR-INV-008'
  | 'XR-INV-009'
  | 'XR-INV-010'
  | 'XR-INV-011'
  | 'XR-INV-012'

/**
 * `DETERMINISTIC` — fully enforced here.
 * `PARTIAL` — the structural part is enforced; a judgment remains.
 * `REVIEWER` — not decidable from graph state alone.
 * `PERSISTENCE` — needs history the in-memory graph does not carry.
 */
export type EnforcementLevel = 'DETERMINISTIC' | 'PARTIAL' | 'REVIEWER' | 'PERSISTENCE'

export interface InvariantCoverage {
  id: InvariantId
  name: string
  level: EnforcementLevel
  /** What this validator actually checks. */
  enforced: string
  /** What it deliberately does not, and who owns it. */
  notEnforced?: string
}

export const INVARIANT_COVERAGE: readonly InvariantCoverage[] = [
  {
    id: 'XR-INV-001',
    name: 'Surface Source Isolation',
    level: 'DETERMINISTIC',
    enforced:
      'No Evidence drawn from the surface source may bear on a SURFACE claim, and no EvidenceProvenance may name the surface source as an origin.',
  },
  {
    id: 'XR-INV-002',
    name: 'Atomic Claim Requirement',
    level: 'REVIEWER',
    enforced:
      'Every Finding references an existing Claim (referential), so no finding floats free of a claim.',
    notEnforced:
      'Whether a claim is actually atomic and independently testable is a reading of its text. Reviewer.',
  },
  {
    id: 'XR-INV-003',
    name: 'Observation / Interpretation / Meaning Separation',
    level: 'PARTIAL',
    enforced: 'Every Claim carries a structurally valid layer.',
    notEnforced:
      'Whether evidence appropriate to one layer silently established another. Evidence carries no layer in the canonical domain, so the comparison the invariant describes has no data. Recorded as an architecture gap on issue #3; Evidence.layer was deliberately NOT introduced here.',
  },
  {
    id: 'XR-INV-004',
    name: 'Source Independence',
    level: 'DETERMINISTIC',
    enforced:
      'Confirmed evidence origins may never exceed the claim EVIDENCE count (each proposition resolves to at most one origin); UNIDENTIFIED and UNRESOLVED origins are never counted as confirmed; multi-origin sources must carry proposition-level provenance; provenance may not name its own source as origin. Origins exceeding the SOURCE count is surfaced as a warning, not an error — see issue #3.',
  },
  {
    id: 'XR-INV-005',
    name: 'Same-Measure Contradiction Rule',
    level: 'PARTIAL',
    enforced:
      'CONTRADICTS may not be asserted where claim and evidence measurements are DEMONSTRABLY incompatible; a CONTRADICTED finding must rest on at least one non-incompatible contradicting record; GENUINE_CONTRADICTION may not be classified over incompatible measurements.',
    notEnforced:
      'Where compatibility is UNDETERMINED — one side measured, the other not — the validator reports nothing. Unmeasured testimony can legitimately contradict a measured claim, and "compatibility cannot be mechanically established" is not a graph defect. Semantic compatibility in that case is Reviewer or research-stage judgment.',
  },
  {
    id: 'XR-INV-006',
    name: 'Missing Evidence Is Not Negative Evidence',
    level: 'DETERMINISTIC',
    enforced:
      'No source may assert non-existence; every gap records the search attempted; evidence may not be extracted from an unobtained record, and no quoted passage may come from one.',
  },
  {
    id: 'XR-INV-007',
    name: 'Findings Must Be Reversible',
    level: 'DETERMINISTIC',
    enforced:
      'Every Finding carries a rationale and at least one wouldChangeFinding entry, and its three evidence lists mirror Evidence.relationship exactly and exhaustively.',
    notEnforced:
      'Whether the stated overturn conditions are the right ones. Reviewer.',
  },
  {
    id: 'XR-INV-008',
    name: 'Gap Preservation',
    level: 'DETERMINISTIC',
    enforced:
      'Every UNRESOLVED, INSUFFICIENT_EVIDENCE or CONTESTED finding names at least one gap. At graduation, every gap is also reachable from a finding on one of its claims.',
    notEnforced:
      'Both directions are skipped in STAGED mode while the other collection is absent: a gap may legitimately precede the finding that will reference it, and between GRADE and GAPS an unresolved finding necessarily names no gap. Both bind under FULL, and the second binds under STAGED as soon as any gap exists. Whether synthesis hides a gap downstream remains a projection concern.',
  },
  {
    id: 'XR-INV-009',
    name: 'Action Eligibility',
    level: 'PARTIAL',
    enforced:
      'atiEligible holds exactly when resolutionPath is PUBLIC_RECORD_REQUEST. This is a property of a gap, and gaps are version-scoped research state.',
    notEnforced:
      'The request half — that a request targets an eligible gap and asks only for records that gap names — is enforced at the ATI command boundary (application/ati-service.ts) against the exact frozen origin snapshot, emitting the same two violation codes. It is not enforceable here because the graph does not carry requests: an action taken about a frozen version keeps changing after that version is frozen (#10 C1/C2/C7).',
  },
  {
    id: 'XR-INV-010',
    name: 'Historical Preservation',
    level: 'PERSISTENCE',
    enforced:
      'Version numbering is coherent: versions are 1-based, supersedesVersion is strictly lower and absent at version 1, and currentVersion agrees with the version record.',
    notEnforced:
      'That earlier versions were never rewritten. That requires stored history; a single in-memory graph cannot show it. Persistence (#7).',
  },
  {
    id: 'XR-INV-011',
    name: 'Synthesis Cannot Mutate Evidence',
    level: 'PARTIAL',
    enforced:
      'No canonical artifact carries a derived count or presentation field, so synthesis has nothing to write back into. The validator itself never mutates the graph, which its own checks assert.',
    notEnforced:
      'That a running synthesis stage did not mutate state. That is a pipeline property observable only across stage runs. Pipeline (#6) and persistence (#7).',
  },
  {
    id: 'XR-INV-012',
    name: 'Discovered Claims Are Separate',
    level: 'DETERMINISTIC',
    enforced:
      'Claim ids sit in the namespace their origin requires, no id falls outside both namespaces, and no id is reused.',
  },
] as const

export const coverageFor = (id: InvariantId): InvariantCoverage =>
  INVARIANT_COVERAGE.find((c) => c.id === id)!
