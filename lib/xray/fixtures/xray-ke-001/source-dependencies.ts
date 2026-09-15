/**
 * XRAY-KE-001 — canonical SourceDependency edges.
 *
 * XR-INV-004: repetition is not corroboration. These edges are what make
 * "publications = N, independent originating observations = 1" computable
 * instead of asserted in prose.
 *
 * The required acceptance case is SD-001..SD-003: three publications
 * (SRC-018 People Daily, SRC-019 Radio47, SRC-020 The Star) reproducing ONE
 * originating September 2026 ministry status dataset (SRC-017) that neither
 * benchmark run was able to obtain.
 */

import type { SourceDependency } from '@/lib/xray/domain'

export const sourceDependencies: SourceDependency[] = [
  // -------------------------------------------------------------------------
  // September 2026 ministry status dataset — 3 publications, 1 origin
  // [G:S007,S008,S009 dependency diagram] [C:S016]
  // -------------------------------------------------------------------------
  {
    id: 'SD-001',
    sourceId: 'SRC-018',
    dependsOnSourceId: 'SRC-017',
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
    originDescription:
      'People Daily reproduces project-status information attributed to the Ministry of Interior under PS Raymond Omollo.',
  },
  {
    id: 'SD-002',
    sourceId: 'SRC-019',
    dependsOnSourceId: 'SRC-017',
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
    originDescription: 'Radio47 reports the same lot values and progress percentages from the same ministry update.',
  },
  {
    id: 'SD-003',
    sourceId: 'SRC-020',
    dependsOnSourceId: 'SRC-017',
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
    originDescription: 'The Star reports the same values and progress from the same ministry update.',
  },

  // -------------------------------------------------------------------------
  // KeNHA Nyanza site briefing, 8 May 2026 — 3 publications, 1 origin.
  // Origin of "KSh 16.7 billion", "44 km" and "July 2027". [C:S009,S010,S011]
  // -------------------------------------------------------------------------
  {
    id: 'SD-004',
    sourceId: 'SRC-012',
    dependsOnSourceId: 'SRC-011',
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
    originDescription: 'The Star reports the 8 May 2026 KeNHA Nyanza site briefing.',
  },
  {
    id: 'SD-005',
    sourceId: 'SRC-013',
    dependsOnSourceId: 'SRC-011',
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
    originDescription: 'People Daily reports the same briefing.',
  },
  {
    id: 'SD-006',
    sourceId: 'SRC-014',
    dependsOnSourceId: 'SRC-011',
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
    originDescription: 'Radio47 reports the same briefing.',
  },

  // -------------------------------------------------------------------------
  // PS Omollo scope statement, 17 Feb 2026 — origin never retrieved
  // [C:S008] "all three outlets derive from one statement"
  // -------------------------------------------------------------------------
  {
    id: 'SD-007',
    sourceId: 'SRC-010',
    dependsOnSourceId: 'SRC-009',
    relationship: 'QUOTES',
    confidence: 'HIGH',
    originDescription:
      'Capital FM quotes the PS Omollo statement directly; the original post was not retrieved.',
  },

  // -------------------------------------------------------------------------
  // Parliamentary inspection, 6 Jun 2026 [C:S013,S014] [G:S006]
  // -------------------------------------------------------------------------
  {
    id: 'SD-008',
    sourceId: 'SRC-016',
    dependsOnSourceId: 'SRC-015',
    relationship: 'ATTRIBUTES_TO',
    confidence: 'HIGH',
    originDescription:
      "People Daily attributes the 28% figure and the January 2028 date to KeNHA's statement to the committee. No committee report or Hansard was located.",
  },

  // -------------------------------------------------------------------------
  // Figures tracing back to the 2021 award record [C: dependency graph]
  // -------------------------------------------------------------------------
  {
    id: 'SD-009',
    sourceId: 'SRC-004',
    dependsOnSourceId: 'SRC-002',
    relationship: 'PROBABLE_COMMON_ORIGIN',
    confidence: 'MEDIUM',
    originDescription:
      "KeNHA's 2022 on-record lot sums match the award notice exactly. Independent as a statement, but not an independent measurement of the contract values.",
  },
  {
    id: 'SD-010',
    sourceId: 'SRC-018',
    dependsOnSourceId: 'SRC-002',
    relationship: 'PROBABLE_COMMON_ORIGIN',
    confidence: 'MEDIUM',
    originDescription:
      'The September 2026 lot values repeat 5.19 / 4.96 / 5.72 exactly — the 2021 awarded works sums, carried forward unrevised.',
  },

  // -------------------------------------------------------------------------
  // Tour itinerary: dependency SUSPECTED, NOT CONFIRMED.
  // [C: dependency graph] "S001 (Citizen) ──?── S018 (Star) : itinerary
  // dependency suspected, not confirmed". Recorded at LOW confidence with no
  // dependsOnSourceId, because the itinerary itself was never obtained.
  // -------------------------------------------------------------------------
  {
    id: 'SD-011',
    sourceId: 'SRC-001',
    relationship: 'PROBABLE_COMMON_ORIGIN',
    confidence: 'LOW',
    originDescription:
      'An unnamed tour itinerary. The surface source attributes its schedule to "his itinerary" with no institution named; the itinerary was not retrieved.',
  },
  {
    id: 'SD-012',
    sourceId: 'SRC-022',
    relationship: 'PROBABLE_COMMON_ORIGIN',
    confidence: 'LOW',
    originDescription:
      'The same unnamed itinerary appears to underlie this report. Dependency on the surface source was suspected but not confirmed by either run.',
  },
]

export const sourceDependencyById = new Map(sourceDependencies.map((d) => [d.id, d]))
