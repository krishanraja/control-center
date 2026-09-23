import React, { useState } from 'react'
import { ChevronRight } from '@/lib/icons'
import { MobileShell, TabHeader, MobileLoadingScreen } from '../mobile/primitives'
import { AskMarcus } from '../AskMarcus'
import { Eyebrow } from '../shared/Eyebrow'
import { SpendDetailSheet } from './SpendDetailSheet'
import { BetsSheet } from './BetsSheet'
import { MarcusReadSheet } from './MarcusReadSheet'
import {
  useCostingQuestion, useIncomeQuestion, useBrokenQuestion,
  useConvertingQuestion, useDecideQuestion,
  stampDay, TOKEN_TONE, type QuestionState,
} from './questions'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useSpend } from '../../hooks/useSpend'
import { useHaptics } from '../../hooks/useHaptics'

const DAY_MS = 86_400_000

/**
 * Business Intelligence — an interrogation, not a dashboard.
 *
 * Five fixed questions in an unchanging order, each answered live in one
 * line with a one-word state token; opening a question expands its full
 * answer (one at a time on a phone; a rail and pane on desktop). The sixth
 * question is the open one — Ask Marcus. Marcus's headline and dateline
 * crown the page in his serif voice, and his full brief lives one tap
 * behind the dateline; his authored numbers never mix with the system's.
 *
 * The phone's whole glance is one screen; a fully opened question stays
 * under two (pinned in e2e). This replaced the stacked-cards console after
 * Krish rejected it twice — the concept won a blind three-way judging on
 * 2026-08-26 and he approved the rendered mock.
 */
