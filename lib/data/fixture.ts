import type { XRayInvestigation } from '@/lib/types'

export const mamboleoInvestigation: XRayInvestigation = {
  id: 'XRAY-KE-001',
  sourceUrl: 'https://citizendigital.com/road/mamboleo-project/',
  sourcePublisher: 'Citizen Digital',
  articleTitle:
    'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road: Progress and Challenges',
  status: 'completed',
  createdAt: new Date('2025-01-10T14:30:00Z'),
  updatedAt: new Date('2025-01-10T15:45:00Z'),
  claimsCount: 5,
  receiptsCount: 11,
  gapsCount: 2,

  stages: [
    {
      id: 'stage-1',
      name: 'Ingesting source',
      description: 'Parsing article and extracting text',
      status: 'completed',
      order: 1,
    },
    {
      id: 'stage-2',
      name: 'Decomposing claims',
      description: 'Identifying material assertions',
      status: 'completed',
      order: 2,
    },
    {
      id: 'stage-3',
      name: 'Classifying claims',
      description: 'Categorizing by type and scope',
      status: 'completed',
      order: 3,
    },
    {
      id: 'stage-4',
      name: 'Planning evidence search',
      description: 'Mapping evidence trails',
      status: 'completed',
      order: 4,
    },
    {
      id: 'stage-5',
      name: 'Tracing receipts',
      description: 'Locating supporting records',
      status: 'completed',
      order: 5,
    },
    {
      id: 'stage-6',
      name: 'Mapping provenance',
      description: 'Establishing evidence chains',
      status: 'completed',
      order: 6,
    },
    {
      id: 'stage-7',
      name: 'Searching counterevidence',
      description: 'Testing competing claims',
      status: 'completed',
      order: 7,
    },
    {
      id: 'stage-8',
      name: 'Reconciling discrepancies',
      description: 'Analyzing conflicting data',
      status: 'completed',
      order: 8,
    },
    {
      id: 'stage-9',
      name: 'Grading evidence',
      description: 'Assessing confidence levels',
      status: 'completed',
      order: 9,
    },
    {
      id: 'stage-10',
      name: 'Identifying gaps',
      description: 'Documenting missing evidence',
      status: 'completed',
      order: 10,
    },
  ],

  events: [
    {
      id: 'evt-1',
      timestamp: 0,
      message: 'Article ingested: 3,847 words',
      type: 'status',
    },
    {
      id: 'evt-2',
      timestamp: 1500,
      message: '5 material claims identified',
      type: 'claim',
    },
    {
      id: 'evt-3',
      timestamp: 3000,
      message: '2 quantitative claims, 1 financial, 2 delivery/timeline',
      type: 'claim',
    },
    {
      id: 'evt-4',
      timestamp: 4500,
      message: 'Tracing KSh16.7B project value to originating source',
      type: 'evidence',
    },
    {
      id: 'evt-5',
      timestamp: 6000,
      message: 'Treasury project record located (2024 Budget Implementation)',
      type: 'evidence',
    },
    {
      id: 'evt-6',
      timestamp: 7500,
      message:
        'Possible common source detected: 3 publications citing same government statement',
      type: 'connection',
    },
    {
      id: 'evt-7',
      timestamp: 9000,
      message:
        'Reconciling 63 km vs 65 km road length across 4 separate sources',
      type: 'evidence',
    },
    {
      id: 'evt-8',
      timestamp: 10500,
      message: 'Road survey data from county engineering office cross-checked',
      type: 'evidence',
    },
    {
      id: 'evt-9',
      timestamp: 12000,
      message: 'Discrepancy found: project scope changed Jan 2024',
      type: 'gap',
    },
    {
      id: 'evt-10',
      timestamp: 13500,
      message:
        'Missing evidence: No published contract amendment after scope change',
      type: 'gap',
    },
  ],

  claims: [
    {
      id: 'claim-1',
      text: 'The principal road is approximately 63 km in length.',
      category: 'QUANTITATIVE',
      sources: ['Treasury Circulars', 'County Engineering', 'Media reports'],
      discoveredAt: 1500,
    },
    {
      id: 'claim-2',
      text: 'The project is worth KSh16.7 billion.',
      category: 'FINANCIAL',
      sources: [
        'Government announcement',
        'Cabinet memo',
        'Parliamentary record',
      ],
      discoveredAt: 3000,
    },
    {
      id: 'claim-3',
      text: 'Most sections of the road have already been tarmacked.',
      category: 'DELIVERY',
      sources: ['Site inspection reports', 'Contractor statements'],
      discoveredAt: 4500,
    },
    {
      id: 'claim-4',
      text: 'The President was scheduled to inspect the project in Q2 2025.',
      category: 'TIMELINE',
      sources: ['State House diary', 'Regional media'],
      discoveredAt: 6000,
    },
    {
      id: 'claim-5',
      text: 'Completion was delayed due to supply chain disruptions.',
      category: 'TIMELINE',
      sources: [
        'Contractor correspondence',
        'Ministry statement',
        'Industry reports',
      ],
      discoveredAt: 7500,
    },
  ],

  receipts: [
    { id: 'r1', title: 'Northern Corridor project status update', institution: 'Ministry of Roads and Transport', publishedAt: '2024-11-18', sourceType: 'Ministry status update', classification: 'PRIMARY', provenance: 'ORIGINATING', proposition: 'Reports the principal corridor at approximately 63 km.', relationship: 'Supports the principal-road scope.', strength: 'HIGH', url: 'https://example.org/ministry-status' },
    { id: 'r2', title: '2024 Budget Implementation Review', institution: 'The National Treasury', publishedAt: '2024-12-06', sourceType: 'Treasury record', classification: 'PRIMARY', provenance: 'ORIGINATING', proposition: 'Lists a project cost of KSh16.385B.', relationship: 'Challenges a single settled project value.', strength: 'HIGH', url: 'https://example.org/treasury-record' },
    { id: 'r3', title: 'President to inspect western roads', institution: 'Citizen Digital', publishedAt: '2025-01-06', sourceType: 'News report', classification: 'SECONDARY', provenance: 'REPEATING', proposition: 'Says the President was scheduled to inspect the project.', relationship: 'Supports scheduled status only.', strength: 'MEDIUM', url: 'https://citizendigital.com/road/mamboleo-project/' },
    { id: 'r4', title: 'Contractor progress briefing', institution: 'Regional Roads Authority', publishedAt: '2024-10-30', sourceType: 'Progress statement', classification: 'PRIMARY', provenance: 'ORIGINATING', proposition: 'Reports 20–34% overall project completion and active surfacing.', relationship: 'Provides context but not surfaced-kilometre coverage.', strength: 'MEDIUM', url: 'https://example.org/progress-briefing' },
    { id: 'r5', title: 'Road value repeated across coverage', institution: 'People Daily', publishedAt: '2025-01-07', sourceType: 'News report', classification: 'SECONDARY', provenance: 'REPEATING', proposition: 'Repeats the KSh16.7B figure from a government statement.', relationship: 'Repeats rather than independently corroborates.', strength: 'LOW', url: 'https://example.org/people-daily' },
  ],
  explorerClaims: [
    { id: 'claim-1', text: 'The principal road is 63 km long.', category: 'QUANTITATIVE', sources: ['Treasury record', 'County engineering'], discoveredAt: 1500, origin: 'SURFACE', receiptIds: ['r1'], discrepancyIds: ['d1'], finding: { status: 'SUPPORTED', confidence: 0.86, establish: 'The principal corridor is approximately 63 km.', rationale: 'Primary road records describe the main corridor at roughly 63 km. Larger figures refer to a wider works package.', supports: ['Ministry status update identifies the principal corridor.', 'County engineering scope aligns with the shorter route.'], challenges: ['A 122 km figure appears in project-level reporting.'], missing: 'A single public scope map tying every spur to the works package.', wouldChange: 'A current approved scope map showing 122 km as the principal corridor.' } },
    { id: 'claim-2', text: 'The project is worth KSh16.7 billion.', category: 'FINANCIAL', sources: ['Government announcement', 'Treasury record', 'Media reports'], discoveredAt: 3000, origin: 'SURFACE', receiptIds: ['r2', 'r5'], discrepancyIds: ['d2'], finding: { status: 'UNRESOLVED', confidence: 0.42, establish: 'KSh16.7B is reported, but its definition is not currently traceable to one authoritative record.', rationale: 'Located records contain several material values with no public bridge explaining whether they represent contract, revised, or total programme cost.', supports: ['Later reporting consistently uses KSh16.7B.'], challenges: ['Treasury records list KSh16.385B.', 'Earlier contract representations list approximately KSh15.87B.'], missing: 'An authoritative record explaining exactly how KSh16.7B is derived.', wouldChange: 'An approved variation schedule, revised contract value, or current cost record.' }, gap: { title: 'Missing authoritative project-cost record', whyItMatters: 'Located records use different project-value definitions.', whatWouldSettleIt: 'An approved variation schedule, revised contract values, or current authoritative project-cost record.' } },
    { id: 'claim-3', text: 'Most sections have already been tarmacked.', category: 'DELIVERY', sources: ['Site inspection reports', 'Contractor statements'], discoveredAt: 4500, origin: 'SURFACE', receiptIds: ['r4'], discrepancyIds: ['d3'], finding: { status: 'INSUFFICIENT EVIDENCE', confidence: 0.31, establish: 'There is evidence of active tarmacking, but not that most mainline kilometres are surfaced.', rationale: 'Overall project completion percentages measure more than surfacing. They cannot be converted into a percentage of road length.', supports: ['Progress briefing confirms active surfacing on sections.'], challenges: ['Reported overall completion sits between 20–34%.'], missing: 'Section-by-section surfacing quantities or a current completion map.', wouldChange: 'A dated engineering schedule showing surfaced kilometres against the mainline.' } },
    { id: 'claim-4', text: 'The President was scheduled to inspect the project.', category: 'TIMELINE', sources: ['State House diary', 'Regional media'], discoveredAt: 6000, origin: 'SURFACE', receiptIds: ['r3'], discrepancyIds: [], finding: { status: 'SUPPORTED', confidence: 0.78, establish: 'The visit was scheduled or expected at the investigation cutoff.', rationale: 'The available records support an intended inspection, not that the inspection occurred.', supports: ['Published diary and regional coverage use future or scheduled language.'], challenges: ['No completed visit record was located by the cutoff.'], missing: 'A post-visit release, itinerary outcome, or site report.', wouldChange: 'A dated record confirming the visit occurred or was cancelled.' } },
    { id: 'claim-5', text: 'The project remained substantially incomplete immediately before the tour.', category: 'DELIVERY', sources: ['Progress briefing', 'Treasury record'], discoveredAt: 7500, origin: 'DISCOVERED', receiptIds: ['r4', 'r2'], discrepancyIds: [], finding: { status: 'SUPPORTED', confidence: 0.81, establish: 'Available progress records indicate substantial work remained before the scheduled tour.', rationale: 'The discovered claim is supported by low overall completion measures, while preserving the distinction between project completion and surfaced kilometres.', supports: ['Progress briefing reports 20–34% overall completion.'], challenges: ['Some sections were actively being surfaced.'], missing: 'A contemporaneous independent site verification.', wouldChange: 'A dated completion certificate or engineering measurement showing near-completion.' } },
  ],
  provenanceClusters: [{ id: 'p1', source: 'Ministry status update', publications: ['People Daily', 'Radio47', 'The Star'], note: 'Three publications appear to derive from one originating government update. Repetition is not independent corroboration.' }],
  discrepancies: [
    { id: 'd1', title: '63 km vs 122 km', classification: 'Different scope', summary: 'The shorter figure describes the principal corridor; the larger figure includes feeder and spur works.', leftLabel: '63 km principal corridor', rightLabel: '122 km wider works package', resolution: 'RECONCILED' },
    { id: 'd2', title: 'KSh15.87B vs KSh16.385B vs KSh16.7B', classification: 'Unresolved definition/value discrepancy', summary: 'The values may refer to different cost definitions, but no current authoritative bridge was located.', leftLabel: 'Contract sums ~KSh15.87B', rightLabel: 'Treasury / later reporting', resolution: 'UNRESOLVED' },
    { id: 'd3', title: '“Most tarmacked” vs 20–34% completion', classification: 'Measurement mismatch', summary: 'Overall project completion is not equivalent to the percentage of road length surfaced.', leftLabel: 'Project completion %', rightLabel: '% of road length surfaced', resolution: 'UNRESOLVED' },
  ],
  disconfirmation: { hypothesis: 'The KSh16.7B figure is a settled current project value.', counterHypothesis: 'The figure is a later shorthand for a different cost definition.', opposingEvidence: 'Treasury and contract records show materially different values.', result: 'The preliminary finding remains unresolved rather than upgraded to supported.', wouldChange: 'A current authoritative record with the value definition and scope.' },
}

export const cachedXRayCard = {
  title: 'Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road',
  publisher: 'Citizen Digital',
  claimsCount: 5,
  receiptsCount: 11,
  gapsCount: 2,
  lastInvestigated: '2 days ago',
  id: 'XRAY-KE-001',
}
