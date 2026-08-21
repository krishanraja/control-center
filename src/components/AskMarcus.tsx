import React, { useEffect, useRef, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
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

const SAMPLE_PROMPTS = [
  'Should I raise Fractionl Circle pricing?',
  "What's the one bet I should kill this week?",
  'Which product is leaking the most MRR?',
  'Which customer should I call first?',
]

/**
 * Pillar 4 — Ask Marcus. Chat surface grounded in live customer/lead/bet
 * data. Mounted on the Intel tab.
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

  useEffect(() => { inputRef.current?.focus() }, [])

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
    <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.03] overflow-hidden">
      <header className="px-4 py-3 border-b border-violet-500/[0.15] flex items-center gap-2">
        <Sparkles size={14} className="text-violet-300" />
        <h2 className="text-body font-semibold text-white">Ask Marcus</h2>
        <span className="text-micro text-violet-200/55 ml-auto">
          Grounded in live customers · leads · bets
        </span>
      </header>

      {history.length === 0 && (
        <div className="px-4 py-4">
          <p className="text-micro text-white/55 mb-2">Try:</p>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_PROMPTS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => ask(p)}
                className="px-2.5 py-1 rounded-full text-micro font-medium border border-white/10 text-white/70 hover:bg-white/[0.06] hover:border-white/20"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto px-4 py-3 space-y-3">
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
              {ex.reply   && <p className="text-body text-white/85 leading-snug whitespace-pre-wrap">{ex.reply}</p>}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question) }}
        className="border-t border-violet-500/[0.12] p-3 flex items-end gap-2"
      >
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
          placeholder="Ask something pointed…"
          disabled={busy}
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg text-body text-white p-2.5 placeholder:text-white/30 focus:outline-none focus:border-white/[0.18] disabled:opacity-50 resize-none"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="px-3 py-2.5 rounded-lg text-label font-semibold bg-violet-500/30 border border-violet-500/40 text-violet-100 hover:bg-violet-500/40 disabled:opacity-40 flex items-center gap-1"
        >
          {busy ? <Working size={12} /> : <Send size={12} />}
          Ask
        </button>
      </form>
    </section>
  )
}
