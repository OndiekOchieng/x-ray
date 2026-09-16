/**
 * XRAY-KE-001 — evidence-level provenance.
 *
 * Where each derivative proposition actually came from, as distinct from what
 * its publication depends on as a document.
 *
 * SCOPE OF THIS FILE
 * ==================
 * A record appears here only when the evidence is derivative — drawn from a
 * source the graph marks `REPEATING`, or otherwise shown by the benchmark to
 * derive from another record. Evidence from an `ORIGINATING` source needs no
 * entry: its own source is the origin.
 *
 * THE CASE THAT MOTIVATED THIS
 * ============================
 * SRC-018 (People Daily, 11 Sep 2026) is a multi-origin publication. It
 * reproduces the September ministry status release AND carries lot contract
 * values that repeat the 2021 procurement award exactly. Document lineage
 * records both (SD-001, SD-010), which is correct for the document — and wrong
 * for a claim resting on only one of them.
 *
 * Splitting it here:
 *   EV-020, EV-021, EV-022, EV-029  progress percentages  → SRC-017
 *   EV-009                          lot lengths            → SRC-017
 *   EV-018                          lot contract values    → SRC-002
 *
 * DC001 uses only EV-029, so it now sees one origin from this publication
 * rather than two.
 *
 * NOTHING IS INFERRED BEYOND THE FROZEN RUNS. Where a run establishes that a
 * proposition is derivative but never identifies the originating record, the
 * origin is `UNIDENTIFIED` — never the publication itself, which would count a
 * repetition as an independent observation.
 */

import type { EvidenceProvenance } from '@/lib/xray/domain'

