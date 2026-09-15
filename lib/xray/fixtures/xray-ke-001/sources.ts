/**
 * XRAY-KE-001 — canonical Sources.
 *
 * Reconstructed from the frozen benchmark corpus:
 *   docs/benchmarks/XRAY-KE-001/raw/claude-run.md   (cited [C:Snnn])
 *   docs/benchmarks/XRAY-KE-001/raw/gpt-run.md      (cited [G:Snnn])
 *
 * The two runs used independent S-numbering. Canonical ids are `SRC-nnn` and
 * each source records which run(s) attest it.
 *
 * RULES OBSERVED
 *  - No metadata is invented. Where a run left a date, URL or attribution
 *    uncertain, the uncertainty is preserved in the record rather than
 *    resolved into a precise-looking value.
 *  - No evidence after the 2026-09-13 research cutoff.
 *  - A Source is a record, not a proposition. Propositions live in evidence.ts.
 */

import type { Source } from '@/lib/xray/domain'

// ---------------------------------------------------------------------------
// Surface source
// ---------------------------------------------------------------------------

/**
 * The article under investigation. XR-INV-001: it establishes that the claims
 * were MADE. It is never evidence that they are true, and evidence.ts contains
 * no Evidence record with this sourceId bearing on C001–C004.
 */
export const SURFACE_SOURCE_ID = 'SRC-001'

