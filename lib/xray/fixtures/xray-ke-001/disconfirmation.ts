/**
 * XRAY-KE-001 — canonical Disconfirmation records.
 *
 * Claim-addressable, one per load-bearing claim. Both benchmark runs performed
 * a disconfirmation pass on every claim they carried; these records reproduce
 * the searches those runs actually ran. No search is invented, and no pass is
 * recorded for a claim neither run attacked.
 *
 * Where the two runs framed the preliminary hypothesis in OPPOSITE directions
 * — C003 — that is stated in `effectOnFinding` rather than resolved by
 * choosing one framing.
 */

import type { Disconfirmation } from '@/lib/xray/domain'

export const disconfirmations: Disconfirmation[] = [
  {
    // [C:06 C001] [G:06 C001] — both runs, same result.
    id: 'DCF-001',
    claimId: 'C001',
    preliminaryHypothesis:
      '63 km is the main-carriageway length, and the larger figures describe other definitions.',
    counterHypothesis:
      '63 km is stale — a pre-2021 design figure or journalistic carry-over — and the current project is 122 km of main road.',
    searchStrategy: [
      'Project name with "122 km"',
      'KeNHA tender award notices for lot chainages',
      'Contractor project pages',
      'PS Omollo statement and its reproductions',
      'Searches on the unexplained "44 km" figure',
    ],
    strongestSupportingEvidenceIds: ['EV-001', 'EV-002', 'EV-003'],
    strongestOpposingEvidenceIds: ['EV-005', 'EV-008', 'EV-009'],
    result: 'SURVIVED_WEAKENED',
    effectOnFinding:
      'Survived with scope qualification. The mainline arithmetic and PS Omollo\'s explicit definition support 63 km as one valid measure, but the surface source presents "63-kilometre Highway" while omitting that roughly 60 km of further works sit inside the same contracts. Graded SUPPORTED rather than ESTABLISHED. Both runs reached this outcome; they differed only on confidence.',
  },

  {
    // [C:06 C002] [G:06 C002] — both runs, same result.
    id: 'DCF-002',
    claimId: 'C002',
    preliminaryHypothesis:
      'KSh 16.7 billion is the authoritative current project value.',
    counterHypothesis:
      'KSh 16.7bn is a rounded or revised public figure unsupported by the underlying contract values, and the awarded works total of KSh 15.88bn is the real figure.',
    searchStrategy: [
      '"16.7 billion" with the project name',
      'KeNHA award notices across four quarters, seeking a Lot 3 supervision award',
      'Auditor-General reports on KeNHA',
      'Treasury budget estimates and sector reports',
      'Road Maintenance Levy Fund securitisation reporting by project',
    ],
    strongestSupportingEvidenceIds: ['EV-013', 'EV-016'],
    strongestOpposingEvidenceIds: ['EV-010', 'EV-012', 'EV-018'],
    result: 'CHANGED',
    effectOnFinding:
      'Neither figure could be shown to be the current contract value, so the hypothesis changed to UNRESOLVED. The primary record establishes the awarded works value only. KSh 16.7bn cannot be dismissed — KeNHA\'s own regional office uses it — and it cannot be established, because no record explains its composition. Works plus located supervision already reach KSh 16.385bn, and scope additions (two bridges to be redesigned, a planned interchange) are on record without values. The supervision explanation is a hypothesis, not a finding.',
  },

  {
    /**
     * THE REGRESSION CASE. [C:06 C003] [G:06 C003]
     *
     * The two runs framed this in opposite directions: Claude hypothesised the
     * claim was FALSE and found that survived; GPT hypothesised the claim was
     * TRUE and found it did not survive as established fact. Both concluded
     * that the located evidence settles neither direction, because it does not
     * measure the quantity the claim is about.
     *
     * Recorded as UNRESOLVED, which is what both runs' reasoning actually
     * supports, rather than adopting either framing.
     */
    id: 'DCF-003',
    claimId: 'C003',
    preliminaryHypothesis:
      'More than half of the relevant road sections have already been surfaced.',
    counterHypothesis:
      'The surface source overstates physical delivery, and most sections are not tarmacked.',
    searchStrategy: [
      '"tarmacked", "asphalt" and "DBM" with the project name',
      'Local reporting and residents\' accounts',
      'Parliamentary inspection accounts',
      'KeNHA statements and progress reporting 2025–2026',
      'Searches for any km-surfaced or engineer\'s progress measurement',
    ],
    strongestSupportingEvidenceIds: ['EV-026', 'EV-027'],
    strongestOpposingEvidenceIds: ['EV-020', 'EV-021', 'EV-022', 'EV-023'],
    result: 'UNRESOLVED',
    effectOnFinding:
      'Neither direction is established, so the finding is INSUFFICIENT_EVIDENCE — not CONTRADICTED. No located source of any kind describes most of the road as surfaced, and every official progress figure sits at or below 34%. But those figures measure physical project completion against contractual work, which cannot be converted into a proportion of road length surfaced, and asphalt laying is documented as active in September 2026. The counter-hypothesis is not excluded by evidence, only unsupported by it. The two benchmark runs framed the preliminary hypothesis in opposite directions and both arrived here. What would settle it is a certified surfaced-kilometre measurement — GAP-002.',
  },

  {
    // [C:06 C004] [G:06 C004] — both runs, same result.
    id: 'DCF-004',
    claimId: 'C004',
    preliminaryHypothesis:
      'The road was on the published programme for Monday 14 September 2026.',
    counterHypothesis:
      'The road is not on the official programme, or the itinerary changed, or the surface source inserted the project into it.',
    searchStrategy: [
      'Tour itinerary reporting, 11–13 September 2026',
      'Searches for an official State House or PCS programme',
    ],
    strongestSupportingEvidenceIds: ['EV-033'],
    strongestOpposingEvidenceIds: ['EV-034'],
    result: 'SURVIVED',
    effectOnFinding:
      'Survives as a scheduling claim. Contemporaneous itinerary reporting independently describes the planned road inspection. What does not survive is any stronger wording that the inspection had occurred — the visit was scheduled for the day after the research cutoff, and no official programme was retrieved. Itineraries differ on tour length and county order, which weakens the detail without unseating the scheduling.',
  },

  {
    // [G:06 C005] — GPT run.
    id: 'DCF-005',
    claimId: 'DC001',
    preliminaryHypothesis:
      'The road remained substantially incomplete immediately before the tour.',
    counterHypothesis:
      'The status figures were stale and most of the work had since been completed.',
    searchStrategy: [
      'Latest ministry- and KeNHA-attributed project status data',
      'Reports of resumed works and site activity in September 2026',
    ],
    strongestSupportingEvidenceIds: ['EV-029', 'EV-030', 'EV-031'],
    strongestOpposingEvidenceIds: ['EV-032'],
    result: 'SURVIVED',
    effectOnFinding:
      'Survives strongly. The September figures follow a June KeNHA-attributed figure of 28% overall and Treasury completion data from June 2025, and no credible located evidence shows the project approaching overall completion by 13 September 2026. Graded SUPPORTED with HIGH confidence.',
  },

  {
    // [C:06 C005] — Claude run.
    id: 'DCF-006',
    claimId: 'DC002',
    preliminaryHypothesis:
      "KeNHA's latest completion date is January 2028.",
    counterHypothesis:
      'July 2027 is the operative date and January 2028 was misreported or refers to something else.',
    searchStrategy: [
      'Both dates with the project name',
      'Committee reporting across three outlets',
      'KNA and GAA publications after June 2026',
    ],
    strongestSupportingEvidenceIds: ['EV-035', 'EV-036'],
    strongestOpposingEvidenceIds: [],
    result: 'CHANGED',
    effectOnFinding:
      "Changed to CONTESTED. KeNHA's regional office repeated July 2027 in July 2026, after the January 2028 statement, and three independent outlets carry the January 2028 figure from the same committee session — so misreporting is unlikely. Two KeNHA-sourced dates coexist and which is contractual is not on any located record.",
  },
]

export const disconfirmationById = new Map(disconfirmations.map((d) => [d.id, d]))
