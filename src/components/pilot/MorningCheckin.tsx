import React, { useState } from 'react'
import type { PilotMode } from '../../types/pilot'
import { computeMode, modeReason, saveMorning } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { Tap } from './controls'

// The gate. Three taps, under ten seconds, and the dashboard is unreachable
// until it is answered. Not hostile, just unavoidable: the cost of answering is
// deliberately lower than the cost of trying to route around it.

interface Props {
  onDone: (mode: PilotMode) => void
}

function Scale({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number) => void }) {
  const h = useHaptics()
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onPointerDown={() => h.select()}
            onClick={() => onChange(n)}
            aria-label={`${label} ${n}`}
            className={`flex-1 min-h-[56px] rounded-xl text-[17px] border transition-all duration-100 active:scale-95 touch-manipulation ${
              value === n
                ? 'bg-white/[0.12] border-white/30 text-ink'
                : 'bg-white/[0.03] border-white/10 text-ink-muted hover:bg-white/[0.07]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export function MorningCheckin({ onDone }: Props) {
  const h = useHaptics()
  const [energy, setEnergy] = useState<number | null>(null)
  const [anxiety, setAnxiety] = useState<number | null>(null)
  const [oneWord, setOneWord] = useState('')
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
      await saveMorning({ energy, anxiety, one_word: oneWord.trim(), mode })
      h.notifySuccess()
      onDone(mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-6 py-10 text-ink">
      <div className="w-full max-w-[420px] flex flex-col gap-7">
        <div>
          <h1 className="font-display text-[22px] leading-tight">Before the dashboard.</h1>
          <p className="text-[13px] text-ink-faint mt-1">Three taps. Then it opens.</p>
        </div>

        <Scale label="Energy" value={energy} onChange={setEnergy} />
        <Scale label="Anxiety" value={anxiety} onChange={setAnxiety} />

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] text-ink-muted">One word, if you have one</span>
          <input
            value={oneWord}
            onChange={e => setOneWord(e.target.value)}
            placeholder="Optional"
            className="w-full px-4 py-3.5 min-h-[52px] rounded-xl bg-white/[0.03] border border-white/10 text-[16px] text-ink placeholder:text-ink-faint outline-none focus:border-white/25"
          />
        </div>

        {answered && mode && (
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-[13px] text-ink-muted">
              {mode === 'red' ? 'One action today.' : 'Full dashboard today.'}
              <span className="text-ink-faint"> {modeReason(energy, anxiety)}</span>
            </p>

            <button
              type="button"
              onPointerDown={() => h.impactRigid()}
              onClick={() => setChosen(mode === 'red' ? 'green' : 'red')}
              className="self-start min-h-[44px] text-[13px] text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
            >
              {mode === 'red' ? 'Give me the full dashboard instead' : 'Give me one action instead'}
            </button>

            {error && <p className="text-[12px] text-ink-muted">{error}</p>}

            <Tap className="mt-1 w-full justify-center flex items-center" onTap={commit} disabled={saving} feel="success">
              {saving ? 'Saving' : 'Start'}
            </Tap>
          </div>
        )}
      </div>
    </div>
  )
}
