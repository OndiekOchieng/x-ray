/**
 * XRAY-KE-001 acceptance suite — A01 to A10.
 *
 * The ten behaviors from `docs/engineering/acceptance-fixtures.md` §35, asserted
 * over the canonical graph.
 *
 * ACCEPTANCE IS SEMANTIC, NOT TEXTUAL. None of these compares prose to a golden
 * string. They assert structure and relationships: that a discrepancy is
 * classified by scope rather than contradiction, that a finding is unsettled,
 * that measurements are incompatible, that a gap exists. A later run may phrase
 * everything differently, locate stronger evidence, and still satisfy all ten —
 * which is the point (ADR-0009).
 *
 * Benchmark ids and metric names belong here, not in the generic runner.
 */

import type { XRayGraph } from '@/lib/xray/selectors'
import {
  claimById,
  claimProvenanceSummary,
  evidenceForClaim,
  evidenceForSource,
  findingForClaim,
  originForEvidence,
  gapsForClaim,
  provenanceClusterForOrigin,
  contradictingEvidenceForClaim,
} from '@/lib/xray/selectors'
import { assessMeasurementCompatibility } from '@/lib/xray/validation'
import { claimViews, investigationView, libraryEntryView } from '@/lib/xray/projections'
import type { AcceptanceBehavior, AcceptanceStatus } from '@/lib/xray/acceptance'

const ok = (detail: string, targets?: readonly string[]) =>
  ({ status: 'SATISFIED' as AcceptanceStatus, detail, targets })
const bad = (detail: string, targets?: readonly string[]) =>
  ({ status: 'VIOLATED' as AcceptanceStatus, detail, targets })

/** Find the claim asserting a given measured quantity, without matching prose. */
const claimByMetric = (graph: XRayGraph, metric: string) =>
  graph.claims.find((c) => c.measurement?.metric === metric)

