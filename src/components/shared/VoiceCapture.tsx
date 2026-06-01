import React, { useRef, useState } from 'react'
import { Mic, Square, Loader2 } from 'lucide-react'

// Shared mic capture. Records audio and POSTs the blob to `endpoint`, then hands
// the parsed JSON to `onJson`. Used by the daily custom-pick textarea, the weekly
// custom-move entry, and the objective-altitude narration. Endpoints differ in
// what they return ({ text } for plain transcription, { transcript, proposal }
// for the objective interpreter), so the caller owns the result shape.

export function browserCanRecord(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined'
  )
}

export function MicButton({
  endpoint,
  onJson,
  onError,
  disabled,
  label,
  size = 12,
}: {
  endpoint: string
  onJson: (j: Record<string, unknown>) => void
  onError?: (reason: string) => void
  disabled?: boolean
  /** When set, renders a labelled pill instead of a bare icon button. */
  label?: string
  size?: number
}) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  if (!browserCanRecord()) return null

  const send = async (blob: Blob) => {
    setBusy(true)
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j && j.ok) onJson(j)
      else onError?.((j?.reason as string) || 'transcription_unavailable')
    } catch {
      onError?.('transcription_failed')
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
        await send(blob)
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch {
      onError?.('mic_denied')
    }
  }

  const stop = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    setRecording(false)
  }

  const icon = busy ? <Loader2 size={size} className="animate-spin" /> : recording ? <Square size={size - 1} /> : <Mic size={size} />

  if (label) {
    return (
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || busy}
        aria-label={recording ? 'Stop recording' : label}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border transition-colors ${
          recording
            ? 'bg-rose-500/25 border-rose-400/50 text-rose-100 animate-pulse'
            : 'bg-violet-500/15 border-violet-400/30 text-violet-100 hover:bg-violet-500/30'
        } disabled:opacity-50`}
      >
        {icon}
        {busy ? 'Transcribing…' : recording ? 'Stop' : label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={recording ? stop : start}
      disabled={disabled || busy}
      aria-label={recording ? 'Stop recording' : 'Record'}
      className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
        recording ? 'bg-rose-500/30 border border-rose-400/50 text-rose-100 animate-pulse' : 'text-white/45 hover:text-white/85'
      } disabled:opacity-50`}
    >
      {icon}
    </button>
  )
}
