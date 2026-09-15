import { AppShell } from '@/components/layout/app-shell'

export default function AboutPage() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-20">
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-3">About X-Ray</p>
        <h1 className="text-4xl font-bold mb-4">Receipts over verdicts.</h1>
        <p className="text-lg text-muted-foreground">X-Ray is civic research infrastructure for reconstructing what public claims are standing on.</p>
      </div>
    </AppShell>
  )
}
