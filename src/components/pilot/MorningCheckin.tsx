import React, { useMemo, useState } from 'react'
import type { PilotMode, YesterdayRecap } from '../../types/pilot'
import { computeMode, saveMorning } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { INTENTS, type Intent } from '../../lib/pilotIntent'
import { readingFor, stoicFor } from '../../lib/pilotStoic'
import { ANXIETY_ANCHORS, ENERGY_ANCHORS, anxietyColor, energyColor } from '../../lib/pilotColor'
import { bucketFor, type StateBucket } from '../../lib/pilotStoic'
import { MicButton, browserCanRecord } from '../shared/VoiceCapture'
import { ThumbSlider, ENERGY_NOTCHES, ANXIETY_NOTCHES } from './ThumbSlider'
import { Tap } from './controls'

/**
 * The gate, as four screens instead of one long form.
 *
 * The scrolling version was the problem: the heading scrolled away, every
 * section was another grey box, and the whole thing read as paperwork. Each
 * stage now owns exactly one viewport, never scrolls, and asks for one thing.
 *
 * Layout contract, and the reason this holds at any phone height: the shell is
 * a fixed 100dvh flex column with overflow hidden. The header and footer are
 * fixed-height rows; the middle is the only flexible region and it centres its
 * content. Nothing inside can push the page taller than the screen.
 */

const API = import.meta.env.VITE_API_URL ?? ''

interface Props {
  yesterday: YesterdayRecap | null
  today: string
  onDone: (mode: PilotMode, intent: Intent | null) => void
}

// The word must FOLLOW the reading. Offering 'heavy' and 'flat' to someone who
// just said high energy and low anxiety reads as though the check-in was not
// listening, and it teaches him the whole flow is decorative.
// Buckets come from bucketFor(energy, anxiety) so there is one state model, not
// a second one invented here.
const MOOD_CHIPS_BY_BUCKET: Record<StateBucket, string[]> = {
  strong_calm:      ['clear', 'sharp', 'ready', 'light', 'focused', 'up for it'],
  strong_anxious:   ['wired', 'restless', 'urgent', 'buzzing', 'scattered', 'over-caffeinated'],
  depleted_calm:    ['flat', 'slow', 'quiet', 'tired', 'muted', 'low battery'],
  depleted_anxious: ['heavy', 'behind', 'frayed', 'thin', 'wrung out', 'underwater'],
  steady:           ['steady', 'fine', 'even', 'plodding', 'okay', 'warming up'],
}

// Accountability: which venture is today actually for. Mirrors
// venture_registry active ventures; kept short because this is a phone screen
// at 7am, not a picker.
const VENTURE_CHOICES: Array<{ slug: string; label: string }> = [
  { slug: 'mindmaker', label: 'Mindmaker' },
  { slug: 'mymu', label: 'MYMU' },
  { slug: 'mm_ctrl', label: 'CTRL' },
  { slug: 'full_time', label: 'Full Time' },
  { slug: 'fractionl_pulse', label: 'Pulse' },
  { slug: 'legibility', label: 'Legibility' },
]

/** Fallback only for the case where the reading is somehow missing. */
const MOOD_CHIPS_DEFAULT = ['clear', 'steady', 'scattered', 'flat', 'wired', 'heavy']

type Stage = 'read' | 'word' | 'intent' | 'set'