export function BusinessIntelTab({ narrow }: { narrow: boolean }) {
  const h = useHaptics()
  const { intel, loading } = useHomeIntelligence()
  const { spend } = useSpend()

  const [open, setOpen] = useState<string | null>(narrow ? null : 'decide')
  const [servicesOpen, setServicesOpen] = useState(false)
  const [betsOpen, setBetsOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)

  const questions: QuestionState[] = [
    useCostingQuestion({ onOpenServices: () => setServicesOpen(true) }),
    useIncomeQuestion(),
    useBrokenQuestion(),
    useConvertingQuestion(),
    useDecideQuestion({ onOpenBets: () => setBetsOpen(true) }),
  ]

  const toggle = (id: string) => {
    h.select()
    setOpen(prev => (prev === id && narrow ? null : id))
  }

  // The dateline: when it was written, when he writes next (Mon/Wed/Fri).
  const writtenAt = intel.generated_at
  const stale = writtenAt != null && Date.now() - Date.parse(writtenAt) > 4 * DAY_MS
  const dateline = writtenAt
    ? `MARCUS · WRITTEN ${stampDay(writtenAt)}${stale ? '' : ` · NEXT READ ${nextRunDay(writtenAt)}`}`
    : 'MARCUS HAS NOT WRITTEN YET'

  if (narrow && loading && !intel.generated_at && !spend) {
    return <MobileLoadingScreen title="Business Intelligence" />
  }

  const header = (
    <div>
      {intel.summary?.headline && (
        <p className="mt-1.5 font-serif text-lede italic leading-snug text-violet-200/90">
          {intel.summary.headline}
        </p>
      )}
      <button
        type="button"
        data-testid="marcus-brief-open"
        onClick={() => { h.select(); setBriefOpen(true) }}
        className="group mt-1 flex items-center gap-1 text-left"
      >
        <span className="font-mono text-micro font-semibold tracking-[0.14em] text-ink-faint transition-colors group-hover:text-ink-muted">
          {dateline}
        </span>
        <ChevronRight size={11} className="text-ink-faint transition-colors group-hover:text-ink-faint" aria-hidden />
      </button>
    </div>
  )

  const sheets = (
    <>
      {spend && <SpendDetailSheet open={servicesOpen} onClose={() => setServicesOpen(false)} spend={spend} />}
      <BetsSheet open={betsOpen} onClose={() => setBetsOpen(false)} />
      <MarcusReadSheet open={briefOpen} onClose={() => setBriefOpen(false)} />
    </>
  )

  // ── Phone: the accordion ─────────────────────────────────────────────────
  if (narrow) {
    return (
      <MobileShell
        header={
          <div>
            <TabHeader title="Business Intelligence" wrap />
            {header}
          </div>
        }
      >
        <div className="shrink-0 px-5" data-testid="bi-questions">
          {questions.map((q, i) => {
            const isOpen = open === q.id
            return (
              <div
                key={q.id}
                className={`${i < questions.length - 1 || isOpen ? 'border-b border-white/[0.06]' : ''} ${
                  isOpen ? '-mx-5 border-l-2 border-l-violet-400/70 px-5' : ''
                }`}
              >
                <button
                  type="button"
                  data-testid={`bi-q-${q.id}`}
                  aria-expanded={isOpen}
                  onClick={() => toggle(q.id)}
                  className="flex w-full flex-col gap-0.5 py-3 text-left"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-display text-lede font-semibold tracking-tight text-ink">{q.question}</span>
                    <span className={`ml-auto shrink-0 font-mono text-micro font-semibold tracking-[0.14em] ${TOKEN_TONE[q.token.tone]}`}>
                      {q.token.label}
                    </span>
                  </span>
                  <span className="text-ui leading-snug text-ink-faint">
                    {q.answer}
                    <span aria-hidden className="ml-1.5 text-ink-faint">{isOpen ? '⌃' : '⌄'}</span>
                  </span>
                </button>
                {isOpen && <div className="pb-4">{q.detail}</div>}
              </div>
            )
          })}
        </div>

        {/* The sixth question. */}
        <div className="shrink-0 px-5 pt-1">
          <AskMarcus />
        </div>

        {sheets}
      </MobileShell>
    )
  }

  // ── Desktop: the rail and the pane ───────────────────────────────────────
  const active = questions.find(q => q.id === open) || questions[4]

  return (
    <div className="mx-auto max-w-[1080px] h-full min-h-0 flex flex-col">
      <div className="flex-shrink-0">
        <h1 className="text-title font-display font-semibold text-ink tracking-tight leading-tight">Business Intelligence</h1>
        {header}
      </div>

      {/* `gap-14` (56px) between a 400px rail and the pane beside it was the
          widest gutter in the app by a factor of three, and the pane holds one
          short answer — so the surface read as a narrow column with a hole
          where the rest of the screen should be. Measured 2026-09-23: the
          largest unpainted rectangle was 34% of the painted area. */}
      <div className="mt-5 flex gap-8 flex-1 min-h-0 overflow-y-auto pb-2">
        <div className="flex w-[400px] shrink-0 flex-col" data-testid="bi-questions">
          {questions.map(q => {
            const isOpen = active.id === q.id
            return (
              <button
                key={q.id}
                type="button"
                data-testid={`bi-q-${q.id}`}
                aria-expanded={isOpen}
                onClick={() => toggle(q.id)}
                className={`flex flex-col gap-1 border-b border-white/[0.06] py-3.5 text-left transition-colors ${
                  isOpen ? '-ml-[18px] border-l-2 border-l-violet-400/70 pl-4' : 'hover:bg-white/[0.02]'
                }`}
              >
                <span className="flex items-baseline gap-3">
                  <span className={`font-display text-ui font-semibold tracking-tight ${isOpen ? 'text-ink' : 'text-ink-muted'}`}>{q.question}</span>
                  <span className={`ml-auto shrink-0 font-mono text-micro font-semibold tracking-[0.14em] ${TOKEN_TONE[q.token.tone]}`}>
                    {q.token.label}
                  </span>
                </span>
                <span className={`text-body leading-snug ${isOpen ? 'text-ink-muted' : 'text-ink-faint'}`}>{q.answer}</span>
              </button>
            )
          })}

          {/* The sixth question, docked under the interrogation. */}
          <div className="mt-6">
            <AskMarcus />
          </div>
        </div>

        {/* The pane carries the DETAIL. It used to repeat the question as a
            20px heading, so "What should I decide?" rendered twice on one
            screen — once as the highlighted row in the rail and once as the
            largest text in the pane — with the rail's one-line answer and the
            pane's opening line saying the same thing in two wordings. The row
            is already marked selected three inches to the left; the pane only
            needs to say which row it belongs to, quietly. */}
        <div className="min-w-0 flex-1 pt-1" data-testid="bi-pane">
          <Eyebrow>{active.question}</Eyebrow>
          <div className="mt-3 max-w-[560px]">{active.detail}</div>
        </div>
      </div>

      {sheets}
    </div>
  )
}

/** The next Mon/Wed/Fri after the last write, as a stamp word. */
function nextRunDay(lastIso: string): string {
  const RUN_DAYS = [1, 3, 5] // Mon Wed Fri
  const d = new Date(lastIso)
  if (Number.isNaN(d.getTime())) return ''
  for (let i = 1; i <= 7; i++) {
    const cand = new Date(d.getTime() + i * DAY_MS)
    if (RUN_DAYS.includes(cand.getDay())) {
      return cand.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()
    }
  }
  return ''
}
