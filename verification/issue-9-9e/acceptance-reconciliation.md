# Issue #9 — acceptance reconciliation

Against the parent acceptance list, with the evidence for each. Per section P, this is
the closeout reconciliation, not a claim that green code closes the issue.

| Acceptance criterion | Status | Evidence |
|---|---|---|
| Published version URLs are stable and immutable | **Met** | Slug minted once at first publication, immutable, never freed by withdrawal or inherited (9b proofs 1–3, 6). `/xray/{slug}/v{n}` follows that version's own history (9d proofs 5, 25). |
| Creating version N+1 cannot change the rendered content of version N | **Met** | 9d proof 25 renders v2, publishes v3, re-renders v2 byte-identically. #7's insert-only version tables make it structural; 8d proved v1 unchanged after v2 commits. |
| Latest/current resolution is explicit and cache behavior documented | **Met** | Alias is the presentation head from event history, never `MAX(version)` or `latestCommittedVersion` (9b proof 19, 9c proof 5). Cache posture is ADR-0016 and `publication-and-cache.md`; executable in 9d proofs 17–21. |
| Library cards derive counts/status from projections, not stored display strings | **Met** | No discovery table and no stored display column (9e proof 24/25). All five counts equal the exact projection (9e proof 5/6). |
| Public pages expose research cutoff/version context | **Met** | 9d proof 24: version, protocol version and research cutoff rendered; citation link is the exact version URL (proof 23). |
| Unknown/unpublished ids do not leak draft investigations | **Met** | Four `NOT_PUBLIC` cases byte-identical with zero canonical reads (9c proofs 1–4), including the draft's real computable would-be slug. No draft reaches library or search (9e proofs 2, 22). |
| Share/synthesis content cannot mutate or overwrite evidence state | **Met** | Public documents are a read-only projection layer; the library performs no write (9e proof N). Tombstone copy is bound by responsible sharing (9d proofs 11, 13). |

### Beyond the list, decided during #9

| Concern | Where |
|---|---|
| Publication is an attributed event, not a flag | ADR-0013 |
| Withdrawal changes presentation, never canonical state | ADR-0014 |
| Public retrieval is a separate trust boundary | ADR-0015 |
| Cache the version projection, not the response | ADR-0016 |
| Withdrawal/republish lifecycle preserved end to end | 9e proof 29/30/31 |

## Known limitations, recorded rather than closed over

**1 · Native PostgreSQL simultaneous first publication is unproven.** 9b proof 22
establishes the outcome the constraints guarantee — a second attempt refused
`DUPLICATE_PUBLISH`, one slug, one event — but PGlite runs on a single connection and
two interleaved `BEGIN`s corrupt both transactions. `XRAY_POSTGRES_URL` is unset and no
native server is available here. **The row-lock race is not claimed.** The mechanisms
that make it safe (the `FOR UPDATE` lineage lock and the slug uniqueness constraint)
are asserted independently.

This is the same limitation carried forward from #7's closeout.

**2 · No actor/authorisation layer exists.** #9 records attribution and refuses an
unattributed act, but who *may* publish is the host's concern and nothing enforces it
yet (ADR-0013). A deployment must supply the principal from a trusted boundary.

**3 · Principal is never displayed publicly.** Deliberate for v1 — a stable
administrative identifier is not an approved public display label. A future identity
layer may supply one under a separate decision.

**4 · Version lineage is not a library-card field.** The card shows the currently
presented version and links to it; "what changed between versions" is available from
`InvestigationVersion` and the re-evaluation audit but is not surfaced in discovery.
The #9 scope line mentions surfacing lineage; this is the one scope item **not**
delivered as a public surface, and it is recorded here rather than quietly dropped.

**5 · Library membership is computed per request.** Deliberate: no read model, per the
recorded "derive first, index only on measured need" decision. If the published corpus
grows, a rebuildable non-canonical index is permitted under the invariants in
`publication-and-cache.md`.

**6 · Search is metadata-only.** By decision D6, not by omission — indexing evidence
prose would let a search surface reveal what the page resolver correctly withholds.
