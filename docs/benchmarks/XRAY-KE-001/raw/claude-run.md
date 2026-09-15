# X-Ray Research Run — XRAY-KE-001 (Claude)

Stages 1–9 only. No synthesis, no verdict.

---

## 00 — RUN METADATA

| Field | Value |
|---|---|
| Protocol version | X-Ray Research Protocol v0.1.0 (Experimental) |
| Source URL | https://citizen.digital/article/inside-rutos-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-n390083 |
| Focus | Not supplied in the action prompt. Protocol §18 (XRAY-KE-001) fixes the initial subject as the Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet road and pre-specifies C001–C004 with C005 reserved. This run treats that as the effective focus. |
| Research date/time | Sunday 13 September 2026, afternoon EAT (surface source retrieved 13 Sep 2026; article last modified 13:03 EAT) |
| Researcher/model | Claude (Anthropic), web research via search + page fetch |
| Limitations | (1) The presidential inspection of the road is scheduled for Monday 14 Sep 2026 — after research time — so its occurrence cannot be established. (2) MyGov (mygov.go.ke) originating page for the May 2025 Owalo statement returned HTTP 404; content recovered from search excerpts and repeating outlets. (3) No signed contracts, variation orders, payment certificates, or KeNHA project-status reports were reachable online; procurement evidence is the KeNHA quarterly award notice. (4) PS Omollo's February and September 2026 statements were reached through press reproductions, not the original posts. (5) The Lot 3 supervision-consultancy award was not located. (6) Two officials named as "KeNHA Nyanza Regional Director" at the same May 2026 event (Fredrick Oyuga / Alfred Ouko / "Fredrick Ayuga") — name discrepancy left unresolved; treated as one KeNHA regional-office source. |

---

## 01 — SOURCE RECORD

```text
source_id:        S001
source_type:      news article (online)
title:            Inside Ruto's five-day tour of Kisumu, Siaya, Migori and Homa Bay
publisher:        Citizen Digital (Royal Media Services)
author:           Allan Obiero
url:              https://citizen.digital/article/inside-rutos-five-day-tour-of-kisumu-siaya-migori-and-homa-bay-n390083
published_at:     2026-09-13T11:24:56Z (page meta; byline shows 11:24 EAT)
updated_at:       2026-09-13T13:03:18Z (page meta)
retrieved_at:     2026-09-13 (EAT), same day
section:          Top Stories
```

**Relevant content (focus passage, preserved verbatim):**

> Earlier in the day, Ruto is expected to visit a number of ongoing projects in Kisumu, including the Ksh.16.7 billion, 63-kilometre Mamboleo Junction-Miwani-Chemelil-Muhoroni-Kipsitet Highway, most sections of which have already been tarmacked.

**Framing passages (verbatim):**

> President William Ruto has kicked off a five-day development tour of the Luo Nyanza region, where he is expected to assess a number of multi-billion-shilling projects initiated by his administration while also seeking to consolidate his political support in the ODM party's backyard ahead of the 2027 General Election.

> According to his itinerary, the president will later on Monday hold a closed-door meeting with about 10,000 people drawn from Kisumu, Siaya, Homa Bay and Migori counties…

> Ruto will conclude the tour in Homa Bay County on Thursday, September 17…

**Other project passages in the article (preserved; out of focus, not investigated):** Rabuor–Chiga road, Nyando, "Ksh.1.1 billion", to be inspected; Lake Victoria Water and Sanitation Project, GoK + EU, "Ksh.7.5 billion", to be commissioned; Kisumu West sub-county police HQ, Otonglo, to be commissioned; Kisumu International Airport tower, "Ksh.314 million", eight storeys, to be commissioned; Siaya: Dhogoye Bridge (Usenge, Bondo), Siaya Stadium (Ministry of Defence); Migori: Stella–Sibuoche–Gogo road (Uriri), Kanyawanga–Kwoyo–Madiaba road (Awendo); Homa Bay: ESP markets at Misambi, Kendu Bay, Kijabe; Sindo KMTC access road; Junction–Kodiyo–Pier road.

**Entities extracted:** People — William Ruto; Opiyo Wandayi (Energy CS); John Mbadi (Treasury CS); Raymond Omollo (Interior PS); Anyang' Nyong'o; Ochilo Ayacko; Gladys Wanga. Institutions — ODM; Ministry of Defence; European Union; Government of Kenya. Locations — Kisumu, Siaya, Migori, Homa Bay; Mamboleo Junction, Miwani, Chemelil, Muhoroni, Kipsitet; Nyando; Otonglo; Jua Kali area. Money — Ksh 16.7bn; 1.1bn; 7.5bn; 314m. Distances — 63 km. Dates — Monday (14 Sep 2026 implied); Tuesday; Wednesday; Thursday 17 Sep 2026; "five-day". Quantities — ~10,000 attendees.

**Attribution inside the source:** The itinerary is attributed to "his itinerary" (no institution named). The road figures carry no attribution.

---

## 02 — CLAIM LEDGER

### In-scope (focus) claims

| claim_id | claim_text | source_passage | layer | claim_type | entities / locations | time_scope | ambiguities | priority |
|---|---|---|---|---|---|---|---|---|
| **C001** | The road/project is 63 kilometres long. | "63-kilometre Mamboleo Junction-Miwani-Chemelil-Muhoroni-Kipsitet Highway" | O | quantitative / geographic | C674 road; Kisumu, Nandi, Kericho | present (project as scoped) | Does 63 km denote (a) main carriageway only, (b) total works length including feeder/spur roads, (c) lane-km, (d) the original 1960s alignment? Sources also use 122 km, ~100 km, 44 km. | high |
| **C002** | The project is worth KSh 16.7 billion. | "Ksh.16.7 billion … Highway" | O | financial | KeNHA; three contractors | undated | "Worth" could mean: sum of awarded works contracts; works + supervision; revised contract value after variations/price adjustment; budget/financing envelope; total programme cost; amount spent. Not stated. | high |
| **C003** | Most sections of the road are already tarmacked. | "most sections of which have already been tarmacked" | O (checkable) with interpretive gloss ("most") | delivery | as above | as at 13 Sep 2026 | "Sections" — contract lots, or physical stretches? "Tarmacked" — any bituminous layer laid, or completed pavement? "Most" — by length, by lot count, or by value? | high |
| **C004** | The President is inspecting or commissioning the road during the September 2026 tour. | "Ruto is expected to visit a number of ongoing projects in Kisumu, including the … Highway" | O (scheduled) | timeline / political | Ruto; State House itinerary | Monday 14 Sep 2026 (implied) | Source says "visit", not "commission". "Expected to" = itinerary, not occurrence. Tour length/dates differ across outlets. | medium |
| **C005** | *(Reserved — discovered from tracing; see below)* The road's completion date: what the contractual completion date is/was, and what the government's current target completion date is. | not in S001; emerged from tracing C001–C004 | O | timeline / delivery | KeNHA; National Assembly Roads Committee | 2021 → 2028 | Original contract period vs extended period; regional-office target (July 2027) vs KeNHA statement to Parliament (January 2028). | high |

