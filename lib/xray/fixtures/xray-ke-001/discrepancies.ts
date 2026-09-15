/**
 * XRAY-KE-001 — canonical Discrepancies.
 *
 * Only material discrepancies are modelled. Both runs found further anomalies
 * (a KNA figure applying a single lot value to the whole road; a contractor
 * name inconsistency; progress percentages moving in both directions between
 * reports; itinerary variance). Those are carried in evidence propositions
 * where they bear on a claim, and are deliberately not promoted to
 * first-class discrepancies — the fixture is an acceptance case, not a dump.
 */

import type { Discrepancy } from '@/lib/xray/domain'

export const discrepancies: Discrepancy[] = [
  {
    // [C:D001] [G:D001]
    id: 'DISC-001',
    claimIds: ['C001'],
    evidenceIds: ['EV-001', 'EV-002', 'EV-003', 'EV-005', 'EV-006', 'EV-007'],
    description:
      'The same project is described as 63 km and as 122 km. Published per-lot lengths sum to 100.8 km, and the regional office separately gave about 44 km.',
    /**
     * MUST NOT be GENUINE_CONTRADICTION. Both runs independently reconciled
     * this by separating main carriageway from feeder/spur works — the
     * reconciliation the architecture's acceptance case requires.
     */
    classification: 'DIFFERENT_SCOPE',
    reconciliation:
      'The figures measure different things. PS Omollo states explicitly that about 63 km is main carriageway and that feeder roads and related sections bring total project scope to about 122 km. The ESIA separately programmes 54 km of spur roads, and H. Young counts Lot 3 as about 23 km of main road plus about 19.5 km of feeder works. The mainline arithmetic is consistent: Lot 2 chainage gives 27.4 km, Lot 3 main road about 23 km, and Lot 1 about 12.6 km — roughly 63 km. The Claude run classified this different_definition and the GPT run different_scope; both reached the same reconciliation. Residual and unreconciled: the published lot lengths total 100.8 km rather than 122 km, and the "about 44 km" figure matches neither and is unexplained by any located source. No current KeNHA scope schedule was recovered — see GAP-004.',
    resolved: true,
  },

  {
    // [C:D002] [G:D002]
    id: 'DISC-002',
    claimIds: ['C002'],
    evidenceIds: ['EV-010', 'EV-011', 'EV-012', 'EV-013', 'EV-017', 'EV-018', 'EV-019'],
    description:
      'Four materially different values are on the record for the same project: KSh 15.7bn, KSh 15.87bn, KSh 16.385bn and KSh 16.7bn.',
    classification: 'UNRESOLVED',
    reconciliation:
      'The values are not all in conflict. KSh 15.7bn, 15.87bn and 15.9bn are roundings of the same awarded works total of KSh 15,880,008,733. The real difference is KSh 16.7bn against that works total — about KSh 0.82bn. Two tested explanations reach KSh 16.385bn by independent routes: awarded works plus the two located supervision consultancies (KSh 505,284,864), and the National Treasury\'s own estimated project costs. Neither route reaches 16.7bn. A Lot 3 supervision contract, if one exists, was not located; no variation order, revised contract schedule or price-adjustment record was located; and no source states the composition of 16.7bn. The figure cannot be dismissed either, because KeNHA\'s own regional office uses it. Both runs left this unresolved — see GAP-001.',
    resolved: false,
  },

  {
    /**
     * THE SAME-MEASURE REGRESSION CASE. [C:D007-adjacent, C:C003] [G:D003]
     *
     * This is the discrepancy that produced XR-INV-005. It is classified as a
     * definitional mismatch between two metrics, NOT as a contradiction, and
     * the fixture contains no Evidence asserting CONTRADICTS against C003.
     */
    id: 'DISC-003',
    claimIds: ['C003', 'DC001'],
    evidenceIds: ['EV-020', 'EV-021', 'EV-022', 'EV-023', 'EV-026', 'EV-028'],
    description:
      'The surface source says most sections have already been tarmacked. Ministry-attributed status data two days earlier puts the three lots at 20.2%, 34% and 28%, and KeNHA told Parliament in June that the project stood at 28% overall.',
    classification: 'DIFFERENT_DEFINITION',
    reconciliation:
      'These measure different quantities and are not mathematically opposite. The claim measures surfaced length as a proportion of road sections; the evidence measures physical project completion as a proportion of contractual work. A road can carry asphalt over a substantial linear distance while overall completion stays low, because bridges, drainage, shoulders, interchanges, utilities and finishing works remain outstanding. Low overall completion therefore does not prove that less than half the mainline carries tarmac. The converse also fails: active asphalt laying is documented in September 2026, but no located record measures how much of the road is surfaced. MUST NOT be read as a genuine contradiction — no measurement-compatible evidence exists on either side. The missing measurement is GAP-002.',
    resolved: false,
  },

  {
    /**
     * [C:D005] The only discrepancy in the corpus that survived reconciliation
     * testing as a genuine contradiction. Included because it demonstrates that
     * the constrained classification is reachable when the evidence earns it —
     * the Claude run tested the scope, phase and definition alternatives first
     * and none of them held.
     */
    id: 'DISC-004',
    claimIds: ['DC002'],
    evidenceIds: ['EV-035', 'EV-036', 'EV-037', 'EV-038'],
    description:
      'KeNHA gave completion as July 2027 on 8 May 2026 and as January 2028 to the National Assembly Roads Committee on 6 June 2026, and the July 2027 figure was then repeated in July 2026 after the January 2028 statement.',
    classification: 'GENUINE_CONTRADICTION',
    reconciliation:
      'Alternatives were tested before this classification. Different scope: rejected — the May report says "this project will be complete" and the committee statement gives a single project-wide date; neither carries a scope qualifier. Different phase: rejected — neither source distinguishes contractual completion from an internal target. Misreporting: unlikely — three independent outlets report the January 2028 figure from the same committee session. The same institution therefore has two incompatible dates on the public record one month apart, and which is contractual is not stated anywhere located. Resolving records are identified in GAP-006.',
    resolved: false,
  },
]

export const discrepancyById = new Map(discrepancies.map((d) => [d.id, d]))
