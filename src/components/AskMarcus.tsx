import React, { useRef, useState } from 'react'
import { Send, Sparkles } from '@/lib/icons'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { streamText } from '../lib/streamText'
import { useWork } from '../lib/loadingVoice'
import { useElapsed } from '../hooks/useAsyncAction'
import { Pending } from './shared/Pending'
import { Working } from './shared/Working'

interface Exchange {
  id: string
  question: string
  reply?: string
  loading: boolean
  error?: string
}

/**
 * The sixth question. The Business Intelligence tab asks five fixed
 * questions with live answers; this is the open one — a single input in
 * Marcus's serif voice that becomes the conversation once asked. Grounded
 * in live customer, lead and bet data. Idle footprint is one row; history
 * renders above the input as it accumulates.
 */
export function AskMarcus() {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Exchange[]>([])
  const [busy, setBusy] = useState(false)
  const marcus = useWork('ask.marcus')
  const elapsed = useElapsed(busy)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const { toast } = useToast()
  const h = useHaptics()

  // No autofocus on mount: this card mounts with the Intel tab, and stealing
  // focus there pops the phone keyboard into the fixed no-scroll shell — the
  // tab appears to load zoomed in. Focus arrives only from a user's own ask
  // (the refocus in ask()'s finally) or their tap on the box.

  const ask = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    h.heavy()
    const id = crypto.randomUUID()
    setHistory(prev => [...prev, { id, question: q, loading: true }])
    setQuestion('')
    setBusy(true)
    try {
      await streamText<{ reply?: string }>(
        '/api/ask-marcus',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        },
        {
          // Append as it lands. The exchange stops being `loading` on the first
          // chunk, because from that moment there is something to read and a
          // placeholder over the top of it would be a lie.
          onText: chunk => setHistory(prev => prev.map(ex =>
            ex.id === id ? { ...ex, reply: (ex.reply || '') + chunk, loading: false } : ex,
          )),
          // A route that has not been converted still answers with JSON; this
          // is what makes it arrive as one delta instead of nothing.
          jsonText: body => body.reply || '',
        },
      )
      h.success()
      setHistory(prev => prev.map(ex => ex.id === id ? { ...ex, loading: false } : ex))
    } catch (err: any) {
      h.error()
      const msg = String(err?.message || err)
      setHistory(prev => prev.map(ex => ex.id === id ? { ...ex, error: msg, loading: false } : ex))
      toast('Marcus failed to answer — try again.', 'error')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  return (
    <section aria-label="Ask Marcus" className="flex flex-col gap-3">
      {history.length > 0 && (
        <div className="flex flex-col gap-3 border-l-2 border-violet-400/40 pl-3.5">
          {history.map(ex => (
            <div key={ex.id} className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-micro uppercase tracking-[0.14em] text-white/35 mt-0.5 flex-shrink-0">You</span>
                <p className="text-body text-white">{ex.question}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-micro uppercase tracking-[0.14em] text-violet-300 mt-0.5 flex-shrink-0">M</span>
                {ex.loading && <Pending label={marcus.label} elapsedMs={elapsed} expectedMs={marcus.expectedMs} />}
                {ex.error   && <p className="text-label text-red-300">{ex.error}</p>}
                {ex.reply   && <p className="font-serif text-lede text-white/85 leading-relaxed whitespace-pre-wrap">{ex.reply}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question) }}
        className="flex items-end gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-2 pl-3.5 transition-colors focus-within:border-white/[0.18]"
      >
        <Sparkles size={14} className="mb-[11px] shrink-0 text-violet-300/70" aria-hidden />
        <textarea
          ref={inputRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ask(question)
            }
          }}
          rows={1}
          placeholder="Ask the sixth question…"
          disabled={busy}
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
    </section>
  )
}
