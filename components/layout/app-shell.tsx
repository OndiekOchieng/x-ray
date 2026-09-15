'use client'

import Link from 'next/link'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          {/* Logo & Tagline */}
          <Link href="/" className="group">
            <div className="flex flex-col">
              <div className="text-xl font-bold tracking-tighter text-foreground">
                X-RAY
              </div>
              <div className="text-xs text-muted-foreground">
                Civic Evidence Engine
              </div>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden sm:flex items-center gap-8">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Investigate
            </Link>
            <Link
              href="/library"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Library
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              About
            </Link>
          </nav>
        </div>

        {/* Principle bar */}
        <div className="border-t border-border bg-accent/5 px-4 sm:px-6 lg:px-8 py-2">
          <div className="max-w-7xl mx-auto text-xs text-muted-foreground text-center">
            Verdicts expire. Receipts compound.
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-xs text-muted-foreground">
            X-Ray is a civic evidence engine designed to decompose public
            claims and trace supporting records.
          </div>
        </div>
      </footer>
    </div>
  )
}
