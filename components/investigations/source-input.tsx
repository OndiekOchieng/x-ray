'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon } from 'lucide-react'

import { resolveSourceSubmission } from '@/lib/xray/investigations'

/**
 * Source submission (#11 slice 11b).
 *
 * TWO PATHS, AND THEY ARE NOT INTERCHANGEABLE
 * ===========================================
 * **The source X-Ray has already investigated** opens the completed research
 * that exists. It is phrased as existing completed research and it starts no
 * execution — there is nothing to run, and animating stages to make it look
 * live would be the single dishonesty this whole slice is about.
 *
 * **Any other URL** creates a real investigation through
 * `POST /api/investigations` and starts a real execution. With no research
 * provider configured that run ends `CAPABILITY_BLOCKED` with its stages
 * journalled as never executed, and the progress screen says so. The
 * benchmark is never substituted for it: a new URL yields a new
 * investigation id and its own run, or it yields an error.
 *
 * Before 11b this form called no API at all. It was honest — it said live
 * research was unavailable — but it meant there was no fresh path to be
 * honest *in*.
 */

type Phase =
  | { kind: 'IDLE' }
  | { kind: 'INVALID' }
  | { kind: 'EXISTING'; investigationId: string }
  | { kind: 'SUBMITTING' }
  | { kind: 'FAILED'; message: string }

export function SourceInput() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'IDLE' })

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim() || phase.kind === 'SUBMITTING') return

    const submission = resolveSourceSubmission(url)
    if (submission.kind === 'INVALID_URL') {
      setPhase({ kind: 'INVALID' })
      return
    }
    if (submission.kind === 'KNOWN_DEMO_SOURCE') {
      // Existing completed research. No execution is created.
      setPhase({ kind: 'EXISTING', investigationId: submission.investigationId })
      return
    }

    setPhase({ kind: 'SUBMITTING' })
    try {
      const investigation = await postJson('/api/investigations', { sourceUrl: url.trim() })
      const investigationId = String(investigation.investigationId)
      const run = await postJson(`/api/investigations/${encodeURIComponent(investigationId)}/executions`)
      router.push(
        `/investigation/${encodeURIComponent(investigationId)}?run=${encodeURIComponent(String(run.executionRunId))}`,
      )
    } catch (error) {
      setPhase({ kind: 'FAILED', message: messageFor(error) })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <label htmlFor="source-url" className="sr-only">
          Public source URL
        </label>
        <input
          id="source-url"
          type="url"
          placeholder="https://citizen.digital/article/…"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
            setPhase({ kind: 'IDLE' })
          }}
          aria-describedby="source-url-help"
          className="w-full rounded-lg border border-border bg-card py-3.5 pl-12 pr-5 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <SearchIcon
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />

        <button
          type="submit"
          disabled={!url.trim() || phase.kind === 'SUBMITTING'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase.kind === 'SUBMITTING' ? 'Starting…' : 'X-Ray'}
        </button>
      </div>

      <p id="source-url-help" className="mt-3 text-xs text-muted-foreground">
        A new source starts a real investigation. If this deployment has no research
        provider configured, the run will record that its research could not be done —
        it will not invent findings.
      </p>

      {phase.kind === 'INVALID' && (
        <Notice>
          That does not look like a URL. Paste the full web address of a public article.
        </Notice>
      )}

      {phase.kind === 'EXISTING' && (
        <Notice>
          We already have a completed X-Ray for this source. Nothing new will be
          researched.{' '}
          <button
            type="button"
            onClick={() => router.push(`/investigations/${phase.investigationId}`)}
            className="font-semibold text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Open the completed X-Ray
          </button>
        </Notice>
      )}

      {phase.kind === 'FAILED' && <Notice>{phase.message}</Notice>}
    </form>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-foreground"
    >
      {children}
    </div>
  )
}

async function postJson(
  path: string, body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = (await response.json().catch(() => null)) as
    { error?: { code?: string; message?: string } } | Record<string, unknown> | null
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error
    throw new SubmissionFailed(error?.code ?? 'UNKNOWN', error?.message)
  }
  return (payload ?? {}) as Record<string, unknown>
}

class SubmissionFailed extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'SubmissionFailed'
    this.code = code
  }
}

/**
 * Authored copy per failure. The API's own message is shown only for the codes
 * whose messages this codebase authored for a caller to read.
 */
function messageFor(error: unknown): string {
  const failure = error instanceof SubmissionFailed ? error : null
  if (failure?.code === 'SERVICE_UNAVAILABLE')
    return 'This deployment cannot start a new investigation right now — X-Ray could not reach its storage. Nothing was submitted.'
  if (failure?.code === 'INVALID_INPUT')
    return failure.message ?? 'That submission was rejected. Check the URL and try again.'
  return 'Starting the investigation failed, and nothing was recorded. The source was not researched.'
}
