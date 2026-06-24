import React, { useMemo, useState } from 'react'
import {
  AlertTriangle, Check, Flame, Gauge, MessageSquare, PenLine, RotateCcw, Save, Send, Sparkles, Swords, Wand2, X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { lintVoice, type LintIssue } from '../../lib/voiceLint'
import {
  FACTORY_CHANNELS, FIVE_STANDARDS, HUMOR_PRESETS, ITERATE_CHIPS, LANES, LENGTH_PRESETS, TONE_PRESETS,
  ZOOM_DEFAULT_HINT, gatePasses, laneToFactoryChannel, type AxisOption, type FactoryChannel,
} from '../../lib/contentEngine'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'

/**
 * The Content Engine controls, layered onto a content idea card behind
 * VITE_CONTENT_ENGINE_ENABLED. Works on whichever row it's handed — parent idea
 * or a transformed child — operating on that row's `body` as the working draft.
 */
export function ContentEnginePanel({ idea: i }: { idea: ContentIdeaRow }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [working, setWorking] = useState<string>(i.body || '')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [sel, setSel] = useState('')
  const [openSection, setOpenSection] = useState<null | 'edit' | 'standards' | 'challenge' | 'variants' | 'cleo'>(null)

  React.useEffect(() => { setWorking(i.body || ''); setPreview(null) }, [i.body])

  const draftOnScreen = preview ?? working
  const lint = useMemo<LintIssue[]>(() => lintVoice(draftOnScreen), [draftOnScreen])
  const lintErrors = lint.filter(l => l.severity === 'error').length
  const lintWarns = lint.filter(l => l.severity === 'warn').length

  const meta = i.meta || {}
  const standards = meta.standards || null
  const latestChallenge = Array.isArray(meta.challenges) ? meta.challenges[0] : null
  const lastPush = Array.isArray(meta.cleo_pushes) ? meta.cleo_pushes[0] : null

  // ── revise (transform axes + iterate) ──────────────────────────────────
  // `selection` (optional) scopes the rewrite to just that substring of the draft
  // (paragraph/sentence-level). The API returns the full draft with the span swapped.
  const revise = async (mode: string, value: string, hint?: string, instruction?: string, selection?: string) => {
    if (!draftOnScreen.trim()) { toast('Nothing to revise yet — Expand or write a draft first.', 'error'); return }
    h.heavy(); setBusy(`${mode}:${value}`)
    try {
      const r = await fetch(`/api/content-ideas/${i.id}/revise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, value, hint, instruction, selection, source_text: draftOnScreen }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setPreview(j.revised); h.success()
      if (selection) { setSel(''); toast('Revised just that passage.', 'success') }
    } catch (e: any) { h.error(); toast(`Revise failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  // Capture a text selection made inside a draft block so it can be revised alone.
  const captureSelection = () => {
    const s = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
    if (s && s.length >= 8 && draftOnScreen.includes(s)) setSel(s)
  }

  const acceptPreview = async () => {
    if (preview == null) return
    h.tap(); setBusy('accept')
    const { error } = await supabase.from('content_ideas')
      .update({ body: preview, updated_at: new Date().toISOString() }).eq('id', i.id)
    setBusy(null)
    if (error) { h.error(); toast('Could not save — try again.', 'error'); return }
    setWorking(preview); setPreview(null); h.success(); toast('Draft updated.', 'success')
  }

  // ── challenge (enrich) ─────────────────────────────────────────────────
  const challenge = async (mode: string) => {
    h.heavy(); setBusy(`challenge:${mode}`)
    try {
      const r = await fetch(`/api/content-ideas/${i.id}/challenge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, source_text: draftOnScreen }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); setOpenSection('challenge')
      toast(mode === 'sources' ? 'Sources pulled in.' : 'Challenge ready below.', 'success')
    } catch (e: any) { h.error(); toast(`Challenge failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  // ── score (Five Standards) ─────────────────────────────────────────────
  const score = async () => {
    if (!draftOnScreen.trim()) { toast('No draft to score yet.', 'error'); return }
    h.heavy(); setBusy('score')
    try {
      const r = await fetch(`/api/content-ideas/${i.id}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_text: draftOnScreen }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); toast(`Scored: ${j.quality_score}.`, j.quality_score === 'red' ? 'error' : 'success')
    } catch (e: any) { h.error(); toast(`Score failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  // ── push to cleo ───────────────────────────────────────────────────────
  const pushToCleo = async (channel: FactoryChannel) => {
    h.heavy(); setBusy('push')
    try {
      const r = await fetch(`/api/content-ideas/${i.id}/push-to-cleo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_channel: channel, source_text: draftOnScreen }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); toast('Sent to Cleo. Google Doc lands in Telegram shortly.', 'success')
    } catch (e: any) { h.error(); toast(`Push failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  const chip = (o: AxisOption, mode: string, accent: string) => (
    <button
      key={o.value} type="button" title={o.hint} disabled={busy !== null}
      onClick={(e) => { e.stopPropagation(); revise(mode, o.value, o.hint) }}
      className={`text-[10px] px-2 py-1 rounded-md border ${accent} disabled:opacity-40 transition-colors min-h-[36px]`}
    >
      {busy === `${mode}:${o.value}` ? '…' : o.label}
    </button>
  )

  return (
    <div className="mt-3 rounded-lg border border-violet-500/15 bg-violet-500/[0.03] p-2.5 space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[10px] text-violet-200/70 uppercase tracking-[0.1em] font-semibold">
        <Wand2 size={11} /> Content engine
        {(lintErrors > 0 || lintWarns > 0) && (
          <span className={`ml-auto px-1.5 py-0.5 rounded ${lintErrors ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/15 text-amber-200'}`} title={lint.map(l => l.message).join('\n')}>
            voice: {lintErrors > 0 ? `${lintErrors} err` : ''}{lintErrors > 0 && lintWarns > 0 ? ' · ' : ''}{lintWarns > 0 ? `${lintWarns} warn` : ''}
          </span>
        )}
      </div>

      {/* Working draft — select any sentence to revise just that part */}
      {preview == null && working.trim() && (
        <div className="rounded-md border border-white/[0.06] bg-black/20 p-2">
          <div className="text-[9px] text-white/30 uppercase tracking-wide mb-1">Working draft · select a sentence to refine just it</div>
          <p onMouseUp={captureSelection} className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto cursor-text select-text">{working}</p>
        </div>
      )}

      {/* Selection-scoped revise toolbar */}
      {sel && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-amber-200/80">
            <span className="flex-1 truncate">Selected: "{sel.slice(0, 60)}{sel.length > 60 ? '…' : ''}"</span>
            <button type="button" onClick={() => setSel('')} className="text-white/40 hover:text-white/70"><X size={11} /></button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {[
              ...TONE_PRESETS.map(o => ({ o, mode: 'tone' })),
              ...HUMOR_PRESETS.map(o => ({ o, mode: 'tone' })),
              ...ITERATE_CHIPS.slice(0, 2).map(o => ({ o, mode: 'feedback' })),
            ].map(({ o, mode }) => (
              <button key={o.value} type="button" title={o.hint} disabled={busy !== null}
                onClick={() => revise(mode, o.value, o.hint, undefined, sel)}
                className="text-[10px] px-2 py-1 rounded-md border border-amber-500/30 text-amber-100 hover:bg-amber-500/15 disabled:opacity-40 min-h-[32px]">
                {busy === `${mode}:${o.value}` ? '…' : o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transform axes */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-white/35 w-10">Tone</span>
          {TONE_PRESETS.map(o => chip(o, 'tone', 'border-rose-500/25 text-rose-200 hover:bg-rose-500/10'))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-white/35 w-10">Humor</span>
          {HUMOR_PRESETS.map(o => chip(o, 'tone', 'border-fuchsia-500/25 text-fuchsia-200 hover:bg-fuchsia-500/10'))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-white/35 w-10">Length</span>
          {LENGTH_PRESETS.map(o => chip(o, 'length', 'border-sky-500/25 text-sky-200 hover:bg-sky-500/10'))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-white/35 w-10">Zoom</span>
          <button type="button" disabled={busy !== null}
            onClick={(e) => { e.stopPropagation(); revise('zoom', 'contrarian-angle', ZOOM_DEFAULT_HINT) }}
            className="text-[10px] px-2 py-1 rounded-md border border-amber-500/25 text-amber-200 hover:bg-amber-500/10 disabled:opacity-40 min-h-[36px]">
            {busy === 'zoom:contrarian-angle' ? '…' : 'Sharpest angle'}
          </button>
        </div>
      </div>

      {/* Iterate chips + open feedback */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] text-white/35 w-10">Iterate</span>
        {ITERATE_CHIPS.map(o => chip(o, 'feedback', 'border-white/10 text-white/65 hover:bg-white/[0.06]'))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={feedback} onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && feedback.trim()) { revise('feedback', 'custom', undefined, feedback.trim()); setFeedback('') } }}
          placeholder="Tell Cleo what to change…"
          className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 focus:outline-none focus:border-violet-500/40"
        />
        <button type="button" disabled={busy !== null || !feedback.trim()}
          onClick={() => { revise('feedback', 'custom', undefined, feedback.trim()); setFeedback('') }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] border border-violet-500/25 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 min-h-[36px]">
          <MessageSquare size={11} />
        </button>
      </div>

      {/* Preview / accept */}
      {preview != null && (
        <div className="rounded-md border border-violet-500/25 bg-black/30 p-2 space-y-2">
          <div className="flex items-center gap-1.5 text-[9px] text-violet-200/70 uppercase tracking-wide">
            <Sparkles size={10} /> Revised preview
          </div>
          <p onMouseUp={captureSelection} className="text-[12px] text-white/85 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto cursor-text select-text">{preview}</p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={acceptPreview} disabled={busy !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-violet-500/30 text-white hover:bg-violet-500/40 disabled:opacity-40 min-h-[36px]">
              <Check size={11} /> Accept
            </button>
            <button type="button" onClick={() => { setWorking(preview); setPreview(null) }} disabled={busy !== null}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] border border-white/10 text-white/70 hover:bg-white/[0.06] min-h-[36px]">
              <RotateCcw size={11} /> Keep iterating
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={busy !== null}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/40 hover:text-white/70 min-h-[36px]">
              <X size={11} /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Section toggles: fields / challenge / variants / cleo */}
      <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-white/[0.05]">
        <SectionTab icon={<PenLine size={11} />} label="Edit" active={openSection === 'edit'} onClick={() => setOpenSection(s => s === 'edit' ? null : 'edit')} />
        <SectionTab icon={<Swords size={11} />} label="Challenge" active={openSection === 'challenge'} onClick={() => setOpenSection(s => s === 'challenge' ? null : 'challenge')} />
        <SectionTab icon={<Wand2 size={11} />} label="Variants" active={openSection === 'variants'} onClick={() => setOpenSection(s => s === 'variants' ? null : 'variants')} />
        <SectionTab icon={<Gauge size={11} />} label="Standards" active={openSection === 'standards'} onClick={() => setOpenSection(s => s === 'standards' ? null : 'standards')} />
        <SectionTab icon={<Send size={11} />} label="Push to Cleo" active={openSection === 'cleo'} onClick={() => setOpenSection(s => s === 'cleo' ? null : 'cleo')} />
      </div>

      {/* Inline field edit (idea / thesis / distribution) */}
      {openSection === 'edit' && <InlineFields idea={i} busy={busy} setBusy={setBusy} />}

      {/* Challenge */}
      {openSection === 'challenge' && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 flex-wrap">
            {[['challenge', 'Challenge this'], ['counter', 'Counter-argument'], ['hook', 'Commercial hook'], ['sources', 'Add sources']].map(([m, label]) => (
              <button key={m} type="button" disabled={busy !== null} onClick={() => challenge(m)}
                className="text-[10px] px-2 py-1 rounded-md border border-amber-500/25 text-amber-200 hover:bg-amber-500/10 disabled:opacity-40 min-h-[36px]">
                {busy === `challenge:${m}` ? '…' : label}
              </button>
            ))}
          </div>
          {latestChallenge && (
            <div className="rounded-md border border-amber-500/20 bg-black/30 p-2 space-y-1.5 text-[11px] leading-snug">
              {latestChallenge.steelman && <p className="text-white/75"><span className="text-amber-300/70">Steelman: </span>{latestChallenge.steelman}</p>}
              {latestChallenge.counter && <p className="text-white/75"><span className="text-amber-300/70">Counter: </span>{latestChallenge.counter}</p>}
              {latestChallenge.sharper_take && <p className="text-white/85"><span className="text-emerald-300/70">Sharper take: </span>{latestChallenge.sharper_take}</p>}
              {latestChallenge.commercial_hook && <p className="text-white/85"><span className="text-sky-300/70">Commercial hook: </span>{latestChallenge.commercial_hook}</p>}
              {latestChallenge.gaps && <p className="text-rose-200/70"><span className="text-rose-300/70">Gaps to fill: </span>{latestChallenge.gaps}</p>}
              {Array.isArray(latestChallenge.citations) && latestChallenge.citations.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  {latestChallenge.citations.slice(0, 5).map((u: string, idx: number) => (
                    <a key={idx} href={u} target="_blank" rel="noreferrer noopener" className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 hover:text-white/85 truncate max-w-[160px]">{hostname(u)}</a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Channel variants */}
      {openSection === 'variants' && <ChannelVariants idea={i} busy={busy} setBusy={setBusy} />}

      {/* Five Standards gate */}
      {openSection === 'standards' && (
        <div className="space-y-2">
          <button type="button" onClick={score} disabled={busy !== null}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 min-h-[36px]">
            <Gauge size={11} /> {busy === 'score' ? 'Scoring…' : 'Score the five standards'}
          </button>
          {standards && (
            <div className="rounded-md border border-white/[0.06] bg-black/30 p-2 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {FIVE_STANDARDS.map(st => {
                  const v = standards.scores?.[st.key] ?? 0
                  const bad = v < 3
                  return (
                    <span key={st.key} title={standards.notes?.[st.key] || st.label}
                      className={`text-[9px] px-1.5 py-0.5 rounded tabular-nums ${bad ? (st.watch ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/15 text-amber-200') : 'bg-emerald-500/15 text-emerald-200'}`}>
                      {st.label.split(' ')[0]} {v}/5
                    </span>
                  )
                })}
              </div>
              {standards.verdict && <p className="text-[10px] text-white/55 italic">{standards.verdict}</p>}
              {standards.artifact_sourced === false && (
                <p className="flex items-start gap-1.5 text-[10px] text-amber-200/70"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />No owned artifact detected — this may be commentary on a thing read. Reach for a builder-operator source.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Push to Cleo */}
      {openSection === 'cleo' && (
        <div className="space-y-2">
          {!gatePasses(standards) && (
            <p className="flex items-start gap-1.5 text-[10px] text-amber-200/80"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />Fails a watch standard ({standards?.failing.join(', ')}). You can still push — Cleo polishes, you stay the final word.</p>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            {FACTORY_CHANNELS.map(c => (
              <button key={c.value} type="button" disabled={busy !== null} onClick={() => pushToCleo(c.value)}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 min-h-[36px]">
                <Flame size={10} /> {busy === 'push' ? '…' : c.label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/35">
            Suggested for this lane: <span className="text-white/55">{FACTORY_CHANNELS.find(c => c.value === laneToFactoryChannel(i.lane, i.lane_slot))?.label}</span>
            {lastPush && <> · last sent to {lastPush.channel}</>}
          </p>
        </div>
      )}
    </div>
  )
}

function SectionTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors min-h-[36px] ${active ? 'bg-white/[0.08] text-white/85' : 'text-white/45 hover:text-white/70'}`}>
      {icon} {label}
    </button>
  )
}

function ChannelVariants({ idea: i, busy, setBusy }: { idea: ContentIdeaRow; busy: string | null; setBusy: (s: string | null) => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const keyOf = (lane: string, slot?: string) => (slot ? `${lane}::${slot}` : lane)
  const toggle = (k: string) => setPicked(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

  const generate = async () => {
    if (picked.size === 0) { toast('Pick at least one channel.', 'error'); return }
    const lanes: string[] = []
    const slots: Record<string, string> = {}
    for (const k of picked) {
      const [lane, slot] = k.split('::')
      if (!lanes.includes(lane)) lanes.push(lane)
      if (slot) slots[lane] = slot
    }
    h.heavy(); setBusy('variants')
    try {
      const r = await fetch(`/api/content-ideas/${i.id}/transform`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lanes, slots }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error((j.errors && j.errors[0]?.error) || j.error || `HTTP ${r.status}`)
      h.success(); toast(`${j.created?.length || 0} variant(s) generated — they appear as their own cards.`, 'success')
      setPicked(new Set())
    } catch (e: any) { h.error(); toast(`Variants failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        {LANES.map(l => {
          const k = keyOf(l.lane, l.slot)
          const on = picked.has(k)
          return (
            <button key={k} type="button" onClick={() => toggle(k)} disabled={busy !== null}
              className={`text-[10px] px-2 py-1 rounded-md border disabled:opacity-40 min-h-[36px] ${on ? 'border-violet-400/50 bg-violet-500/20 text-violet-100' : 'border-white/10 text-white/55 hover:bg-white/[0.06]'}`}>
              {on ? '✓ ' : ''}{l.label} <span className="text-white/30">·{l.gear}</span>
            </button>
          )
        })}
      </div>
      <button type="button" onClick={generate} disabled={busy !== null || picked.size === 0}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-violet-500/30 text-white hover:bg-violet-500/40 disabled:opacity-40 min-h-[36px]">
        <Wand2 size={11} /> {busy === 'variants' ? 'Generating…' : `Generate ${picked.size || ''} variant${picked.size === 1 ? '' : 's'}`}
      </button>
      <p className="text-[9px] text-white/35">Each variant is its own card in that lane's voice — not the same text restyled.</p>
    </div>
  )
}

function hostname(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u.slice(0, 24) }
}

/** Inline edit of the structured fields (idea / thesis / distribution) via the
 *  existing PATCH /api/content-ideas route. Phase 2: "edit everything inline". */
function InlineFields({ idea: i, busy, setBusy }: { idea: ContentIdeaRow; busy: string | null; setBusy: (s: string | null) => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [ideaText, setIdeaText] = useState(i.idea)
  const [thesis, setThesis] = useState(i.thesis || '')
  const [dist, setDist] = useState((Array.isArray(i.distribution) ? i.distribution : []).join(', '))

  React.useEffect(() => {
    setIdeaText(i.idea); setThesis(i.thesis || '')
    setDist((Array.isArray(i.distribution) ? i.distribution : []).join(', '))
  }, [i.id, i.idea, i.thesis, i.distribution])

  const dirty = ideaText !== i.idea || thesis !== (i.thesis || '') ||
    dist !== (Array.isArray(i.distribution) ? i.distribution : []).join(', ')

  const save = async () => {
    if (!ideaText.trim()) { toast('Idea cannot be empty.', 'error'); return }
    h.tap(); setBusy('fields')
    try {
      const distribution = dist.split(',').map(s => s.trim()).filter(Boolean)
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: i.id, idea: ideaText.trim(), thesis: thesis.trim() || null, distribution }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); toast('Fields updated.', 'success')
    } catch (e: any) { h.error(); toast(`Save failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  const field = 'w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 focus:outline-none focus:border-violet-500/40'
  return (
    <div className="space-y-1.5">
      <label className="block text-[9px] text-white/35 uppercase tracking-wide">Idea</label>
      <textarea value={ideaText} onChange={e => setIdeaText(e.target.value)} rows={2} className={field} />
      <label className="block text-[9px] text-white/35 uppercase tracking-wide">Thesis</label>
      <textarea value={thesis} onChange={e => setThesis(e.target.value)} rows={2} className={field} placeholder="The arguable claim, one sentence." />
      <label className="block text-[9px] text-white/35 uppercase tracking-wide">Distribution (comma-separated)</label>
      <input value={dist} onChange={e => setDist(e.target.value)} className={field} placeholder="techonomic, linkedin, signal_noise" />
      <button type="button" onClick={save} disabled={busy !== null || !dirty}
        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-violet-500/30 text-white hover:bg-violet-500/40 disabled:opacity-40 min-h-[36px]">
        <Save size={11} /> {busy === 'fields' ? 'Saving…' : 'Save fields'}
      </button>
    </div>
  )
}
