import React, { useMemo, useState } from 'react'
import { Search, Wand2, ExternalLink, Loader2 } from 'lucide-react'
import type { ContentIdeaRow, ContentLane } from '../../hooks/useRealtimeContentIdeas'
import { VENTURE_FORMATS } from '../../lib/contentEngine'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

interface DeepDive { query: string; findings: string; citations?: string[]; at: string }

interface TransformTarget { lane: ContentLane; slot?: string; label: string }
// DERIVED from VENTURE_FORMATS on purpose. This list used to be hand-maintained
// and drifted every time the taxonomy moved, offering retired formats long after
// they were gone. Transform moves a researched idea into another format, each in
// that format's krish-voice gear.
const TRANSFORM_TARGETS: TransformTarget[] = VENTURE_FORMATS.map(f => ({
  lane: f.venture as ContentLane,
  slot: f.slot,
  label: f.label,
}))

/**
 * Research transparency + drill-down + Transform (CONTENT_TAB_SPEC §4.3a, §5.5).
 * Shown in the expanded content-idea card. Surfaces the sources behind the draft,
 * lets Krish dive deeper on a sub-area (scoped Perplexity), and transform the
 * researched idea into other lanes (each in that lane's krish-voice gear).
 */
export function ResearchAndTransform({ idea }: { idea: ContentIdeaRow }) {
  const { toast } = useToast()
  const h = useHaptics()
  const meta = (idea.meta || {}) as any
  const citations: string[] = Array.isArray(meta.research) ? meta.research : []
  const sources: string[] = Array.isArray(meta.sources) ? meta.sources : []
  const allLinks = useMemo(() => Array.from(new Set([idea.source_url, ...citations, ...sources].filter(Boolean))) as string[], [idea.source_url, citations, sources])
  const serverDives: DeepDive[] = Array.isArray(meta.deep_dives) ? meta.deep_dives : []

  const [localDives, setLocalDives] = useState<DeepDive[]>([])
  const [diveQ, setDiveQ] = useState('')
  const [busy, setBusy] = useState<null | 'dive' | 'transform'>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const dives = [...serverDives, ...localDives]

  const isChild = !!idea.parent_idea_id

  const dive = async () => {
    const q = diveQ.trim()
    if (!q || busy) return
    setBusy('dive'); h.tap()
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/dive-deeper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }),
      })
      const p = await r.json().catch(() => ({}))
      if (!r.ok || !p.ok) throw new Error(p.error || `HTTP ${r.status}`)
      setLocalDives(d => [...d, p.entry])
      setDiveQ(''); h.success(); toast('Dug deeper. Added to research.', 'success')
    } catch (e) { h.error(); toast(`Dive failed: ${(e as Error).message}`, 'error') }
    finally { setBusy(null) }
  }

  const toggle = (key: string) => setPicked(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const transform = async () => {
    if (picked.size === 0 || busy) return
    setBusy('transform'); h.heavy()
    const targets = TRANSFORM_TARGETS.filter(t => picked.has(t.lane + (t.slot || '')))
    const lanes = Array.from(new Set(targets.map(t => t.lane)))
    const slots: Record<string, string> = {}
    for (const t of targets) if (t.slot) slots[t.lane] = t.slot
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/transform`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lanes, slots }),
      })
      const p = await r.json().catch(() => ({}))
      if (!r.ok || !p.ok) throw new Error((p.errors?.[0]?.error) || p.error || `HTTP ${r.status}`)
      h.success(); toast(`Transformed into ${p.created.length} lane${p.created.length === 1 ? '' : 's'}.`, 'success')
      setPicked(new Set())
    } catch (e) { h.error(); toast(`Transform failed: ${(e as Error).message}`, 'error') }
    finally { setBusy(null) }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
      {/* Research / sources */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5">Research behind this</div>
        {allLinks.length === 0 && dives.length === 0 ? (
          <p className="text-[11px] text-white/35 italic">No sources attached yet.</p>
        ) : (
          <ul className="space-y-1">
            {allLinks.slice(0, 8).map((u, idx) => (
              <li key={idx} className="flex items-start gap-1.5 min-w-0">
                <ExternalLink size={10} className="text-white/30 mt-1 flex-shrink-0" />
                <a href={u} target="_blank" rel="noreferrer noopener" className="text-[11px] text-sky-300/80 hover:text-sky-200 truncate">{prettyUrl(u)}</a>
              </li>
            ))}
          </ul>
        )}
        {dives.map((d, idx) => (
          <details key={idx} className="mt-1.5">
            <summary className="text-[11px] text-emerald-300/80 cursor-pointer hover:text-emerald-200">↳ {d.query}</summary>
            <p className="text-[11px] text-white/70 leading-relaxed mt-1 whitespace-pre-wrap">{d.findings}</p>
          </details>
        ))}
      </div>

      {/* Dive deeper */}
      <div>
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5">
          <Search size={11} className="text-emerald-300/70" /> Dive deeper
        </div>
        <div className="flex items-center gap-2">
          <input
            value={diveQ}
            onChange={e => setDiveQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') dive() }}
            placeholder="Drill into a specific area…"
            className="flex-1 rounded-md bg-black/40 border border-white/10 px-2.5 py-1.5 text-[12px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-emerald-500/40"
          />
          <button type="button" onClick={dive} disabled={busy !== null || !diveQ.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-emerald-500/25 text-white hover:bg-emerald-500/35 disabled:opacity-40 transition-colors min-h-[36px]">
            {busy === 'dive' ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Research
          </button>
        </div>
      </div>

      {/* Transform to lanes */}
      {!isChild && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5">
            <Wand2 size={11} className="text-violet-300/70" /> Transform into other lanes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRANSFORM_TARGETS.filter(t => t.lane !== idea.lane).map(t => {
              const key = t.lane + (t.slot || '')
              const on = picked.has(key)
              return (
                <button key={key} type="button" onClick={() => toggle(key)}
                  className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${on ? 'bg-violet-500/25 border-violet-400/50 text-violet-100' : 'border-white/10 text-white/60 hover:bg-white/[0.06]'}`}>
                  {t.label}
                </button>
              )
            })}
          </div>
          <button type="button" onClick={transform} disabled={busy !== null || picked.size === 0}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold bg-violet-500/30 text-white hover:bg-violet-500/40 disabled:opacity-40 transition-colors min-h-[36px]">
            {busy === 'transform' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            Transform{picked.size > 0 ? ` (${picked.size})` : ''}
          </button>
        </div>
      )}
      {isChild && (
        <p className="text-[10px] text-white/35 italic">Transformed from a parent idea — dive deeper here, or edit the draft directly.</p>
      )}
    </div>
  )
}

function prettyUrl(u: string): string {
  try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname !== '/' ? x.pathname : '') } catch { return u }
}
