import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, BookOpen, Check, ExternalLink, FileText, Link2, Loader2, MessageSquare, Paperclip, PenLine, RotateCcw,
  Save, Search, Send, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Wand2, X, Gauge,
} from 'lucide-react'
import { RichText } from './RichText'
import { useRealtimeContentIdeas, type ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { lintVoice, autoFixVoice, type LintIssue } from '../../lib/voiceLint'
import {
  FACTORY_CHANNELS, FIVE_STANDARDS, ITERATE_CHIPS, LANE_ADAPTS, LENGTH_PRESETS,
  TONE_PRESETS, ZOOM_DEFAULT_HINT, laneToFactoryChannel, nextBestAction,
} from '../../lib/contentEngine'
// ─────────────────────────────────────────────────────────────────────────
// ContentComposer — the full-screen deep-work surface for ONE piece.
//
// Replaces the old infinite-scroll card. One screen: the draft is the canvas;
// every tool (Cleo chat, Refine, Materials, Research, Standards) lives in a
// single-panel rail so nothing stacks endlessly. One end CTA: Save Draft, which
// produces a formatted Google Doc in Drive and pings Krish on Telegram. Flexible
// order, never rigid. Esc / back returns to the pipeline.
// ─────────────────────────────────────────────────────────────────────────

type RailTab = 'cleo' | 'refine' | 'materials' | 'research' | 'standards'

interface Material {
  id: string
  kind: 'paste' | 'link' | 'file' | 'research'
  title?: string | null
  content?: string | null
  url?: string | null
  bytes?: number
  at?: string
}

interface ChatMsg { role: 'user' | 'assistant'; content: string }

interface Props {
  ideaId: string
  narrow: boolean
  onClose: () => void
}

const RAIL_TABS: { id: RailTab; label: string; icon: React.ReactNode }[] = [
  { id: 'cleo', label: 'Cleo', icon: <MessageSquare size={14} /> },
  { id: 'refine', label: 'Refine', icon: <Wand2 size={14} /> },
  { id: 'materials', label: 'Materials', icon: <Paperclip size={14} /> },
  { id: 'research', label: 'Research', icon: <Search size={14} /> },
  { id: 'standards', label: 'Standards', icon: <Gauge size={14} /> },
]

export function ContentComposer({ ideaId, narrow, onClose }: Props) {
  const { ideas } = useRealtimeContentIdeas()
  const idea = useMemo(() => ideas.find(i => i.id === ideaId) || null, [ideas, ideaId])

  const { toast } = useToast()
  const h = useHaptics()

  const [tab, setTab] = useState<RailTab>('cleo')

  // Flow to the next piece without a list round-trip (P-10 / P-22): jump straight
  // to the next-best card, computed across the pile excluding this one. If nothing
  // is left, just close back to the (now lighter) pipeline.
  const goNext = useCallback(() => {
    const rest = ideas.filter(i => i.id !== ideaId)
    const nb = nextBestAction(rest)
    if (nb.idea) { h.tap(); window.location.hash = `#/content?idea=${nb.idea.id}` }
    else { onClose() }
  }, [ideas, ideaId, h, onClose])
  const nextPiece = useMemo(() => {
    const nb = nextBestAction(ideas.filter(i => i.id !== ideaId))
    return nb.idea ? nb : null
  }, [ideas, ideaId])

  // Draft canvas — local source of truth so realtime refreshes never jump the cursor.
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  // Desktop canvas: formatted reading view by default when a draft exists,
  // straight into writing when the page is blank.
  const [canvasMode, setCanvasMode] = useState<'read' | 'write'>('write')
  const seededRef = useRef<string | null>(null)

  // Adopt the row's body the first time we see this idea (and when not editing).
  useEffect(() => {
    if (!idea) return
    if (seededRef.current !== idea.id) {
      seededRef.current = idea.id
      setDraft(idea.body || '')
      setDirty(false)
      setCanvasMode((idea.body || '').trim() ? 'read' : 'write')
    } else if (!dirty) {
      setDraft(idea.body || '')
    }
  }, [idea?.id, idea?.body, dirty])

  // Lock background scroll while the composer owns the screen.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc closes (when no inner dialog has it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Debounced autosave of the draft body through the API (service role; anon
  // cannot write content_ideas, which is why the old inline card's saves were
  // silently lost).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistBody = useCallback(async (text: string) => {
    if (!idea) return
    setSaveState('saving')
    try {
      const r = await fetch('/api/content-ideas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: idea.id, body: text }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setSaveState('saved')
      setDirty(false)
    } catch {
      setSaveState('idle')
      toast('Could not autosave the draft.', 'error')
    }
  }, [idea, toast])

  const onDraftChange = (text: string) => {
    setDraft(text); setDirty(true); setSaveState('idle')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistBody(text), 1200)
  }

  // Apply a new draft body (from Cleo / Refine), persist immediately.
  const applyDraft = useCallback(async (text: string) => {
    setDraft(text); setDirty(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    await persistBody(text)
  }, [persistBody])

  const lint = useMemo<LintIssue[]>(() => lintVoice(draft), [draft])
  const emDashes = lint.filter(l => l.rule === 'em-dash').length
  const warns = lint.filter(l => l.severity === 'warn').length
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0

  const fixVoice = () => {
    const fixed = autoFixVoice(draft)
    if (fixed === draft) { toast('No em dashes to fix.', 'success'); return }
    h.tap(); applyDraft(fixed); toast('Em dashes cleared.', 'success')
  }

  if (!idea) {
    return (
      <div className="fixed inset-0 z-[90] bg-[#0a0a0b] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-white/40" />
      </div>
    )
  }

  const openRail = (t: RailTab) => setTab(t)

  const railPanel = (
    <RailContent
      tab={tab}
      idea={idea}
      draft={draft}
      onApplyDraft={applyDraft}
    />
  )

  return (
    <div className="fixed inset-0 z-[90] bg-[#0a0a0b] text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 sm:px-5 h-14 border-b border-white/[0.08] flex-shrink-0">
        <button
          type="button" onClick={onClose} aria-label="Back to pipeline"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <TitleField idea={idea} />
          <div className="flex items-center gap-1.5 mt-0.5">
            {idea.lane && (
              <span className="text-[10px] uppercase tracking-[0.1em] text-violet-300/80">{idea.lane.replace(/_/g, ' ')}{idea.lane_slot ? ` · ${idea.lane_slot}` : ''}</span>
            )}
            <span className="text-[10px] uppercase tracking-[0.1em] text-white/35">{idea.state}</span>
            <span className="text-[10px] text-white/30">·</span>
            <span className="text-[10px] text-white/35 tabular-nums">{words} words</span>
            <span className="text-[10px] text-white/30">·</span>
            <span className="text-[10px] text-white/35">
              {saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : dirty ? 'unsaved' : 'saved'}
            </span>
          </div>
        </div>

        {/* Voice status + fix — only meaningful once there's a draft (no
            "voice ok" on a blank page). */}
        {draft.trim() && (
          <button
            type="button" onClick={fixVoice}
            title={emDashes ? `${emDashes} em dash${emDashes === 1 ? '' : 'es'} — click to fix` : warns ? `${warns} voice note${warns === 1 ? '' : 's'}` : 'Voice clean'}
            className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors ${
              emDashes ? 'border-rose-500/40 text-rose-200 hover:bg-rose-500/10'
                : warns ? 'border-amber-500/30 text-amber-200 hover:bg-amber-500/10'
                  : 'border-white/10 text-white/45'
            }`}
          >
            <Check size={11} /> {emDashes ? `${emDashes} em dash` : warns ? `${warns} note` : 'voice ok'}
          </button>
        )}

        {!narrow && <SaveDraftButton idea={idea} draft={draft} onApplyDraft={applyDraft} onSaved={goNext} />}
        {/* Finish one, flow to the next (P-10 / P-22). */}
        {!narrow && nextPiece && (
          <button
            type="button" onClick={goNext}
            title={`Next: ${nextPiece.headline}`}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-[12px] font-medium border border-white/10 text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            Next <ArrowLeft size={14} className="rotate-180" />
          </button>
        )}
      </header>

      {/* Body */}
      {narrow ? (
        <MobileComposerBody
          idea={idea}
          draft={draft}
          emDashes={emDashes}
          onApplyDraft={applyDraft}
          onEditChange={onDraftChange}
          onFixVoice={fixVoice}
          onClose={onClose}
        />
      ) : (
        <div className="flex-1 min-h-0 flex flex-row">
          {/* Canvas */}
          <main className="flex-1 min-w-0 flex flex-col">
            {draft.trim() && (
              <div className="flex items-center justify-center pt-3 flex-shrink-0">
                <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
                  <button
                    type="button" onClick={() => setCanvasMode('read')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                      canvasMode === 'read' ? 'bg-white/[0.09] text-white/90' : 'text-white/45 hover:text-white/75'
                    }`}
                  >
                    <BookOpen size={12} /> Formatted
                  </button>
                  <button
                    type="button" onClick={() => setCanvasMode('write')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
                      canvasMode === 'write' ? 'bg-white/[0.09] text-white/90' : 'text-white/45 hover:text-white/75'
                    }`}
                  >
                    <PenLine size={12} /> Write
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="max-w-[820px] mx-auto px-5 sm:px-10 py-6 pb-28">
                <SynthesisCitationStrip idea={idea} />
                {!draft.trim() && (
                  <EmptyCanvasHint idea={idea} onJump={() => openRail('cleo')} />
                )}
                {canvasMode === 'read' && draft.trim() ? (
                  <div onClick={() => setCanvasMode('write')} title="Click anywhere to edit" className="cursor-text">
                    <RichText text={draft} className="text-[16px] leading-[1.8] text-white/90" />
                  </div>
                ) : (
                  <GrowTextarea
                    value={draft}
                    onChange={onDraftChange}
                    autoFocus={!!draft.trim()}
                    placeholder="Write here, or ask Cleo to start. Paste your research in Materials so she has the full picture."
                    className="w-full min-h-[55vh] bg-transparent resize-none text-[16px] leading-[1.8] text-white/90 placeholder:text-white/25 focus:outline-none"
                  />
                )}
              </div>
            </div>
          </main>

          {/* Desktop rail */}
          <aside className="w-[380px] flex-shrink-0 border-l border-white/[0.08] flex flex-col min-h-0">
            <div className="flex items-center gap-0.5 px-2 pt-2 border-b border-white/[0.06] flex-shrink-0">
              {RAIL_TABS.map(t => (
                <button
                  key={t.id} type="button" onClick={() => setTab(t.id)} title={t.label}
                  aria-label={t.label} aria-pressed={tab === t.id}
                  className={`flex items-center gap-1.5 px-2.5 py-2 text-[11px] rounded-t-md transition-colors ${
                    tab === t.id ? 'bg-white/[0.06] text-white/90' : 'text-white/45 hover:text-white/75'
                  }`}
                >
                  {t.icon}{tab === t.id && <span>{t.label}</span>}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">{railPanel}</div>
          </aside>
        </div>
      )}
    </div>
  )
}

// ── Mobile: review-first body ───────────────────────────────────────────────
// On a phone Krish reviews, makes a quick magic adjustment, previews, and pushes.
// Draft is read by default (no keyboard); one-tap adjustments preview inline;
// Cleo / Materials / Research are secondary sheets; one big sticky Save Draft.

const MAGIC: { key: string; label: string; mode: string; value: string; hint?: string; instruction?: string }[] = [
  { key: 'tighten', label: 'Tighten', mode: 'feedback', value: 'shorter', hint: 'Cut at least a third. Keep the sharpest sentences, lose the connective tissue.' },
  { key: 'hook', label: 'Sharper open', mode: 'feedback', value: 'sharper-hook', hint: 'Rewrite only the opening so the first sentence makes the reader feel mid-argument. No context-setting.' },
  { key: 'ending', label: 'Harder ending', mode: 'feedback', value: 'harder-verdict', hint: 'Replace the ending with a hard, forward-looking verdict. No summary, no question, no CTA.' },
  { key: 'ready', label: 'Make it ready', mode: 'feedback', value: 'custom', instruction: 'Final publish polish: tighten, sharpen the opening and the ending, strip any voice tells and em dashes. Stay true to the draft, never invent.' },
]

function MobileComposerBody({ idea, draft, emDashes, onApplyDraft, onEditChange, onFixVoice, onClose }: {
  idea: ContentIdeaRow
  draft: string
  emDashes: number
  onApplyDraft: (t: string) => void
  onEditChange: (t: string) => void
  onFixVoice: () => void
  onClose: () => void
}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ label: string; text: string } | null>(null)
  const [sheet, setSheet] = useState<null | 'cleo' | 'materials' | 'research'>(null)

  const runMagic = async (m: typeof MAGIC[number]) => {
    if (!draft.trim()) { toast('Nothing to adjust yet — ask Cleo to draft it first.', 'error'); return }
    h.heavy(); setBusy(m.key)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/revise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m.mode, value: m.value, hint: m.hint, instruction: m.instruction, source_text: draft }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setPreview({ label: m.label, text: j.revised }); h.success()
    } catch (e: any) { h.error(); toast(`${m.label} failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Draft: read by default, edit on demand */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {!draft.trim() ? (
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="flex items-center gap-2 text-[13px] text-white/70 mb-1.5"><Sparkles size={14} className="text-violet-300" /> Nothing written yet</div>
            {idea.thesis && <p className="text-[12px] text-white/55 leading-snug mb-2"><span className="text-white/35">Thesis: </span>{idea.thesis}</p>}
            <p className="text-[12px] text-white/50 leading-snug">Tap <button type="button" onClick={() => setSheet('cleo')} className="text-violet-300 underline underline-offset-2">Ask Cleo</button> to draft it, or Edit to write.</p>
          </div>
        ) : edit ? (
          <GrowTextarea
            value={draft} onChange={onEditChange} autoFocus
            className="w-full min-h-[55vh] bg-transparent resize-none text-[16px] leading-[1.75] text-white/90 focus:outline-none"
          />
        ) : (
          <RichText text={draft} className="text-[16px] leading-[1.75] text-white/90" />
        )}
      </div>

      {/* Magic adjust row */}
      {draft.trim() && !edit && (
        <div className="px-3 pt-2 border-t border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
            {MAGIC.map(m => (
              <button
                key={m.key} type="button" disabled={busy !== null} onClick={() => runMagic(m)}
                className={`flex items-center gap-1 whitespace-nowrap px-3 py-2 rounded-full text-[12px] border disabled:opacity-40 ${
                  m.key === 'ready' ? 'border-violet-400/50 bg-violet-500/20 text-violet-100' : 'border-white/12 text-white/75 bg-white/[0.03]'
                }`}
              >
                {busy === m.key ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Secondary actions */}
      <div className="px-3 pb-1 flex items-center gap-1.5 flex-shrink-0 text-white/60">
        <MobileTool icon={<MessageSquare size={14} />} label="Cleo" onClick={() => setSheet('cleo')} />
        <MobileTool icon={<Paperclip size={14} />} label="Materials" onClick={() => setSheet('materials')} />
        <MobileTool icon={<Search size={14} />} label="Research" onClick={() => setSheet('research')} />
        <MobileTool icon={<PenLine size={14} />} label={edit ? 'Done' : 'Edit'} onClick={() => setEdit(e => !e)} active={edit} />
        {emDashes > 0 && (
          <button type="button" onClick={onFixVoice} className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-rose-500/40 text-rose-200 bg-rose-500/10">
            <Check size={12} /> Fix {emDashes}
          </button>
        )}
      </div>

      {/* Sticky push */}
      <div className="px-3 pt-2.5 pb-safe border-t border-white/[0.08] flex-shrink-0 bg-[#0a0a0b]">
        <SaveDraftButton idea={idea} draft={draft} onApplyDraft={onApplyDraft} onSaved={onClose} block />
      </div>

      {/* Magic preview sheet */}
      {preview && (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end">
          <button aria-label="Discard" onClick={() => setPreview(null)} className="absolute inset-0 bg-black/60 animate-fade-in" />
          <div className="relative bg-[#0f0f12] border-t border-white/[0.1] rounded-t-3xl max-h-[85dvh] flex flex-col animate-sheet-up">
            <div className="flex justify-center pt-2.5 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
            <div className="flex items-center gap-1.5 px-4 py-2 text-[13px] text-violet-200/80">
              <Sparkles size={14} /> {preview.label} — preview
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              <RichText text={preview.text} className="text-[15px] leading-relaxed text-white/90" />
            </div>
            <div className="px-4 pt-3 pb-safe border-t border-white/[0.06] flex items-center gap-2">
              <button type="button" onClick={() => { onApplyDraft(preview.text); setPreview(null); toast('Applied.', 'success') }}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-[14px] font-semibold bg-violet-500/90 text-white active:bg-violet-500">
                <Check size={15} /> Keep this
              </button>
              <button type="button" onClick={() => setPreview(null)}
                className="px-4 py-3 rounded-xl text-[14px] border border-white/12 text-white/70 active:bg-white/[0.06]">Discard</button>
            </div>
          </div>
        </div>
      )}

      {/* Cleo / Materials / Research sheets */}
      {sheet && (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end">
          <button aria-label="Close" onClick={() => setSheet(null)} className="absolute inset-0 bg-black/60 animate-fade-in" />
          <div className="relative bg-[#0f0f12] border-t border-white/[0.1] rounded-t-3xl h-[85dvh] flex flex-col animate-sheet-up">
            <div className="flex justify-center pt-2.5 flex-shrink-0"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
            <div className="flex items-center justify-between pl-4 pr-2 py-1.5 flex-shrink-0">
              <div className="flex items-center gap-2 text-[15px] font-medium text-white/90">
                {sheet === 'cleo' ? <><MessageSquare size={16} className="text-violet-300" /> Cleo</> : sheet === 'materials' ? <><Paperclip size={16} className="text-emerald-300" /> Materials</> : <><Search size={16} className="text-emerald-300" /> Research</>}
              </div>
              <button onClick={() => setSheet(null)} aria-label="Close" className="flex items-center justify-center w-10 h-10 rounded-full text-white/50 active:bg-white/[0.08]"><X size={20} /></button>
            </div>
            <div className={`flex-1 min-h-0 px-4 pb-safe ${sheet === 'cleo' ? 'flex flex-col' : 'overflow-y-auto'}`}>
              {sheet === 'cleo' && <CleoChat idea={idea} draft={draft} mobile onUseAsDraft={(t) => { onApplyDraft(t); setSheet(null) }} />}
              {sheet === 'materials' && <MaterialsPanel idea={idea} />}
              {sheet === 'research' && <ResearchPanel idea={idea} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MobileTool({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] press-effect ${active ? 'bg-white/[0.08] text-white/90' : 'text-white/55 active:bg-white/[0.06]'}`}>
      {icon} {label}
    </button>
  )
}

// Auto-growing textarea: the page scrolls, the textarea never does (no nested
// scrollbar inside the canvas). Optionally capped for chat-style inputs.
function GrowTextarea({ value, onChange, className, placeholder, autoFocus, maxPx, onKeyDown }: {
  value: string
  onChange: (t: string) => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
  maxPx?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const h = maxPx ? Math.min(el.scrollHeight, maxPx) : el.scrollHeight
    el.style.height = `${h}px`
    el.style.overflowY = maxPx && el.scrollHeight > maxPx ? 'auto' : 'hidden'
  }, [value, maxPx])
  useEffect(() => {
    const el = ref.current
    if (autoFocus && el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])
  return (
    <textarea
      ref={ref} value={value} onChange={e => onChange(e.target.value)} rows={1}
      placeholder={placeholder} onKeyDown={onKeyDown} className={className} spellCheck
    />
  )
}

// ── Header bits ──────────────────────────────────────────────────────────

function TitleField({ idea }: { idea: ContentIdeaRow }) {
  const [val, setVal] = useState(idea.idea)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setVal(idea.idea) }, [idea.idea])
  const save = async () => {
    setEditing(false)
    const next = val.trim()
    if (!next || next === idea.idea) { setVal(idea.idea); return }
    await fetch('/api/content-ideas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idea.id, idea: next }),
    })
  }
  if (editing) {
    return (
      <input
        autoFocus value={val} onChange={e => setVal(e.target.value)}
        onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(idea.idea); setEditing(false) } }}
        className="w-full bg-transparent text-[14px] font-semibold text-white border-b border-white/20 focus:outline-none focus:border-violet-400/60"
      />
    )
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="text-left w-full truncate text-[14px] font-semibold text-white hover:text-white/80" title="Click to rename">
      {idea.idea}
    </button>
  )
}

interface SaveResult { docUrl: string | null; pending: boolean; channel: string }

function SaveDraftButton({ idea, draft, onApplyDraft, onSaved, block }: { idea: ContentIdeaRow; draft: string; onApplyDraft: (t: string) => void; onSaved: () => void; block?: boolean }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [running, setRunning] = useState(false)   // Final Pass running
  const [menu, setMenu] = useState(false)
  const [pass, setPass] = useState<FinalPassData | null>(null) // review gate open
  const [result, setResult] = useState<SaveResult | null>(null)
  const autoChannel = laneToFactoryChannel(idea.lane, idea.lane_slot)
  const [channel, setChannel] = useState<string>(autoChannel)

  // Save Draft now runs Cleo's Final Pass first (Krish, Q1/Q3): the ship-moment
  // editor reads the whole piece against the venture rubric, then the review gate
  // lets him accept/dismiss and ship. Nothing reaches the factory until Ship.
  const runPass = async () => {
    if (!draft.trim()) { toast('Write or expand a draft first.', 'error'); return }
    h.heavy(); setRunning(true)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/final-pass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_text: draft }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); setPass(j as FinalPassData)
    } catch (e: any) {
      h.error(); toast(`Final pass failed: ${e?.message || 'error'}`, 'error')
    } finally { setRunning(false) }
  }

  // The actual ship: fires the factory and logs the override decision (Q14).
  const ship = async (finalText: string, override: FinalPassShipPayload) => {
    const r = await fetch(`/api/content-ideas/${idea.id}/save-draft`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, source_text: finalText, final_pass: override }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
    h.success()
    onApplyDraft(finalText) // keep the canvas == what shipped
    setPass(null)
    setResult({ docUrl: j.doc_url || null, pending: !!j.doc_pending, channel: j.target_channel || channel })
  }

  return (
    <div className={`relative flex items-center ${block ? 'w-full' : ''}`}>
      <button
        type="button" onClick={runPass} disabled={running}
        title="Run Cleo's final pass, then ship to Google Docs"
        className={`flex items-center justify-center gap-1.5 font-semibold bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors ${
          block ? 'flex-1 py-3 rounded-l-xl text-[14px]' : 'pl-3 pr-2.5 py-2 rounded-l-lg text-[12px]'
        }`}
      >
        {running ? <Loader2 size={block ? 15 : 13} className="animate-spin" /> : <Save size={block ? 15 : 13} />} Save Draft
      </button>
      <button
        type="button" onClick={() => setMenu(m => !m)} disabled={busy}
        title="Choose channel" aria-label="Choose channel"
        className={`bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-50 border-l border-violet-300/30 text-[10px] ${
          block ? 'px-3 py-3 rounded-r-xl' : 'px-1.5 py-2 rounded-r-lg'
        }`}
      >
        ▾
      </button>
      {menu && (
        <div className={`absolute ${block ? 'right-0 bottom-full mb-1' : 'right-0 top-full mt-1'} w-52 rounded-lg border border-white/10 bg-[#0c0c0e] shadow-xl z-40 overflow-hidden`} onMouseLeave={() => setMenu(false)}>
          <div className="px-3 py-1.5 text-[9px] uppercase tracking-wide text-white/35">Save as a draft for</div>
          {FACTORY_CHANNELS.map(c => (
            <button
              key={c.value} type="button"
              onClick={() => { setChannel(c.value); setMenu(false) }}
              className={`w-full text-left px-3 py-2 text-[12px] hover:bg-white/[0.05] ${channel === c.value ? 'text-violet-200' : 'text-white/80'}`}
            >
              {channel === c.value ? '✓ ' : ''}{c.label}{c.value === autoChannel ? ' (from lane)' : ''}
            </button>
          ))}
        </div>
      )}

      {pass && (
        <FinalPassReview
          pass={pass}
          original={draft}
          channelLabel={FACTORY_CHANNELS.find(c => c.value === channel)?.label || channel}
          onShip={ship}
          onApplyDraft={onApplyDraft}
          onClose={() => setPass(null)}
          onRerun={async (lenses) => {
            const r = await fetch(`/api/content-ideas/${idea.id}/final-pass`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source_text: draft, lenses }),
            })
            const j = await r.json().catch(() => ({}))
            if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
            return j as FinalPassData
          }}
        />
      )}

      {result && (
        <SavedToDocsModal
          result={result}
          onClose={() => setResult(null)}
          onDone={() => { setResult(null); onSaved() }}
        />
      )}
    </div>
  )
}

// ── Final Pass: the ship-moment review gate ─────────────────────────────────
// Cleo's last read against the venture rubric. Auto-fixed errors are already
// folded into pass.cleaned_text; here Krish accepts/dismisses content
// suggestions, dials Techonomic lenses, eyeballs [VERIFY] flags and the Five
// Standards, then ships. An instant-fail hard-blocks the ship (Q1). What he
// dismisses or overrides is logged so the rubric tunes to his taste (Q14).

interface PassSuggestionUI {
  id: string; dimension: string; severity: 'high' | 'med' | 'low'
  quote: string; issue: string; suggestion: string; rewrite?: string | null
}
interface FinalPassData {
  venture: string; venture_label: string; has_lenses: boolean
  cleaned_text: string; changed: boolean
  instant_fail: { failed: boolean; reasons: string[] }
  autofixes: { kind: string; before: string; after: string; note?: string }[]
  suggestions: PassSuggestionUI[]
  lenses: { key: string; label: string; present: boolean; note?: string }[]
  verify: { quote: string; claim: string; why: string }[]
  standards: Record<string, { score: number; note: string }>
  verdict: string
}
interface FinalPassShipPayload {
  venture: string; verdict: string; ran: boolean; accepted: number
  dismissed: { dimension: string; issue: string }[]
  shipped_with_open: { dimension: string; issue: string }[]
  lenses_demanded: string[]
}

const DIM_LABEL: Record<string, string> = {
  clarity: 'Clearer', evidence: 'Evidenced', narration: 'Narrated', harden: 'Hardened',
  soften: 'Softened', impact: 'More impactful', structure: 'Structure', factual: 'Factual risk',
  voice: 'Voice', kind: 'Kindness',
}
const SEV_STYLE: Record<string, string> = {
  high: 'border-rose-500/40 text-rose-200',
  med: 'border-amber-500/30 text-amber-200',
  low: 'border-white/12 text-white/55',
}

function FinalPassReview({ pass, original, channelLabel, onShip, onApplyDraft, onClose, onRerun }: {
  pass: FinalPassData
  original: string
  channelLabel: string
  onShip: (finalText: string, override: FinalPassShipPayload) => Promise<void>
  onApplyDraft: (t: string) => void
  onClose: () => void
  onRerun: (lenses: string[]) => Promise<FinalPassData>
}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [data, setData] = useState<FinalPassData>(pass)
  const [working, setWorking] = useState<string>(pass.cleaned_text)
  const [autofixed, setAutofixed] = useState<boolean>(pass.autofixes.length > 0)
  const [handled, setHandled] = useState<Record<string, 'accepted' | 'dismissed'>>({})
  const [lensSel, setLensSel] = useState<Set<string>>(new Set(pass.lenses.map(l => l.key)))
  const [rerunning, setRerunning] = useState(false)
  const [shipping, setShipping] = useState(false)

  // Re-seed when a re-run swaps the data.
  const reseed = (d: FinalPassData) => {
    setData(d); setWorking(d.cleaned_text); setAutofixed(d.autofixes.length > 0)
    setHandled({}); setLensSel(new Set(d.lenses.map(l => l.key)))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const blocked = data.instant_fail.failed
  const open = data.suggestions.filter(s => !handled[s.id])
  const acceptedCount = Object.values(handled).filter(v => v === 'accepted').length

  const applySuggestion = (s: PassSuggestionUI) => {
    if (!s.rewrite) return
    if (!working.includes(s.quote)) { toast('That passage has changed, dismiss and edit by hand.', 'error'); return }
    setWorking(working.replace(s.quote, s.rewrite)); setHandled(h2 => ({ ...h2, [s.id]: 'accepted' })); h.tap()
  }
  const dismiss = (s: PassSuggestionUI) => { setHandled(h2 => ({ ...h2, [s.id]: 'dismissed' })); h.tap() }

  const revertAutofixes = () => { setWorking(original); setAutofixed(false); toast('Reverted to your exact words.', 'success') }

  const toggleLens = (k: string) => setLensSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const rerun = async () => {
    setRerunning(true)
    try { reseed(await onRerun([...lensSel])); h.success() }
    catch (e: any) { h.error(); toast(`Re-run failed: ${e?.message || 'error'}`, 'error') }
    finally { setRerunning(false) }
  }

  const doShip = async () => {
    if (blocked) return
    setShipping(true)
    try {
      const dismissed = data.suggestions.filter(s => handled[s.id] === 'dismissed').map(s => ({ dimension: s.dimension, issue: s.issue }))
      const openNow = data.suggestions.filter(s => !handled[s.id]).map(s => ({ dimension: s.dimension, issue: s.issue }))
      await onShip(working, {
        venture: data.venture, verdict: data.verdict, ran: true, accepted: acceptedCount,
        dismissed, shipped_with_open: openNow, lenses_demanded: [...lensSel],
      })
    } catch (e: any) { h.error(); toast(`Ship failed: ${e?.message || 'error'}`, 'error'); setShipping(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Final pass review">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-lg max-h-[92dvh] flex flex-col rounded-2xl border border-white/[0.1] bg-[#0f0f12] shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-start gap-2.5 p-4 pb-3 border-b border-white/[0.07] flex-shrink-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${blocked ? 'bg-rose-500/15' : 'bg-violet-500/15'}`}>
            {blocked ? <ShieldAlert size={16} className="text-rose-300" /> : <ShieldCheck size={16} className="text-violet-300" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-white leading-tight">Final pass · {data.venture_label}</h3>
            {data.verdict && <p className="text-[12px] text-white/55 leading-snug mt-0.5">{data.verdict}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex items-center justify-center w-8 h-8 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.06] flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5">
          {/* Instant-fail block */}
          {blocked && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/[0.07] p-3">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-rose-200 mb-1.5">
                <AlertTriangle size={13} /> Can't ship yet, {data.venture_label} instant-fail
              </div>
              <ul className="space-y-1">
                {data.instant_fail.reasons.map((r, i) => (
                  <li key={i} className="text-[12px] text-rose-100/85 leading-snug flex gap-1.5"><span className="text-rose-300/70">·</span>{r}</li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-200/60 mt-2 leading-snug">Fix these in the draft, then Save Draft again to re-run the pass.</p>
            </div>
          )}

          {/* Auto-fixed errors */}
          {data.autofixes.length > 0 && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-200">
                  <Check size={13} /> Cleaned {data.autofixes.length} error{data.autofixes.length === 1 ? '' : 's'} {autofixed ? 'automatically' : '(reverted)'}
                </div>
                <button type="button" onClick={autofixed ? revertAutofixes : () => { setWorking(data.cleaned_text); setAutofixed(true) }}
                  className="text-[10px] px-2 py-1 rounded-md border border-white/12 text-white/55 hover:bg-white/[0.06]">
                  {autofixed ? 'Revert' : 'Re-apply'}
                </button>
              </div>
              {autofixed && (
                <div className="mt-2 space-y-1">
                  {data.autofixes.slice(0, 5).map((f, i) => (
                    <div key={i} className="text-[11px] text-white/55 leading-snug">
                      <span className="line-through text-white/35">{f.before.slice(0, 60)}</span>{' → '}
                      <span className="text-emerald-200/80">{f.after.slice(0, 60)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Techonomic lenses (dial-able) */}
          {data.has_lenses && data.lenses.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/45 mb-2">
                <SlidersHorizontal size={12} /> Investigative lenses
              </div>
              <div className="space-y-1.5">
                {data.lenses.map(l => {
                  const demanded = lensSel.has(l.key)
                  return (
                    <div key={l.key} className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleLens(l.key)}
                        className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border transition-colors ${
                          demanded ? 'border-violet-500/40 text-violet-100 bg-violet-500/15' : 'border-white/10 text-white/45'
                        }`}>
                        {demanded ? <Check size={11} /> : <span className="w-[11px]" />}{l.label}
                      </button>
                      <span className={`text-[11px] flex items-center gap-1 ${l.present ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                        {l.present ? <><Check size={11} /> present</> : <><AlertTriangle size={11} /> missing</>}
                      </span>
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={rerun} disabled={rerunning}
                className="mt-2.5 flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40">
                {rerunning ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Re-run with these lenses
              </button>
            </div>
          )}

          {/* Suggestions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-[0.12em] text-white/45">Suggestions{open.length ? ` (${open.length})` : ''}</span>
              {acceptedCount > 0 && <span className="text-[10px] text-emerald-300/70">{acceptedCount} applied</span>}
            </div>
            {data.suggestions.length === 0 ? (
              <p className="text-[12px] text-white/45 italic">Nothing to flag. Clean as it stands.</p>
            ) : (
              <div className="space-y-2">
                {data.suggestions.map(s => {
                  const state = handled[s.id]
                  return (
                    <div key={s.id} className={`rounded-xl border p-2.5 transition-opacity ${state ? 'opacity-45 border-white/[0.06] bg-transparent' : 'border-white/[0.08] bg-white/[0.02]'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${SEV_STYLE[s.severity]}`}>{DIM_LABEL[s.dimension] || s.dimension}</span>
                        {state && <span className="text-[9px] text-white/40">{state === 'accepted' ? '✓ applied' : 'dismissed'}</span>}
                      </div>
                      {s.quote && <p className="text-[11px] text-white/40 italic leading-snug mb-1 line-clamp-2">"{s.quote}"</p>}
                      <p className="text-[12px] text-white/80 leading-snug">{s.issue}</p>
                      {s.suggestion && <p className="text-[11.5px] text-white/55 leading-snug mt-0.5">{s.suggestion}</p>}
                      {!state && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {s.rewrite && (
                            <button type="button" onClick={() => applySuggestion(s)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-violet-500/25 text-white hover:bg-violet-500/40">
                              <Check size={11} /> Apply
                            </button>
                          )}
                          <button type="button" onClick={() => dismiss(s)}
                            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:bg-white/[0.06]">
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Verify flags */}
          {data.verify.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-amber-300/80 mb-1.5">
                <Search size={12} /> Verify before publishing
              </div>
              <div className="space-y-1.5">
                {data.verify.map((v, i) => (
                  <div key={i}>
                    <p className="text-[12px] text-amber-100/85 leading-snug">{v.claim || v.quote}</p>
                    {v.why && <p className="text-[10.5px] text-amber-200/55 leading-snug">{v.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Five standards */}
          <div className="flex flex-wrap gap-1.5">
            {FIVE_STANDARDS.map(st => {
              const v = data.standards?.[st.key]?.score ?? 0
              if (!v) return null
              const bad = v < 3
              return (
                <span key={st.key} title={data.standards?.[st.key]?.note || st.label}
                  className={`text-[9px] px-1.5 py-0.5 rounded tabular-nums ${bad ? (st.watch ? 'bg-rose-500/20 text-rose-200' : 'bg-amber-500/15 text-amber-200') : 'bg-emerald-500/15 text-emerald-200'}`}>
                  {st.label.split(' ')[0]} {v}/5
                </span>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 p-3.5 border-t border-white/[0.07] flex-shrink-0">
          <button type="button" onClick={onClose} className="px-3 py-2.5 rounded-xl text-[13px] text-white/65 hover:text-white hover:bg-white/[0.06]">
            Back to editing
          </button>
          <button type="button" onClick={doShip} disabled={blocked || shipping}
            title={blocked ? 'Resolve the instant-fail first' : `Ship to ${channelLabel} Google Doc`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[14px] font-semibold bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {shipping ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
            {blocked ? 'Blocked' : open.length ? `Ship anyway (${open.length} open)` : 'Ship to Google Docs'}
          </button>
        </div>
      </div>
    </div>
  )
}

// The post-save popup. The Doc is logged to the pipeline (the card's "Doc" link
// + calendar now point at it) and the piece sits in Review until Krish publishes,
// so the platform keeps following him up. This is just the jump-straight-there
// affordance Krish asked for, plus an honest line about what happens next.
function SavedToDocsModal({ result, onClose, onDone }: { result: SaveResult; onClose: () => void; onDone: () => void }) {
  const channelLabel = FACTORY_CHANNELS.find(c => c.value === result.channel)?.label || result.channel.replace(/_/g, ' ')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Draft saved to Google Docs">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0f0f12] shadow-2xl shadow-black/60 p-5">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <Check size={16} className="text-emerald-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-white leading-tight">
              {result.pending ? 'Building your Google Doc' : 'Saved to Google Docs'}
            </h3>
            <p className="text-[11px] text-white/45">{channelLabel} · logged to the pipeline</p>
          </div>
        </div>

        {result.docUrl ? (
          <a
            href={result.docUrl} target="_blank" rel="noreferrer noopener"
            className="mt-3 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[14px] font-semibold bg-violet-500/90 text-white hover:bg-violet-500 transition-colors"
          >
            <ExternalLink size={15} /> Open in Google Docs
          </a>
        ) : (
          <p className="mt-3 text-[12.5px] text-white/65 leading-snug rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            Cleo is assembling the formatted doc now. The link will land here and she'll ping you on Telegram the moment it's ready.
          </p>
        )}

        <p className="mt-3 text-[12px] text-white/55 leading-snug">
          Next step's on you: review and publish. It stays in <span className="text-amber-200/90">Ready for you</span> until it's live, so it won't slip.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] text-white/60 hover:text-white/85 hover:bg-white/[0.06] transition-colors">
            Stay here
          </button>
          <button type="button" onClick={onDone} className="px-4 py-2 rounded-lg text-[13px] font-medium border border-white/12 text-white/80 hover:bg-white/[0.06] transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * SynthesisCitationStrip — banner shown above the canvas when the open idea
 * is the output of /api/content-ideas/synthesize. Renders:
 *   - cluster_summary (the narrative thread description)
 *   - cohesion_confidence (warns if < 0.6)
 *   - one row per source card with a deep-link back, so Krish can verify the
 *     model isn't hallucinating connections.
 */
function SynthesisCitationStrip({ idea }: { idea: ContentIdeaRow }) {
  const synth = (idea.meta as any)?.synthesis as
    | undefined
    | {
        citation_strip?: Array<{ ref: number; id: string; title: string; source_url?: string | null; source_type?: string | null }>
        cluster_summary?: string | null
        cohesion_confidence?: number | null
        sources_used?: string[]
        sources_discarded?: string[]
        discard_reasons?: string[]
      }
  if (!synth) return null

  const strip = Array.isArray(synth.citation_strip) ? synth.citation_strip : []
  const cohesion = typeof synth.cohesion_confidence === 'number' ? synth.cohesion_confidence : null
  const weak = cohesion != null && cohesion < 0.6

  return (
    <div className={`mb-5 rounded-xl border p-4 ${weak ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-violet-500/25 bg-violet-500/[0.04]'}`}>
      <div className="flex items-start gap-2 mb-2">
        <Sparkles size={13} className={weak ? 'text-amber-300 mt-0.5' : 'text-violet-300 mt-0.5'} />
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] uppercase tracking-[0.12em] font-medium ${weak ? 'text-amber-300/90' : 'text-violet-300/90'}`}>
            Synthesized from {strip.length} card{strip.length === 1 ? '' : 's'}
            {cohesion != null && (
              <span className={`ml-2 text-white/45 tabular-nums normal-case tracking-normal`}>
                cohesion {Math.round(cohesion * 100)}%
              </span>
            )}
          </p>
          {synth.cluster_summary && (
            <p className="mt-1 text-[12.5px] text-white/75 leading-snug">{synth.cluster_summary}</p>
          )}
          {weak && (
            <p className="mt-1 text-[11px] text-amber-200/80">
              Low cohesion — review the citations and consider dropping cards that don't earn a place.
            </p>
          )}
        </div>
      </div>
      {strip.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {strip.map(c => {
            const href = c.source_url || `#/content?idea=${c.id}`
            const external = !!c.source_url
            return (
              <a
                key={c.id}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer noopener' : undefined}
                title={c.title}
                className="inline-flex items-center gap-1 max-w-[260px] px-2 py-1 rounded-md border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <span className="text-[10px] text-violet-300/80 font-mono tabular-nums flex-shrink-0">[{c.ref}]</span>
                <span className="text-[11px] text-white/70 truncate">{c.title || c.id.slice(0, 8)}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyCanvasHint({ idea, onJump }: { idea: ContentIdeaRow; onJump: () => void }) {
  return (
    <div className="mb-5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-[12px] text-white/70 mb-1.5">
        <Sparkles size={13} className="text-violet-300" /> Nothing written yet
      </div>
      {idea.thesis && <p className="text-[12px] text-white/55 leading-snug mb-2"><span className="text-white/35">Thesis: </span>{idea.thesis}</p>}
      <p className="text-[12px] text-white/50 leading-snug">
        Start typing, or{' '}
        <button type="button" onClick={onJump} className="text-violet-300 hover:text-violet-200 underline underline-offset-2">ask Cleo to draft it</button>.
        Drop your research into Materials first so she writes from your corpus, not from scratch.
      </p>
    </div>
  )
}

// ── Rail router ────────────────────────────────────────────────────────────

function RailContent({ tab, idea, draft, onApplyDraft }: {
  tab: RailTab; idea: ContentIdeaRow; draft: string; onApplyDraft: (t: string) => void
}) {
  if (tab === 'cleo') return <CleoChat idea={idea} draft={draft} onUseAsDraft={onApplyDraft} />
  if (tab === 'refine') return <RefinePanel idea={idea} draft={draft} onApplyDraft={onApplyDraft} />
  if (tab === 'materials') return <MaterialsPanel idea={idea} />
  if (tab === 'research') return <ResearchPanel idea={idea} />
  return <StandardsPanel idea={idea} draft={draft} />
}

// ── Cleo chat ────────────────────────────────────────────────────────────

function CleoChat({ idea, draft, onUseAsDraft, mobile }: { idea: ContentIdeaRow; draft: string; onUseAsDraft: (t: string) => void; mobile?: boolean }) {
  const { toast } = useToast()
  const h = useHaptics()
  const seed = useMemo<ChatMsg[]>(() => {
    const hist = Array.isArray((idea.meta as any)?.cleo_chat) ? ((idea.meta as any).cleo_chat as any[]) : []
    return hist.map(m => ({ role: m.role, content: m.content })).filter(m => m.role && m.content)
  }, [idea.id])
  const [msgs, setMsgs] = useState<ChatMsg[]>(seed)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length, busy])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    const next = [...msgs, { role: 'user' as const, content }]
    setMsgs(next); setInput(''); setBusy(true); h.tap()
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, draft }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setMsgs(m => [...m, { role: 'assistant', content: j.reply }])
      h.success()
    } catch (e: any) {
      h.error(); toast(`Cleo: ${e?.message || 'error'}`, 'error')
      setMsgs(m => m.slice(0, -1)); setInput(content)
    } finally { setBusy(false) }
  }

  const quick = draft.trim()
    ? ['Sharpen the opening', 'Make it more contrarian', 'What am I missing?']
    : ['Draft this from my materials', 'Give me three angles', 'What is the sharpest take here?']

  return (
    <div className="flex flex-col h-full">
      {msgs.length === 0 && (
        mobile ? (
          <div className="flex flex-col items-center text-center gap-2.5 pt-10 pb-4 px-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/15 flex items-center justify-center">
              <Sparkles size={24} className="text-violet-300" />
            </div>
            <div className="text-[16px] font-semibold text-white/90">Ask Cleo anything</div>
            <p className="text-[13px] text-white/50 leading-snug max-w-[280px]">
              She knows your voice, this draft, and your materials. Tap a suggestion below or just start typing.
            </p>
          </div>
        ) : (
          <div className="text-[12px] text-white/50 leading-snug mb-3">
            Talk to Cleo like a writing partner. She knows your voice, this draft, and your attached materials. Ask her to draft, sharpen, restructure, or push your thinking.
          </div>
        )
      )}
      <div className={`flex-1 min-h-0 overflow-y-auto space-y-3 ${mobile ? 'py-1' : 'pr-1'}`}>
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`${mobile ? 'rounded-2xl px-3.5 py-2.5 text-[14px]' : 'rounded-xl px-3 py-2 text-[12px]'} leading-relaxed max-w-[92%] ${
              m.role === 'user' ? 'bg-violet-500/20 text-white/90 whitespace-pre-wrap' : 'bg-white/[0.05] text-white/85'
            }`}>
              {m.role === 'assistant' ? <RichText text={m.content} className="[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0" /> : m.content}
              {m.role === 'assistant' && m.content.length > 120 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.08]">
                  <button type="button" onClick={() => { onUseAsDraft(m.content); toast('Set as your draft.', 'success') }}
                    className={`${mobile ? 'text-[12px] px-3 py-1.5' : 'text-[10px] px-2 py-1'} rounded-md border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 active:bg-violet-500/15`}>
                    Use as draft
                  </button>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(m.content); toast('Copied.', 'success') }}
                    className={`${mobile ? 'text-[12px] px-3 py-1.5' : 'text-[10px] px-2 py-1'} rounded-md border border-white/10 text-white/60 hover:bg-white/[0.06] active:bg-white/[0.08]`}>
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-1.5 text-[12px] text-white/45"><Loader2 size={13} className="animate-spin" /> Cleo is thinking…</div>}
        <div ref={endRef} />
      </div>

      <div className={mobile
        ? 'flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pt-2 pb-2 flex-shrink-0'
        : 'flex flex-wrap gap-1 mt-2 mb-1.5'}>
        {quick.map(q => (
          <button key={q} type="button" disabled={busy} onClick={() => send(q)}
            className={mobile
              ? 'whitespace-nowrap text-[13px] px-3.5 py-2 rounded-full border border-white/12 bg-white/[0.04] text-white/70 active:bg-white/[0.1] disabled:opacity-40 press-effect'
              : 'text-[10px] px-2 py-1 rounded-full border border-white/10 text-white/55 hover:bg-white/[0.06] disabled:opacity-40'}>
            {q}
          </button>
        ))}
      </div>
      <div className={`flex items-end gap-2 flex-shrink-0 ${mobile ? 'pb-1' : ''}`}>
        {mobile ? (
          <GrowTextarea
            value={input} onChange={setInput} maxPx={132}
            placeholder="Message Cleo…"
            className="flex-1 rounded-2xl bg-black/40 border border-white/10 px-4 py-2.5 text-[16px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40 resize-none"
          />
        ) : (
          <textarea
            value={input} onChange={e => setInput(e.target.value)} rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            placeholder="Ask Cleo…  (Enter to send, Shift+Enter for a new line)"
            className="flex-1 rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 text-[12px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40 resize-none"
          />
        )}
        <button type="button" onClick={() => send(input)} disabled={busy || !input.trim()}
          className={`flex items-center justify-center bg-violet-500/80 text-white hover:bg-violet-500 disabled:opacity-40 ${
            mobile ? 'w-11 h-11 rounded-full flex-shrink-0 press-effect' : 'w-9 h-9 rounded-lg'
          }`}>
          <Send size={mobile ? 18 : 14} />
        </button>
      </div>
    </div>
  )
}

// ── Refine ─────────────────────────────────────────────────────────────────

function RefinePanel({ idea, draft, onApplyDraft }: { idea: ContentIdeaRow; draft: string; onApplyDraft: (t: string) => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const revise = async (mode: string, value: string, hint?: string, instruction?: string) => {
    if (!draft.trim()) { toast('Nothing to refine yet — write or ask Cleo first.', 'error'); return }
    h.heavy(); setBusy(`${mode}:${value}`)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/revise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, value, hint, instruction, source_text: preview ?? draft }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setPreview(j.revised); h.success()
    } catch (e: any) { h.error(); toast(`Refine failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(null) }
  }

  const chip = (label: string, busyKey: string, onClick: () => void, accent: string) => (
    <button key={busyKey} type="button" disabled={busy !== null} onClick={onClick}
      className={`text-[10px] px-2 py-1 rounded-md border disabled:opacity-40 transition-colors min-h-[32px] ${accent}`}>
      {busy === busyKey ? '…' : label}
    </button>
  )

  return (
    <div className="space-y-3">
      {preview != null ? (
        <div className="rounded-lg border border-violet-500/30 bg-black/30 p-2.5 space-y-2">
          <div className="text-[9px] uppercase tracking-wide text-violet-200/70 flex items-center gap-1"><Sparkles size={10} /> Revised preview</div>
          <p className="text-[12px] text-white/85 leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">{preview}</p>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => { onApplyDraft(preview); setPreview(null); toast('Draft updated.', 'success') }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-violet-500/30 text-white hover:bg-violet-500/40 min-h-[32px]">
              <Check size={11} /> Accept
            </button>
            <button type="button" onClick={() => setPreview(null)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/50 hover:text-white/80 min-h-[32px]">
              <RotateCcw size={11} /> Keep current
            </button>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-white/45 leading-snug">One-click rewrites of the current draft. Each is a preview you accept or discard, never destructive. Adapt-to-lane bundles tone, length, and zoom for that channel.</p>
      )}

      <Group label="Tone">
        {TONE_PRESETS.map(o => chip(o.label, `tone:${o.value}`, () => revise('tone', o.value, o.hint), 'border-rose-500/25 text-rose-200 hover:bg-rose-500/10'))}
      </Group>
      <Group label="Length">
        {LENGTH_PRESETS.map(o => chip(o.label, `length:${o.value}`, () => revise('length', o.value, o.hint), 'border-sky-500/25 text-sky-200 hover:bg-sky-500/10'))}
      </Group>
      <Group label="Zoom">
        {chip('Sharpest angle', 'zoom:contrarian-angle', () => revise('zoom', 'contrarian-angle', ZOOM_DEFAULT_HINT), 'border-amber-500/25 text-amber-200 hover:bg-amber-500/10')}
      </Group>
      <Group label="Iterate">
        {ITERATE_CHIPS.map(o => chip(o.label, `feedback:${o.value}`, () => revise('feedback', o.value, o.hint), 'border-white/10 text-white/65 hover:bg-white/[0.06]'))}
      </Group>
      <Group label="Adapt to lane">
        {LANE_ADAPTS.filter(l => l.value !== laneToFactoryChannel(idea.lane, idea.lane_slot)).map(o =>
          chip(o.label, `feedback:adapt-${o.value}`, () => revise('feedback', `adapt-${o.value}`, o.hint), 'border-violet-500/25 text-violet-200 hover:bg-violet-500/10'))}
      </Group>

      <div className="flex items-end gap-1.5 pt-1">
        <input
          value={feedback} onChange={e => setFeedback(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && feedback.trim()) { revise('feedback', 'custom', undefined, feedback.trim()); setFeedback('') } }}
          placeholder="Tell Cleo exactly what to change…"
          className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 focus:outline-none focus:border-violet-500/40"
        />
        <button type="button" disabled={busy !== null || !feedback.trim()}
          onClick={() => { revise('feedback', 'custom', undefined, feedback.trim()); setFeedback('') }}
          className="flex items-center justify-center w-8 h-8 rounded-md border border-violet-500/25 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40">
          <MessageSquare size={12} />
        </button>
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[9px] text-white/35 w-14 pt-1.5 flex-shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

// ── Materials ───────────────────────────────────────────────────────────────

function MaterialsPanel({ idea }: { idea: ContentIdeaRow }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [materials, setMaterials] = useState<Material[] | null>(null)
  const [mode, setMode] = useState<'paste' | 'link'>('paste')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/materials`)
      const j = await r.json().catch(() => ({}))
      setMaterials(r.ok && j.ok ? j.materials : [])
    } catch { setMaterials([]) }
  }, [idea.id])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (mode === 'paste' && !content.trim()) { toast('Paste some text first.', 'error'); return }
    if (mode === 'link' && !url.trim()) { toast('Add a URL first.', 'error'); return }
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/materials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'paste'
          ? { kind: 'paste', title: title.trim() || undefined, content }
          : { kind: 'link', title: title.trim() || undefined, url }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setMaterials(j.materials); setTitle(''); setContent(''); setUrl(''); h.success()
      toast('Material attached. Cleo will write from it.', 'success')
    } catch (e: any) { h.error(); toast(`Attach failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(false) }
  }

  const remove = async (mid: string) => {
    h.tap()
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/materials?materialId=${mid}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.ok) setMaterials(j.materials)
    } catch { /* noop */ }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-white/45 leading-snug">
        Your research lives here, safely. Paste a corpus, link a source, or run a dive in the Research tab — those land here automatically. Everything attached grounds Cleo's writing and rides into the Google Doc when you Save Draft.
      </p>

      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setMode('paste')} className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ${mode === 'paste' ? 'bg-white/[0.08] text-white/85' : 'text-white/45 hover:text-white/70'}`}><FileText size={11} /> Paste</button>
        <button type="button" onClick={() => setMode('link')} className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ${mode === 'link' ? 'bg-white/[0.08] text-white/85' : 'text-white/45 hover:text-white/70'}`}><Link2 size={11} /> Link</button>
      </div>

      <div className="space-y-1.5">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
          className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40" />
        {mode === 'paste' ? (
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={6}
            placeholder="Paste your research / corpus markdown here…"
            className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40 resize-none" />
        ) : (
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…"
            className="w-full rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40" />
        )}
        <button type="button" onClick={add} disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-violet-500/30 text-white hover:bg-violet-500/40 disabled:opacity-40 min-h-[32px]">
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />} Attach
        </button>
      </div>

      <div className="space-y-1.5 pt-1 border-t border-white/[0.06]">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 pt-1">
          Attached{materials && materials.length ? ` (${materials.length})` : ''}
        </div>
        {materials === null ? (
          <div className="text-[11px] text-white/40">Loading…</div>
        ) : materials.length === 0 ? (
          <div className="text-[11px] text-white/35 italic">No materials attached yet.</div>
        ) : materials.map(m => (
          <div key={m.id} className="flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.015] p-2">
            {m.kind === 'link' ? <Link2 size={11} className="text-sky-300 mt-0.5 flex-shrink-0" />
              : m.kind === 'research' ? <Search size={11} className="text-violet-300 mt-0.5 flex-shrink-0" />
                : <FileText size={11} className="text-emerald-300 mt-0.5 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              {m.kind === 'link' && m.url ? (
                <a href={m.url} target="_blank" rel="noreferrer noopener" className="text-[11px] text-sky-300/90 hover:text-sky-200 truncate block">{m.title || m.url}</a>
              ) : (
                <div className="text-[11px] text-white/80 truncate">{m.title || 'Pasted material'}</div>
              )}
              <div className="text-[9px] text-white/35">
                {m.kind === 'research' ? 'cleo research' : m.kind}
                {typeof m.bytes === 'number' ? ` · ${formatBytes(m.bytes)}` : ''}
                {m.at ? ` · ${shortDate(m.at)}` : ''}
              </div>
            </div>
            <button type="button" onClick={() => remove(m.id)} className="text-white/30 hover:text-rose-300 flex-shrink-0"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function shortDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) } catch { return '' }
}

function formatBytes(n: number): string {
  if (n < 1000) return `${n} chars`
  return `${(n / 1000).toFixed(1)}k chars`
}

// ── Research ──────────────────────────────────────────────────────────────

function ResearchPanel({ idea }: { idea: ContentIdeaRow }) {
  const { toast } = useToast()
  const h = useHaptics()
  const meta = (idea.meta || {}) as any
  const citations: string[] = Array.isArray(meta.research) ? meta.research : []
  const sources: string[] = Array.isArray(meta.sources) ? meta.sources : []
  const links = useMemo(() => Array.from(new Set([idea.source_url, ...citations, ...sources].filter(Boolean))) as string[], [idea.source_url, citations, sources])
  const serverDives: any[] = Array.isArray(meta.deep_dives) ? meta.deep_dives : []
  const [localDives, setLocalDives] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [runningQ, setRunningQ] = useState<string | null>(null)
  const dives = [...serverDives, ...localDives]
  const doneQueries = new Set(dives.map(d => d.query))

  // Cleo's proactive suggestions: generated once per piece the first time the
  // panel opens, cached on the row, refreshable on demand.
  const [sugs, setSugs] = useState<{ query: string; why?: string }[] | null>(
    Array.isArray(meta.research_suggestions?.items) ? meta.research_suggestions.items : null
  )
  const [sugBusy, setSugBusy] = useState(false)

  const suggest = useCallback(async (force = false) => {
    setSugBusy(true)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/dive-deeper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggest: true, force }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && j.ok && Array.isArray(j.suggestions)) setSugs(j.suggestions)
    } catch { /* manual research still works */ }
    finally { setSugBusy(false) }
  }, [idea.id])

  useEffect(() => { if (!sugs) suggest() }, []) // arm the panel on first open

  const dive = async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed || runningQ) return
    setRunningQ(trimmed); h.tap()
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/dive-deeper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: trimmed }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setLocalDives(d => [...d, j.entry]); setQ(''); h.success()
      toast('Research done — attached to Materials.', 'success')
    } catch (e: any) { h.error(); toast(`Research failed: ${e?.message || 'error'}`, 'error') }
    finally { setRunningQ(null) }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-white/40">
            <Sparkles size={10} className="text-violet-300" /> Cleo suggests
          </div>
          <button type="button" onClick={() => suggest(true)} disabled={sugBusy} title="Fresh suggestions" aria-label="Refresh suggestions"
            className="flex items-center justify-center w-7 h-7 rounded-md text-white/35 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-40">
            {sugBusy && sugs ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
          </button>
        </div>
        {sugBusy && !sugs ? (
          <div className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Loader2 size={12} className="animate-spin" /> Cleo is working out what research would strengthen this…
          </div>
        ) : !sugs?.length ? (
          <p className="text-[11px] text-white/35 italic">No suggestions yet. Dig into a specific area below.</p>
        ) : (
          <div className="space-y-1.5">
            {sugs.map(s => {
              const done = doneQueries.has(s.query)
              return (
                <div key={s.query} className="rounded-md border border-white/[0.06] bg-white/[0.015] p-2">
                  <div className="text-[11px] text-white/80 leading-snug">{s.query}</div>
                  {s.why && <div className="text-[10px] text-white/40 leading-snug mt-0.5">{s.why}</div>}
                  <button
                    type="button" onClick={() => dive(s.query)} disabled={!!runningQ || done}
                    className={`mt-1.5 flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border min-h-[28px] ${
                      done ? 'border-emerald-500/25 text-emerald-300/80'
                        : 'border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40'
                    }`}
                  >
                    {done ? <><Check size={10} /> In materials</>
                      : runningQ === s.query ? <><Loader2 size={10} className="animate-spin" /> Researching…</>
                        : <><Search size={10} /> Research this</>}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="pt-1 border-t border-white/[0.06]">
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5">Sources behind this</div>
        {links.length === 0 ? (
          <p className="text-[11px] text-white/35 italic">No sources yet. Run a suggestion above or dig into a specific area.</p>
        ) : (
          <ul className="space-y-1">
            {links.slice(0, 12).map((u, i) => (
              <li key={i} className="min-w-0"><a href={u} target="_blank" rel="noreferrer noopener" className="text-[11px] text-sky-300/80 hover:text-sky-200 truncate block">{prettyUrl(u)}</a></li>
            ))}
          </ul>
        )}
      </div>
      {dives.map((d, i) => (
        <details key={i}>
          <summary className="text-[11px] text-emerald-300/80 cursor-pointer hover:text-emerald-200">↳ {d.query}</summary>
          <p className="text-[11px] text-white/70 leading-relaxed mt-1 whitespace-pre-wrap">{d.findings}</p>
        </details>
      ))}
      <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') dive(q) }}
          placeholder="Dig into a specific area…"
          className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-emerald-500/40" />
        <button type="button" onClick={() => dive(q)} disabled={!!runningQ || !q.trim()}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500/25 text-white hover:bg-emerald-500/35 disabled:opacity-40 flex-shrink-0">
          {runningQ === q.trim() && q.trim() ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        </button>
      </div>
      <p className="text-[10px] text-white/30 leading-snug">Everything researched here is attached to Materials automatically, so Cleo writes from it.</p>
    </div>
  )
}

// ── Standards ─────────────────────────────────────────────────────────────

function StandardsPanel({ idea, draft }: { idea: ContentIdeaRow; draft: string }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const standards = (idea.meta as any)?.standards || null

  const score = async () => {
    if (!draft.trim()) { toast('No draft to score yet.', 'error'); return }
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/score`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source_text: draft }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success(); toast(`Scored: ${j.quality_score}.`, j.quality_score === 'red' ? 'error' : 'success')
    } catch (e: any) { h.error(); toast(`Score failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-white/45 leading-snug">A quick gut-check mid-draft against the five standards. The full per-venture Final Pass runs automatically when you Save Draft, this is the same rubric, earlier.</p>
      <button type="button" onClick={score} disabled={busy}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] border border-emerald-500/25 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40 min-h-[32px]">
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Gauge size={11} />} Score the five standards
      </button>
      {standards && (
        <div className="rounded-md border border-white/[0.06] bg-black/30 p-2 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
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
        </div>
      )}
    </div>
  )
}

function prettyUrl(u: string): string {
  try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname !== '/' ? x.pathname : '') } catch { return u }
}
