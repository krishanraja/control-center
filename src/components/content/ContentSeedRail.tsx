import React, { useEffect, useState } from 'react'
import { Sparkles, Plus, X, Radio, MessageCircle, Trophy } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

// Seed rail — thin renderer over the governed seed engine.
//
// All judgement about what counts as a content-grade artifact (time-box,
// type/quality gates, dedupe, exclude already-seeded, ranking) lives server-side
// in /api/content-seed-candidates → api/_seedSources.ts. This component does NOT
// read tables directly; that hardcoded two-table read is exactly what surfaced
// stale podcast leads + a "test" row as "this week's artifacts". It only renders
// the ranked list and seeds a chosen artifact into the Content pipeline.
//
// Honest empty state: if the engine returns nothing, the rail says so plainly
// instead of scraping a dead table to look busy.

interface SeedCandidate {
  key: string
  kind: 'signal' | 'customer' | 'deal'
  text: string
  sub: string | null
  source_type: string
  source_ref: string
  source_url: string | null
  score: number | null
}

const KIND_ICON: Record<SeedCandidate['kind'], React.ReactNode> = {
  signal: <Radio size={11} className="text-sky-300 mt-0.5 flex-shrink-0" />,
  customer: <MessageCircle size={11} className="text-emerald-300 mt-0.5 flex-shrink-0" />,
  deal: <Trophy size={11} className="text-amber-300 mt-0.5 flex-shrink-0" />,
}

export function ContentSeedRail() {
  const { toast } = useToast()
  const h = useHaptics()
  const [cands, setCands] = useState<SeedCandidate[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // Default collapsed so the rail never takes over the page on load — it's an
  // opt-in "browse what's ready to seed", not the main event. Preference sticks.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('cc_seed_rail_open') !== '1' } catch { return true }
  })
  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v)
    try { localStorage.setItem('cc_seed_rail_open', v ? '0' : '1') } catch { /* noop */ }
  }

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/content-seed-candidates')
        const j = (await r.json().catch(() => ({}))) as {
          ok?: boolean
          candidates?: SeedCandidate[]
        }
        if (alive) setCands(r.ok && j.ok && Array.isArray(j.candidates) ? j.candidates : [])
      } catch {
        if (alive) setCands([])
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const seed = async (c: SeedCandidate) => {
    h.heavy()
    setBusy(c.key)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: c.text,
          source_type: c.source_type,
          source_ref: c.source_ref,
          source_url: c.source_url || undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      setDismissed((prev) => new Set(prev).add(c.key))
      // Open the new piece straight into the composer so seeding flows into
      // deep work, not into a buried card the user has to hunt for.
      const newId = j.id || (j.idea && j.idea.id) || null
      if (newId) {
        toast('Seeded — opening the composer.', 'success')
        window.location.hash = `#/content?idea=${newId}`
      } else {
        toast('Seeded into the Content pipeline.', 'success')
      }
    } catch (e) {
      h.error()
      toast(`Seed failed: ${e instanceof Error ? e.message : 'error'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  // Still loading — render nothing (no layout shift, no skeleton flash).
  if (cands === null) return null

  const visible = cands.filter((c) => !dismissed.has(c.key))

  // Nothing to seed — stay quiet and small, never a dead block.
  if (visible.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 py-2" aria-label="Seed ideas from recent artifacts">
        <p className="text-[11px] text-white/40 leading-snug">
          No fresh artifacts to seed from right now. New customer signals, closed deals, and
          market intelligence land here automatically, or capture an idea directly with{' '}
          <kbd className="px-1 py-0.5 rounded bg-white/[0.06] text-white/55 text-[10px]">⌘I</kbd>.
        </p>
      </section>
    )
  }

  // Collapsed (default) — a slim opt-in bar. One click to browse the queue.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsedPersist(false)}
        aria-label="Browse ideas ready to seed"
        className="w-full flex items-center gap-2 rounded-xl border border-violet-500/15 bg-violet-500/[0.03] px-3 py-2 hover:border-violet-500/30 hover:bg-violet-500/[0.06] transition-colors text-left"
      >
        <Sparkles size={13} className="text-violet-300 flex-shrink-0" />
        <span className="text-[12px] text-white/75">
          <span className="font-semibold text-violet-200/90 tabular-nums">{visible.length}</span> idea{visible.length === 1 ? '' : 's'} ready to seed from this week's artifacts
        </span>
        <span className="ml-auto text-[11px] text-violet-300/80">Browse →</span>
      </button>
    )
  }

  return (
    <section
      className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-3"
      aria-label="Seed ideas from recent artifacts"
    >
      <header className="flex items-center gap-2 mb-2">
        <Sparkles size={13} className="text-violet-300" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">
          Seed from recent artifacts
        </h2>
        <span className="text-[10px] text-white/35">{visible.length}</span>
        <button
          type="button"
          onClick={() => setCollapsedPersist(true)}
          className="ml-auto text-[10px] text-white/40 hover:text-white/70"
        >
          Hide
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visible.map((c) => (
              <div
                key={c.key}
                className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5 flex flex-col gap-2"
              >
                <div className="flex items-start gap-1.5">
                  {KIND_ICON[c.kind]}
                  <p className="text-[11px] text-white/80 leading-snug flex-1 min-w-0">{c.text}</p>
                  <button
                    type="button"
                    onClick={() => setDismissed((prev) => new Set(prev).add(c.key))}
                    className="text-white/25 hover:text-white/60 flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    <X size={11} />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {c.sub && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 uppercase tracking-wide">
                      {c.sub}
                    </span>
                  )}
                  {typeof c.score === 'number' && (
                    <span className="text-[9px] text-white/40 tabular-nums">★ {c.score}</span>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => seed(c)}
                    className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 min-h-[32px]"
                  >
                    <Plus size={10} /> {busy === c.key ? 'Seeding…' : 'Seed as idea'}
                  </button>
                </div>
              </div>
            ))}
      </div>
    </section>
  )
}
