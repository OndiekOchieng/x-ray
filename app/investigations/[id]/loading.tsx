/**
 * Streamed-load state for the explorer route (#11 slice 11d §F).
 *
 * WHAT IT MAY AND MAY NOT SAY
 * ===========================
 * It says what is actually happening: stored state is being fetched. It does
 * **not** say "Analyzing", and it does not animate research stages — the demo
 * path replays a completed investigation, and dressing a read as live research
 * is the one dishonesty this whole issue exists to avoid.
 *
 * `role="status"` so the wait is announced rather than only drawn, and the
 * text is the announcement: a bare spinner tells a screen reader nothing.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <p role="status" className="text-sm text-muted-foreground">
        Loading evidence…
      </p>
    </div>
  )
}
