import type { ProvenanceView } from '@/lib/xray/projections'

/**
 * Evidence origin — where an assertion actually came from.
 *
 * USER-FACING NAME
 * ================
 * "Origin" on screen; `provenance` in the domain, the schema and the
 * invariants. The projection type is still `ProvenanceView` and
 * `EvidenceProvenance` is untouched — this is a wording rule for readers, not
 * a rename (#11 slice 11c §A).
 *
 * Driven entirely by dependency edges. The v0 scaffold rendered this panel
 * behind `selected.id === 'claim-2'`, so it existed for one hardcoded claim;
 * here a claim gets a panel when its records genuinely trace to a shared
 * origin.
 *
 * The wording keeps repetition and corroboration apart. "3 publications trace
 * to 1 apparent originating record" says something true. "3 sources confirm"
 * would not.
 */
export function ProvenanceClusterView({ provenance }: { provenance: ProvenanceView }) {
  if (!provenance.hasRepetition) return null

  const clusters = provenance.clusters.filter((c) => c.publicationCount > 1)

  return (
    <section className="rounded-2xl border border-border bg-card p-5 md:p-7">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Evidence origin
      </p>
      <h2 className="mt-2 text-lg font-semibold text-foreground">
        Repetition is not corroboration
      </h2>

      {clusters.map((cluster) => (
        <div key={cluster.origin?.sourceId ?? cluster.originDescription} className="mt-6">
          <div className="flex flex-col items-center gap-3">
            <div className="max-w-md rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-center">
              <p className="text-sm font-semibold text-foreground">
                {cluster.origin?.title ?? cluster.originDescription ?? 'Origin not identified'}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {cluster.origin
                  ? `Originating record · ${cluster.origin.accessibilityLabel}`
                  : 'Origin described but never identified'}
              </p>
            </div>

            <div className="h-5 w-px bg-border" aria-hidden="true" />

            <div className="grid w-full gap-2 sm:grid-cols-3">
              {cluster.publications.map((publication) => (
                <div
                  key={publication.sourceId}
                  className="rounded-lg border border-border p-3 text-center"
                >
                  <p className="text-xs text-foreground">
                    {publication.publisher ?? publication.title}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {publication.originStatusLabel}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-5 text-sm font-medium text-foreground">
            {cluster.publicationCount} publications trace to 1 apparent originating record.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Counting the publications would count the same observation
            {cluster.publicationCount === 2 ? ' twice' : ` ${cluster.publicationCount} times`}.
            {cluster.origin && !cluster.origin.wasObtained &&
              ' The originating record itself was never obtained, so nothing downstream can be graded against it directly.'}
          </p>
        </div>
      ))}

      {/*
        Two different questions, kept apart.

        Above: document lineage — which publications reproduce which record.
        Below: claim-level independence, resolved per evidence proposition.

        The claim-level count appears ONLY when every proposition's origin is
        settled. Where any origin is unresolved or was never identified, the
        panel says so rather than printing a falsely precise number.
      */}
      {/*
        TWO AXES, NAMED.
        ================
        11a found these two sentences adjacent and unlabelled, so a reader met
        two numbers about one claim that looked like a contradiction — C001
        reads "8 records traced · 3 repeat another record" above "8 independent
        originating observations". Both are right about different questions:
        the first counts documents reproducing each other, the second counts
        propositions whose own origin resolved. Naming the axis is the fix;
        neither count changes.
      */}
      <div className="mt-6 border-t border-border pt-4">
        <p className="font-mono text-[11px] text-muted-foreground">
          {provenance.lineageLabel}
        </p>

        {provenance.independence.isResolved ? (
          <p className="mt-2 font-mono text-[11px] text-foreground">
            {provenance.independence.originLabel}
          </p>
        ) : (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">
            {provenance.independence.unresolvedLabel}
          </p>
        )}
      </div>
    </section>
  )
}
