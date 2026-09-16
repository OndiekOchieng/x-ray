'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon } from 'lucide-react'

import { resolveSourceSubmission, type SourceSubmission } from '@/lib/xray/investigations'

/**
 * Source submission.
 *
 * DEMO BEHAVIOUR, STATED HONESTLY. Arbitrary URL research is not built — the
 * pipeline, model adapter and research adapter are all out of v0 scope. So
 * this input does not pretend to research anything.
 *
 * It recognises the one source the frozen benchmark already covers and opens
 * that completed investigation. Anything else is reported back to the user
 * with the URL they submitted still in the field. The v0 scaffold discarded
 * the input entirely and routed every submission to the fixture as though a
 * new investigation had been run.
 */
export function SourceInput() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<SourceSubmission | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim()) return

    const submission = resolveSourceSubmission(url)
    setResult(submission)

    if (submission.kind === 'KNOWN_DEMO_SOURCE') {
      setIsLoading(true)
      router.push(`/investigation/${submission.investigationId}`)
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
            setResult(null)
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
          disabled={!url.trim() || isLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Opening…' : 'X-Ray'}
        </button>
      </div>

      <p id="source-url-help" className="mt-3 text-xs text-muted-foreground">
        This build opens the one investigation X-Ray has already completed. Live research on an
        arbitrary URL is not available yet.
      </p>

      {result && result.kind !== 'KNOWN_DEMO_SOURCE' && (
        <div
          role="status"
          className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-foreground"
        >
          {result.kind === 'INVALID_URL' ? (
            <>That does not look like a URL. Paste the full web address of a public article.</>
          ) : (
            <>
              {result.reason}{' '}
              <button
                type="button"
                onClick={() => {
                  setUrl('')
                  setResult(null)
                  router.push('/investigation/XRAY-KE-001')
                }}
                className="font-semibold text-primary underline underline-offset-2"
              >
                Open the benchmark investigation instead
              </button>
            </>
          )}
        </div>
      )}
    </form>
  )
}
