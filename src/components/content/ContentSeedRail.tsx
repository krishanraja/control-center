import React, { useEffect, useState } from 'react'
import { Sparkles, Plus, X, Radio, MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

// Phase 8 — auto-seed. Surfaces this week's real artifacts (Zara market signals +
// customer voice) at the top of the Content tab so ideas start from something
// Krish actually has, not a blank box. One click seeds the artifact into
// content_ideas via the existing capture route. Krish-voice: builder-operator
// artifacts beat commentary, so these are the strongest possible seeds.

interface SeedCandidate {
  key: string
  kind: 'signal' | 'customer'
  text: string
  sub?: string | null
  source_type: string
  source_ref: string
  source_url?: string | null
  score?: number | null
}

export function ContentSeedRail() {
  const { toast } = useToast()
  const h = useHaptics()
  const [cands, setCands] = useState<SeedCandidate[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // Source refs already turned into ideas, so we don't re-offer them.
      const { data: existing } = await supabase
        .from('content_ideas').select('source_ref').not('source_ref', 'is', null).limit(500)
      const seeded = new Set((existing || []).map((r: any) => r.source_ref))

      const [sig, cust] = await Promise.all([
        supabase.from('zara_signals')
          .select('id,summary,description,signal_type,signal_score,krish_rating,source_url,venture,status,created_at')
          .order('created_at', { ascending: false }).limit(40),
        supabase.from('customer_contacts')
          .select('id,summary,reason,next_step,created_at')
          .order('created_at', { ascending: false }).limit(12),
      ])

      const out: SeedCandidate[] = []
      for (const s of (sig.data || []) as any[]) {
        if (s.status === 'closed' || s.status === 'dropped') continue
        if (seeded.has(s.id)) continue
        const text = s.summary || s.description
        if (!text) continue
        out.push({
          key: `sig:${s.id}`, kind: 'signal', text: String(text).slice(0, 200),
          sub: s.venture || s.signal_type || null, source_type: 'zara_signal',
          source_ref: s.id, source_url: s.source_url, score: s.krish_rating ?? s.signal_score ?? null,
        })
      }
      for (const c of (cust.data || []) as any[]) {
        if (seeded.has(c.id)) continue
        const text = c.summary || c.reason
        if (!text) continue
        out.push({
          key: `cust:${c.id}`, kind: 'customer', text: String(text).slice(0, 200),
          sub: 'customer voice', source_type: 'manual', source_ref: c.id, score: null,
        })
      }
      // Best signals first (by score), then customer voice.
      out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      if (alive) setCands(out.slice(0, 8))
    })()
    return () => { alive = false }
  }, [])

  const seed = async (c: SeedCandidate) => {
    h.heavy(); setBusy(c.key)
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: c.text, source_type: c.source_type, source_ref: c.source_ref, source_url: c.source_url || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); toast('Seeded into the Content pipeline.', 'success')
      setDismissed(prev => new Set(prev).add(c.key))
    } catch (e: any) { h.error(); toast(`Seed failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  const visible = (cands || []).filter(c => !dismissed.has(c.key))
  if (cands === null || visible.length === 0) return null

  return (
    <section className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-3" aria-label="Seed ideas from this week's artifacts">
      <header className="flex items-center gap-2 mb-2">
        <Sparkles size={13} className="text-violet-300" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200/80">Seed from this week's artifacts</h2>
        <span className="text-[10px] text-white/35">{visible.length}</span>
        <button type="button" onClick={() => setCollapsed(c => !c)} className="ml-auto text-[10px] text-white/40 hover:text-white/70">
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </header>
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visible.map(c => (
            <div key={c.key} className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-2.5 flex flex-col gap-2">
              <div className="flex items-start gap-1.5">
                {c.kind === 'signal' ? <Radio size={11} className="text-sky-300 mt-0.5 flex-shrink-0" /> : <MessageCircle size={11} className="text-emerald-300 mt-0.5 flex-shrink-0" />}
                <p className="text-[11px] text-white/80 leading-snug flex-1 min-w-0">{c.text}</p>
                <button type="button" onClick={() => setDismissed(prev => new Set(prev).add(c.key))} className="text-white/25 hover:text-white/60 flex-shrink-0" aria-label="Dismiss">
                  <X size={11} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {c.sub && <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50 uppercase tracking-wide">{c.sub}</span>}
                {typeof c.score === 'number' && <span className="text-[9px] text-white/40 tabular-nums">★ {c.score}</span>}
                <button type="button" disabled={busy !== null} onClick={() => seed(c)}
                  className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-violet-500/30 text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 min-h-[32px]">
                  <Plus size={10} /> {busy === c.key ? 'Seeding…' : 'Seed as idea'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
