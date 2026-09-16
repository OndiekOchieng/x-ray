/**
 * XRAY-KE-001 — canonical Evidence.
 *
 * A Source is a record; Evidence is a proposition extracted from it and
 * connected to claims. One source yields many propositions.
 *
 * TWO RULES THIS MODULE HOLDS TO
 *
 * 1. Evidence is only extracted from sources actually obtained
 *    (`accessibility: 'RETRIEVED' | 'PARTIAL'`). Originating records that were
 *    never held — SRC-009, SRC-011, SRC-015, SRC-017 — anchor dependency edges
 *    and gaps, but yield no propositions. You cannot quote a record you never
 *    read. Asserted by the integrity check.
 *
 * 2. The surface source SRC-001 yields NO evidence bearing on C001–C004
 *    (XR-INV-001). It establishes that the claims were made, not that they are
 *    true. Asserted by the integrity check.
 *
 * TEMPORAL SCOPE: `Evidence.timeScope` carries when an observation or
 * measurement is true of, which is not the same as when its source was
 * published — Treasury's November 2025 report states completion as at 30 June
 * 2025. `Measurement.definition` is reserved for measurement semantics and
 * carries no dates. Where the frozen runs give no measurement date, that is
 * said in `description` rather than filled in.
 *
 * NOTE ON `CONTRADICTS`: no record in this fixture uses it. That is the
 * finding, not an omission — the benchmark located no measurement-compatible
 * evidence contradicting any surface claim. See discrepancies.ts DISC-003.
 */

import type { Evidence } from '@/lib/xray/domain'