**Why C005 emerged:** Tracing C002 led to the KeNHA award record (2021) and a reported award letter with a 36-month completion period; tracing C003 led to official progress figures of 20–34% per lot in 2026 and two different official completion targets. The gap between the original contract period, current progress, and the divergent completion dates is the most material delivery/accountability question the evidence exposed. It also bears directly on C003 and on the article's "ongoing" framing.

### Supporting sub-claims created by decomposition (used in ledgers)

| claim_id | claim_text | layer | note |
|---|---|---|---|
| C001a | The project is split into three lots. | O | established by S002 |
| C001b | Lot lengths: Lot 1 Mamboleo–Miwani ≈12.6–12.9 km; Lot 2 Miwani–Chemelil; Lot 3 Chemelil–Muhoroni–Kipsitet. | O | lengths contested |
| C002a | Awarded works contract sums are KSh 5.19bn / 4.96bn / 5.72bn (Lots 1–3). | O | established by S002 |
| C002b | The 16.7bn figure is the figure currently used by KeNHA's Nyanza regional office and government media. | O | established (that it is used), composition unknown |
| C003a | Official per-lot progress as of Sep 2026: 20.2% / 34% / 28%. | O | S016 (PS Omollo status data) |
| C004a | The tour runs 13–17 September 2026 ("five-day"). | O | contested by other itineraries |

### Out-of-scope claims (recorded, not investigated)

C101 Rabuor–Chiga road, KSh 1.1bn, to be inspected (note: S016 lists "Chiga-Rabuor Road, valued at Ksh1.10 billion … at the contract-award stage", which sits oddly beside "inspect"; flagged, not investigated). C102 LVWATSAN, KSh 7.5bn, GoK+EU, to be commissioned. C103 Kisumu Airport tower, KSh 314m, eight storeys. C104 Siaya Stadium built by Ministry of Defence. C105 "his administration has invested heavily in a number of projects [in Homa Bay], most of which have been completed" (I). C106 ~10,000-person closed-door meeting.

---

## STAGE 4 — INVESTIGATION PLAN (recorded before tracing)

**C001 (length)** — Ideal: signed contract scope / design report / KeNHA project sheet with chainages. Strong: KeNHA tender notices or award notices giving chainages; contractor project pages. Contextual: KeNHA press statements; PS/State House statements. Insufficient alone: news reports repeating a figure. Likely holders: KeNHA HQ & Nyanza region; contractors. Search questions: What chainage does each lot cover? Does any official record explain 63 vs 122?

**C002 (value)** — Ideal: signed contracts; variation orders; KeNHA financial statements. Strong: KeNHA tender award notice (contract sums); Treasury budget estimates; Auditor-General report on KeNHA. Contextual: KeNHA officials' statements; GAA/KNA. Insufficient alone: outlets repeating 16.7. Search questions: What is the awarded contract sum per lot? Does 16.7 = works + supervision? Has the contract sum been revised?

**C003 (tarmacked)** — Ideal: KeNHA monthly progress report / RE's certificate. Strong: official progress percentages by lot; parliamentary committee inspection record. Contextual: local reporting with photographs; contractor statements. Insufficient alone: adjectives in news copy. Search questions: What is per-lot % completion and as at when? Does any source describe length surfaced?

**C004 (inspection)** — Ideal: State House / PCS programme; post-event record (PCS, KeNHA). Strong: independent outlets' itineraries if independently sourced. Contextual: pre-tour reporting. Search questions: Is the road on the published Monday programme? Has the visit happened (not possible before 14 Sep)?

**C005 (completion date)** — Ideal: contract completion date + approved extensions of time. Strong: KeNHA statements to Parliament; award letter contract period. Contextual: regional-office targets. Search questions: What was the contract period? What completion date has KeNHA given most recently, and to whom?

---

## 03 — EVIDENCE LEDGER

Evidence strength: direct / strong_indirect / contextual / weak.

