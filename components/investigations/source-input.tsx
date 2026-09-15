'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SearchIcon } from 'lucide-react'

export function SourceInput() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const placeholderUrl =
    'https://citizendigital.com/road/mamboleo-project/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setIsLoading(true)

    // Simulate brief processing delay
    await new Promise((resolve) => setTimeout(resolve, 300))

    // Generate investigation ID based on hash of URL
    const id = 'XRAY-KE-001'

    router.push(`/investigation/${id}`)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative">
        <input
          type="url"
          placeholder={placeholderUrl}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-5 py-3.5 pl-12 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />

        <button
          type="submit"
          disabled={!url.trim() || isLoading}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-primary text-primary-foreground rounded font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Loading...' : 'X-Ray'}
        </button>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Paste a news article, government report, or public source to X-Ray
        what claims are standing on.
      </div>
    </form>
  )
}
