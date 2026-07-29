import React, { useState } from 'react'
import type { PilotMode } from '../../types/pilot'
import { computeMode, modeReason, saveMorning } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { INTENTS, type Intent } from '../../lib/pilotIntent'
import { MicButton, browserCanRecord } from '../shared/VoiceCapture'
import { ThumbSlider, ENERGY_NOTCHES, ANXIETY_NOTCHES } from './ThumbSlider'
import { Tap } from './controls'

// The gate. Two drags, two taps, and the dashboard opens on whatever the day is
// actually for.
//
// Everything here is thumb-driven. The scales are sliders with detents so the
// reading is felt as well as given, the word is a chip or a spoken sentence
// rather than a keyboard, and the routing verdict updates live under the finger
// so the consequence of the reading is never a surprise at the end.

const API = import.meta.env.VITE_API_URL ?? ''

interface Props {
  onDone: (mode: PilotMode, intent: Intent | null) => void
}

/** Common openings. Tapping one is faster than typing and just as true. */
const MOOD_CHIPS = [
  'wired', 'flat', 'scattered', 'clear',
  'heavy', 'restless', 'calm', 'behind',
]

export function MorningCheckin({ onDone }: Props) {
  const h = useHaptics()
  const [energy, setEnergy] = useState<number | null>(null)
  const [anxiety, setAnxiety] = useState<number | null>(null)
  const [word, setWord] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [chosen, setChosen] = useState<PilotMode | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const answered = energy !== null && anxiety !== null
  const computed = answered ? computeMode(energy, anxiety) : null
  const mode = chosen ?? computed

  const commit = async () => {
    if (energy === null || anxiety === null || !mode) return
    setSaving(true)
    setError(null)
    try {
      await saveMorning({
        energy, anxiety, one_word: word.trim(), mode,
        intent: intent?.key,
      })
      h.notifySuccess()
      onDone(mode, intent)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-6 py-10 text-ink">
      <div className="w-full max-w-[430px] flex flex-col gap-8">
        <div>
          <h1 className="font-display text-[22px] leading-tight">Before the dashboard.</h1>
          <p className="text-[13px] text-ink-faint mt-1">Two slides. Then it opens.</p>
        </div>

        <ThumbSlider
          label="Energy"
          notches={ENERGY_NOTCHES}
          value={energy}
          onChange={setEnergy}
        />
        <ThumbSlider
          label="Anxiety"
          notches={ANXIETY_NOTCHES}
          value={anxiety}
          onChange={setAnxiety}
        />

        {/* The verdict, live under the finger. Never a surprise at the end. */}
        {answered && mode && (
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] px-4 py-3.5 flex flex-col gap-2">
            <p className="text-[15px] text-ink">
              {mode === 'red' ? 'One action today.' : 'Full dashboard today.'}
            </p>
            <p className="text-[12px] text-ink-faint leading-relaxed">{modeReason(energy, anxiety)}</p>
            <button
              type="button"
              onPointerDown={() => h.impactRigid()}
              onClick={() => setChosen(mode === 'red' ? 'green' : 'red')}
              className="self-start min-h-[40px] text-[12px] text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
            >
              {mode === 'red' ? 'Give me the full dashboard instead' : 'Give me one action instead'}
            </button>
          </div>
        )}

        {/* One word: tap it, say it, or skip it. The keyboard is the last resort. */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink-muted">One word, if you have one</span>
            {browserCanRecord() && (
              <MicButton
                endpoint={`${API}/api/pilot/voice`}
                label="say it"
                onJson={(j) => {
                  const t = typeof j.text === 'string' ? j.text.trim() : ''
                  if (t) { setWord(t); h.success() }
                }}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {MOOD_CHIPS.map(c => (
              <button
                key={c}
                type="button"
                onPointerDown={() => h.select()}
                onClick={() => setWord(word === c ? '' : c)}
                className={`min-h-[44px] px-4 rounded-xl text-[14px] border transition-all active:scale-95 touch-manipulation ${
                  word === c
                    ? 'bg-white/[0.12] border-white/30 text-ink'
                    : 'bg-white/[0.03] border-white/10 text-ink-muted hover:bg-white/[0.07]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {word && !MOOD_CHIPS.includes(word) && (
            <p className="text-[13px] text-ink-muted">{word}</p>
          )}
        </div>

        {/* What today is for. This is what the dashboard opens on. */}
        {mode === 'green' && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] text-ink-muted">What is today for?</span>
            <div className="grid grid-cols-2 gap-2.5">
              {INTENTS.map(i => (
                <button
                  key={i.key}
                  type="button"
                  onPointerDown={() => h.select()}
                  onClick={() => setIntent(intent?.key === i.key ? null : i)}
                  className={`min-h-[52px] px-3 rounded-xl text-[14px] border transition-all active:scale-95 touch-manipulation ${
                    intent?.key === i.key
                      ? 'bg-white/[0.12] border-white/30 text-ink'
                      : 'bg-white/[0.03] border-white/10 text-ink-muted hover:bg-white/[0.07]'
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
            {intent && <p className="text-[12px] text-ink-faint leading-relaxed">{intent.blurb} It opens there.</p>}
          </div>
        )}

        {error && <p className="text-[13px] text-ink-muted">{error}</p>}

        {answered && mode && (
          <Tap
            className="w-full justify-center flex items-center"
            onTap={commit}
            disabled={saving}
            feel="success"
          >
            {saving ? 'Saving' : 'Start'}
          </Tap>
        )}
      </div>
    </div>
  )
}