| ID | Title | Institution / publisher | Date | URL | Type | Primary/Secondary | Orig./Repeat | Independence | Supports | Contradicts | Contextualizes | Relevant evidence | Strength |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **S001** | Inside Ruto's five-day tour… | Citizen Digital | 13 Sep 2026 | (see 01) | news | secondary | repeating unnamed itinerary + unattributed figures | surface source | — | — | all | 16.7bn; 63 km; "most sections tarmacked"; Monday visit | contextual (establishes what was claimed) |
| **S002** | Tender Awards for 4th Qtr FY 2020-2021 | KeNHA (procurement notice) | Q4 FY2020/21 (Apr–Jun 2021); file uploaded Mar 2022 | https://kenha.co.ke/wp-content/uploads/2022/03/TENDER-AWARDS-FOR-4TH-QTR-FY-2020-2021.pdf | procurement award notice | **primary** | originating | independent of all press | C001a, C002a, C001b (Lot 2 chainage) | C002 as "16.7bn contract value" (works sum is 15.88bn) | C005 | KeNHA/2370/2020 Lot 1 Mamboleo Junction (A12)–Miwani: **KSh 5,194,524,145.57**, China Railway No.10 Engineering Group JV Pinnie Agency. KeNHA/2371/2020 Lot 2 Miwani–Chemelil **(KM 12+600 – KM 40+000)**: **KSh 4,964,716,883.42**, Sinohydro Corporation JV Gragab Agencies. KeNHA/2372/2020 Lot 3 Chemelil–Muhoroni–Kipsitet: **KSh 5,720,767,704.00**, H. Young & Co (EA). Supervision: KeNHA/2365/2020 Lot 1 KSh 243,748,108.80 (Interconsult/Professional Consultants); KeNHA/2366/2020 Lot 2 KSh 261,536,755.20 (AMA Consulting). No Lot 3 supervision award in this notice. Works total = **15,880,008,733**. | **direct** |
| **S003** | Kenha awards Sh4.9bn tender for Mamboleo-Muhoroni road works | The Star | 17 Mar 2021 | https://the-star.co.ke/counties/nyanza/2021-03-17-kenha-awards-sh49bn-tender-for-mamboleo-muhoroni-road-works | news reporting a KeNHA award letter | secondary (describes a primary letter) | originating for contract-period detail | independent reporting of S002-era event | C001a, C005 | — | C002 | 12 Mar 2021 KeNHA letter (D.A. Muchilwa for DG Mundinia) to Sinohydro: Lot award KSh 4.9bn; contract to be signed within 60 days; **contract period 60 months = 36 months completion + 24 months defects liability**; Treasury approved funds; road described as 63 km. | strong_indirect |
| **S004** | Work starts on Sh15bn Kisumu-Muhoroni road | Business Daily (Nation Media) | Jul/Aug 2022 (BD page dated 4 Aug 2022; reposted on JamiiForums 7 Jul 2022) | https://www.businessdailyafrica.com/bd/economy/work-starts-on-sh15bn-kisumu-muhoroni-road-3872660 | news quoting KeNHA spokesperson | secondary | originating (KeNHA on-record statement) | independent of S002 as a statement, but figures match S002 | C001 (63 km), C002a (5.19/4.96/5.72 = 15.87bn), C005 | — | — | KeNHA's Samwel Kumba: works started **June [2022]**; three years to complete; 63 km; road built early 1960s. | strong_indirect |
| **S005** | Sh3.58bn marked for Kisumu–Muhoroni road works | Daily Nation | 24 May 2023 | https://nation.africa/kenya/business/sh3-58bn-marked-for-kisumu-muhoroni-road-works-4244432 | news citing Treasury budget documents | secondary (cites primary budget estimates) | repeating budget docs | independent of KeNHA press | C001 (63 km); C005 (budget pace) | — | C002 (allocation ≠ contract value) | Treasury apportioned **KSh 3.58bn over three FYs** from FY2023/24, of which **KSh 908m** in FY2023/24; contract awarded "last year" [2022 per Nation; S002 shows 2021 approval]. | strong_indirect (for allocation) |
| **S006** | Construction of stalled Kisumu-Muhoroni-Kipsitet road resumes | Kenya News Agency (kenyanews.go.ke); same text in MyGov 11 Feb 2025 (hosted on kenha.co.ke) | ~Feb 2025 (MyGov print 11 Feb 2025; KNA page header shows 15 Dec 2025 — date unstable) | https://www.kenyanews.go.ke/construction-of-stalled-kisumu-muhoroni-kipsitet-road-resumes-2/ ; https://kenha.co.ke/wp-content/uploads/2025/02/MyGov-Tender-Notice-February-11-2025-1.pdf | government news agency | secondary (state media) | originating (quotes PDU/RC) | not independent of government | C001 (63 km), C001a | — | C002, C005 | PDU Western Director Sylvance Osele: funds released, contractors paid; "Sh4.9 billion project, which commenced in **October 2022** and is funded by the National Treasury"; RC Flora Mworoa: Lot 1 at **15%**. | contextual (progress); the 4.9bn/63km pairing appears to be a probable source error — see D003 |
| **S007** | Construction of stalled Mamboleo Junction Miwani–Chemelil–Muhoroni road resumes | MyGov / Government Advertising Agency (mygov.go.ke — 404 at retrieval); repeated by TV47 (1 May 2025), Construction Kenya (15 May 2025), Meta Group (15 May 2025) | ~1 May 2025 | https://www.mygov.go.ke/construction-stalled-mamboleo-junction-miwani-chemelil-muhoroni-road-resumes (404) ; https://www.tv47.digital/construction-of-mamboleo-junction-miwani-chemelil-muhoroni-kipsitet-road-resumes-97677/ | government media | secondary (state media) | originating (Owalo inspection) | not independent of government; TV47/CK/Meta repeat it | C001a, C002a | C001 (says 122 km) | C005 | Deputy CoS Eliud Owalo: funding unlocked; road "122-kilometre… at a cost of Sh15.7 billion"; Lot 2 **43.4 km** KSh 4.96bn (Sinohydro JV Gragab); Lot 3 **44.7 km** ~KSh 5.7bn (H. Young); CR10's Li Jingang confirms payment received. (Meta Group adds Lot 1 = 33.9 km — provenance unclear.) | contextual |
| **S008** | Govt upgrades 122 km Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road (PS Omollo statement) | Capital FM / allAfrica; Kenyans.co.ke; Business Today | 17 Feb 2026 | https://capitalfm.africa/govt-upgrades-122-km-mamboleo-miwani-chemelil-muhoroni-kipsitet-road/ ; https://allafrica.com/stories/202602170182.html ; https://www.kenyans.co.ke/news/120884-… | press reproduction of Interior PS statement | secondary (statement is primary-ish official comms) | originating: PS Omollo statement (original post not retrieved) | all three outlets derive from one statement | **C001 (63 km = main carriageway)** | — | C001 (122 km total scope) | "122-kilometre road… with about **63 kilometres of the main carriageway** earmarked for upgrading. Additional works on feeder roads and related sections bring the total project scope to approximately 122 kilometres." C674; Kisumu–Nandi–Kericho. | strong_indirect (official scope definition) |
| **S009** | Hope as works on Sh16.7 billion Mamboleo-Miwani road revived | The Star (Faith Matete) | 8 May 2026 | https://www.the-star.co.ke/counties/nyanza/2026-05-08-hope-as-works-on-sh167-billion-mamboleo-miwani-road-revived | news from KeNHA site briefing | secondary | originating for 16.7bn in press (KeNHA Nyanza office briefing, 8 May 2026) | same event as S010, S011 | C002b; C005 (started 2021; stalled ~5 yrs) | C001 (says 44 km) | C003 (asphalt DBM being laid at Mamboleo) | RD "Alfred Ouko": project started 2021; financing via securitisation of Road Maintenance Levy Fund; RE Catherine Munyi: pavement is Dense Bitumen Macadam. "44-kilometre road project, valued at Sh16.7 billion". | contextual |
| **S010** | KeNHA boss issues roadmap for construction of Mamboleo–Muhoroni road | People Daily (Viola Kosome) | 9 May 2026 | https://peopledaily.digital/news/kenha-boss-issues-roadmap-for-construction-of-mamboleo-muhoroni-road | news from same 8 May briefing | secondary | same origin as S009 | not independent of S009/S011 | C002b, C001b, C003a (May figures), C005 | C003 | — | RD "Frederick Oyuga": Lot 1 **12.6 km** incl. 6.5 km dual carriageway, **24%**; Lot 2 **~20 km**, **34%**; Lot 3 Chemelil–Muhoroni–Kipsitet, **22%**; "total project length to about **44 kilometres**, including spur roads"; began 2021; RMLF securitisation; completion **July 2027**; Lot 3 "implemented by Etta Construction" [conflicts with S002 H. Young — see D006]. | contextual |
| **S011** | Kisumu residents to benefit from Sh16.7 billion road project | Radio47 | 7 May 2026 | https://www.radio47.fm/counties/kisumu-residents-to-benefit-from-sh16-7-billion-road-project-28928/ | news | secondary | same KeNHA briefing | not independent | C002b, C005 | — | — | "approximately Sh16.7 billion"; began 2021; completion July 2027. | weak |
| **S012** | Sh16.7 billion highway project to open up Kisumu and surrounding counties | GAA (gaa.go.ke) / KNA (Mabel Keya & Robert Onyango); also kenyanews.go.ke 15 Jul 2026 "nears completion" | 21 Jul 2026 (KNA 15 Jul 2026) | https://gaa.go.ke/sh167-billion-highway-project-open-kisumu-and-surrounding-counties ; https://www.kenyanews.go.ke/?p=169466 | government media | secondary (state media) | repeats KeNHA regional office | not independent of S009–S011 | C002b, C001b, C005 | C003 (progress 22–34%) | financing (Fuel Levy Fund) | Lot 1 12.6 km (6.5 km dual) **24%**; Lot 2 ~20 km **34%**; Lot 3 ~44 km **22%**; commenced **2021**; financed through Fuel Levy Fund; completion **July next year [2027]**; RE Catherine Mwinyi on pavement standard. KNA headline "nears completion" is editorial, not supported by its own figures. | contextual |
| **S013** | National Assembly Roads Committee lauds progress on Muhoroni–Chemelil–Mamboleo road project | Capital FM (Simon Ndonga) | 7 Jun 2026 | https://capitalfm.africa/national-assembly-roads-committee-lauds-progress-on-muhoroni-chemelil-mamboleo-road-project/ | news of parliamentary committee inspection (6 Jun 2026) | secondary (records official statements) | originating | independent of KeNHA regional briefings (different actors, different date) | C005 | — | C003 | Vice-chair Didmus Barasa: pace increased "for the last three to four months" after pending bills paid; expects completion "within the contractual period… possibly even earlier"; KeNHA Director of Roads & Design Henry Gakuru: two bridges to be redesigned/reconstructed; airport link included. | strong_indirect (for committee/KeNHA positions) |
| **S014** | MPs expose blunder slowing down road projects / MPs warn KeNHA against awarding multiple contracts to one firm | People Daily (7 Jun 2026); Capital Business (8 Jun 2026); Kahawatungu (7 Jun 2026) | 6–8 Jun 2026 | https://peopledaily.digital/news/mps-expose-blunder-slowing-down-road-projects-send-warning-to-kenha ; https://www.capitalfm.co.ke/business/2026/06/mps-warn-kenha-against-awarding-multiple-road-contracts-to-one-firm/ ; https://kahawatungu.com/mps-urge-kenha-to-avoid-awarding-multiple-road-contracts-to-single-firms/ | news of same 6 Jun 2026 inspection | secondary | originating (KeNHA statement to committee) | same event as S013 | **C005 (Jan 2028)**, C003a | C003; C005 (July 2027 target) | — | KeNHA team (Gakuru; Director of Maintenance Fukwo Wafula): **overall progress 28%**; completion **expected January 2028 under a revised schedule**, revised from earlier timelines "due to pending bills, slow funding and weather"; Mamboleo Interchange planned. | strong_indirect |
| **S015** | Ksh16B Mamboleo–Kipsitet Road project gains momentum after years of delay | People Daily | 7 Jun 2026 | https://peopledaily.digital/news/ksh16b-mamboleo-kipsitet-road-project-gains-momentum-after-years-of-delay/amp | news | secondary | same event as S013/S014 | not independent | C002b; C001 (122 km) | — | — | "Ksh16.7 billion"; "122-kilometre corridor"; Barasa: "bridges are part of the current contract". | weak |
| **S016** | Ahero's 7-hour traffic nightmare nears end as Ksh15.8B road projects transform Kisumu; same data in allAfrica / East African Herald "Sh14bn Road Projects Reshape Kisumu Network" (9 Sep 2026) | People Daily (Viola Kosome); allAfrica; EA Herald | 11 Sep 2026 (PD); 9 Sep 2026 (allAfrica/EAH) | https://peopledaily.digital/news/aheros-7-hour-traffic-nightmare-nears-end-as-ksh15-8b-road-projects-transform-kisumu ; https://allafrica.com/stories/202609090085.html | news reproducing Interior Ministry project-status data | secondary (data is official) | originating: "project status information provided by the Ministry of Interior… under PS Raymond Omollo" (original release not retrieved; photos credited @ray_omollo/X) | one origin, three outlets | C002a, C001b, **C003a** | **C003** | C002 ("more than Ksh15.8 billion") | Lot 1 **12.9 km**, KSh 5.19bn, **20.2%**; Lot 2 **43.4 km**, KSh 4.96bn, **34%**; Lot 3 **44.5 km**, KSh 5.72bn, **28%**. Also: Chiga–Rabuor Road KSh 1.10bn "at the contract-award stage". | strong_indirect (most recent official status) |
| **S017** | Reconstruction of Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road… Lot 3 (portfolio page) | H. Young & Co (EA) Ltd (contractor) | undated | https://hyoung.com/portfolio/reconstruction-of-mamboleo-miwani-chemelil-muhoroni-kipsitet-road-to-bitumen-standard-lot-3-chemelil-muhoroni-kipsitet/ | contractor project description | primary-adjacent (interested party) | originating | independent of press; not independent of contract | C001 (main-carriageway reconstruction), C001b | C001b (44 km readings) | C001 (63 vs 122) | Lot 3 main road ≈ **23 km** (from ~1 km short of Chemelil roundabout, through Muhoroni, to A12 near Kaitui); feeder roads Muhoroni–Songhor ≈14 km and Junction C35–Koru link/loop ≈5.5 km; **total 42.5 km**; 7 m carriageway + 2 m shoulders; surface dressing. | strong_indirect |
| **S018** | Ruto set for four-day Nyanza tour packed with development projects | The Star | 12 Sep 2026 | https://www.the-star.co.ke/news/2026-09-12-ruto-heads-to-nyanza-for-four-day-development-tour | pre-tour itinerary report | secondary | repeating an itinerary (institution unnamed) | probably same itinerary as S001 — dependency not confirmable | C004 | C004a ("four-day… September 13-17") | — | Monday: "inspect road projects along the Mamboleo-Miwani-Chemelil-Muhoroni and Kipsitet routes"; airport tower; police HQ; LVWATSAN; Awasi–Katito road. | contextual |
| **S019** | President Ruto set for Nyanza region tour to undo Opposition's gains | Eastleigh Voice | 12 Sep 2026 | https://eastleighvoice.co.ke/politics/399697/president-ruto-set-for-nyanza-region-tour-to-undo-oppositions-gains | pre-tour report | secondary | repeating | unclear | C004 | C004a ("September 13 to 16"); C002 ("Sh15.9 billion") | — | "Sh15.9 billion Kisumu-Chemelil-Muhoroni-Kipsitet road"; Sh220bn regional projects. | weak |
| **S020** | William Ruto returns to Nyanza for 4-day tour… (Tuko, via Streamlinefeed summary) | Tuko / Streamlinefeed | 11 Sep 2026 | https://streamlinefeed.co.ke/news/ruto-to-begin-four-day-nyanza-tour-of-sh220-billion-projects | pre-tour report of "preliminary itinerary" | secondary | repeating a preliminary itinerary | unclear | C004 | C004a (county order: Kisumu 13, Siaya 14, Homa Bay 15, Migori 16) | — | "KSh15.9 billion Kisumu-Chemelil-Muhoroni-Kipsitet road". | weak |
| **S021** | RMLF securitisation reporting: Star "What's securitisation" (21 May 2026); Nation "How Sh188bn debts stalled 580 road projects" (Aug 2026, citing Auditor-General on KURA FY2024/25); Business Daily "State cuts roads bond target" (3 Jun 2026); allAfrica (Chirchir, 17 Jul 2025) | The Star; Daily Nation; Business Daily; allAfrica | 2025–2026 | https://www.the-star.co.ke/news/2026-05-21-whats-securitisation-and-how-it-works ; https://nation.africa/kenya/business/how-sh188bn-debts-stalled-580-road-projects--5567784 ; https://www.businessdailyafrica.com/bd/markets/capital-markets/state-cuts-roads-bond-target-to-sh120-billion-5483860 ; https://allafrica.com/stories/202507170296.html | financial/policy reporting | secondary | mixed | independent of road-specific sources | financing context only | — | C002, C005 | KSh 7/litre of the KSh 25 fuel levy securitised (Apr 2025) to raise ~KSh 175bn to clear road pending bills to Dec 2024; further KSh 5/litre approved Nov 2025; Auditor-General (KURA FY2024/25) records the mechanism. None of these name this road. | contextual |
| **S022** | Kisumu–Chemelil–Muhoroni Road (Wikipedia) | Wikipedia | n/d | https://en.wikipedia.org/wiki/Kisumu%E2%80%93Chemelil%E2%80%93Muhoroni_Road | tertiary | tertiary | repeating | — | — | — | C001 (road ≈50 km Mamboleo–Muhoroni; 1960s build) | Not relied on. | weak |

