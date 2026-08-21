import React, { useEffect, useRef, useState } from 'react'
import { Mic, Square, Inbox, X, Send } from 'lucide-react'
import { useHaptics } from '../../hooks/useHaptics'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'

// Phase 2 of focus + tasks inbox brief. Cmd+J opens this modal. Krish
// types or speaks a raw task; it lands in tasks_inbox, gets classified
// by Sonnet 4.6, and routed to the right agent. Krish sees it return
// to decisions_waiting when the agent needs his input again.

export function isInboxEnabled(): boolean {
  return import.meta.env.VITE_TASKS_INBOX_ENABLED !== 'false'
}

interface Props {
  open: boolean
  onClose: () => void
  source?: 'control_center' | 'mobile'
}

function browserCanRecord(): boolean {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined'
}

export function IdeaCaptureModal({ open, onClose, source = 'control_center' }: Props) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const h = useHaptics()
  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      setText('')
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit() }
    else if (e.key === 'Escape') onClose()
  }

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
        setTranscribing(true)
        try {
          const r = await fetch('/api/tasks-inbox/voice', {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'audio/webm' },
            body: blob,
          })
          const j = await r.json().catch(() => ({}))
          if (j.ok && j.text) setText((cur) => (cur ? `${cur} ${j.text}` : j.text))
          else toast('Voice transcription unavailable. Type instead.', 'error')
        } catch {
          toast('Voice transcription failed. Type instead.', 'error')
        } finally {
          setTranscribing(false)
        }
      }
      rec.start()
      recRef.current = rec
      setRecording(true)
    } catch {
      toast('Microphone access denied.', 'error')
    }
  }

  const stopRecord = () => {
    if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    setRecording(false)
  }

  const submit = async () => {
    const raw = text.trim()
    if (!raw) return
    if (submitting) return
    setSubmitting(true)
    h.tap()
    try {
      const r = await fetch('/api/tasks-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: raw, source }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
      h.success()
      toast(`Inbox: routing to ${j.estimated_agent || 'agent'}.`, 'success')
      setText('')
      onClose()
    } catch (e) {
      h.error()
      toast(`Could not drop: ${(e as Error).message}`, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const canRecord = browserCanRecord()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:pt-24 bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Drop a task">
      <div className="w-full max-w-xl rounded-2xl border border-violet-500/25 bg-base shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-violet-300" />
            <span className="text-label font-semibold uppercase tracking-[0.14em] text-violet-200">Drop a task</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/85" aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="p-5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Anything on your mind. Sonnet will figure out where it belongs and which agent owns it."
            rows={4}
            className="w-full bg-black/30 border border-white/[0.08] rounded-md px-3 py-2 text-ui text-white placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none resize-y"
          />
          <div className="mt-3 flex items-center gap-2">
            {canRecord && (
              <button
                type="button"
                onClick={recording ? stopRecord : startRecord}
                disabled={transcribing || submitting}
                aria-label={recording ? 'Stop recording' : 'Record'}
                className={`h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors ${
                  recording
                    ? 'bg-rose-500/30 border-rose-400/50 text-rose-100 animate-pulse'
                    : 'bg-white/[0.04] border-white/[0.08] text-white/60 hover:text-white/90'
                } disabled:opacity-50`}
              >
                {transcribing ? <Working size={13} /> : (recording ? <Square size={12} /> : <Mic size={13} />)}
              </button>
            )}
            <span className="text-micro text-white/35 hidden sm:inline ml-auto">⌘↵ to drop</span>
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || submitting}
              className="inline-flex items-center gap-1.5 text-label font-semibold text-violet-100 bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/40 rounded-md px-3 py-2 disabled:opacity-50"
            >
              {submitting ? <Working size={12} /> : <Send size={12} />}
              {submitting ? 'Dropping…' : 'Drop in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