export const XRAY_KE_001_ACCEPTANCE: readonly AcceptanceBehavior[] = [
  {
    id: 'XRAY-KE-001-A01',
    title: 'Surface source does not self-prove claims',
    run(graph) {
      const surfaceId = graph.investigation.surfaceSourceId
      const surfaceClaims = new Set<string>(
        graph.claims.filter((c) => c.origin === 'SURFACE').map((c) => c.id),
      )
      const offending = evidenceForSource(graph, surfaceId).filter((e) =>
        e.claimIds.some((id) => surfaceClaims.has(id)),
      )
      return offending.length === 0
        ? ok(
            `Source ${surfaceId} yields ${evidenceForSource(graph, surfaceId).length} evidence record(s), none bearing on its own ${surfaceClaims.size} surface claims.`,
          )
        : bad(
            `${offending.length} evidence record(s) from the surface source corroborate its own claims.`,
            offending.map((e) => e.id),
          )
    },
  },

  {
    id: 'XRAY-KE-001-A02',
    title: '63 km / 122 km undergo scope reconciliation, not contradiction',
    run(graph) {
      const claim = claimByMetric(graph, 'road_length')
      if (!claim) return bad('No claim measures road_length.')

      const discrepancies = graph.discrepancies.filter((d) =>
        d.claimIds.some((id) => id === claim.id),
      )
      if (discrepancies.length === 0)
        return bad(`Claim ${claim.id} records no discrepancy over its competing lengths.`, [claim.id])

      const contradiction = discrepancies.filter(
        (d) => d.classification === 'GENUINE_CONTRADICTION',
      )
      if (contradiction.length > 0)
        return bad(
          `The length discrepancy is classified GENUINE_CONTRADICTION; scope and definition must be tested first.`,
          contradiction.map((d) => d.id),
        )

      const acceptable = discrepancies.filter(
        (d) =>
          d.classification === 'DIFFERENT_SCOPE' || d.classification === 'DIFFERENT_DEFINITION',
      )
      if (acceptable.length === 0)
        return bad(
          `The length discrepancy is classified ${discrepancies.map((d) => d.classification).join(', ')}; acceptance requires DIFFERENT_SCOPE or DIFFERENT_DEFINITION.`,
          discrepancies.map((d) => d.id),
        )

      // §27 requires the reconciliation to reach both concepts. Concept
      // presence, not prose equality.
      const text = acceptable.map((d) => d.reconciliation ?? '').join(' ').toLowerCase()
      const hasMainline = /main carriageway|mainline|principal corridor/.test(text)
      const hasFeeder = /feeder|spur/.test(text)
      if (!hasMainline || !hasFeeder)
        return bad(
          `Reconciliation does not separate the main carriageway from feeder/spur works (mainline concept: ${hasMainline}, feeder concept: ${hasFeeder}).`,
          acceptable.map((d) => d.id),
        )

      return ok(
        `Claim ${claim.id} reconciles as ${acceptable[0].classification}, separating main carriageway from feeder/spur works.`,
        [claim.id, ...acceptable.map((d) => d.id)],
      )
    },
  },

  {
    id: 'XRAY-KE-001-A03',
    title: 'Project value remains unresolved absent the authoritative bridge',
    run(graph) {
      const claim = claimByMetric(graph, 'project_value')
      if (!claim) return bad('No claim measures project_value.')
      const finding = findingForClaim(graph, claim.id)
      if (!finding) return bad(`Claim ${claim.id} is ungraded.`, [claim.id])

      if (finding.status === 'ESTABLISHED')
        return bad(
          `Claim ${claim.id} is graded ESTABLISHED. The value may not be established without a record explaining its derivation.`,
          [finding.id],
        )
      if (finding.status !== 'UNRESOLVED')
        return bad(
          `Claim ${claim.id} is graded ${finding.status}; acceptance requires UNRESOLVED while the bridge is missing.`,
          [finding.id],
        )

      const gaps = gapsForClaim(graph, claim.id)
      if (gaps.length === 0)
        return bad(`Claim ${claim.id} is UNRESOLVED but identifies no missing bridge.`, [claim.id])

      return ok(
        `Claim ${claim.id} is UNRESOLVED (${finding.confidence} confidence in the insufficiency) with ${gaps.length} gap(s) naming the missing bridge.`,
        [claim.id, finding.id, ...gaps.map((g) => g.id)],
      )
    },
  },

  {
    id: 'XRAY-KE-001-A04',
    title: 'Repeated publications collapse toward a common origin',
    run(graph) {
      // Any originating record with two or more dependents, found structurally.
      const candidates = graph.sources
        .map((s) => provenanceClusterForOrigin(graph, s.id))
        .filter((c) => c.publicationCount >= 2)

      if (candidates.length === 0)
        return bad('No originating record has two or more publications depending on it.')

      const inflated = candidates.filter((c) => c.independentOriginCount !== 1)
      if (inflated.length > 0)
        return bad(
          `${inflated.length} cluster(s) report more than one originating observation.`,
          inflated.map((c) => c.origin.kind === 'SOURCE' ? c.origin.sourceId : 'UNIDENTIFIED'),
        )

      /**
       * "Must not be treated as independent corroboration" — in countable form.
       *
       * Satisfied structurally when provenance actually collapses repetition:
       * a claim drawing on a repeating cluster must resolve to fewer confirmed
       * origins than it has sources. If those numbers are equal, every
       * publication was counted as its own observation.
       *
       * An earlier revision of this check asserted "at most one publication per
       * cluster may carry evidence above WEAK". That was wrong twice over: it
       * counted every record a publication carries rather than the records
       * deriving from the cluster's origin, and it promoted a fixture-authoring
       * convention into a general law. Strength measures force against a claim,
       * not independence; independence is what provenance carries. Failure
       * evidence recorded on issue #5.
       */
      for (const claim of graph.claims) {
        // Group this claim's own records by the origin each resolves to.
        const bySource = new Map<string, Set<string>>()
        for (const e of evidenceForClaim(graph, claim.id)) {
          const resolution = originForEvidence(graph, e.id)
          if (resolution.status !== 'RESOLVED') continue
          const key =
            resolution.origin.kind === 'SOURCE' ? resolution.origin.sourceId : 'UNIDENTIFIED'
          const set = bySource.get(key) ?? new Set<string>()
          set.add(e.sourceId)
          bySource.set(key, set)
        }

        // Collapse is only expected where two or more of THIS claim's sources
        // share one origin. A claim touching a repeating publication that no
        // other of its sources shares has nothing to collapse.
        const shared = [...bySource.entries()].filter(([, sources]) => sources.size >= 2)
        if (shared.length === 0) continue

        const summary = claimProvenanceSummary(graph, claim.id)
        if (summary.independentOriginCount < summary.sourceCount) continue

        return bad(
          `Claim ${claim.id} has ${shared.length} origin(s) reached by two or more of its own sources, yet reports ${summary.independentOriginCount} confirmed origin(s) from ${summary.sourceCount} source(s) — no collapse occurred, so repetition is being counted as corroboration.`,
          [claim.id],
        )
      }

      const biggest = candidates.reduce((a, b) =>
        b.publicationCount > a.publicationCount ? b : a,
      )
      return ok(
        `${candidates.length} dependency cluster(s); the largest has ${biggest.publicationCount} publications tracing to 1 originating observation.`,
      )
    },
  },

  {
    id: 'XRAY-KE-001-A05',
    title: 'Project-completion % is not treated as surfaced-road coverage',
    run(graph) {
      const claim = claimByMetric(graph, 'surfaced_length')
      if (!claim) return bad('No claim measures surfaced_length.')
      const finding = findingForClaim(graph, claim.id)
      if (!finding) return bad(`Claim ${claim.id} is ungraded.`, [claim.id])

      if (finding.status === 'CONTRADICTED')
        return bad(
          `Claim ${claim.id} is graded CONTRADICTED. Project completion is a different measure and cannot refute surfaced coverage.`,
          [finding.id],
        )

      const acceptable = ['INSUFFICIENT_EVIDENCE', 'UNRESOLVED', 'PARTIALLY_SUPPORTED']
      if (!acceptable.includes(finding.status))
        return bad(
          `Claim ${claim.id} is graded ${finding.status}; acceptance permits ${acceptable.join(', ')} while no surfacing measurement exists.`,
          [finding.id],
        )

      const contradicting = contradictingEvidenceForClaim(graph, claim.id)
      if (contradicting.length > 0)
        return bad(
          `${contradicting.length} record(s) assert CONTRADICTS against ${claim.id} without a compatible measurement.`,
          contradicting.map((e) => e.id),
        )

      // The mismatch itself must be real, not merely unasserted.
      const measured = evidenceForClaim(graph, claim.id).filter((e) => e.measurement)
      const compatible = measured.filter(
        (e) =>
          assessMeasurementCompatibility(claim.measurement, e.measurement).compatibility ===
          'COMPATIBLE',
      )
      if (compatible.length > 0)
        return bad(
          `Evidence measuring the claim directly exists, so the finding should not rest on insufficiency.`,
          compatible.map((e) => e.id),
        )

      const gaps = gapsForClaim(graph, claim.id)
      if (gaps.length === 0)
        return bad(`No gap records the missing surfacing measurement.`, [claim.id])

      return ok(
        `Claim ${claim.id} is ${finding.status}; ${measured.length} measured record(s) all incompatible, no CONTRADICTS asserted, ${gaps.length} gap(s) name the missing measurement.`,
        [claim.id, finding.id, ...gaps.map((g) => g.id)],
      )
    },
  },

  {
    id: 'XRAY-KE-001-A06',
    title: 'A scheduled inspection does not become an occurred one',
    run(graph) {
      const cutoff = graph.investigation.researchCutoffAt
      if (!cutoff) return bad('Investigation records no research cutoff.')

      // Claims whose period begins after the cutoff.
      const future = graph.claims.filter((c) => {
        const from = c.timeScope?.from
        if (!from) return false
        const w = Math.min(from.length, cutoff.length)
        return from.slice(0, w) > cutoff.slice(0, w)
      })
      if (future.length === 0)
        return bad('No claim concerns a period after the research cutoff, so the case is untested.')

      for (const claim of future) {
        const finding = findingForClaim(graph, claim.id)
        if (finding?.status === 'ESTABLISHED')
          return bad(
            `Claim ${claim.id} concerns a period after the ${cutoff} cutoff yet is graded ESTABLISHED.`,
            [claim.id, finding.id],
          )
        if (gapsForClaim(graph, claim.id).length === 0)
          return bad(
            `Claim ${claim.id} concerns a post-cutoff period but records no gap for the occurrence evidence.`,
            [claim.id],
          )
      }

      // And no post-cutoff evidence may have leaked in.
      const used = new Set(graph.evidence.map((e) => e.sourceId))
      const leaked = graph.sources.filter((s) => {
        if (!s.publishedAt || !used.has(s.id)) return false
        const w = Math.min(s.publishedAt.length, cutoff.length)
        return s.publishedAt.slice(0, w) > cutoff.slice(0, w)
      })
      if (leaked.length > 0)
        return bad(
          `${leaked.length} source(s) published after the cutoff yield evidence.`,
          leaked.map((s) => s.id),
        )

      return ok(
        `${future.length} post-cutoff claim(s) graded below ESTABLISHED with gaps recorded, and no post-cutoff source yields evidence.`,
        future.map((c) => c.id),
      )
    },
  },

  {
    id: 'XRAY-KE-001-A07',
    title: 'Missing primary records remain explicit gaps, not negative facts',
    run(graph) {
      const unsettled = graph.findings.filter((f) =>
        ['UNRESOLVED', 'INSUFFICIENT_EVIDENCE', 'CONTESTED'].includes(f.status),
      )
      const withoutGap = unsettled.filter((f) => f.gapIds.length === 0)
      if (withoutGap.length > 0)
        return bad(
          `${withoutGap.length} unsettled finding(s) expose no gap.`,
          withoutGap.map((f) => f.id),
        )

      const thin = graph.gaps.filter(
        (g) =>
          g.missingEvidence.trim() === '' ||
          g.resolvingEvidence.length === 0 ||
          g.searchAlreadyAttempted.length === 0,
      )
      if (thin.length > 0)
        return bad(
          `${thin.length} gap(s) omit what is missing, what would settle it, or where the search reached.`,
          thin.map((g) => g.id),
        )

      const nonexistence = graph.sources.filter(
        (s) => (s.accessibility as string) === 'DOES_NOT_EXIST',
      )
      if (nonexistence.length > 0)
        return bad(
          `${nonexistence.length} source(s) assert non-existence rather than non-retrieval.`,
          nonexistence.map((s) => s.id),
        )

      const unobtained = graph.sources.filter(
        (s) => s.accessibility === 'NOT_RETRIEVED' || s.accessibility === 'NOT_LOCATED',
      )
      return ok(
        `${unsettled.length} unsettled finding(s) all expose gaps; ${graph.gaps.length} gap(s) record their search; ${unobtained.length} unobtained record(s) preserved without asserting non-existence.`,
      )
    },
  },

  {
    id: 'XRAY-KE-001-A08',
    title: 'Every finding records what would change it',
    run(graph) {
      const silent = graph.findings.filter(
        (f) => f.wouldChangeFinding.length === 0 || f.rationale.trim() === '',
      )
      return silent.length === 0
        ? ok(
            `All ${graph.findings.length} finding(s) carry a rationale and name what would overturn them.`,
          )
        : bad(
            `${silent.length} finding(s) cannot describe how they could be overturned.`,
            silent.map((f) => f.id),
          )
    },
  },

  {
    id: 'XRAY-KE-001-A09',
    title: 'Discovered claims remain separate from controlled claims',
    run(graph) {
      const offenders: string[] = []
      for (const claim of graph.claims) {
        const surfaceId = /^C\d+$/.test(claim.id)
        const discoveredId = /^DC\d+$/.test(claim.id)
        if (!surfaceId && !discoveredId) offenders.push(claim.id)
        else if (claim.origin === 'SURFACE' && !surfaceId) offenders.push(claim.id)
        else if (claim.origin === 'DISCOVERED' && !discoveredId) offenders.push(claim.id)
      }
      if (offenders.length > 0)
        return bad(`${offenders.length} claim id(s) sit in the wrong namespace.`, offenders)

      const ids = graph.claims.map((c) => c.id)
      if (new Set(ids).size !== ids.length) return bad('A claim id is reused.')

      const surface = graph.claims.filter((c) => c.origin === 'SURFACE').length
      const discovered = graph.claims.length - surface
      return ok(
        `${surface} surface claim(s) in C###, ${discovered} discovered claim(s) in DC###, no id reused.`,
      )
    },
  },

  {
    id: 'XRAY-KE-001-A10',
    title: 'Citizen-facing synthesis does not mutate evidence state',
    run(graph) {
      // Run the projection layer the public surfaces consume and confirm the
      // canonical arrays are untouched afterwards.
      const before = JSON.stringify({
        claims: graph.claims,
        sources: graph.sources,
        evidence: graph.evidence,
        evidenceProvenance: graph.evidenceProvenance,
        discrepancies: graph.discrepancies,
        findings: graph.findings,
        gaps: graph.gaps,
      })

      claimViews(graph)
      investigationView(graph)
      libraryEntryView(graph)

      const after = JSON.stringify({
        claims: graph.claims,
        sources: graph.sources,
        evidence: graph.evidence,
        evidenceProvenance: graph.evidenceProvenance,
        discrepancies: graph.discrepancies,
        findings: graph.findings,
        gaps: graph.gaps,
      })

      return before === after
        ? ok('Full projection pass left every canonical artifact byte-identical.')
        : bad('Canonical state changed while building citizen-facing projections.')
    },
  },
] as const

/** Sanity: claim provenance summaries are reachable for every claim. */
export const claimProvenanceReachable = (graph: XRayGraph): boolean =>
  graph.claims.every((c) => claimProvenanceSummary(graph, c.id) !== undefined) &&
  graph.claims.every((c) => claimById(graph, c.id) !== undefined)
