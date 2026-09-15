/**
 * XRAY-KE-001 — canonical Gaps.
 *
 * A gap is what the public record does not contain. Every gap below appears in
 * at least one frozen run's gap ledger.
 *
 * XR-INV-006 is observed throughout: `missingEvidence` says what was not
 * located, never that it does not exist, and `searchAlreadyAttempted` records
 * how far the search actually went.
 *
 * XR-INV-009 / ADR-0008: `atiEligible` is bound to `resolutionPath` by the
 * domain's discriminated union — it cannot be set independently. Both branches
 * are present: GAP-003 waits for a record that does not yet exist and is
 * therefore NOT eligible, however material it is.
 *
 * NO ATIRequest OBJECTS EXIST IN THIS FIXTURE. Neither benchmark run executed
 * the action stage — both stopped after stage 9 — so there is no frozen
 * evidence for a drafted request. A gap being eligible is not a reason to
 * manufacture one.
 */

import type { Gap } from '@/lib/xray/domain'

export const gaps: Gap[] = [
  {
    // [C:GAP-002] [G:GAP-001]
    id: 'GAP-001',
    claimIds: ['C002'],
    missingEvidence:
      'A record showing how KSh 16.7 billion is derived — whether it is awarded works plus supervision, a revised contract sum after variations or price adjustment, a financing envelope, or something else — together with the current contract sum per lot.',
    whyItMatters:
      'The project value used publicly by officials cannot be audited against the KSh 15.88 billion primary award record. Works plus the two located supervision contracts reach KSh 16.385bn, as do the Treasury estimates, but nothing located bridges either figure to KSh 16.7bn.',
    resolvingEvidence: [
      'Signed contracts for Lots 1–3',
      'Approved variation orders or revised contract-price schedules',
      'A Lot 3 supervision consultancy award notice',
      'KeNHA financial statements, notes on commitments',
      'An Auditor-General report on KeNHA covering this contract',
      'A current authoritative KeNHA project-cost record',
    ],
    likelyHolder: {
      institution: 'Kenya National Highways Authority (KeNHA)',
      // Both runs also name the Office of the Auditor-General and the National
      // Treasury as possible holders. No information officer, office or contact
      // was located by either run.
      basis: 'INFERRED',
    },
    searchAlreadyAttempted: [
      'KeNHA tender award notices sampled across four quarters',
      '"16.7 billion" queries against the project name',
      'Office of the Auditor-General queries',
      'Treasury budget estimates and the November 2025 sector report',
      'Road Maintenance Levy Fund securitisation reporting by project',
    ],
    status: 'OPEN',
    effectOnFinding:
      'C002 is graded UNRESOLVED rather than ESTABLISHED. Locating this record would either establish KSh 16.7bn as the current contract value or show it to be a different measure.',
    identifiers: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'KeNHA/2370/2020 (Lot 1 works)',
      'KeNHA/2371/2020 (Lot 2 works)',
      'KeNHA/2372/2020 (Lot 3 works)',
      'KeNHA/2365/2020 and KeNHA/2366/2020 (supervision, Lots 1–2)',
      'XRAY-KE-001',
    ],
    resolutionPath: 'PUBLIC_RECORD_REQUEST',
    atiEligible: true,
  },

  {
    // [C:GAP-003] [G:GAP-003] — the gap the same-measure rule exists to preserve.
    id: 'GAP-002',
    claimIds: ['C003', 'DC001'],
    missingEvidence:
      'Any measurement of road length actually surfaced — kilometres carrying a bituminous layer, per lot, against total mainline kilometres — as distinct from percentage completion against contractual work.',
    whyItMatters:
      '"Most sections tarmacked" is a claim about physical length. Every located figure measures overall project completion, which is weighted across earthworks, drainage, structures and finishing. Neither the surface source nor any other located record gives kilometres surfaced, so the claim cannot be measured at all — in either direction.',
    resolvingEvidence: [
      "A KeNHA monthly progress report giving surfaced kilometres per lot",
      "A resident engineer's progress certificate stating kilometres completed to bitumen or asphalt standard",
      'A dated site measurement or completion map for the mainline',
    ],
    likelyHolder: {
      institution: 'Kenya National Highways Authority (KeNHA), Nyanza region',
      office: 'Supervising consultants (Interconsult / Professional Consultants; AMA Consulting)',
      basis: 'INFERRED',
    },
    searchAlreadyAttempted: [
      'All located progress reporting for 2025 and 2026',
      '"tarmacked", "asphalt" and "DBM" queries against the project name',
      'Parliamentary inspection accounts',
      'Local reporting and residents\' accounts',
      'Contractor statements and project pages',
    ],
    status: 'OPEN',
    effectOnFinding:
      'C003 is graded INSUFFICIENT_EVIDENCE. This gap is what prevents the project-completion percentages from being read as a measurement of surfacing in either direction.',
    identifiers: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'Lot 1 Mamboleo Junction–Miwani',
      'Lot 2 Miwani–Chemelil',
      'Lot 3 Chemelil–Muhoroni–Kipsitet',
      'XRAY-KE-001',
    ],
    resolutionPath: 'PUBLIC_RECORD_REQUEST',
    atiEligible: true,
  },

  {
    /**
     * THE NON-ELIGIBLE BRANCH. [C:GAP-006] [G:GAP-005]
     *
     * The record does not exist yet — the inspection was scheduled for the day
     * AFTER the research cutoff. No information request can produce a record of
     * an event that has not happened. XR-INV-009: materiality does not create
     * eligibility.
     */
    id: 'GAP-003',
    claimIds: ['C004'],
    missingEvidence:
      'Post-event evidence establishing whether the scheduled presidential inspection of the road actually took place, was cancelled, or changed.',
    whyItMatters:
      'The located evidence supports a scheduled or expected inspection only. A planned visit is not evidence that the visit occurred. The inspection was scheduled for 14 September 2026, one day after the research cutoff.',
    resolvingEvidence: [
      'A State House or Presidential Communication Service post-event release',
      'An updated or confirmed official itinerary',
      'A dated KeNHA site-visit record',
      'Dated photographs or video of the inspection',
    ],
    likelyHolder: {
      institution: 'State House / Presidential Communication Service',
      basis: 'INFERRED',
    },
    searchAlreadyAttempted: [
      'Pre-tour reporting from 11–13 September 2026',
      'Searches for an official State House or PCS programme for 14 September 2026',
    ],
    // NOTE: the v0 UI scaffold had a 'WAITING' status here. The ratified
    // GapStatus vocabulary has no such member, and it is not needed: the gap
    // is OPEN, and the waiting is already expressed by
    // `resolutionPath: 'WAIT_FOR_RECORD'`. Status and path answer different
    // questions — is it closed, and how would it close.
    status: 'OPEN',
    effectOnFinding:
      'C004 is graded SUPPORTED as a scheduling claim only. It cannot be graded as an occurred event at this research cutoff, and it must not be upgraded when the date passes without a record being located.',
    identifiers: [
      'Presidential Nyanza tour, 13–17 September 2026',
      'Scheduled road inspection, Monday 14 September 2026',
      'XRAY-KE-001',
    ],
    resolutionPath: 'WAIT_FOR_RECORD',
    atiEligible: false,
  },

  {
    // [C:GAP-001] [G:GAP-002]
    id: 'GAP-004',
    claimIds: ['C001'],
    missingEvidence:
      "An official scope schedule giving each lot's main-carriageway length and its feeder, spur and service road lengths, and stating the basis of the 122 km figure.",
    whyItMatters:
      'The reconciliation of 63 km against 122 km currently rests on one official statement whose original was never obtained, plus arithmetic from a contract chainage and a contractor page. The published lot lengths total 100.8 km, which matches neither figure, and an unexplained 44 km figure is also on the record.',
    resolvingEvidence: [
      'A KeNHA project sheet or design review report with chainages for all three lots',
      'Signed contract scope schedules',
      'Tender documents for KeNHA/2370–2372/2020',
    ],
    likelyHolder: {
      institution: 'Kenya National Highways Authority (KeNHA)',
      office: 'Development directorate, HQ; Nyanza region',
      basis: 'INFERRED',
    },
    searchAlreadyAttempted: [
      'KeNHA website and tender award notices',
      'Contractor project pages',
      'The PS Omollo statement and its press reproductions',
      'Searches on the "44 km" and "122 km" figures',
    ],
    status: 'OPEN',
    effectOnFinding:
      'C001 is graded SUPPORTED rather than ESTABLISHED, and DISC-001 retains an unreconciled residue.',
    identifiers: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'Road C674',
      'KeNHA/2370/2020, KeNHA/2371/2020, KeNHA/2372/2020',
      'XRAY-KE-001',
    ],
    resolutionPath: 'PUBLIC_RECORD_REQUEST',
    atiEligible: true,
  },

  {
    // [G:GAP-004] [C:GAP-008] The originating dataset behind the key figures.
    id: 'GAP-005',
    claimIds: ['C003', 'DC001'],
    missingEvidence:
      'The Ministry of Interior project-status release underlying the 9–11 September 2026 lot figures, and the original PS Omollo statements of February and September 2026.',
    whyItMatters:
      'Three newsrooms reproduce the same lot values and percentages, but they are three publications of one dataset, not three independent measurements. The current progress data is strongly attributed yet remains one evidentiary step removed from its origin, and the definition of the percentages is not stated anywhere located.',
    resolvingEvidence: [
      'The Ministry or KeNHA status sheet, dashboard or engineering report behind the September figures',
      'The original PS Omollo posts of 17 February 2026 and about 9 September 2026',
    ],
    likelyHolder: {
      institution: 'Ministry of Interior and National Administration',
      office: 'Office of the Principal Secretary',
      basis: 'INFERRED',
    },
    searchAlreadyAttempted: [
      'Press reproductions across People Daily, Radio47, The Star, Capital FM, allAfrica and Kenyans.co.ke',
      'Searches for the originating ministry release',
      'The mygov.go.ke originating page, which returned HTTP 404 at retrieval',
    ],
    status: 'OPEN',
    effectOnFinding:
      'Provenance for the September progress figures is recorded as "via press". It caps the strength of EV-020 to EV-023 and is why EV-024 and EV-025 are graded WEAK rather than corroborating.',
    identifiers: [
      'Ministry of Interior project-status information, September 2026',
      'PS Raymond Omollo',
      'XRAY-KE-001',
    ],
    resolutionPath: 'PUBLIC_RECORD_REQUEST',
    atiEligible: true,
  },

  {
    // [C:GAP-004]
    id: 'GAP-006',
    claimIds: ['DC002'],
    missingEvidence:
      'Contract commencement dates per lot, original contractual completion dates, approved extensions of time, and the revised schedule KeNHA cited to Parliament.',
    whyItMatters:
      'These determine whether the project is beyond its contractual completion period and by how much, and they are what would explain how July 2027 and January 2028 can both be on the record from the same institution one month apart.',
    resolvingEvidence: [
      'Commencement orders for Lots 1–3',
      'Approved extension-of-time records',
      "KeNHA's submission to the National Assembly Departmental Committee on Roads & Transport, June 2026",
      'The committee report or Hansard for the 6 June 2026 inspection',
    ],
    likelyHolder: {
      institution: 'Kenya National Highways Authority (KeNHA)',
      office: 'National Assembly Departmental Committee on Roads & Transport',
      basis: 'INFERRED',
    },
    searchAlreadyAttempted: [
      'Parliament library search',
      'Committee reporting across three outlets',
      'KeNHA website',
      'Both completion dates queried against the project name',
    ],
    status: 'OPEN',
    effectOnFinding:
      'DC002 is graded CONTESTED. Locating these records would show which date is contractual and which is a target.',
    identifiers: [
      'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
      'National Assembly Departmental Committee on Roads & Transport inspection, 6 June 2026',
      'XRAY-KE-001',
    ],
    resolutionPath: 'PUBLIC_RECORD_REQUEST',
    atiEligible: true,
  },
]

export const gapById = new Map(gaps.map((g) => [g.id, g]))