export function MorningCheckin({ yesterday, today, onDone }: Props) {
  const h = useHaptics()
  const [stage, setStage] = useState<Stage>('read')
  const [energy, setEnergy] = useState<number | null>(null)
  const [anxiety, setAnxiety] = useState<number | null>(null)
  // Raw track positions (0..1), streamed by the sliders during the drag so the
  // ambient light answers the finger frame by frame, not notch by notch.
  const [energyT, setEnergyT] = useState<number | null>(null)
  const [anxietyT, setAnxietyT] = useState<number | null>(null)
  const [word, setWord] = useState('')
  const [intent, setIntent] = useState<Intent | null>(null)
  const [chosen, setChosen] = useState<PilotMode | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [venture, setVenture] = useState<string | null>(null)
  const answered = energy !== null && anxiety !== null
  const computed = answered ? computeMode(energy, anxiety) : null
  // Words follow the reading, so the check-in visibly listened.
  const moodChips = answered
    ? MOOD_CHIPS_BY_BUCKET[bucketFor(energy as number, anxiety as number)]
    : MOOD_CHIPS_DEFAULT
  const mode = chosen ?? computed

  const stoic = useMemo(
    () => (answered ? stoicFor(energy, anxiety, today) : null),
    [answered, energy, anxiety, today],
  )

  const stages: Stage[] = mode === 'red' ? ['read', 'word', 'set'] : ['read', 'word', 'intent', 'set']
  const idx = Math.max(0, stages.indexOf(stage))

  const go = (next: Stage) => { h.impactMedium(); setStage(next) }
  const back = () => { h.tap(); setStage(stages[Math.max(0, idx - 1)]) }
  const forward = () => go(stages[Math.min(stages.length - 1, idx + 1)])

  // Optional skip. The gate blocks the whole dashboard until today's check-in
  // exists, so "not now" has to still write a row or the operator is locked out
  // of his own control center by a question he chose not to answer.
  //
  // It writes a NEUTRAL reading (3/3) and green mode, not a real one. The
  // capacity layer only ever reduces what the screen demands, so a neutral
  // reading is the honest default: it asks for nothing extra and hides nothing.
  // `one_word: ''` keeps the row identifiable as skipped rather than answered.
  const skip = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveMorning({ energy: 3, anxiety: 3, one_word: '', mode: 'green', intent: undefined, venture: undefined })
      h.tap()
      onDone('green', null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  const commit = async () => {
    if (energy === null || anxiety === null || !mode) return
    setSaving(true)
    setError(null)
    try {
      await saveMorning({ energy, anxiety, one_word: word.trim(), mode, intent: intent?.key, venture })
      h.notifySuccess()
      onDone(mode, intent)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      setSaving(false)
    }
  }

  // The screen's ambient light: energy glows from the lower left, anxiety from
  // the upper right, each blended along its slider's own anchor strip. Before
  // the first touch the screen is dark; the reading brings the light with it,
  // and the tint stays through the later stages so the whole ritual carries
  // the morning's color.
  const eT = energyT ?? (energy !== null ? (energy - 1) / 4 : null)
  const aT = anxietyT ?? (anxiety !== null ? (anxiety - 1) / 4 : null)
  const ambientLayers = [
    eT !== null ? `radial-gradient(120% 85% at 12% 94%, ${energyColor(eT, 0.22)} 0%, rgba(0,0,0,0) 62%)` : null,
    aT !== null ? `radial-gradient(120% 85% at 88% 4%, ${anxietyColor(aT, 0.18)} 0%, rgba(0,0,0,0) 62%)` : null,
  ].filter(Boolean).join(', ')

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden flex flex-col items-center text-ink">
      {ambientLayers && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: ambientLayers }}
        />
      )}
      <div className="relative w-full max-w-[420px] h-full flex flex-col px-6">

        {/* Header: progress and yesterday, both fixed height */}
        <header className="shrink-0 pt-[calc(env(safe-area-inset-top,0px)+22px)] pb-2">
          {/* Skip sits on the first screen only. Once a reading has been given
              the later stages already have their own way forward, and offering
              an exit next to them would just be a second Next. */}
          {stage === 'read' && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={skip}
                disabled={saving}
                className="-mr-2 -mt-1 mb-1 min-h-[36px] px-2 text-[12px] text-ink-faint transition-colors hover:text-ink-muted disabled:opacity-40 touch-manipulation"
              >
                Skip
              </button>
            </div>
          )}
          <div className="flex items-center gap-1.5" aria-label={`Step ${idx + 1} of ${stages.length}`}>
            {stages.map((s, i) => (
              <span
                key={s}
                className={`h-[3px] rounded-full transition-all duration-300 ${
                  i <= idx ? 'bg-ink/40 flex-1' : 'bg-ink/10 flex-1'
                }`}
              />
            ))}
          </div>
          <p className="mt-3 h-[18px] text-[12px] text-ink-faint truncate">
            {yesterdayLine(yesterday)}
          </p>
        </header>

        {/* The one flexible region. Everything centres here and never overflows. */}
        <main className="flex-1 min-h-0 flex flex-col justify-center py-2">
          {stage === 'read' && (
            <Fade key="read">
              <h1 className="font-display text-[26px] leading-[1.15] mb-7">How is it, honestly?</h1>
              <div className="flex flex-col gap-5">
                <ThumbSlider
                  label="Energy"
                  notches={ENERGY_NOTCHES}
                  value={energy}
                  onChange={setEnergy}
                  anchors={ENERGY_ANCHORS}
                  onLive={setEnergyT}
                />
                <ThumbSlider
                  label="Anxiety"
                  notches={ANXIETY_NOTCHES}
                  value={anxiety}
                  onChange={setAnxiety}
                  anchors={ANXIETY_ANCHORS}
                  onLive={setAnxietyT}
                />
              </div>
              {answered && mode && (
                <div className="mt-7">
                  <p className="font-serif text-[19px] leading-snug text-ink">
                    {mode === 'red' ? 'One action today.' : 'Full dashboard today.'}
                  </p>
                  <button
                    type="button"
                    onPointerDown={() => h.impactRigid()}
                    onClick={() => setChosen(mode === 'red' ? 'green' : 'red')}
                    className="mt-1.5 min-h-[36px] text-[12px] text-ink-faint hover:text-ink-muted underline underline-offset-4 transition-colors touch-manipulation"
                  >
                    {mode === 'red' ? 'Give me the dashboard instead' : 'Give me one action instead'}
                  </button>
                </div>
              )}
            </Fade>
          )}

          {stage === 'word' && (
            <Fade key="word">
              <div className="flex items-start justify-between gap-3 mb-6">
                <h1 className="font-display text-[26px] leading-[1.15]">One word for it.</h1>
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
              <div className="grid grid-cols-2 gap-2.5">
                {moodChips.map(c => (
                  <button
                    key={c}
                    type="button"
                    onPointerDown={() => h.select()}
                    onClick={() => { setWord(word === c ? '' : c); if (word !== c) setTimeout(forward, 140) }}
                    className={`min-h-[52px] rounded-2xl text-[15px] border transition-all active:scale-[0.97] touch-manipulation ${
                      word === c
                        ? 'bg-ink/[0.10] border-ink/25 text-ink'
                        : 'bg-ink/[0.02] border-ink/[0.08] text-ink-muted'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {word && !moodChips.includes(word) && (
                <p className="mt-4 text-[14px] text-ink-muted truncate">{word}</p>
              )}
            </Fade>
          )}

          {stage === 'intent' && (
            <Fade key="intent">
              <h1 className="font-display text-[26px] leading-[1.15] mb-6">What is today for?</h1>
              <div className="flex flex-col gap-2">
                {INTENTS.map(i => (
                  <button
                    key={i.key}
                    type="button"
                    onPointerDown={() => h.select()}
                    onClick={() => { setIntent(i); h.select() }}
                    className={`min-h-[52px] px-4 rounded-2xl text-[15px] text-left border transition-all active:scale-[0.98] touch-manipulation ${
                      intent?.key === i.key
                        ? 'bg-ink/[0.10] border-ink/25 text-ink'
                        : 'bg-ink/[0.02] border-ink/[0.08] text-ink-muted'
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>

              {/* Krish: "if I select one of these, ideally I can choose which
                  venture to focus on as well, for accountability." The intent
                  says what KIND of day it is; the venture says what it is FOR.
                  Only appears once an intent is picked, so the screen stays a
                  single decision until it has been made. */}
              {intent && (
                <div className="mt-6">
                  <p className="text-[12px] uppercase tracking-[0.16em] text-ink-faint mb-2.5">
                    On what?
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {VENTURE_CHOICES.map(v => (
                      <button
                        key={v.slug}
                        type="button"
                        onPointerDown={() => h.select()}
                        onClick={() => {
                          setVenture(venture === v.slug ? null : v.slug)
                          if (venture !== v.slug) setTimeout(forward, 160)
                        }}
                        className={`min-h-[48px] rounded-2xl text-[14px] border transition-all active:scale-[0.97] touch-manipulation ${
                          venture === v.slug
                            ? 'bg-ink/[0.10] border-ink/25 text-ink'
                            : 'bg-ink/[0.02] border-ink/[0.08] text-ink-muted'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setVenture(null); forward() }}
                    className="mt-3 text-[13px] text-ink-faint underline underline-offset-4"
                  >
                    Skip, no single venture today
                  </button>
                </div>
              )}
            </Fade>
          )}

          {stage === 'set' && stoic && (
            <Fade key="set">
              <p className="text-[12px] uppercase tracking-[0.16em] text-ink-faint">
                {readingFor(energy as number, anxiety as number)}
              </p>
              <blockquote className="mt-4 font-serif text-[22px] leading-[1.35] text-ink">
                {stoic.quote}
              </blockquote>
              <p className="mt-3 text-[12px] tracking-wide text-ink-faint">{stoic.source}</p>
              <p className="mt-7 text-[15px] leading-relaxed text-ink-muted">{stoic.so}</p>
              {intent && (
                <p className="mt-5 text-[13px] text-ink-faint">{intent.blurb}</p>
              )}
              {error && <p className="mt-4 text-[13px] text-ink-muted">{error}</p>}
            </Fade>
          )}
        </main>

        {/* Footer: one action, fixed height, always reachable without scrolling */}
        <footer className="shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-2 flex items-center gap-3">
          {idx > 0 && (
            <button
              type="button"
              onClick={back}
              className="min-h-[52px] px-4 text-[13px] text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
            >
              Back
            </button>
          )}
          {stage === 'set' ? (
            <Tap className="flex-1 justify-center flex items-center !min-h-[54px]" onTap={commit} disabled={saving} feel="success">
              {saving ? 'Saving' : 'Start'}
            </Tap>
          ) : (
            <Tap
              className="flex-1 justify-center flex items-center !min-h-[54px]"
              onTap={forward}
              disabled={stage === 'read' && !answered}
              feel="impactMedium"
            >
              {stage === 'read' ? 'Next' : 'Skip'}
            </Tap>
          )}
        </footer>
      </div>
    </div>
  )
}

/** A stage entrance. Short, so it never feels like waiting. */
function Fade({ children }: { children: React.ReactNode }) {
  return <div className="animate-[pilotIn_260ms_ease-out] will-change-transform">{children}</div>
}

/** Yesterday in one line, or a quiet placeholder on the first ever day. */
function yesterdayLine(y: YesterdayRecap | null): string {
  if (!y || y.energy === null || y.anxiety === null) return 'First light.'
  const state = readingFor(y.energy, y.anxiety).replace(/\.$/, '')
  const word = y.one_word ? `, ${y.one_word}` : ''
  const ships = y.ships === 0
    ? 'nothing left the machine'
    : `${y.ships} ${y.ships === 1 ? 'ship' : 'ships'}`
  return `Yesterday: ${state.toLowerCase()}${word}. ${ships}.`
}