export const evidenceProvenance: EvidenceProvenance[] = [
  // -------------------------------------------------------------------------
  // SRC-010 (Capital FM) quotes the PS Omollo scope statement it never obtained
  // [C:S008] "all three outlets derive from one statement"
  // -------------------------------------------------------------------------
  {
    id: 'EP-001',
    evidenceId: 'EV-001',
    origin: { kind: 'SOURCE', sourceId: 'SRC-009' },
    relationship: 'QUOTES',
    confidence: 'HIGH',
  },

  // -------------------------------------------------------------------------
  // The 8 May 2026 KeNHA Nyanza site briefing (SRC-011).
  // Origin of "KSh 16.7 billion", "44 km" and "July 2027". [C:S009,S010,S011]
  // -------------------------------------------------------------------------
  {
    id: 'EP-002',
    evidenceId: 'EV-013', // 16.7bn, via The Star
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-003',
    evidenceId: 'EV-027', // Dense Bitumen Macadam at Mamboleo, described at the same briefing
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-004',
    evidenceId: 'EV-008', // "about 44 km including spur roads", via People Daily
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-005',
    evidenceId: 'EV-014', // 16.7bn repeated by People Daily
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-006',
    evidenceId: 'EV-035', // completion July 2027, via People Daily
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-007',
    evidenceId: 'EV-015', // 16.7bn repeated by Radio47
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    // [C: counting rule] "the 16.7bn figure appears in >=6 publications but has
    // ONE identifiable origin (KeNHA Nyanza regional office, May 2026)." The
    // June reporting carries the circulating figure rather than reporting that
    // briefing, so DERIVED_FROM at MEDIUM rather than REPRODUCES at HIGH.
    id: 'EP-008',
    evidenceId: 'EV-016',
    origin: { kind: 'SOURCE', sourceId: 'SRC-011' },
    relationship: 'DERIVED_FROM',
    confidence: 'MEDIUM',
  },

  // -------------------------------------------------------------------------
  // KeNHA's statement to the National Assembly Roads Committee (SRC-015).
  // Origin of "28% overall" and "January 2028". [C:S013,S014] [G:S006]
  // -------------------------------------------------------------------------
  {
    id: 'EP-009',
    evidenceId: 'EV-023', // 28% overall, bearing on C003
    origin: { kind: 'SOURCE', sourceId: 'SRC-015' },
    relationship: 'ATTRIBUTES_TO',
    confidence: 'HIGH',
  },
  {
    id: 'EP-010',
    evidenceId: 'EV-030', // the same figure, bearing on DC001
    origin: { kind: 'SOURCE', sourceId: 'SRC-015' },
    relationship: 'ATTRIBUTES_TO',
    confidence: 'HIGH',
  },
  {
    id: 'EP-011',
    evidenceId: 'EV-036', // completion revised to January 2028
    origin: { kind: 'SOURCE', sourceId: 'SRC-015' },
    relationship: 'ATTRIBUTES_TO',
    confidence: 'HIGH',
  },

  // -------------------------------------------------------------------------
  // SRC-018 — THE MULTI-ORIGIN PUBLICATION.
  //
  // Progress percentages and lot lengths come from the September ministry
  // release; lot contract values repeat the 2021 award notice. At document
  // level SD-001 and SD-010 record both. At proposition level they separate.
  // -------------------------------------------------------------------------
  {
    id: 'EP-012',
    evidenceId: 'EV-020', // Lot 1 at 20.2%
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-013',
    evidenceId: 'EV-021', // Lot 2 at 34%
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-014',
    evidenceId: 'EV-022', // Lot 3 at 28%
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    // The record that fixes the DC001 overcount. This proposition comes from
    // the ministry release only; the procurement notice does not bear on it.
    id: 'EP-015',
    evidenceId: 'EV-029', // the same percentages, bearing on DC001
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-016',
    evidenceId: 'EV-009', // lot lengths 12.9 / 43.4 / 44.5 km
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    // [C: dependency graph] "S016 repeats 5.19/4.96/5.72 exactly" — the 2021
    // awarded works sums, carried forward unrevised.
    id: 'EP-017',
    evidenceId: 'EV-018', // lot contract values totalling ~15.87bn
    origin: { kind: 'SOURCE', sourceId: 'SRC-002' },
    relationship: 'DERIVED_FROM',
    confidence: 'MEDIUM',
  },

  // -------------------------------------------------------------------------
  // The other two September publications. Same release, same origin.
  // [G:S008, S009] "three publications, apparently one originating update"
  // -------------------------------------------------------------------------
  {
    id: 'EP-018',
    evidenceId: 'EV-024', // Radio47 reports the same percentages
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },
  {
    id: 'EP-019',
    evidenceId: 'EV-025', // The Star reports the same values and percentages
    origin: { kind: 'SOURCE', sourceId: 'SRC-017' },
    relationship: 'REPRODUCES',
    confidence: 'HIGH',
  },

  // -------------------------------------------------------------------------
  // SRC-004 (Business Daily, 2022) is ORIGINATING for the KeNHA spokesperson's
  // own statement, so EV-004 (63 km) needs no entry. The contract sums it
  // quotes are another matter: they match the 2021 award record exactly.
  // [C: dependency graph] "figures consistent with S002"
  // -------------------------------------------------------------------------
  {
    id: 'EP-020',
    evidenceId: 'EV-019', // lot sums ~15.87bn
    origin: { kind: 'SOURCE', sourceId: 'SRC-002' },
    relationship: 'DERIVED_FROM',
    confidence: 'MEDIUM',
  },

  // -------------------------------------------------------------------------
  // The tour itinerary. Both runs recorded the dependency as SUSPECTED and
  // never identified the itinerary as a record, so the origin is UNIDENTIFIED.
  //
  // Recording SRC-022 as its own origin here would count a repetition as an
  // independent observation — precisely the error this entity prevents.
  // [C: dependency graph] "itinerary dependency suspected, not confirmed"
  // -------------------------------------------------------------------------
  {
    id: 'EP-021',
    evidenceId: 'EV-033', // scheduled inspection along these routes
    origin: {
      kind: 'UNIDENTIFIED',
      description:
        'An unnamed tour itinerary. The surface source attributes its schedule to "his itinerary" with no institution named, and the itinerary was never retrieved by either run.',
    },
    relationship: 'ATTRIBUTES_TO',
    confidence: 'LOW',
  },
  {
    id: 'EP-022',
    evidenceId: 'EV-034', // tour length and county order differ across itineraries
    origin: {
      kind: 'UNIDENTIFIED',
      description:
        'The same unnamed itinerary, in a version differing from the one the surface source carried.',
    },
    relationship: 'ATTRIBUTES_TO',
    confidence: 'LOW',
  },
]

export const evidenceProvenanceById = new Map(evidenceProvenance.map((p) => [p.id, p]))