**Source dependency graph (known or probable):**

```text
S004 (BD, KeNHA spokesperson) ──┐
S005 (Nation, Treasury docs)   ─┼─ figures consistent with ─► S002 KeNHA award notice (origin of lot sums; 15.88bn)
S016 (PD/allAfrica/EAH)        ─┘   (S016 repeats 5.19/4.96/5.72 exactly)

S009 (Star) ─┐
S010 (PD)   ─┼─► one KeNHA Nyanza site briefing, 8 May 2026  ──► origin of "16.7bn", "44 km", "July 2027"
S011 (R47)  ─┤
S012 (GAA/KNA, Jul 2026) repeats the same office's figures

S013 (Capital FM) ─┬─► one parliamentary inspection, 6 Jun 2026 ──► origin of "28% overall", "January 2028"
S014 (PD/CapBiz/KT)─┤
S015 (PD)          ─┘

S008 (Capital/allAfrica/Kenyans/BusinessToday) ──► one PS Omollo statement, 17 Feb 2026 ──► origin of "63 km main carriageway / 122 km scope"
S016 ──► one PS Omollo status release, ~9 Sep 2026 ──► origin of "20.2 / 34 / 28%"
S007 (MyGov) ──► TV47, Construction Kenya, Meta Group (repeat) ──► origin of "122 km / 15.7bn / 43.4 km / 44.7 km"
S006 (KNA) ──► MyGov 11 Feb 2025 print (repeat)
S001 (Citizen) ──?── S018 (Star) ──?── S020 (Tuko) : itinerary dependency suspected, not confirmed
```

