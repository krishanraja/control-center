import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Send } from '@/lib/icons'
import { SlideOver } from './shared/SlideOver'
import { BottomSheet } from './mobile/BottomSheet'
import { Pending } from './shared/Pending'
import { Working } from './shared/Working'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { useElapsed } from '../hooks/useAsyncAction'
import { useQuickCreateListener } from '../lib/quickCreate'
import { streamText } from '../lib/streamText'
import { useWork } from '../lib/loadingVoice'
import { isTypingTarget } from '../lib/hotkeys'
import { TABS } from '../lib/tabs'

/**
 * Talk to the tab you are looking at.
 *
 * Every tab in this app is a view over live rows, and until now the only way
 * to ask a question about any of them was to read them yourself. The two chats
 * that existed were welded to one subtab (Ask Marcus, on OS to Intel) and one
 * record (Cleo, inside a content idea), so six of seven tabs had no way to be
 * asked anything at all.
 *
 * One host, mounted once in App, because the panel is the same everywhere and
 * only its scope changes. It reads the active tab from App rather than being
 * told per call site, which is why the create bus fires a bare 'talk' instead
 * of 'talk:<tab>': the host already knows, and a kind per tab would be seven
 * subscriptions carrying information the host has.
 *
 * The input is a plain textarea that takes focus when the panel opens. That is
 * deliberate and it is the whole input design: Krish dictates with Wispr Flow,
 * which types into whatever is focused, so the correct thing to build is a
 * focused text box and no microphone at all.
 *
 * History is per tab and lives for the session. The transcript is not the
 * artifact here — the actions are, and audit_log keeps the questions. A tab
 * conversation that survived a reload would mostly resurface stale answers
 * about rows that have since changed.
 */

interface Exchange {
  id: string
  question: string
  reply?: string
  loading: boolean
  error?: string
}

interface Turn { role: 'user' | 'assistant'; content: string }

export interface TabChatHostProps {
  /** The active tab id, from App's route state. */
  tab: string
  /** True on the mobile shell — decides sheet vs drawer. */
  narrow: boolean
  /** Route params, so People's ?lane= and OS's ?sub= reach the grounding. */
  params?: Record<string, string>
  /** Hidden while a full-screen overlay owns the screen. */
  suppressed?: boolean
}

function tabLabel(tab: string): string {
  return TABS.find(t => t.id === tab)?.label || 'this tab'
}

