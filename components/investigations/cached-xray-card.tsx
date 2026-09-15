import Link from 'next/link'
import { ArrowRightIcon } from 'lucide-react'

export function CachedXRayCard() {
  return (
    <Link href="/investigation/XRAY-KE-001">
      <div className="border border-border rounded-lg p-6 hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-foreground mb-1">
              Mamboleo–Miwani–Chemelil–Muhoroni–Kipsitet Road
            </h3>
            <p className="text-sm text-muted-foreground">Citizen Digital</p>
          </div>
          <span className="ml-4 text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
            XRAY-KE-001
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 py-4 border-y border-border">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">5</div>
            <div className="text-xs text-muted-foreground mt-1">claims</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">11</div>
            <div className="text-xs text-muted-foreground mt-1">receipts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">2</div>
            <div className="text-xs text-muted-foreground mt-1">gaps</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Last investigated 2 days ago
          </p>
          <div className="flex items-center gap-2 text-primary text-sm font-medium group-hover:translate-x-1 transition-transform">
            Explore X-Ray
            <ArrowRightIcon className="w-4 h-4" />
          </div>
        </div>
      </div>
    </Link>
  )
}