Counting rule applied: the "16.7bn" appears in ≥6 publications but has **one** identifiable origin (KeNHA Nyanza regional office, May 2026). The "15.87/15.88bn" appears in ≥4 publications and rests on **one** primary record (S002) plus one on-record KeNHA statement (S004).

---

## 04 — DISCREPANCY LEDGER

| ID | claim_id | sources | values / statements | classification | explanation | effect |
|---|---|---|---|---|---|---|
| **D001** | C001 | S001, S003, S004, S005, S006, S008 vs S007, S008, S015 vs S009, S010 vs S016 | **63 km** (Citizen; KeNHA 2022; Nation 2023; KNA 2025; PS Omollo: "main carriageway") — **122 km** (Owalo 2025; PS Omollo 2026: "total project scope incl. feeder roads") — **44 km** (KeNHA Nyanza, May 2026, "including spur roads") — lot sums **12.9 + 43.4 + 44.5 = 100.8 km** (Sep 2026) | **different_definition** (63 vs 122) — partly reconciled; **unresolved** (44; 100.8 vs 122) | Reconciliation test: S002 gives Lot 2 chainage KM 12+600–40+000 = 27.4 km, implying Lot 1 ≈ 12.6 km (matches S010). S017 gives Lot 3 main road ≈ 23 km. **12.6 + 27.4 + 23 ≈ 63 km of main carriageway** — consistent with PS Omollo's definition (S008). So "63 km" and "122 km" are most plausibly two definitions (main carriageway vs total works incl. feeder/spur/dual sections), not a contradiction. However: (a) the published per-lot totals (100.8 km) do not sum to 122; (b) "44 km" (S009/S010) is not reconcilable with either and may be Lot 3's ~42.5–44.7 km misapplied to the whole project; (c) Lot 2 "~20 km" (S010) vs 27.4 km chainage (S002) vs 43.4 km (S007/S016) — 43.4 likely includes feeder/service roads, ~20 km is unexplained. | C001 reads as SUPPORTED for main carriageway; project-length claims in general remain partly unresolved. |
| **D002** | C002 | S001, S009–S012, S015 vs S002, S004, S016 vs S007 vs S019/S020 | **16.7bn** (KeNHA Nyanza office 2026; GAA/KNA; Citizen) — **15.88bn** works sums (S002 primary; S004; S016 "more than 15.8bn") — **15.7bn** (Owalo/MyGov 2025) — **15.9bn** (EV/Tuko 2026) — **14bn** (allAfrica/EAH headline) | **unresolved** (candidate: different_definition or revised_value) | 15.7 / 15.8 / 15.87 / 15.9 are all roundings of the same 15,880,008,733 works total — not real discrepancies. **16.7bn vs 15.88bn is a real difference of ≈KSh 0.82bn.** Tested explanations: (i) works + supervision consultancies — Lots 1–2 supervision in S002 total KSh 505.3m → 16.385bn; if a Lot 3 supervision contract of ≈KSh 0.3bn exists (not located), the total would approach 16.7bn — **plausible but not established**; (ii) revised/varied contract sums after ~5 years (price adjustment, redesign of two bridges per S013, Mamboleo interchange per S014) — **no variation record located**; (iii) figure includes VAT/contingency/RAP — no source states this. No source explains the composition of 16.7bn. "14bn" headline unexplained (may reflect a different subset; body text gives 5.19/4.96/5.72). | C002 cannot be graded ESTABLISHED as "contract value". See GAP-002. |
| **D003** | C002 / C001 | S006 vs S002/S003 | KNA: "Sh4.9 billion project… 63-kilometre" | **probable_source_error** | KSh 4.9bn is the Lot 2 award value (S002: 4,964,716,883; S003: "Sh4.9bn" for Sinohydro lot). KNA applied a single-lot value to the whole 63 km road. Multiple sources repeat 4.9bn only in the Lot 2 context. | Does not affect C002 finding; flags KNA figure as unreliable for total value. |
| **D004** | C005 | S004 vs S006 vs S009/S010/S012 vs S002 | Works "started in June [2022]" (KeNHA spokesperson) — "commenced in October 2022" (PDU via KNA) — "project started/commenced in 2021" (KeNHA Nyanza 2026) — award approved Q4 FY2020/21 / letter 12 Mar 2021 (S002/S003) | **different_definition / different_phase** | Award (Mar–Jun 2021) ≠ contract signature (≤60 days after letter, per S003) ≠ site commencement (June or October 2022). "Started 2021" most plausibly refers to award/contract; "June/October 2022" to mobilisation. June vs October 2022 remains a genuine unresolved difference between two official speakers. | Commencement date matters for computing the original 36-month completion date (mid-2025 if June 2022; late-2025 if October 2022). Unresolved → GAP-004. |
| **D005** | C005 | S010/S011/S012 vs S014 | Completion **July 2027** (KeNHA Nyanza RD, 8 May 2026; GAA/KNA 21 Jul 2026) vs **January 2028** "under a revised schedule" (KeNHA to National Assembly Roads Committee, 6 Jun 2026) | **genuine_contradiction** (unless the two refer to different scopes) | Same institution, dates one month apart, then the July 2027 figure repeated in July 2026 after the January 2028 statement. Tested: could July 2027 be Lot 1 only and Jan 2028 the whole project? S010 says "this project will be complete"; S014 gives a single project-wide date. No scope qualifier in either. Alternative: one is the contractual completion date and the other an internal target — neither source says which. | C005 status CONTESTED. Both dates are on the record from KeNHA. |
| **D006** | C001a | S010 vs S002, S007, S016, S017 | Lot 3 contractor "Etta Construction" (PD, May 2026) vs **H. Young & Co (EA)** (KeNHA award notice; MyGov; H. Young's own site) | **probable_source_error** (or unreported subcontract/novation) | Primary record and contractor's own page say H. Young. No record of novation located. | Not material to C001–C005 unless a contract change occurred; noted. |
| **D007** | C003a | S010/S012 vs S016 | Lot 1 progress **24%** (May & Jul 2026) then **20.2%** (Sep 2026); Lot 3 **22%** (May/Jul) then **28%** (Sep) | **different_definition / unresolved** | A decline in Lot 1 progress over four months is not physically possible if the same measure is used; suggests different bases (physical vs financial; re-measured after scope change such as the Mamboleo interchange/bridges) or a reporting error. No source explains. | Weakens precision of any progress figure but every official figure remains ≤34%, so the direction of the C003 finding is unaffected. |
| **D008** | C004a | S001 vs S018 vs S019 vs S020 | "five-day" tour ending Thursday 17 Sep (Citizen) — "four-day… Sunday, September 13-17" (Star) — "September 13 to 16" (Eastleigh Voice) — Kisumu 13 / Siaya 14 / Homa Bay 15 / Migori 16 (Tuko "preliminary itinerary") vs Citizen order Kisumu–Siaya–Migori–Homa Bay | **unresolved** (likely revised_value: itinerary versions) | Tuko explicitly calls its version "preliminary". Citizen's is the latest (13 Sep) and internally consistent (Sun–Thu = five days). Star's "four-day" with "13-17" is internally inconsistent. No official programme retrieved. | Does not affect whether the road is on Monday's programme (Citizen and Star agree on that). |
| **D009** | C003 | S012 headline vs S012 body | KNA/GAA headline "nears completion" vs body figures 24/34/22% | **probable_source_error** (editorial framing) | The headline is not supported by the article's own progress data. | Illustrates how "most sections tarmacked"-type framing can arise; not evidence for C003. |

---

## 05 — GAP LEDGER

| gap_id | claim_ids | missing | why it matters | evidence that would resolve it | likely holder | searched | status | effect |
|---|---|---|---|---|---|---|---|---|
| **GAP-001** | C001 | An official scope document giving the length of each lot's main carriageway and its feeder/spur/service roads, and the basis of "122 km". | Without it, 63 vs 122 vs 100.8 vs 44 km rests on inference from a chainage and a contractor page. | KeNHA project sheet / design review report / signed contract scope; tender documents for KeNHA/2370–2372/2020. | KeNHA (HQ Development directorate; Nyanza region); contractors; supervising consultants (Interconsult; AMA). | KeNHA site; tender award notices; contractor sites; press | Partially located (Lot 2 chainage; Lot 3 contractor scope). Lot 1 chainage and Lots 1–2 feeder roads not located. | C001 graded SUPPORTED not ESTABLISHED. |
| **GAP-002** | C002 | The composition of "KSh 16.7 billion": whether it is works + supervision, a revised contract sum, a financing envelope, or something else; and the current (revised) contract sum per lot. | "Project value" as used by officials cannot be audited against the 15.88bn primary award figure. | Signed contracts + variation orders; KeNHA financial statements (notes on commitments); Auditor-General report on KeNHA FY2024/25 or FY2025/26; Lot 3 supervision award notice. | KeNHA; Office of the Auditor-General; National Treasury (BPS/estimates). | KeNHA award PDFs (Q4 FY20/21, Q3 FY20/21, FY22/23, FY23/24 sampled); "16.7 billion" queries; OAG queries | Not located. | C002 UNRESOLVED. |
| **GAP-003** | C003 | Any official measure of length surfaced (bituminous layer laid) per lot, as opposed to % completion. | "Tarmacked" is a physical-length claim; % completion is a weighted measure. Neither the article nor any source gives km surfaced. | KeNHA monthly progress report / RE's certificate; site inspection. | KeNHA Nyanza; supervising consultants. | All progress reporting 2025–2026 | Not located. | C003 graded on % completion only → MEDIUM confidence. |
| **GAP-004** | C005 | Contract commencement dates per lot; original contractual completion dates; approved extensions of time; the "revised schedule" KeNHA cited to Parliament. | Determines whether the project is beyond its contractual completion period and by how much; explains July 2027 vs January 2028. | Commencement orders; EoT approvals; KeNHA submission to National Assembly Roads Committee (June 2026); Hansard/committee report. | KeNHA; National Assembly Departmental Committee on Roads & Transport; Parliament library. | Parliament library search; committee reporting; KeNHA site | Not located (S003 gives 36-month period for Lot 2 only). | C005 CONTESTED/UNRESOLVED. |
| **GAP-005** | C002, C005 | Amounts actually paid/certified per lot to date, and pending bills settled in 2025 from RMLF securitisation proceeds. | Contract value ≠ expenditure; the "stall" and "resumption" are financing events with no located figures for this road. | KeNHA payment records; KRB securitisation disbursement schedule by project; OAG KeNHA report. | KeNHA; Kenya Roads Board; OAG. | RMLF securitisation reporting; OAG | Only aggregate sector figures located (S021). | No expenditure finding possible. |
| **GAP-006** | C004 | Official State House / PCS programme for 14 Sep 2026, and post-event record of whether the road was inspected. | Citizen and Star report an itinerary; the visit is in the future at research time. | PCS programme; PCS/State House post-event release; KeNHA statement; photographs/video dated 14 Sep. | State House / Presidential Communication Service; KeNHA. | Pre-tour reporting (13 Sep) | Not yet available. | C004 cannot be graded as an occurred event. |
| **GAP-007** | C001a, D006 | Whether Lot 3 has been sub-contracted or novated (Etta Construction reference). | A contractor change would be a material procurement event. | KeNHA notice; PPRA/PPIP record. | KeNHA; PPRA. | Search on Etta Construction + road | Not located. | Noted; not material to current grades. |
| **GAP-008** | C001–C003 | Original PS Omollo posts (17 Feb 2026; ~9 Sep 2026) and the Interior Ministry "project status information" release. | These are the origins of the 63/122 km definition and the latest progress figures; only press reproductions were reached. | The X posts / ministry release. | Interior PS Omollo (@ray_omollo); Ministry of Interior. | Press reproductions | Original not retrieved. | Provenance recorded as "via press". |

---

## 06 — DISCONFIRMATION LOG

**C001 — "63 km"**
- Preliminary hypothesis: 63 km is the main-carriageway length; other figures are other definitions.
- Counter-hypothesis: 63 km is stale (pre-2021 design) and the current project is 122 km of main road; or 63 km is a journalistic carry-over with no current basis.
- Searches: project name + "122 km"; KeNHA award notice for chainages; contractor pages; PS Omollo statement; "44 km".
- Strongest contrary evidence: Owalo (S007) and PS Omollo (S008/S015) repeatedly describe "the 122-kilometre road"; per-lot lengths published in Sep 2026 sum to 100.8 km, not 63 or 122; the regional office said "44 km".
- Effect: **Survived, weakened.** The main-carriageway reconstruction (12.6 + 27.4 + 23 ≈ 63) and PS Omollo's explicit definition support 63 km as one valid measure; but the article's "63-kilometre Highway" omits that ~60 km of additional works are inside the same contracts.

**C002 — "16.7bn"**
- Preliminary hypothesis: the project's awarded value is 15.88bn; 16.7bn is an unexplained later figure.
- Counter-hypothesis: 16.7bn is the current, correct contract value (works + supervision, or revised sums), and 15.88bn is stale.
- Searches: "16.7 billion" + road; KeNHA award notices (four quarters sampled) for Lot 3 supervision; OAG/KeNHA; RMLF securitisation by project.
- Strongest contrary evidence (against the primary figure being current): the 16.7bn figure is used by KeNHA's own regional office, by GAA/KNA, and by People Daily in June 2026; works + located supervision already reach 16.385bn; scope additions (two bridges, interchange) are on record without values.
- Effect: **Became unresolved.** Neither figure can be shown to be the current contract value. The primary record establishes the *awarded works* value only.

**C003 — "most sections already tarmacked"**
- Preliminary hypothesis: false as at Sep 2026; official progress is 20–34% per lot.
- Counter-hypothesis: progress percentages understate surfacing — a first bituminous layer could be laid on most of the length while earthworks/drainage/structures keep % completion low; or "sections" means the three lots and two of three have some tarmac.
- Searches: "tarmacked"/"asphalt"/"DBM" + road; local reporting; parliamentary inspection accounts; KeNHA statements.
- Strongest contrary evidence: S009/S010 describe Dense Bitumen Macadam being laid at Mamboleo (May 2026); S013/S014 describe accelerated work and visible progress; local residents' quotes describe dust (i.e., unsurfaced sections) as ongoing (S016, Sep 2026).
- Effect: **Survived, with precision caveat.** No source — official, parliamentary, contractor, or local — describes most of the road as surfaced. Every official progress figure is ≤34% per lot and 28% overall. The counter-hypothesis is not excluded by evidence, only unsupported by it.

**C004 — inspection on the tour**
- Preliminary hypothesis: the road is on the Monday 14 Sep programme.
- Counter-hypothesis: the road is not on the official programme, or the itinerary changed.
- Searches: tour itinerary reporting 11–13 Sep 2026.
- Strongest contrary evidence: itineraries differ on tour length and county order (D008); Tuko's version is labelled preliminary; the article itself uses "expected to".
- Effect: **Survived as a scheduling claim; unresolved as an event** (future at research time).

**C005 — completion date**
- Preliminary hypothesis: KeNHA's latest completion date is January 2028.
- Counter-hypothesis: July 2027 is the operative date and January 2028 was misreported or refers to something else.
- Searches: both dates + road; committee reporting from three outlets; KNA/GAA after June 2026.
- Strongest contrary evidence: KeNHA's regional office repeated July 2027 in July 2026 (S012), *after* the January 2028 statement; the committee vice-chair spoke of completion "possibly even earlier" than contractual period.
- Effect: **Changed to CONTESTED.** Two KeNHA-sourced dates coexist; three independent outlets report the January 2028 figure from the same committee session, so misreporting is unlikely, but which date is contractual is not on record.

---

## 07 — CLAIM GRADES

| claim | status | confidence | rationale | strongest support | strongest challenge | unresolved | what would change it |
|---|---|---|---|---|---|---|---|
| **C001** 63 km | **SUPPORTED** | MEDIUM | 63 km is consistently used by KeNHA (2022), Treasury-based reporting (2023), and is explicitly defined by PS Omollo (2026) as the main carriageway; it reconciles arithmetically with the Lot 2 chainage (S002) and Lot 3 main-road length (S017). But the article presents 63 km as the whole "Highway" while the contracts cover ≈100–122 km of works, and no single official document giving 63 km with a definition was retrieved. | S002 chainage + S017 + S008 | S007/S008/S015 "122 km"; S009/S010 "44 km"; S016 lot sum 100.8 km | GAP-001 | A KeNHA scope document showing main-carriageway length ≠ 63 km, or showing that "63 km" is a pre-2021 figure superseded by redesign. |
| **C002** 16.7bn | **UNRESOLVED** | HIGH (that the evidence does not settle it) | The primary award record fixes *awarded works* at KSh 15,880,008,733 across three lots (ESTABLISHED as a sub-finding). 16.7bn is the figure KeNHA's regional office and GAA use in 2026 but its composition is nowhere stated; the ≈0.82bn difference has plausible but unverified explanations (supervision contracts; variations). | S002 (works sums); S009–S012 (16.7bn in official use) | S002/S004/S016 vs S009–S012 (D002) | GAP-002, GAP-005 | Signed contract sums + variation orders, or a KeNHA/OAG statement of current contract value. If 16.7 = works + three supervision contracts, C002 → SUPPORTED (as total contract value); if no such reconciliation exists, → CONTRADICTED as "contract value". |
| **C003** most sections tarmacked | **CONTRADICTED** | MEDIUM | Every located official progress figure — 24/34/22% (May & Jul 2026), 28% overall (Jun 2026, to Parliament), 20.2/34/28% (Sep 2026) — sits well below half; no source of any kind describes most of the road as surfaced; residents quoted in Sep 2026 still describe dust. Confidence is MEDIUM because % completion is not a surfacing measure and "sections"/"tarmacked" are undefined (GAP-003). | S014 (28% to Parliament); S016 (Sep 2026 per-lot) | S009/S010 (DBM being laid at Mamboleo); possibility that early bituminous layers cover more length than % suggests | GAP-003; D007 | A KeNHA/RE report giving km surfaced per lot > 50% of length; or dated site evidence showing surfacing along most of the corridor. |
| **C004** inspection during tour | **SUPPORTED** (as scheduled) / **UNRESOLVED** (as occurred) | MEDIUM | Two outlets (S001, S018) place a road inspection on Monday 14 Sep 2026; their common origin is probable but unconfirmed; the event post-dates research. Article says "visit", not "commission" — no commissioning claim is made for this road. | S001 + S018 | Itinerary variance (D008); nothing official retrieved | GAP-006 | A PCS/State House programme or post-event record. |
| **C005** completion date | **CONTESTED** | HIGH (that two official dates coexist) | KeNHA Nyanza: July 2027 (May & Jul 2026). KeNHA to National Assembly committee: January 2028, revised (Jun 2026). Original Lot 2 contract period 36 months (S003) from a 2022 commencement implies a lapsed original completion date, but commencement/EoT records were not located. | S014 (Jan 2028, three outlets); S010/S012 (Jul 2027); S003 (36 months) | Each date challenges the other | GAP-004 | KeNHA's revised schedule / EoT approvals; committee report. |

**Sub-findings graded:** C001a (three lots) — ESTABLISHED, HIGH (S002). C002a (awarded works sums 5.19/4.96/5.72bn) — ESTABLISHED, HIGH (S002; corroborated on-record by S004; repeated in S016). C002b (16.7bn is the figure in official use in 2026) — ESTABLISHED, HIGH (as a fact about usage only). C003a (official Sep 2026 per-lot progress 20.2/34/28%) — SUPPORTED, MEDIUM (single origin via press; D007 measurement inconsistency). C004a (five-day, 13–17 Sep) — CONTESTED, LOW.

---

## STOP CONDITION CHECK

1. Material in-scope claims decomposed — yes (C001–C005 + sub-claims).
2. Primary/originating tracing attempted — yes; one primary procurement record recovered (S002); originating official statements identified for every major figure; originals of two PS Omollo statements and the MyGov page not retrieved.
3. Disconfirmation on load-bearing findings — yes (06).
4. Material discrepancies investigated — yes (D001–D009).
5. Claims graded per protocol vocabulary — yes (07).
6. Gaps recorded — yes (GAP-001–008).

**Remaining research not completed:** (a) locate Lot 3 supervision award and any variation orders (KeNHA award notices FY2021/22 Q1–Q4, FY2024/25–FY2025/26 not all sampled); (b) OAG reports on KeNHA FY2023/24–FY2024/25 for this contract (pending bills, stalled-project notes); (c) National Assembly Roads Committee report / Hansard for the 6 Jun 2026 inspection; (d) PS Omollo's original posts; (e) post-14 Sep 2026 record of the presidential visit; (f) Treasury Programme-Based Budget lines for the project FY2024/25–FY2026/27.

---

## GRADUATION GATE — SELF-AUDIT

**Decomposition**
- Material claims split into independently testable units — **PASS**
- Original source passages preserved — **PASS**

**Classification**
- O / I / M separated — **PASS** (note: "most sections tarmacked" carried as O with interpretive gloss; "assess… initiated by his administration" and "invested heavily… most completed" recorded as I and left out of scope)
- Material ambiguities identified — **PASS**

**Evidence**
- Load-bearing claims traced toward primary/originating evidence — **PASS** for C002a/C001a (primary award notice); **NOT ESTABLISHED** for C002 as stated (no current contract-value record) and C003 (no progress report, only official figures via press)
- Source provenance recorded — **PASS** (with two originals unretrieved, flagged in GAP-008)
- Repetition not mistaken for corroboration — **PASS** (dependency graph in 03)
- Evidence strength matches claims — **PASS** (16.7bn kept at "official usage", not "contract value"; progress % kept distinct from km surfaced)

**Disconfirmation**
- Strongest credible opposing case actively sought — **PASS**
- Evidence capable of changing each finding identified — **PASS**
- Contrary evidence not hidden — **PASS** (16.7bn in KeNHA's own use; DBM laying at Mamboleo; July 2027 repeated after Jan 2028)

**Reconciliation**
- Different figures tested for date/scope/definition/phase before being called contradictory — **PASS** (only D005 classified genuine_contradiction; D001, D002, D004 held as definition/phase/unresolved)
- Unresolved discrepancies left unresolved — **PASS** (D001 partial, D002, D004, D007, D008)

**Gaps**
- Missing evidence not filled by inference — **PASS** (the supervision-contract explanation for 16.7bn is labelled hypothesis, not finding; "could not locate" is not treated as "does not exist" anywhere)
- Material missing pieces named — **PASS**
- Resolving evidence identified per gap — **PASS**

**Reader freedom**
- No moral/political verdict forced — **PASS**
- Reader can see what is established — **PASS** (award sums; three lots; official progress ≤34%; two official completion dates)
- Reader can see where the investigation could be wrong — **PASS** (C003 measurement caveat; C001 definition inference; C002 composition unknown; itinerary dependency unconfirmed)
- Reader can inspect the receipts — **PASS** with limitation: one primary record is a PDF on kenha.co.ke; the MyGov origin is 404; two originating PS posts are reached only via press.

**Overall:** Stages 1–9 complete. Two checks are NOT ESTABLISHED rather than PASS (primary tracing for C002-as-stated and C003). They are left visible. Investigation stops here; no Stage 10/11.
