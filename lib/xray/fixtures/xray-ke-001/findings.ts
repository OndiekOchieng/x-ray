/**
 * XRAY-KE-001 — canonical Findings.
 *
 * XR-INV-007: every finding records rationale, supporting and challenging
 * evidence BY ID, the discrepancies and gaps bearing on it, and what would
 * change it. No prose-only support lists.
 *
 * CONVENTION: the three evidence lists mirror `Evidence.relationship` for that
 * claim exactly and exhaustively:
 *
 *   SUPPORTS       → supportingEvidenceIds
 *   CHALLENGES     → challengingEvidenceIds
 *   CONTRADICTS    → challengingEvidenceIds
 *   CONTEXTUALIZES → contextualEvidenceIds
 *
 * Every Evidence record bearing on the claim appears in exactly one list, and
 * no list contains an id whose relationship maps elsewhere. The integrity
 * checks assert both directions.
 *
 * `confidence` is ordinal. Where the two runs graded confidence differently,
 * the reason for the canonical value is stated in the comment above the record
 * rather than settled by preferring one run.
 */

import type { Finding } from '@/lib/xray/domain'

const GRADED_AT = '2026-09-13T00:00:00Z'

export const findings: Finding[] = [
  {
    /**
     * BENCHMARK DISAGREEMENT ON CONFIDENCE — Claude MEDIUM, GPT HIGH.
     * Both graded SUPPORTED.
     *
     * Canonical value: MEDIUM. Not a vote — the evidence class decides it. The
     * one record that explicitly defines 63 km as main carriageway is SRC-009,
     * whose original was never obtained; it is reachable only through press
     * reproduction, and is classified ATTRIBUTED_ORIGIN_NOT_RETRIEVED. The rest
     * of the support is arithmetic from a contract chainage plus a contractor's
     * page for one lot. Claude graded MEDIUM for exactly this reason ("no
     * single official document giving 63 km with a definition was retrieved").
     * Grading HIGH on an unretrieved origin would be the same error XR-INV-004
     * guards against in a different form.
     */
    id: 'FND-C001',
    claimId: 'C001',
    status: 'SUPPORTED',
    confidence: 'MEDIUM',
    rationale:
      'The principal corridor is supportable at approximately 63 km once scope is separated. PS Omollo states explicitly that about 63 km is main carriageway and that feeder and related works bring total project scope to about 122 km, and the mainline arithmetic is consistent with that: Lot 2 chainage gives 27.4 km, H. Young puts Lot 3 main road at about 23 km, and Lot 1 is about 12.6 km. The ESIA separately programmes 54 km of spur roads, and H. Young separately counts about 19.5 km of feeder works inside Lot 3 alone — so main-road length and total construction kilometres are demonstrably different measures. Confidence is held at MEDIUM because the one record that states the definition was never obtained in the original, and because the published lot lengths sum to 100.8 km rather than 122 km while an unexplained "about 44 km" figure is also on the record. The surface source presents "63-kilometre Highway" without disclosing that roughly 60 km of further works sit inside the same contracts.',
    supportingEvidenceIds: ['EV-001', 'EV-002', 'EV-003', 'EV-004'],
    challengingEvidenceIds: ['EV-005', 'EV-008', 'EV-009'],
    // The ESIA's separately-programmed 54 km of spur roads and H. Young's
    // split of Lot 3 into main road plus feeder works are what make the scope
    // reconciliation credible. Neither supports nor opposes the 63 km figure;
    // both are load-bearing for the finding.
    contextualEvidenceIds: ['EV-006', 'EV-007'],
    discrepancyIds: ['DISC-001'],
    gapIds: ['GAP-004'],
    wouldChangeFinding: [
      'A current KeNHA scope schedule showing the main Mamboleo–Kipsitet carriageway is materially different from about 63 km.',
      'A record showing that 63 km is a pre-2021 design figure superseded by redesign.',
      'An official document explaining the "about 44 km" figure or reconciling the 100.8 km lot total with 122 km.',
    ],
    gradedAt: GRADED_AT,
  },

  {
    // Both runs: UNRESOLVED / HIGH. No disagreement.
    // HIGH confidence that the evidence does not settle the derivation — NOT
    // confidence that KSh 16.7bn is wrong.
    id: 'FND-C002',
    claimId: 'C002',
    status: 'UNRESOLVED',
    confidence: 'HIGH',
    rationale:
      'KSh 16.7 billion is repeatedly used by KeNHA\'s own Nyanza regional office and in official-attributed reporting, so it cannot be dismissed. It also cannot be established, because no located record states its composition. The primary award notice fixes awarded works at KSh 15,880,008,733. Two independent routes reach KSh 16.385bn — awarded works plus the two located supervision consultancies, and the National Treasury\'s own estimated project costs — and neither reaches 16.7bn. A Lot 3 supervision contract was not located; no variation order, revised contract schedule or price-adjustment record was located; scope additions are on record without values. The confidence is HIGH that the located evidence does not settle the derivation. The claim does not become false because the original contract sums are lower: awarded works and current project value are different measures.',
    supportingEvidenceIds: ['EV-013', 'EV-014', 'EV-015', 'EV-016'],
    challengingEvidenceIds: ['EV-010', 'EV-017', 'EV-018', 'EV-019'],
    // The two independent routes to KSh 16.385bn — awarded works plus located
    // supervision, and Treasury's own estimates. Neither supports nor opposes
    // the 16.7bn figure; together they are why the gap is a missing bridge
    // rather than a contradiction.
    contextualEvidenceIds: ['EV-011', 'EV-012'],
    discrepancyIds: ['DISC-002'],
    gapIds: ['GAP-001'],
    wouldChangeFinding: [
      'Approved variation schedules or revised contract-price schedules totalling approximately KSh 16.7 billion.',
      'A Lot 3 supervision consultancy award that, with works and the located Lot 1–2 supervision contracts, accounts for the difference.',
      'A current authoritative KeNHA project-cost record stating the composition of the figure.',
      'An Auditor-General or Treasury record giving the current contract value per lot.',
    ],
    gradedAt: GRADED_AT,
  },

  {
    /**
     * THE REGRESSION CASE. Benchmark disagreement:
     *   Claude — CONTRADICTED / MEDIUM
     *   GPT    — INSUFFICIENT_EVIDENCE / HIGH
     *
     * Canonical: INSUFFICIENT_EVIDENCE / HIGH.
     *
     * Not a vote, and not deference to GPT. XR-INV-005 was written FROM this
     * disagreement: a finding MUST NOT be graded CONTRADICTED on evidence
     * measuring a materially different quantity, scope, denominator or
     * definition. The located evidence measures physical project completion
     * against contractual work; the claim is about surfaced length against road
     * sections. measurementCompatible = false, so CONTRADICTED is not available
     * regardless of which run emitted it.
     *
     * HIGH confidence is confidence in the INSUFFICIENCY — not confidence that
     * the surface claim is false.
     */
    id: 'FND-C003',
    claimId: 'C003',
    status: 'INSUFFICIENT_EVIDENCE',
    confidence: 'HIGH',
    rationale:
      'No located record measures how much of the road is surfaced, so the claim cannot be tested in either direction. Every located progress figure — 20.2%, 34% and 28% per lot in September 2026, and 28% overall to Parliament in June — measures overall physical completion against contractual work. That measure is weighted across earthworks, drainage, structures and finishing, and cannot be converted into a proportion of road length carrying tarmac: a road can have asphalt over a substantial linear distance while overall completion stays low. Equally, no source of any kind describes most of the road as surfaced, and asphalt laying is documented as active in September 2026. The confidence is HIGH that the evidence is insufficient. It is not confidence that the claim is false, and this finding is not CONTRADICTED, because no measurement-compatible evidence exists on either side.',
    supportingEvidenceIds: [],
    challengingEvidenceIds: ['EV-020', 'EV-021', 'EV-022', 'EV-023', 'EV-024', 'EV-025'],
    // Documented asphalt laying, and Treasury's older completion figures. These
    // are decisive for the finding: active surfacing is why the insufficiency
    // runs in BOTH directions rather than collapsing into a refutation.
    contextualEvidenceIds: ['EV-026', 'EV-027', 'EV-028'],
    discrepancyIds: ['DISC-003'],
    gapIds: ['GAP-002', 'GAP-005'],
    wouldChangeFinding: [
      'A KeNHA or resident-engineer progress report giving kilometres surfaced per lot against total mainline kilometres.',
      'Certified surfaced-kilometre data showing more than half of the relevant mainline had reached bitumen or asphalt standard by 13 September 2026.',
      'A dated engineering measurement or completion map showing surfaced length against the mainline.',
    ],
    gradedAt: GRADED_AT,
  },

  {
    // Both runs: SUPPORTED / MEDIUM, for the scheduling proposition only.
    // The claim text itself is scoped to scheduling — the proposition is NOT
    // silently widened to "the inspection occurred".
    id: 'FND-C004',
    claimId: 'C004',
    status: 'SUPPORTED',
    confidence: 'MEDIUM',
    rationale:
      'Contemporaneous itinerary reporting independently describes a planned inspection of road projects along these routes on the Monday of the tour, and the surface source itself uses "expected to". That supports the inspection being scheduled or expected at the research cutoff. It supports nothing about occurrence: the visit was scheduled for 14 September 2026, one day after the cutoff, and no official State House or PCS programme was retrieved. Confidence is MEDIUM because the itineraries differ on tour length and county order and the dependency between the two itinerary reports was suspected but never confirmed.',
    supportingEvidenceIds: ['EV-033'],
    challengingEvidenceIds: [],
    // Itinerary variance across contemporaneous reports — the reason confidence
    // is MEDIUM rather than HIGH.
    contextualEvidenceIds: ['EV-034'],
    discrepancyIds: [],
    gapIds: ['GAP-003'],
    wouldChangeFinding: [
      'An official State House or PCS programme for 14 September 2026 confirming or omitting the road.',
      'A post-event record establishing that the inspection occurred, was cancelled, or was changed — which would be a finding about a different proposition, not an upgrade of this one.',
    ],
    gradedAt: GRADED_AT,
  },

  {
    // [G] SUPPORTED / HIGH. Only the GPT run carried this claim.
    id: 'FND-DC001',
    claimId: 'DC001',
    status: 'SUPPORTED',
    confidence: 'HIGH',
    rationale:
      'Ministry-attributed status data published two days before the tour puts the three lots at 20.2%, 34% and 28% physical completion. That is consistent with KeNHA\'s own statement of 28% overall to Parliament in June 2026, and with Treasury\'s recorded completion of 15.2%, 11.6% and 24.1% at 30 June 2025. No credible located evidence shows the project approaching overall completion by 13 September 2026; reports of resumed tarmacking show activity, not completion. Unlike C003, this comparison is measurement-compatible: the claim is stated in the same metric the evidence carries — physical project completion against contractual work.',
    supportingEvidenceIds: ['EV-029', 'EV-030', 'EV-031'],
    challengingEvidenceIds: ['EV-032'],
    // No contextualizing evidence: every located record bearing on DC001 either
    // supports or challenges it directly.
    contextualEvidenceIds: [],
    discrepancyIds: ['DISC-003'],
    gapIds: ['GAP-005'],
    wouldChangeFinding: [
      'A certified KeNHA progress report at or near the research cutoff showing substantially higher overall completion.',
      'A completion certificate or engineering measurement showing the project near completion in September 2026.',
    ],
    gradedAt: GRADED_AT,
  },

  {
    // [C] CONTESTED / HIGH. Only the Claude run carried this claim.
    // HIGH confidence that two official dates coexist — not confidence in
    // either date.
    id: 'FND-DC002',
    claimId: 'DC002',
    status: 'CONTESTED',
    confidence: 'HIGH',
    rationale:
      "KeNHA's Nyanza regional office gave July 2027 on 8 May 2026; KeNHA told the National Assembly Roads Committee on 6 June 2026 that completion was expected in January 2028 under a revised schedule; and the July 2027 figure was then repeated in July 2026, after the January 2028 statement. Three independent outlets carry the January 2028 figure from the same session, so misreporting is unlikely. Scope, phase and definitional explanations were tested and none holds — neither source carries a scope qualifier, and neither distinguishes a contractual date from an internal target. The confidence is HIGH that two official dates coexist on the public record, not in either of them. Context: the 2021 award letter set a 36-month completion period for Lot 2, and H. Young recorded a Lot 3 commencement of October 2021 with a then-stated completion of January 2024.",
    supportingEvidenceIds: ['EV-035', 'EV-036'],
    challengingEvidenceIds: [],
    // The 2021 award letter's 36-month contract period and H. Young's recorded
    // Lot 3 commencement. Neither date supports or opposes the claim that two
    // official dates coexist; both are what make the contradiction legible.
    contextualEvidenceIds: ['EV-037', 'EV-038'],
    discrepancyIds: ['DISC-004'],
    gapIds: ['GAP-006'],
    wouldChangeFinding: [
      "KeNHA's revised schedule or approved extension-of-time records showing which date is contractual.",
      'The National Assembly committee report or Hansard for the 6 June 2026 inspection.',
      'Commencement orders per lot establishing the original contractual completion dates.',
    ],
    gradedAt: GRADED_AT,
  },
]

export const findingById = new Map(findings.map((f) => [f.id, f]))
