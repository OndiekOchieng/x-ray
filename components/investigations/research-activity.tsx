'use client'

import { useEffect, useState } from 'react'
import type { ResearchEvent } from '@/lib/types'

const eventIcons: Record<string, string> = {
  claim: '▪',
  evidence: '✓',
  connection: '◆',
  gap: '!',
  status: '→',
}

export function ResearchActivity({
  events,
  investigationStarted,
}: {
  events: ResearchEvent[]
  investigationStarted: boolean
}) {
  const [visibleEvents, setVisibleEvents] = useState<ResearchEvent[]>([])

  useEffect(() => {
    if (!investigationStarted) return

    const timeouts = events.map((event) => {
      return setTimeout(
        () => {
          setVisibleEvents((prev) => [...prev, event])
        },
        event.timestamp
      )
    })

    return () => timeouts.forEach(clearTimeout)
  }, [investigationStarted, events])

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
        Research Activity
      </h2>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {visibleEvents.length === 0 && investigationStarted && (
          <div className="text-xs text-muted-foreground italic">
            Initializing...
          </div>
        )}

        {visibleEvents.map((event, idx) => (
          <div
            key={event.id}
            className="text-xs text-muted-foreground border-l border-muted-foreground/20 pl-3 py-1 animate-in fade-in slide-in-from-left-2 duration-300"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <span className="inline-block w-4 text-left">
              {eventIcons[event.type] || '•'}
            </span>
            <span className="ml-2">{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
