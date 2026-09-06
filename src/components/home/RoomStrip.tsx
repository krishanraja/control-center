import { useEffect, useState } from 'react'
import { ArrowRight } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'

// One line on Home: how many drafted approaches are waiting for Krish to
// send, and the way to them. Renders nothing when nothing is drafted.
//
// Deliberately one 28 to 34px line and not a card: Home is pinned to fit the
// viewport with no scroll (e2e/home-noscroll.spec.ts), and this sits in the
// same shrink-0 stack as the vitals line.

type NavigateFn = (tab: string, params?: Record<string, string>) => void

export function RoomStrip({ onNavigate }: { onNavigate?: NavigateFn }) {
  const [drafted, setDrafted] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/room')
        const j = await r.json()
        const n = Number(j?.stateCounts?.drafted)
        if (!cancelled) setDrafted(j?.ok && Number.isFinite(n) ? n : 0)
      } catch {
        if (!cancelled) setDrafted(0)
      }
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [])

  if (drafted <= 0) return null

  return (
    <button
      type="button"
      data-testid="room-strip"
      onClick={() => onNavigate?.('people', { lane: 'room' })}
      className="flex items-center gap-2 min-h-[28px] max-h-[34px] w-full text-left group"
    >
      <Eyebrow tone="accent">Room</Eyebrow>
      <span className="text-label text-white/80 truncate">
        {drafted} drafted approach{drafted === 1 ? '' : 'es'} waiting to send
      </span>
      <ArrowRight size={12} className="text-white/45 group-hover:text-white/80 transition-colors shrink-0" />
    </button>
  )
}