export const evidence: Evidence[] = [
  // =========================================================================
  // C001 — road length / scope
  // =========================================================================
  {
    // [C:S008] The reconciling definition. Origin (SRC-009) not retrieved;
    // extracted from the Capital FM reproduction that was.
    id: 'EV-001',
    sourceId: 'SRC-010',
    proposition:
      'PS Raymond Omollo describes the works as a 122-kilometre road of which about 63 kilometres is main carriageway earmarked for upgrading, with feeder roads and related sections making up the remainder of the project scope.',
    quotedPassage:
      '122-kilometre road… with about 63 kilometres of the main carriageway earmarked for upgrading. Additional works on feeder roads and related sections bring the total project scope to approximately 122 kilometres.',
    relationship: 'SUPPORTS',
    claimIds: ['C001'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'road_length',
      value: 63,
      unit: 'km',
      scope: 'main carriageway earmarked for upgrading',
      definition: 'Main carriageway only, explicitly distinguished from feeder and related works.',
    },
  },
  {
    // [C:S002] Lot 2 chainage KM 12+600 – KM 40+000 = 27.4 km.
    id: 'EV-002',
    sourceId: 'SRC-002',
    proposition:
      'The Lot 2 works contract (KeNHA/2371/2020, Miwani–Chemelil) covers chainage KM 12+600 to KM 40+000, i.e. 27.4 km of main carriageway.',
    quotedPassage: 'Lot 2 Miwani–Chemelil (KM 12+600 – KM 40+000)',
    relationship: 'SUPPORTS',
    claimIds: ['C001'],
    strength: 'DIRECT',
    measurement: {
      metric: 'road_length',
      value: 27.4,
      unit: 'km',
      scope: 'Lot 2 main carriageway, Miwani–Chemelil',
      definition: 'Derived from the contract chainage stated in the award notice.',
    },
  },
  {
    // [C:S017] [G:S005]
    id: 'EV-003',
    sourceId: 'SRC-007',
    proposition:
      'H. Young describes Lot 3 as approximately 23 km of main project road, from about 1 km short of Chemelil roundabout through Muhoroni to the A12 near Kaitui.',
    relationship: 'SUPPORTS',
    claimIds: ['C001'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'road_length',
      value: 23,
      unit: 'km',
      scope: 'Lot 3 main project road, Chemelil–Muhoroni–Kipsitet',
    },
  },
  {
    // [C:S004] [G:S004]
    id: 'EV-004',
    sourceId: 'SRC-004',
    proposition:
      'KeNHA deputy director Samwel Kumba, on the record, describes the road as 63 km.',
    relationship: 'SUPPORTS',
    claimIds: ['C001'],
    strength: 'STRONG_INDIRECT',
    timeScope: { description: 'As described by KeNHA on the record in 2022.' },
    measurement: { metric: 'road_length', value: 63, unit: 'km', scope: 'the road' },
  },
  {
    // [C:S007] [G:S002]
    id: 'EV-005',
    sourceId: 'SRC-008',
    proposition:
      'MyGov describes the works as a 122-kilometre road divided into three lots, with Lot 1 at 33.9 km, Lot 2 at 43.4 km and Lot 3 at 44.7 km.',
    relationship: 'CHALLENGES',
    claimIds: ['C001'],
    strength: 'CONTEXTUAL',
    measurement: {
      metric: 'road_length',
      value: 122,
      unit: 'km',
      scope: 'total works, all three lots',
      definition: 'Stated without distinguishing main carriageway from feeder and spur works.',
    },
  },
  {
    // [G:S003] The ESIA is what makes the scope reconciliation credible.
    id: 'EV-006',
    sourceId: 'SRC-006',
    proposition:
      'The KeNHA ESIA states that the project will include 54 km of spur roads, separately from the main road being reconstructed.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C001'],
    strength: 'DIRECT',
    measurement: {
      metric: 'road_length',
      value: 54,
      unit: 'km',
      scope: 'spur roads, counted separately from the main corridor',
    },
  },
  {
    // [C:S017] [G:S005]
    id: 'EV-007',
    sourceId: 'SRC-007',
    proposition:
      'H. Young separately counts Lot 3 feeder/spur works — Muhoroni–Songhor about 14 km and a Junction C35–Koru link of about 5.5 km — bringing that lot to about 42.5 km in total.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C001'],
    strength: 'DIRECT',
    measurement: {
      metric: 'road_length',
      value: 42.5,
      unit: 'km',
      scope: 'Lot 3, main road plus feeder/spur works',
      definition: 'Demonstrates that main-road length and total construction kilometres are different measures within one lot.',
    },
  },
  {
    // [C:S010]
    id: 'EV-008',
    sourceId: 'SRC-013',
    proposition:
      "KeNHA's Nyanza regional office is reported as putting total project length at about 44 kilometres including spur roads.",
    relationship: 'CHALLENGES',
    claimIds: ['C001'],
    strength: 'WEAK',
    measurement: {
      metric: 'road_length',
      value: 44,
      unit: 'km',
      scope: 'total project length including spur roads, as stated by the regional office',
      definition: 'Not reconcilable with either 63 km or 122 km; no source explains it.',
    },
  },
  {
    // [C:S016]
    id: 'EV-009',
    sourceId: 'SRC-018',
    proposition:
      'The September 2026 ministry-attributed lot lengths are Lot 1 12.9 km, Lot 2 43.4 km and Lot 3 44.5 km, totalling 100.8 km.',
    relationship: 'CHALLENGES',
    claimIds: ['C001'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'road_length',
      value: 100.8,
      unit: 'km',
      scope: 'sum of the three published lot lengths',
      definition: 'Does not sum to 122 km, and is not stated to be main carriageway.',
    },
  },

  // =========================================================================
  // C002 — project value. The financial chain.
  // =========================================================================
  {
    // [C:S002] The only primary financial record recovered.
    id: 'EV-010',
    sourceId: 'SRC-002',
    proposition:
      'The three awarded works contracts are Lot 1 KSh 5,194,524,145.57 (China Railway No.10 JV Pinnie Agency), Lot 2 KSh 4,964,716,883.42 (Sinohydro JV Gragab Agencies) and Lot 3 KSh 5,720,767,704.00 (H. Young & Co (EA)), totalling KSh 15,880,008,733.',
    relationship: 'CHALLENGES',
    claimIds: ['C002'],
    strength: 'DIRECT',
    timeScope: {
      asOf: '2021-06-30',
      description: 'At award, 4th quarter FY2020/21. No later variation is reflected.',
    },
    measurement: {
      metric: 'awarded_works_contract_sum',
      value: 15.880008733,
      unit: 'KES_BILLION',
      scope: 'three works contracts, Lots 1–3',
      definition:
        'Sum of awarded works contracts. Excludes supervision consultancies, variations and price adjustment.',
    },
  },
  {
    // [C:S002] + [C:D002] tested explanation (i).
    id: 'EV-011',
    sourceId: 'SRC-002',
    proposition:
      'The same notice awards supervision consultancies for Lot 1 (KSh 243,748,108.80) and Lot 2 (KSh 261,536,755.20), together KSh 505,284,864. No Lot 3 supervision award appears in this notice.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C002'],
    strength: 'DIRECT',
    measurement: {
      metric: 'supervision_contract_sum',
      value: 0.505284864,
      unit: 'KES_BILLION',
      scope: 'supervision consultancies, Lots 1 and 2 only',
      definition:
        'Works plus these supervision awards reach KSh 16.385bn. A Lot 3 supervision contract, if one exists, was not located.',
    },
  },
  {
    // [G:S001] Treasury reaches 16.385bn by an entirely different route.
    id: 'EV-012',
    sourceId: 'SRC-005',
    proposition:
      'The National Treasury records the three lots at estimated costs of KSh 5.438bn, KSh 5.226bn and KSh 5.721bn, totalling approximately KSh 16.385 billion, all marked ongoing.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C002'],
    strength: 'DIRECT',
    timeScope: { asOf: '2025-11-18', description: 'As recorded in the November 2025 Treasury sector report.' },
    measurement: {
      metric: 'estimated_project_cost',
      value: 16.385,
      unit: 'KES_BILLION',
      scope: 'three-lot project, Treasury estimate',
      definition:
        'Treasury estimated project cost, which the record distinguishes from budget and expenditure fields. It does not establish that this sum was spent.',
    },
  },
  {
    // [C:S009] Earliest located publication of the 16.7bn figure.
    id: 'EV-013',
    sourceId: 'SRC-012',
    proposition:
      "KeNHA's Nyanza regional office describes the project as valued at KSh 16.7 billion during its 8 May 2026 site briefing.",
    relationship: 'SUPPORTS',
    claimIds: ['C002'],
    strength: 'STRONG_INDIRECT',
    timeScope: { asOf: '2026-05-08', description: 'As stated at the KeNHA Nyanza site briefing.' },
    measurement: {
      metric: 'project_value',
      value: 16.7,
      unit: 'KES_BILLION',
      scope: 'the project, as described by KeNHA Nyanza regional office',
      definition: 'Composition not stated by the source.',
    },
  },
  {
    // [C:S010] dependent repetition of SRC-011.
    id: 'EV-014',
    sourceId: 'SRC-013',
    proposition: 'People Daily repeats the KSh 16.7 billion project value from the same KeNHA briefing.',
    relationship: 'SUPPORTS',
    claimIds: ['C002'],
    strength: 'WEAK',
  },
  {
    // [C:S011] dependent repetition of SRC-011.
    id: 'EV-015',
    sourceId: 'SRC-014',
    proposition: 'Radio47 reports the project at approximately KSh 16.7 billion from the same KeNHA briefing.',
    relationship: 'SUPPORTS',
    claimIds: ['C002'],
    strength: 'WEAK',
  },
  {
    // [G:S006] The figure is also in official use in the parliamentary context.
    id: 'EV-016',
    sourceId: 'SRC-016',
    proposition:
      'Reporting of the June 2026 parliamentary inspection also refers to the project as a KSh 16.7 billion project.',
    relationship: 'SUPPORTS',
    claimIds: ['C002'],
    strength: 'WEAK',
  },
  {
    // [C:S007] [G:S002]
    id: 'EV-017',
    sourceId: 'SRC-008',
    proposition: 'MyGov describes the works as costing KSh 15.7 billion.',
    relationship: 'CHALLENGES',
    claimIds: ['C002'],
    strength: 'CONTEXTUAL',
    timeScope: { asOf: '2025-05-06' },
    measurement: {
      metric: 'project_value',
      value: 15.7,
      unit: 'KES_BILLION',
      scope: 'total works',
      definition: 'A rounding of the awarded works total rather than an independent valuation.',
    },
  },
  {
    // [C:S016] [G:S007]
    id: 'EV-018',
    sourceId: 'SRC-018',
    proposition:
      'The September 2026 ministry-attributed lot values are KSh 5.19bn, KSh 4.96bn and KSh 5.72bn, totalling approximately KSh 15.87 billion — the awarded works sums, two days before the surface article.',
    relationship: 'CHALLENGES',
    claimIds: ['C002'],
    strength: 'STRONG_INDIRECT',
    timeScope: { description: 'As reported in the September 2026 ministry status data.' },
    measurement: {
      metric: 'project_value',
      value: 15.87,
      unit: 'KES_BILLION',
      scope: 'three-lot project',
      definition:
        'The awarded works sums rather than any revised contract value; no revision is reflected.',
    },
  },
  {
    // [C:S004] [G:S004]
    id: 'EV-019',
    sourceId: 'SRC-004',
    proposition:
      'KeNHA, on the record in 2022, gives the three lot sums as KSh 5.19bn, KSh 4.96bn and KSh 5.72bn — about KSh 15.87 billion.',
    relationship: 'CHALLENGES',
    claimIds: ['C002'],
    strength: 'STRONG_INDIRECT',
    timeScope: {
      description: 'As stated by KeNHA on the record in 2022; the awards themselves date from 2021.',
    },
    measurement: {
      metric: 'awarded_works_contract_sum',
      value: 15.87,
      unit: 'KES_BILLION',
      scope: 'three works contracts',
    },
  },

  // =========================================================================
  // C003 — "most sections tarmacked". THE SAME-MEASURE REGRESSION CASE.
  //
  // Every record below measures PHYSICAL PROJECT COMPLETION against
  // CONTRACTUAL WORK. C003 measures SURFACED LENGTH against ROAD SECTIONS.
  // Different metric, different denominator — so these CHALLENGE and
  // CONTEXTUALIZE. None CONTRADICTS. XR-INV-005.
  // =========================================================================
  {
    // [C:S016] [G:S007]
    id: 'EV-020',
    sourceId: 'SRC-018',
    proposition:
      'September 2026 ministry-attributed status data puts Lot 1 (Mamboleo Junction–Miwani) at 20.2% completion.',
    relationship: 'CHALLENGES',
    claimIds: ['C003'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      value: 20.2,
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'Lot 1, Mamboleo Junction–Miwani',
      definition:
        'Overall physical completion against contractual work. NOT a measure of road length surfaced; not compatible with the claim measurement on C003.',
    },
    timeScope: {
      description:
        'September 2026 ministry status data. The release does not state the date the measurement was taken.',
    },
  },
  {
    id: 'EV-021',
    sourceId: 'SRC-018',
    proposition: 'The same data puts Lot 2 (Miwani–Chemelil) at 34% completion.',
    relationship: 'CHALLENGES',
    claimIds: ['C003'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      value: 34,
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'Lot 2, Miwani–Chemelil',
      definition: 'Overall physical completion against contractual work, not road length surfaced.',
    },
    timeScope: {
      description:
        'September 2026 ministry status data. The release does not state the date the measurement was taken.',
    },
  },
  {
    id: 'EV-022',
    sourceId: 'SRC-018',
    proposition: 'The same data puts Lot 3 (Chemelil–Muhoroni–Kipsitet) at 28% completion.',
    relationship: 'CHALLENGES',
    claimIds: ['C003'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      value: 28,
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'Lot 3, Chemelil–Muhoroni–Kipsitet',
      definition: 'Overall physical completion against contractual work, not road length surfaced.',
    },
    timeScope: {
      description:
        'September 2026 ministry status data. The release does not state the date the measurement was taken.',
    },
  },
  {
    // [C:S014] [G:S006]
    id: 'EV-023',
    sourceId: 'SRC-016',
    proposition:
      'KeNHA told the National Assembly Roads Committee in June 2026 that the three-contractor project stood at 28% overall completion.',
    relationship: 'CHALLENGES',
    claimIds: ['C003'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      value: 28,
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'whole three-lot project',
      definition: 'Overall physical completion against contractual work, not road length surfaced.',
    },
    timeScope: { asOf: '2026-06-06', description: 'As stated to the committee during its inspection.' },
  },
  {
    // [G:S008] Dependent corroboration — deliberately WEAK. XR-INV-004.
    id: 'EV-024',
    sourceId: 'SRC-019',
    proposition:
      'Radio47 reports the same three lot progress figures — 20.2%, 34% and 28%.',
    relationship: 'CHALLENGES',
    claimIds: ['C003'],
    strength: 'WEAK',
  },
  {
    // [G:S009] Dependent corroboration — deliberately WEAK. XR-INV-004.
    id: 'EV-025',
    sourceId: 'SRC-020',
    proposition: 'The Star reports the same three lot values and progress figures.',
    relationship: 'CHALLENGES',
    claimIds: ['C003'],
    strength: 'WEAK',
  },
  {
    // [G:S010] The evidence FOR tarmacking activity — and the limit of it.
    id: 'EV-026',
    sourceId: 'SRC-021',
    proposition:
      'Asphalt laying was actively occurring on the corridor in September 2026, with paving machinery deployed. This establishes that some tarmacking is occurring; it does not measure how much of the road is surfaced.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C003'],
    strength: 'CONTEXTUAL',
  },
  {
    // [C:S009]
    id: 'EV-027',
    sourceId: 'SRC-012',
    proposition:
      'The resident engineer describes Dense Bitumen Macadam being laid at Mamboleo in May 2026.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C003'],
    strength: 'CONTEXTUAL',
  },
  {
    // [G:S001] Same source, C003 — older and a different metric again.
    id: 'EV-028',
    sourceId: 'SRC-005',
    proposition:
      'Treasury records completion at 30 June 2025 as Lot 1 15.2%, Lot 2 11.6% and Lot 3 24.1%.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C003'],
    strength: 'CONTEXTUAL',
    measurement: {
      metric: 'physical_project_completion',
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'three lots',
      definition: 'Overall physical completion against contractual work, not surfaced length.',
    },
    timeScope: {
      asOf: '2025-06-30',
      description:
        'Completion as at 30 June 2025, recorded in a report published in November 2025 — fifteen months before the surface claim.',
    },
  },

  // =========================================================================
  // DC001 — substantially incomplete before the tour.
  //
  // The SAME underlying figures as EV-020..023, but bearing on a claim they
  // actually measure — so the relationship flips to SUPPORTS. This is why
  // relationship lives on Evidence rather than on Source.
  // =========================================================================
  {
    // [G:S007] [G:C005 grade]
    id: 'EV-029',
    sourceId: 'SRC-018',
    proposition:
      'Ministry-attributed status data two days before the tour puts the three lots at 20.2%, 34% and 28% physical completion.',
    relationship: 'SUPPORTS',
    claimIds: ['DC001'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'three-lot project',
      definition: 'The metric DC001 is stated in, so the comparison here is measurement-compatible.',
    },
    timeScope: {
      description:
        'September 2026 ministry status data. The release does not state the date the measurement was taken.',
    },
  },
  {
    // [G:S006]
    id: 'EV-030',
    sourceId: 'SRC-016',
    proposition:
      "KeNHA's June 2026 statement of 28% overall completion is consistent with the September lot figures.",
    relationship: 'SUPPORTS',
    claimIds: ['DC001'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      value: 28,
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'whole three-lot project',
    },
    timeScope: { asOf: '2026-06-06' },
  },
  {
    // [G:S001]
    id: 'EV-031',
    sourceId: 'SRC-005',
    proposition:
      'Treasury records the three lots as ongoing at 15.2%, 11.6% and 24.1% completion at 30 June 2025.',
    relationship: 'SUPPORTS',
    claimIds: ['DC001'],
    strength: 'STRONG_INDIRECT',
    measurement: {
      metric: 'physical_project_completion',
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'three lots',
    },
    timeScope: { asOf: '2025-06-30', description: 'Completion as at 30 June 2025.' },
  },
  {
    // [G:C005 disconfirmation] "Strongest contrary evidence: reports of
    // resumed tarmacking and visible construction progress."
    id: 'EV-032',
    sourceId: 'SRC-021',
    proposition:
      'Resumed tarmacking and visible construction activity in September 2026 show the project advancing.',
    relationship: 'CHALLENGES',
    claimIds: ['DC001'],
    strength: 'CONTEXTUAL',
  },

  // =========================================================================
  // C004 — scheduled inspection
  // =========================================================================
  {
    // [C:S018] [G:S011]
    id: 'EV-033',
    sourceId: 'SRC-022',
    proposition:
      'Contemporaneous itinerary reporting says the President is expected on Monday to inspect road projects along the Mamboleo–Miwani–Chemelil–Muhoroni and Kipsitet routes.',
    relationship: 'SUPPORTS',
    claimIds: ['C004'],
    strength: 'STRONG_INDIRECT',
  },
  {
    // [C:D008] itinerary variance.
    id: 'EV-034',
    sourceId: 'SRC-022',
    proposition:
      'The same reporting describes the tour as four-day covering 13–17 September, where the surface source describes a five-day tour — the published itineraries differ on length and county order.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['C004'],
    strength: 'WEAK',
  },

  // =========================================================================
  // DC002 — two official completion dates
  // =========================================================================
  {
    // [C:S010]
    id: 'EV-035',
    sourceId: 'SRC-013',
    proposition:
      "KeNHA's Nyanza regional director gives completion as July 2027.",
    relationship: 'SUPPORTS',
    claimIds: ['DC002'],
    strength: 'STRONG_INDIRECT',
  },
  {
    // [C:S014] [G:S006]
    id: 'EV-036',
    sourceId: 'SRC-016',
    proposition:
      'One month later, KeNHA tells the National Assembly Roads Committee that completion is expected in January 2028 under a revised schedule, citing pending bills, slow funding and weather.',
    relationship: 'SUPPORTS',
    claimIds: ['DC002'],
    strength: 'STRONG_INDIRECT',
  },
  {
    // [C:S003]
    id: 'EV-037',
    sourceId: 'SRC-003',
    proposition:
      'A KeNHA award letter of 12 March 2021 sets the Lot 2 contract period at 60 months — 36 months to completion plus 24 months defects liability.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['DC002'],
    strength: 'STRONG_INDIRECT',
  },
  {
    // [G:S005]
    id: 'EV-038',
    sourceId: 'SRC-007',
    proposition:
      'H. Young records Lot 3 commencement in October 2021 with a then-stated completion of January 2024.',
    relationship: 'CONTEXTUALIZES',
    claimIds: ['DC002'],
    strength: 'DIRECT',
  },
]

export const evidenceById = new Map(evidence.map((e) => [e.id, e]))
