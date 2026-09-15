/**
 * XRAY-KE-001 — canonical Claims.
 *
 * C001–C004  controlled surface claims, decomposed from the Citizen Digital
 *            article. Both runs decomposed the same four.
 * DC001–DC002 claims discovered during tracing. XR-INV-012 keeps them in a
 *            separate identifier namespace; the domain types enforce it.
 *
 * No C005 is reserved. The two runs each discovered a *different* fifth claim,
 * which is why the discovered namespace exists rather than a reserved slot.
 */

import type { Claim } from '@/lib/xray/domain'

/**
 * The focus passage, preserved verbatim from the surface source.
 * [C:01 — SOURCE RECORD, "Relevant content (focus passage, preserved verbatim)"]
 */
export const SURFACE_FOCUS_PASSAGE =
  'Earlier in the day, Ruto is expected to visit a number of ongoing projects in Kisumu, ' +
  'including the Ksh.16.7 billion, 63-kilometre Mamboleo Junction-Miwani-Chemelil-Muhoroni-Kipsitet ' +
  'Highway, most sections of which have already been tarmacked.'

const INVESTIGATION_ID = 'XRAY-KE-001'

export const claims: Claim[] = [
  {
    id: 'C001',
    origin: 'SURFACE',
    investigationId: INVESTIGATION_ID,
    // [C:C001] [G:C001]
    text: 'The principal/main road corridor is approximately 63 km in length.',
    sourcePassage: '63-kilometre Mamboleo Junction-Miwani-Chemelil-Muhoroni-Kipsitet Highway',
    layer: 'OBSERVATION',
    // Both runs classified this "quantitative/geographic". The domain type is
    // single-valued; the asserted magnitude is what is testable, so
    // QUANTITATIVE is carried and the geographic aspect lives in `entities`.
    type: 'QUANTITATIVE',
    priority: 'HIGH',
    entities: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'Kenya National Highways Authority (KeNHA)',
      'Kisumu County',
      'Nandi County',
      'Kericho County',
    ],
    ambiguities: [
      // [C:C001] ambiguity column
      'Does 63 km denote the main carriageway only, the total works length including feeder/spur roads, lane-km, or the original 1960s alignment?',
      'Located sources also use 122 km, ~100.8 km and 44 km for the same project.',
    ],
    measurement: {
      metric: 'road_length',
      value: 63,
      unit: 'km',
      scope: 'principal/main corridor, Mamboleo Junction to Kipsitet',
      definition:
        'Length as asserted by the surface source, which does not state whether feeder and spur works are included.',
    },
    timeScope: {
      // [C:C001] time_scope "present (project as scoped)"
      asOf: '2026-09-13',
      description: 'Present, as the project is currently scoped.',
    },
  },

  {
    id: 'C002',
    origin: 'SURFACE',
    investigationId: INVESTIGATION_ID,
    // [C:C002] [G:C002]
    text: 'The project is worth KSh 16.7 billion.',
    sourcePassage: 'Ksh.16.7 billion … Highway',
    layer: 'OBSERVATION',
    type: 'FINANCIAL',
    priority: 'HIGH',
    entities: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'Kenya National Highways Authority (KeNHA)',
      'The National Treasury',
    ],
    ambiguities: [
      // [C:C002] and [G:C002] state the same set of possible meanings.
      '"Worth" is undefined: sum of awarded works contracts; works plus supervision; revised contract value after variations or price adjustment; budget/financing envelope; total programme cost; or amount spent.',
      'The surface source attributes the figure to no one.',
    ],
    measurement: {
      metric: 'project_value',
      value: 16.7,
      unit: 'KES_BILLION',
      scope: 'the project as described by the surface source',
      definition:
        'Not stated by the source. Whether this is contract sum, estimated cost, revised cost, financing envelope or expenditure is exactly what is unresolved.',
    },
    timeScope: {
      // [C:C002] time_scope "undated"
      description: 'Undated. The source gives no date for the value.',
    },
  },

  {
    id: 'C003',
    origin: 'SURFACE',
    investigationId: INVESTIGATION_ID,
    // [C:C003] [G:C003]
    text: 'Most sections of the road have already been tarmacked.',
    sourcePassage: 'most sections of which have already been tarmacked',
    layer: 'OBSERVATION',
    type: 'DELIVERY',
    priority: 'HIGH',
    entities: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'Kenya National Highways Authority (KeNHA)',
    ],
    ambiguities: [
      // [C:C003] ambiguity column, [G:C003] ambiguity column
      '"Sections" — contract lots, or physical stretches?',
      '"Tarmacked" — any bituminous layer laid, or completed pavement?',
      '"Most" — by length, by lot count, or by value?',
    ],
    /**
     * THE SAME-MEASURE REGRESSION CASE (XR-INV-005).
     *
     * This claim measures SURFACED LENGTH as a proportion of road sections.
     * The evidence located measures PHYSICAL PROJECT COMPLETION as a
     * proportion of contractual work. Different metric, different denominator.
     *
     * The two are not automatically comparable, which is why no Evidence in
     * this fixture carries `relationship: 'CONTRADICTS'` against C003, and why
     * the finding is INSUFFICIENT_EVIDENCE rather than CONTRADICTED.
     */
    measurement: {
      metric: 'surfaced_length',
      // No value: "most" is not quantified by the source.
      unit: 'proportion',
      denominator: 'road_sections',
      scope: 'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road as described by the surface source',
      definition:
        'Proportion of road sections carrying tarmac. Neither "sections" nor "tarmacked" nor "most" is defined by the source. This is NOT physical project completion against contractual work.',
    },
    timeScope: {
      // [C:C003] time_scope "as at 13 Sep 2026"
      asOf: '2026-09-13',
      description: 'As at the date of publication of the surface source.',
    },
  },

  {
    id: 'C004',
    origin: 'SURFACE',
    investigationId: INVESTIGATION_ID,
    // [C:C004] [G:C004]. Deliberately worded as scheduling only: the research
    // cutoff precedes the visit, so "occurred" is not assertable (XR-INV-001,
    // and the scheduled-vs-occurred acceptance fixture).
    text:
      'The President was scheduled or expected to inspect the road project during the September 2026 Nyanza tour.',
    sourcePassage:
      'Ruto is expected to visit a number of ongoing projects in Kisumu, including the … Highway',
    layer: 'OBSERVATION',
    type: 'TIMELINE',
    priority: 'MEDIUM',
    entities: [
      'William Ruto',
      'State House / Presidential Communication Service',
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
    ],
    ambiguities: [
      // [C:C004] ambiguity column
      'The source says "visit", not "commission".',
      '"Expected to" records an itinerary, not an occurrence.',
      'Tour length and county order differ across contemporaneous itineraries.',
    ],
    timeScope: {
      // The visit was scheduled for Monday 14 Sep 2026 — one day AFTER cutoff.
      asOf: '2026-09-13',
      from: '2026-09-14',
      description:
        'Inspection scheduled for Monday 14 September 2026, which is after the 2026-09-13 research cutoff. Occurrence is therefore not establishable from this investigation.',
    },
  },

  // -------------------------------------------------------------------------
  // Discovered claims
  // -------------------------------------------------------------------------
  {
    id: 'DC001',
    origin: 'DISCOVERED',
    investigationId: INVESTIGATION_ID,
    /**
     * WHY INCLUDED: [G:C005]. The GPT run discovered this while tracing C003 —
     * the article's "most sections … already tarmacked" collided with multiple
     * recent status records describing the three lots as one-fifth to one-third
     * complete. GPT graded it SUPPORTED / HIGH and ran a full disconfirmation
     * pass on it.
     *
     * It is materially useful because it is the proposition the located
     * evidence CAN carry, as distinct from C003, which it cannot. Keeping the
     * two separate is what stops project-completion data being silently
     * converted into a surfacing measurement.
     */
    text:
      'The three-lot project remained substantially incomplete immediately before the September 2026 tour.',
    layer: 'OBSERVATION',
    type: 'DELIVERY',
    priority: 'HIGH',
    entities: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'Kenya National Highways Authority (KeNHA)',
      'Ministry of Interior and National Administration',
    ],
    ambiguities: [
      // [G:C005] ambiguity column
      'Physical completion percentage is not necessarily identical to percentage of mainline already surfaced.',
    ],
    measurement: {
      metric: 'physical_project_completion',
      unit: 'percent',
      denominator: 'contractual_work',
      scope: 'three-lot project',
      definition:
        'Overall physical completion against contractual work, as reported per lot by the September 2026 ministry status data. This is the measure the evidence actually carries.',
    },
    timeScope: {
      asOf: '2026-09-13',
      description: 'Immediately before the September 2026 tour.',
    },
  },

  {
    id: 'DC002',
    origin: 'DISCOVERED',
    investigationId: INVESTIGATION_ID,
    /**
     * WHY INCLUDED: [C:C005]. The Claude run discovered this while tracing
     * C002 and C003 — the award record implies a 36-month contract period from
     * a 2022 commencement, while two different official completion dates are on
     * the public record. Claude graded it CONTESTED / HIGH and ran a full
     * disconfirmation pass on it.
     *
     * It is materially useful because it is the only claim in the corpus whose
     * discrepancy survived reconciliation testing as a GENUINE_CONTRADICTION —
     * it demonstrates that the constrained classification is reachable when the
     * evidence earns it, not merely forbidden.
     *
     * NOTE: the two benchmark runs discovered DIFFERENT fifth claims. Both are
     * carried, in the discovered namespace, rather than one being chosen.
     */
    text:
      'KeNHA has publicly given two materially different completion dates for the project — July 2027 and January 2028 — and which of them is contractual is not on the public record.',
    layer: 'OBSERVATION',
    type: 'TIMELINE',
    priority: 'HIGH',
    entities: [
      'Kenya National Highways Authority (KeNHA)',
      'National Assembly Departmental Committee on Roads & Transport',
    ],
    ambiguities: [
      // [C:C005] ambiguity column
      'Original contract period versus extended period.',
      'Regional-office target (July 2027) versus KeNHA statement to Parliament (January 2028).',
      'Neither source states which date is contractual and which is a target.',
    ],
    timeScope: {
      from: '2021',
      to: '2028',
      description:
        'Spans award (2021) to the latest stated completion target (January 2028).',
    },
  },
]

export const claimById = new Map(claims.map((c) => [c.id, c]))