export const sources: Source[] = [
  {
    // [C:S001] [G:S000]
    id: SURFACE_SOURCE_ID,
    title: "Inside Ruto's five-day tour of Kisumu, Siaya, Migori and Homa Bay",
    publisher: 'Citizen Digital',
    institution: 'Royal Media Services',
    author: 'Allan Obiero',
    url: 'https://citizen.digital/article/inside-rutos-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-n390083',
    publishedAt: '2026-09-13T11:24:56Z',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    // [C:S001] "repeating unnamed itinerary + unattributed figures"
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },

  // -------------------------------------------------------------------------
  // Primary / originating records
  // -------------------------------------------------------------------------
  {
    // [C:S002] The only primary procurement record recovered by either run.
    id: 'SRC-002',
    title: 'Tender Awards for 4th Qtr FY 2020-2021',
    institution: 'Kenya National Highways Authority (KeNHA)',
    url: 'https://kenha.co.ke/wp-content/uploads/2022/03/TENDER-AWARDS-FOR-4TH-QTR-FY-2020-2021.pdf',
    // Award quarter Apr–Jun 2021; file uploaded Mar 2022. Exact publication
    // date is not stated by the record; the quarter is preserved instead.
    publishedAt: '2021-06-30',
    retrievedAt: '2026-09-13',
    sourceType: 'PROCUREMENT_RECORD',
    evidenceClass: 'PRIMARY',
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S003]
    id: 'SRC-003',
    title: 'Kenha awards Sh4.9bn tender for Mamboleo-Muhoroni road works',
    publisher: 'The Star',
    url: 'https://the-star.co.ke/counties/nyanza/2021-03-17-kenha-awards-sh49bn-tender-for-mamboleo-muhoroni-road-works',
    publishedAt: '2021-03-17',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    // Describes a primary KeNHA award letter of 12 Mar 2021 that was not itself
    // retrieved; originating for the contract-period detail it carries.
    evidenceClass: 'SECONDARY',
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S004] [G:S004] — both runs. Dates differ between runs (Claude: BD page
    // dated 4 Aug 2022, reposted 7 Jul 2022; GPT: July 7, 2022). The earlier
    // date both runs can support is kept and the ambiguity is not resolved.
    id: 'SRC-004',
    title: 'Work starts on Sh15bn Kisumu-Muhoroni road',
    publisher: 'Business Daily',
    institution: 'Nation Media Group',
    url: 'https://www.businessdailyafrica.com/bd/economy/work-starts-on-sh15bn-kisumu-muhoroni-road-3872660',
    publishedAt: '2022-07-07',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    // On-record statement by KeNHA deputy director Samwel Kumba.
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [G:S001] Treasury sector working group report — primary institutional record.
    id: 'SRC-005',
    title:
      'Energy, Infrastructure & ICT Sector Working Group Report (MTEF)',
    institution: 'The National Treasury',
    url: 'https://www.treasury.go.ke/sites/default/files/NEW/Final-E.I.I-Sector-Report-18.11.-2025.pdf',
    publishedAt: '2025-11-18',
    retrievedAt: '2026-09-13',
    sourceType: 'BUDGET',
    evidenceClass: 'PRIMARY',
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [G:S003] KeNHA ESIA — primary project planning document.
    id: 'SRC-006',
    title:
      'ESIA 1803 — Mamboleo–Chemelil–Muhoroni–Kipsitet Road',
    institution: 'Kenya National Highways Authority (KeNHA); hosted by NEMA',
    url: 'https://www.nema.go.ke/images/Docs/EIA_1800-1809/ESIA_1803%20Mamboleo-Chemilil-Muhoroni-Kipsetit_1935-min.pdf',
    publishedAt: '2020-10',
    retrievedAt: '2026-09-13',
    sourceType: 'OFFICIAL_REPORT',
    evidenceClass: 'PRIMARY',
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S017] [G:S005] Contractor's own record for its own lot: interested party.
    id: 'SRC-007',
    title:
      'Reconstruction of Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road to Bitumen Standard — Lot 3',
    institution: 'H. Young & Co (EA) Ltd',
    url: 'https://hyoung.com/portfolio/reconstruction-of-mamboleo-miwani-chemelil-muhoroni-kipsitet-road-to-bitumen-standard-lot-3-chemelil-muhoroni-kipsitet/',
    // [C:S017] records the page as undated. Not invented.
    retrievedAt: '2026-09-13',
    sourceType: 'CONTRACTOR_RECORD',
    evidenceClass: 'PRIMARY_ADJACENT',
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S007] [G:S002] MyGov / GAA May 2025. Claude found the mygov.go.ke page
    // 404 and reached the content through TV47 / Construction Kenya / Meta;
    // GPT retrieved the GAA-hosted MyGov PDF. Recorded as RETRIEVED on the
    // strength of the GAA PDF, which is the copy that was actually obtained.
    id: 'SRC-008',
    title: 'MyGov, May 6 2025 — Mamboleo Junction–Miwani–Chemelil–Muhoroni road works resume',
    publisher: 'MyGov',
    institution: 'Government Advertising Agency',
    url: 'https://gaa.go.ke/sites/default/files/2025-05/MyGov%20May%206%2C%202025.pdf',
    publishedAt: '2025-05-06',
    retrievedAt: '2026-09-13',
    sourceType: 'OFFICIAL_STATEMENT',
    evidenceClass: 'SECONDARY',
    originStatus: 'ORIGINATING',
    accessibility: 'RETRIEVED',
  },

  // -------------------------------------------------------------------------
  // Originating statements that were never obtained in the original
  // -------------------------------------------------------------------------
  {
    // [C:S008] The origin of the 63 km / 122 km scope definition.
    // Claude: "originating: PS Omollo statement (original post not retrieved)".
    // This is the NOT_RETRIEVED case: identified and quoted, never obtained.
    id: 'SRC-009',
    title:
      'PS Raymond Omollo statement on the Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road scope',
    institution: 'Ministry of Interior and National Administration',
    author: 'Raymond Omollo (Principal Secretary)',
    publishedAt: '2026-02-17',
    retrievedAt: '2026-09-13',
    sourceType: 'OFFICIAL_STATEMENT',
    evidenceClass: 'ATTRIBUTED_ORIGIN_NOT_RETRIEVED',
    originStatus: 'ORIGINATING',
    accessibility: 'NOT_RETRIEVED',
  },
  {
    // [C:S008] one of several outlets reproducing SRC-009.
    id: 'SRC-010',
    title: 'Govt upgrades 122 km Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
    publisher: 'Capital FM',
    url: 'https://capitalfm.africa/govt-upgrades-122-km-mamboleo-miwani-chemelil-muhoroni-kipsitet-road/',
    publishedAt: '2026-02-17',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S009,S010,S011] The KeNHA Nyanza regional office site briefing of
    // 8 May 2026 — the origin of "KSh 16.7 billion", "44 km" and "July 2027".
    // No transcript or release was obtained by either run.
    id: 'SRC-011',
    title: 'KeNHA Nyanza regional office site briefing',
    institution: 'Kenya National Highways Authority (KeNHA), Nyanza region',
    publishedAt: '2026-05-08',
    retrievedAt: '2026-09-13',
    sourceType: 'OFFICIAL_STATEMENT',
    evidenceClass: 'ATTRIBUTED_ORIGIN_NOT_RETRIEVED',
    originStatus: 'ORIGINATING',
    accessibility: 'NOT_RETRIEVED',
  },
  {
    // [C:S009]
    id: 'SRC-012',
    title: 'Hope as works on Sh16.7 billion Mamboleo-Miwani road revived',
    publisher: 'The Star',
    author: 'Faith Matete',
    url: 'https://www.the-star.co.ke/counties/nyanza/2026-05-08-hope-as-works-on-sh167-billion-mamboleo-miwani-road-revived',
    publishedAt: '2026-05-08',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S010]
    id: 'SRC-013',
    title: 'KeNHA boss issues roadmap for construction of Mamboleo–Muhoroni road',
    publisher: 'People Daily',
    author: 'Viola Kosome',
    url: 'https://peopledaily.digital/news/kenha-boss-issues-roadmap-for-construction-of-mamboleo-muhoroni-road',
    publishedAt: '2026-05-09',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S011]
    id: 'SRC-014',
    title: 'Kisumu residents to benefit from Sh16.7 billion road project',
    publisher: 'Radio47',
    url: 'https://www.radio47.fm/counties/kisumu-residents-to-benefit-from-sh16-7-billion-road-project-28928/',
    publishedAt: '2026-05-07',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S013,S014] [G:S006] KeNHA's statement to the National Assembly
    // Departmental Committee on Roads & Transport during its 6 Jun 2026
    // inspection — origin of "28% overall" and "January 2028". Claude searched
    // the Parliament library for the committee report/Hansard and did not find
    // it, so the statement itself was never obtained.
    id: 'SRC-015',
    title:
      'KeNHA statement to the National Assembly Departmental Committee on Roads & Transport',
    institution: 'Kenya National Highways Authority (KeNHA)',
    publishedAt: '2026-06-06',
    retrievedAt: '2026-09-13',
    sourceType: 'PARLIAMENTARY_RECORD',
    evidenceClass: 'ATTRIBUTED_ORIGIN_NOT_RETRIEVED',
    originStatus: 'ORIGINATING',
    accessibility: 'NOT_RETRIEVED',
  },
  {
    // [C:S014] [G:S006]
    id: 'SRC-016',
    title: 'MPs expose blunder slowing down road projects, send warning to KeNHA',
    publisher: 'People Daily',
    url: 'https://peopledaily.digital/news/mps-expose-blunder-slowing-down-road-projects-send-warning-to-kenha',
    publishedAt: '2026-06-07',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },

  // -------------------------------------------------------------------------
  // The September 2026 ministry status dataset and its three publications
  // -------------------------------------------------------------------------
  {
    // [C:S016] [G:S007,S008,S009] The originating status release. Both runs
    // agree it was never obtained: Claude "original release not retrieved
    // (photos credited @ray_omollo/X)"; GPT GAP-004 "the Ministry/KeNHA
    // document or dataset underlying the September 9–11 figures" is missing.
    // This is the origin required by the source-dependency acceptance case.
    id: 'SRC-017',
    title:
      'Ministry of Interior project-status information (September 2026 release)',
    institution: 'Ministry of Interior and National Administration',
    author: 'Raymond Omollo (Principal Secretary)',
    // Both runs place it just before the 9–11 Sep publications; neither gives
    // an exact release date. The approximate date is preserved as such.
    publishedAt: '2026-09',
    retrievedAt: '2026-09-13',
    sourceType: 'OFFICIAL_REPORT',
    evidenceClass: 'ATTRIBUTED_ORIGIN_NOT_RETRIEVED',
    originStatus: 'ORIGINATING',
    accessibility: 'NOT_RETRIEVED',
  },
  {
    // [C:S016] [G:S007] The most detailed reproduction: per-lot length, value
    // and progress.
    id: 'SRC-018',
    title:
      "Ahero's 7-hour traffic nightmare nears end as Ksh15.8B road projects transform Kisumu",
    publisher: 'People Daily',
    author: 'Viola Kosome',
    url: 'https://peopledaily.digital/news/aheros-7-hour-traffic-nightmare-nears-end-as-ksh15-8b-road-projects-transform-kisumu',
    publishedAt: '2026-09-11',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [G:S008]
    id: 'SRC-019',
    title:
      'Sh24.2 billion road boom as Omollo details national government projects in Kisumu',
    publisher: 'Radio47',
    url: 'https://www.radio47.fm/news/sh-24-2-billion-road-boom-as-omollo-details-national-government-projects-in-kisumu-39026/',
    publishedAt: '2026-09-09',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
  {
    // [G:S009]
    id: 'SRC-020',
    title: 'Sh15.8bn Kisumu road projects gather pace',
    publisher: 'The Star',
    url: 'https://www.the-star.co.ke/counties/nyanza/2026-09-09-sh158bn-kisumu-road-projects-gather-pace',
    publishedAt: '2026-09-09',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },

  // -------------------------------------------------------------------------
  // Surfacing activity and tour itinerary
  // -------------------------------------------------------------------------
  {
    // [G:S010]
    id: 'SRC-021',
    title:
      'Tarmacking works resume along Mamboleo–Muhoroni–Kipsitet road in Kisumu County',
    publisher: 'Mjengo Hub',
    url: 'https://mjengohub.co.ke/articles/counties/tarmacking-works-resume-along-mamboleo-muhoroni-kipsitet-road-in-kisumu-county',
    publishedAt: '2026-09-08',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    originStatus: 'UNKNOWN',
    accessibility: 'RETRIEVED',
  },
  {
    // [C:S018] [G:S011]
    id: 'SRC-022',
    title: 'Ruto set for four-day Nyanza tour packed with development projects',
    publisher: 'The Star',
    url: 'https://www.the-star.co.ke/news/2026-09-12-ruto-heads-to-nyanza-for-four-day-development-tour',
    publishedAt: '2026-09-12',
    retrievedAt: '2026-09-13',
    sourceType: 'NEWS',
    evidenceClass: 'SECONDARY',
    // [C:S018] "repeating an itinerary (institution unnamed)".
    originStatus: 'REPEATING',
    accessibility: 'RETRIEVED',
  },
]

export const sourceById = new Map(sources.map((s) => [s.id, s]))
