import { useRef, useState } from 'react'
import { Search, Mic, Square, Loader2, CornerDownLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { browserCanRecord } from '../shared/VoiceCapture'

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
  'Someone who can introduce me to a media agency CEO',
  'Podcast guests who have actually shipped an AI product',
]

export function NetworkSearchBar({ onSearch, onVoice, loading, restated, transcript }: {
  onSearch: (q: string) => void
  onVoice: (audio: Blob) => void
  loading: boolean
  restated?: string
  transcript?: string
}) {
  const [q, setQ] = useState('')
  const [recording, setRecording] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
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

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="Ask your network anything"
          aria-label="Ask your network anything"
          icon={<Search size={14} />}
          disabled={recording}
          className="min-h-[44px] text-[14px]"
        />
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
          className="aurora-btn inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-form transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-40"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <CornerDownLeft size={15} />}
        </button>
      </div>

      {micError && <p className="mt-2 text-[12px] text-amber-300/80">{micError}</p>}
      {recording && <p className="mt-2 text-[12px] text-white/50">Listening. Press stop when you are done.</p>}

      {/* Heard, then understood, then results. In that order, so a mis-hearing
          is caught by reading one line rather than by distrusting twenty rows. */}
      {transcript && (
        <p className="mt-2.5 text-[12px] text-white/45">
          <span className="text-white/30">Heard</span> {transcript}
        </p>
      )}
      {restated && (
        <p className="mt-1.5 text-[12.5px] text-white/70">
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
              className="rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] text-white/45 transition-colors hover:border-white/20 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              {x}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
