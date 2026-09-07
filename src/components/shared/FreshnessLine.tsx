import { useEffect, useState } from 'react'

// "Last refreshed 3 days ago by the Monday guest scout." One line under
// every People lane title, so a lane that has gone quiet says so instead of
// looking full. Krish, 2026-09-07: he wanted to know whether Visibility was
// up to date; nothing on the screen could tell him.

type Lane = 'hunt' | 'visibility' | 'room' | 'network'

interface Freshness { at: string | null; by: string }

let cache: Record<string, Freshness> | null = null
let inflight: Promise<Record<string, Freshness> | null> | null = null

async function load(): Promise<Record<string, Freshness> | null> {
  if (cache) return cache
  if (!inflight) {
    inflight = fetch('/api/people/freshness')
      .then(r => r.json())
      .then(j => (j?.ok ? (cache = j as Record<string, Freshness>) : null))
      .catch(() => null)
      .finally(() => { inflight = null })
  }
  return inflight
}

export function agoWords(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 36) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function FreshnessLine({ lane, className = '' }: { lane: Lane; className?: string }) {
  const [f, setF] = useState<Freshness | null>(null)
  useEffect(() => {
    let live = true
    load().then(all => { if (live && all && all[lane]) setF(all[lane]) })
    return () => { live = false }
  }, [lane])
  if (!f) return null
  const stale = f.at ? (Date.now() - new Date(f.at).getTime()) > 10 * 24 * 3600 * 1000 : true
  return (
    <p className={`text-micro mt-1 ${stale ? 'text-amber-200/80' : 'text-white/40'} ${className}`} data-testid={`freshness-${lane}`}>
      Last refreshed {agoWords(f.at)} by {f.by}.{stale ? ' That is a while.' : ''}
    </p>
  )
}
