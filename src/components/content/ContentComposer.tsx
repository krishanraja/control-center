import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Check, FileText, Link2, Loader2, MessageSquare, Paperclip, RotateCcw,
  Save, Search, Send, Sparkles, Trash2, Wand2, X, Gauge,
} from 'lucide-react'
import { useRealtimeContentIdeas, type ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { lintVoice, autoFixVoice, type LintIssue } from '../../lib/voiceLint'
import {
  FACTORY_CHANNELS, FIVE_STANDARDS, ITERATE_CHIPS, LANE_ADAPTS, LENGTH_PRESETS,
  TONE_PRESETS, ZOOM_DEFAULT_HINT, laneToFactoryChannel,
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
  kind: 'paste' | 'link' | 'file'
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
  const [sheetOpen, setSheetOpen] = useState(false) // mobile rail sheet

  // Draft canvas — local source of truth so realtime refreshes never jump the cursor.
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const seededRef = useRef<string | null>(null)

  // Adopt the row's body the first time we see this idea (and when not editing).
  useEffect(() => {
    if (!idea) return
    if (seededRef.current !== idea.id) {
      seededRef.current = idea.id
      setDraft(idea.body || '')
      setDirty(false)
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

  const openRail = (t: RailTab) => { setTab(t); if (narrow) setSheetOpen(true) }

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

        {/* Voice status + fix */}
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

        <SaveDraftButton idea={idea} draft={draft} onSaved={onClose} />
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex flex-row">
        {/* Canvas */}
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-5">
            <div className="max-w-[720px] mx-auto">
              {!draft.trim() && (
                <EmptyCanvasHint idea={idea} onJump={() => openRail('cleo')} />
              )}
              <textarea
                value={draft}
                onChange={e => onDraftChange(e.target.value)}
                placeholder="Write here, or ask Cleo to start. Paste your research in Materials so she has the full picture."
                className="w-full min-h-[60vh] bg-transparent resize-none text-[15px] leading-relaxed text-white/90 placeholder:text-white/25 focus:outline-none"
                spellCheck
              />
            </div>
          </div>
          {emDashes > 0 && (
            <button
              type="button" onClick={fixVoice}
              className="sm:hidden flex items-center justify-center gap-1 mx-4 mb-2 py-2 rounded-lg text-[12px] border border-rose-500/40 text-rose-200 bg-rose-500/10"
            >
              <Check size={12} /> Clear {emDashes} em dash{emDashes === 1 ? '' : 'es'}
            </button>
          )}
        </main>

        {/* Desktop rail */}
        {!narrow && (
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
        )}
      </div>

      {/* Mobile rail: bottom tab bar + sheet */}
      {narrow && (
        <>
          <nav className="flex items-stretch border-t border-white/[0.08] flex-shrink-0">
            {RAIL_TABS.map(t => (
              <button
                key={t.id} type="button" onClick={() => openRail(t.id)}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 text-white/55 active:bg-white/[0.06]"
              >
                {t.icon}<span className="text-[9px]">{t.label}</span>
              </button>
            ))}
          </nav>
          {sheetOpen && (
            <div className="fixed inset-0 z-[95] flex flex-col justify-end">
              <button aria-label="Close" onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-black/60" />
              <div className="relative bg-[#0f0f12] border-t border-white/[0.1] rounded-t-2xl max-h-[78vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[12px] text-white/80">
                    {RAIL_TABS.find(t => t.id === tab)?.icon}
                    {RAIL_TABS.find(t => t.id === tab)?.label}
                  </div>
                  <button onClick={() => setSheetOpen(false)} className="text-white/50 hover:text-white"><X size={16} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3">{railPanel}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
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

function SaveDraftButton({ idea, draft, onSaved }: { idea: ContentIdeaRow; draft: string; onSaved: () => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState(false)
  const autoChannel = laneToFactoryChannel(idea.lane, idea.lane_slot)
  const [channel, setChannel] = useState<string>(autoChannel)

  const save = async () => {
    if (!draft.trim()) { toast('Write or expand a draft first.', 'error'); return }
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/save-draft`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, source_text: draft }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      toast('Saving to Drive. Cleo will ping you on Telegram when the doc is ready.', 'success')
      setTimeout(onSaved, 700)
    } catch (e: any) {
      h.error(); toast(`Save failed: ${e?.message || 'error'}`, 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="relative flex items-center">
      <button
        type="button" onClick={save} disabled={busy}
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-2 rounded-l-lg text-[12px] font-semibold bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Draft
      </button>
      <button
        type="button" onClick={() => setMenu(m => !m)} disabled={busy}
        title="Choose channel" aria-label="Choose channel"
        className="px-1.5 py-2 rounded-r-lg bg-violet-500/90 text-white hover:bg-violet-500 disabled:opacity-50 border-l border-violet-300/30 text-[10px]"
      >
        ▾
      </button>
      {menu && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-white/10 bg-[#0c0c0e] shadow-xl z-40 overflow-hidden" onMouseLeave={() => setMenu(false)}>
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

function CleoChat({ idea, draft, onUseAsDraft }: { idea: ContentIdeaRow; draft: string; onUseAsDraft: (t: string) => void }) {
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
        <div className="text-[12px] text-white/50 leading-snug mb-3">
          Talk to Cleo like a writing partner. She knows your voice, this draft, and your attached materials. Ask her to draft, sharpen, restructure, or push your thinking.
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap max-w-[92%] ${
              m.role === 'user' ? 'bg-violet-500/20 text-white/90' : 'bg-white/[0.05] text-white/85'
            }`}>
              {m.content}
              {m.role === 'assistant' && m.content.length > 120 && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/[0.08]">
                  <button type="button" onClick={() => { onUseAsDraft(m.content); toast('Set as your draft.', 'success') }}
                    className="text-[10px] px-2 py-1 rounded border border-violet-500/30 text-violet-200 hover:bg-violet-500/10">
                    Use as draft
                  </button>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(m.content); toast('Copied.', 'success') }}
                    className="text-[10px] px-2 py-1 rounded border border-white/10 text-white/60 hover:bg-white/[0.06]">
                    Copy
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-1.5 text-[11px] text-white/45"><Loader2 size={12} className="animate-spin" /> Cleo is thinking…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1 mt-2 mb-1.5">
        {quick.map(q => (
          <button key={q} type="button" disabled={busy} onClick={() => send(q)}
            className="text-[10px] px-2 py-1 rounded-full border border-white/10 text-white/55 hover:bg-white/[0.06] disabled:opacity-40">
            {q}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-1.5">
        <textarea
          value={input} onChange={e => setInput(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Ask Cleo…  (Enter to send, Shift+Enter for a new line)"
          className="flex-1 rounded-lg bg-black/40 border border-white/10 px-2.5 py-2 text-[12px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-violet-500/40 resize-none"
        />
        <button type="button" onClick={() => send(input)} disabled={busy || !input.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/80 text-white hover:bg-violet-500 disabled:opacity-40">
          <Send size={14} />
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
        Your research lives here, safely. Paste the markdown corpus you used to bring to Cleo, or link a source. Everything you attach grounds Cleo's writing and rides into the Google Doc when you Save Draft.
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
        {materials === null ? (
          <div className="text-[11px] text-white/40">Loading…</div>
        ) : materials.length === 0 ? (
          <div className="text-[11px] text-white/35 italic">No materials attached yet.</div>
        ) : materials.map(m => (
          <div key={m.id} className="flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.015] p-2">
            {m.kind === 'link' ? <Link2 size={11} className="text-sky-300 mt-0.5 flex-shrink-0" /> : <FileText size={11} className="text-emerald-300 mt-0.5 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              {m.kind === 'link' && m.url ? (
                <a href={m.url} target="_blank" rel="noreferrer noopener" className="text-[11px] text-sky-300/90 hover:text-sky-200 truncate block">{m.title || m.url}</a>
              ) : (
                <div className="text-[11px] text-white/80 truncate">{m.title || 'Pasted material'}</div>
              )}
              <div className="text-[9px] text-white/35">{m.kind}{typeof m.bytes === 'number' ? ` · ${formatBytes(m.bytes)}` : ''}</div>
            </div>
            <button type="button" onClick={() => remove(m.id)} className="text-white/30 hover:text-rose-300 flex-shrink-0"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [busy, setBusy] = useState(false)
  const dives = [...serverDives, ...localDives]

  const dive = async () => {
    const query = q.trim()
    if (!query || busy) return
    setBusy(true); h.tap()
    try {
      const r = await fetch(`/api/content-ideas/${idea.id}/dive-deeper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setLocalDives(d => [...d, j.entry]); setQ(''); h.success(); toast('Added to research.', 'success')
    } catch (e: any) { h.error(); toast(`Dive failed: ${e?.message || 'error'}`, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1.5">Sources behind this</div>
        {links.length === 0 ? (
          <p className="text-[11px] text-white/35 italic">No sources yet. Dive deeper below or attach materials.</p>
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
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') dive() }}
          placeholder="Dig into a specific area…"
          className="flex-1 rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-[11px] text-white/90 placeholder:text-white/30 focus:outline-none focus:border-emerald-500/40" />
        <button type="button" onClick={dive} disabled={busy || !q.trim()}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500/25 text-white hover:bg-emerald-500/35 disabled:opacity-40">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
        </button>
      </div>
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
      <p className="text-[11px] text-white/45 leading-snug">The five standards a piece must clear before it ships. A gut-check, never a blocker.</p>
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
