import { useRef, useState } from 'react'
import { Search, Mic, Square, CornerDownLeft, X } from '@/lib/icons'
import { Input } from '@/components/ui/input'
import { browserCanRecord } from '../shared/VoiceCapture'
import { Working } from '../shared/Working'

// The one input. Type it or say it.
//
// Recording is inlined rather than reusing shared/VoiceCapture's MicButton
// because that component owns its own fetch: it POSTs to an endpoint and hands
// back parsed JSON. Here the response is a full result set that belongs to the
// page's search state, so the blob is handed up and the page owns the request.
// browserCanRecord is shared, since the capability check is the same everywhere.

const EXAMPLES = [
  'Who should I talk to about identity at a publisher',
  'CMOs at banks who care about AI governance',
  // Geography reads out of the sentence as well as off the chips, so at least
  // one example has to demonstrate it or nobody discovers the typed form.
  'Who do I know in the UK who could introduce me to a publisher',
  'Podcast guests in Australia who have actually shipped an AI product',
]

export function NetworkSearchBar({ onSearch, onVoice, onClear, loading, restated, transcript, hasResults }: {
  onSearch: (q: string) => void
  onVoice: (audio: Blob) => void
  /** Drop the query AND the results, back to the starting state. */
  onClear: () => void
  loading: boolean
  restated?: string
  transcript?: string
  hasResults?: boolean
}) {
  const [q, setQ] = useState('')
  const [recording, setRecording] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chunks = useRef<Blob[]>([])
  const canRecord = browserCanRecord()

  const start = async () => {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = e => { if (e.data?.size) chunks.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        onVoice(new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' }))
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch {
      setMicError('Microphone unavailable. Type instead.')
    }
  }
  const stop = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    setRecording(false)
  }

  const submit = () => { if (q.trim() && !loading) onSearch(q.trim()) }

  // Clearing has to drop the RESULTS too, not just the text. Emptying the field
  // and leaving twenty rows underneath reads as a broken search rather than a
  // fresh start, and it hides the examples and the venture picker behind a
  // query that is no longer there.
  const clear = () => {
    setQ('')
    onClear()
    inputRef.current?.focus()
  }
  const dirty = q.length > 0 || Boolean(restated) || Boolean(hasResults)

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
              // Escape is the keyboard's clear. It matches every search field
              // the operator already uses and costs nothing to support.
              if (e.key === 'Escape' && dirty) { e.preventDefault(); clear() }
            }}
            placeholder="Ask your network anything"
            aria-label="Ask your network anything"
            data-testid="network-search-input"
            icon={<Search size={14} />}
            disabled={recording}
            className={`min-h-[44px] text-ui ${dirty ? 'pr-10' : ''}`}
          />
          {dirty && !recording && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              data-testid="network-search-clear"
              className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {canRecord && (
          <button
            type="button"
            onClick={recording ? stop : start}
            disabled={loading}
            aria-label={recording ? 'Stop recording' : 'Ask by voice'}
            className={`inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-form border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-40 ${
              recording
                ? 'animate-pulse border-rose-400/50 bg-rose-500/20 text-rose-100'
                : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white'}`}
          >
            {recording ? <Square size={14} /> : <Mic size={15} />}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={loading || !q.trim()}
          aria-label="Search"
          data-testid="network-search-submit"
          className="aurora-btn inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-form transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-40"
        >
          {loading ? <Working size={15} /> : <CornerDownLeft size={15} />}
        </button>
      </div>

      {micError && <p className="mt-2 text-label text-amber-300/80">{micError}</p>}
      {recording && <p className="mt-2 text-label text-white/50">Listening. Press stop when you are done.</p>}

      {/* Heard, then understood, then results. In that order, so a mis-hearing
          is caught by reading one line rather than by distrusting twenty rows. */}
      {transcript && (
        <p className="mt-2.5 text-label text-white/45">
          <span className="text-white/30">Heard</span> {transcript}
        </p>
      )}
      {restated && (
        <p className="mt-1.5 text-label text-white/70">
          <span className="text-white/30">Understood</span> {restated}
        </p>
      )}

      {!restated && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map(x => (
            <button
              key={x}
              type="button"
              onClick={() => { setQ(x); onSearch(x) }}
              className="rounded-full border border-white/10 px-2.5 py-1 text-label text-white/45 transition-colors hover:border-white/20 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
