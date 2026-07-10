import { useCallback, useEffect, useRef, useState } from 'react'

// Shared dictation hook (wave 2): the one-thumb contract says the keyboard only
// appears when summoned, so every mobile text ask leads with the mic. Wraps the
// browser SpeechRecognition API (Chrome/Safari webkit prefix); `supported:false`
// degrades the UI to its text fallback. Single-utterance, en-GB, no interim
// results — the same behavior the brief editor's Tell Cleo shipped with.

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getRecognizer(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined
  return Ctor ? new Ctor() : null
}

export function useDictation(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => getRecognizer() !== null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const cbRef = useRef(onTranscript)
  cbRef.current = onTranscript

  useEffect(() => () => { recRef.current?.stop() }, [])

  const toggle = useCallback(() => {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = getRecognizer()
    if (!rec) return
    recRef.current = rec
    rec.lang = 'en-GB'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript || ''
      if (said) cbRef.current(said)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    setListening(true)
    rec.start()
  }, [listening])

  // For sheet owners: closing an input surface must never leave the mic
  // recording (the hook only auto-stops when its component unmounts).
  const stop = useCallback(() => { recRef.current?.stop() }, [])

  return { listening, supported, toggle, stop }
}