export function TabChatHost({ tab, narrow, params, suppressed = false }: TabChatHostProps) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<Exchange[]>([])
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const work = useWork('tab.chat')
  const elapsed = useElapsed(busy)
  const { toast } = useToast()
  const h = useHaptics()

  // One transcript per tab, kept across opens within the session. Switching
  // tabs must not read as "Marcus forgot", and must not carry Growth's thread
  // into Content either.
  const threads = useRef<Map<string, Exchange[]>>(new Map())

  const lane = params?.lane || params?.sub || null
  const label = tabLabel(tab)

  useEffect(() => {
    setHistory(threads.current.get(tab) || [])
    setQuestion('')
  }, [tab])

  useEffect(() => { threads.current.set(tab, history) }, [tab, history])

  const openPanel = useCallback(() => {
    h.select()
    setOpen(true)
  }, [h])

  // The mobile + menu fires this. One kind for all seven tabs.
  useQuickCreateListener('talk', openPanel)

  // ⌘/ — unclaimed. App owns ⌘K and ⌘J, QuickCaptureIdea owns ⌘I.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        if (isTypingTarget(e)) return
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus on open, after the overlay's own mount animation. Immediate focus
  // races Radix's focus trap and loses; the same 30ms delay the idea capture
  // modal uses is what makes dictation land in the box rather than nowhere.
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [open])

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    h.heavy()
    const id = crypto.randomUUID()

    // The turns sent are the thread SO FAR, plus this question. Exchanges that
    // errored carry no assistant turn: replaying a failure as if Marcus had
    // said it would have him answering his own error message.
    const turns: Turn[] = history.flatMap<Turn>(ex =>
      ex.reply && !ex.error
        ? [{ role: 'user', content: ex.question }, { role: 'assistant', content: ex.reply }]
        : [])
    turns.push({ role: 'user', content: q })

    setHistory(prev => [...prev, { id, question: q, loading: true }])
    setQuestion('')
    setBusy(true)
    try {
      await streamText<{ reply?: string }>(
        '/api/tab-chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tab, lane, messages: turns }),
        },
        {
          onText: chunk => setHistory(prev => prev.map(ex =>
            ex.id === id ? { ...ex, reply: (ex.reply || '') + chunk, loading: false } : ex)),
          jsonText: body => body.reply || '',
        },
      )
      h.success()
      setHistory(prev => prev.map(ex => ex.id === id ? { ...ex, loading: false } : ex))
    } catch (err: any) {
      h.error()
      const msg = String(err?.message || err)
      setHistory(prev => prev.map(ex => ex.id === id ? { ...ex, error: msg, loading: false } : ex))
      toast(`Marcus could not answer about ${label} — try again.`, 'error')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const body = (
    <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-1">
      {history.length === 0 && (
        <p className="font-serif text-lede italic text-white/40">
          Ask about {label}. Grounded in what this tab is showing right now.
        </p>
      )}

      {history.map(ex => (
        <div key={ex.id} className="space-y-1.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 text-micro uppercase tracking-[0.14em] text-white/35">You</span>
            <p className="text-body text-white">{ex.question}</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0 text-micro uppercase tracking-[0.14em] text-violet-300">M</span>
            {ex.loading && <Pending label={work.label} elapsedMs={elapsed} expectedMs={work.expectedMs} />}
            {ex.error && <p className="text-label text-red-300">{ex.error}</p>}
            {ex.reply && (
              <p className="whitespace-pre-wrap font-serif text-lede leading-relaxed text-white/85">{ex.reply}</p>
            )}
          </div>
        </div>
      ))}

      <form
        onSubmit={e => { e.preventDefault(); ask(question) }}
        className="sticky bottom-0 flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-base/95 p-2 pl-3.5 backdrop-blur transition-colors focus-within:border-white/[0.18]"
      >
        <MessageCircle size={14} className="mb-[11px] shrink-0 text-violet-300/70" aria-hidden />
        <textarea
          ref={inputRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question) }
          }}
          rows={1}
          placeholder={`Ask about ${label}…`}
          disabled={busy}
          data-testid="tab-chat-input"
          className="flex-1 resize-none bg-transparent p-2 text-body text-white placeholder:font-serif placeholder:italic placeholder:text-white/35 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] px-3.5 py-2 text-label font-semibold text-white/80 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
        >
          {busy ? <Working size={12} /> : <Send size={12} />}
          Ask
        </button>
      </form>
    </div>
  )

  return (
    <>
      {/* Desktop entry. Mobile reaches this through the + sheet, which is why
          the pill matches the ⌘I capture pill's placement and sits above it. */}
      {!suppressed && (
        <button
          type="button"
          onClick={openPanel}
          data-testid="tab-chat-pill"
          className="tab-chat-pill fixed bottom-[4.25rem] right-5 z-30 hidden items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-2 text-violet-200 shadow-lg backdrop-blur transition-colors hover:bg-violet-500/25 min-[900px]:flex"
          title={`Ask about ${label} (⌘+/)`}
        >
          <MessageCircle size={14} />
          <span className="text-label font-medium">Ask {label}</span>
          <kbd className="rounded border border-violet-300/30 bg-violet-500/10 px-1 py-0.5 text-micro font-mono">⌘/</kbd>
        </button>
      )}

      {narrow ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} fullHeight ariaLabel={`Ask about ${label}`}>
          {body}
        </BottomSheet>
      ) : (
        <SlideOver open={open} onClose={() => setOpen(false)} ariaLabel={`Ask about ${label}`} label={`Ask ${label}`}>
          {body}
        </SlideOver>
      )}
    </>
  )
}
