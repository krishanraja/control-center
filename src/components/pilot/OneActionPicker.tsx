import React, { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ACTION_STARTERS, isPublishIntent, isVaguePublishIntent, validateConcreteness } from '../../lib/pilotConcreteness'
import {
  buildOne,
  candidateActionText,
  fetchPublishCandidates,
  laneLabel,
  resolveAsk,
  type PublishCandidate,
} from '../../lib/publishCandidates'
import { useHaptics } from '../../hooks/useHaptics'
import { BuildOfferCard, PublishCandidateCard } from './PublishCandidateCard'
import { Tap, VoiceField } from './controls'

/**
 * Naming the one action, without the keyboard and without a dead end.
 *
 * v1 asked for free text and validated it. On a phone that produced a trap: the
 * operator typed "Schedule content for the week", the rule rejected it, and the
 * only way forward was guessing which words the validator wanted. The button
 * read as broken.
 *
 * The guided path fixes that structurally. Picking a starter verb satisfies the
 * verb half of the rule before a single character is typed, so the only thing
 * left to supply is who and what, by voice if you like. Free text is still
 * available for people who want it, now with a rejection that names the actual
 * problem instead of repeating the rule.
 *
 * Publish is different from the other starters: the system holds real
 * inventory for it (content_ideas). A bare Publish tap gets the deterministic
 * best candidate instantly. A TYPED publish intent goes further: the server
 * judges it against the queue (resolve-ask), and when nothing genuinely
 * matches, red mode offers to build the piece right now (build-one) instead of
 * parking the operator's words verbatim. Always substitution or a build offer,
 * never rejection, and the manual path stays one tap away.
 */

interface Props {
  onCommit: (text: string, url?: string) => void | Promise<void>
  saving?: boolean
  submitLabel?: string
  /** Seeds free-text mode, used by the shutdown when editing. */
  initial?: string
}

type AskPhase =
  | null
  | { kind: 'judging' }
  | { kind: 'offer'; reason: string }
  | { kind: 'building' }

const BUILD_STAGES = [
  'Reading the corpus',
  'Drafting in your voice',
  'Holding it to the five standards',
]

/** Calm inline progress for the synchronous build. Honest stages on a slow
 *  clock, no fake percentage, matching red mode's palette (ProcessingOverlay
 *  is a full-screen dashboard surface and does not belong here). */
function BuildingState() {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStage(s => Math.min(s + 1, BUILD_STAGES.length - 1)), 18000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-ink leading-relaxed animate-pulse">{BUILD_STAGES[stage]}.</p>
      <p className="text-[13px] text-ink-faint leading-relaxed">
        About a minute. It lands as a draft you finish, nothing publishes itself.
      </p>
    </div>
  )
}

export function OneActionPicker({ onCommit, saving, submitLabel = 'Lock it in', initial = '' }: Props) {
  const h = useHaptics()
  const [starter, setStarter] = useState<typeof ACTION_STARTERS[number] | null>(null)
  const [rest, setRest] = useState('')
  const [freeform, setFreeform] = useState(Boolean(initial))
  const [text, setText] = useState(initial)
  const [hint, setHint] = useState<string | null>(null)

  // The deterministic publish queue, loaded once on first need.
  const [cands, setCands] = useState<PublishCandidate[] | null>(null)
  const [candIdx, setCandIdx] = useState(0)
  const [candSource, setCandSource] = useState<null | 'starter' | 'freetext' | 'resolver'>(null)
  const [checkingQueue, setCheckingQueue] = useState(false)

  // The judged path: the operator's words, the judge's reason, the build.
  const [keptWords, setKeptWords] = useState('')
  const [judgeReason, setJudgeReason] = useState<string | null>(null)
  const [askPhase, setAskPhase] = useState<AskPhase>(null)

  const composed = starter ? `${starter.verb} ${rest.trim()}`.trim() : ''

  const loadCandidates = async (): Promise<PublishCandidate[]> => {
    if (cands) return cands
    setCheckingQueue(true)
    const list = await fetchPublishCandidates()
    setCands(list)
    setCheckingQueue(false)
    return list
  }

  const pickStarter = async (s: typeof ACTION_STARTERS[number]) => {
    h.select()
    setStarter(s)
    setHint(null)
    if (s.verb !== 'Publish' && s.verb !== 'Post') return
    const list = await loadCandidates()
    if (list.length) {
      setCandIdx(0)
      setCandSource('starter')
    } else {
      setHint('Nothing in the queue is ready to publish. Name it yourself.')
    }
  }

  /** The typed publish path: judge the ask server-side, then either surface
   *  the genuine match, offer the build, or degrade to the deterministic
   *  candidates so a failed route can never dead-end the screen. */
  const judgeAsk = async (askText: string) => {
    setKeptWords(askText)
    setAskPhase({ kind: 'judging' })
    const result = await resolveAsk(askText)

    if (result?.verdict === 'match' && result.candidate) {
      setAskPhase(null)
      setCands([result.candidate])
      setCandIdx(0)
      setJudgeReason(result.reason || null)
      setCandSource('resolver')
      return
    }
    if (result) {
      setAskPhase({ kind: 'offer', reason: result.reason || 'Nothing in the queue genuinely serves that ask.' })
      return
    }

    // Route unreachable: the pre-judgment behavior, verbatim.
    if (isVaguePublishIntent(askText)) {
      const list = await loadCandidates()
      if (list.length) {
        setAskPhase(null)
        setCandIdx(0)
        setCandSource('freetext')
        return
      }
    }
    setAskPhase(null)
    h.notifySuccess()
    onCommit(askText)
  }

  const startBuild = async () => {
    setAskPhase({ kind: 'building' })
    const built = await buildOne(keptWords)
    if (!built) {
      h.warning()
      setAskPhase({ kind: 'offer', reason: 'The build did not come back. Try once more, or name it yourself.' })
      return
    }
    h.notifySuccess()
    const lane = laneLabel(built.lane)
    onCommit(
      `Finish and publish "${built.idea}"${lane ? ` to ${lane}` : ''}`,
      `#/content?idea=${built.id}`,
    )
  }

  const commitGuided = () => {
    if (!rest.trim()) { setHint('Say or type who it goes to.'); h.warning(); return }
    if (starter && (starter.verb === 'Publish' || starter.verb === 'Post')) {
      judgeAsk(composed)
      return
    }
    h.notifySuccess()
    onCommit(composed)
  }

  const commitFree = async () => {
    const check = validateConcreteness(text)
    if (!check.ok) { setHint(check.hint || null); h.warning(); return }
    if (isPublishIntent(text)) {
      await judgeAsk(text.trim())
      return
    }
    h.notifySuccess()
    onCommit(text.trim())
  }

  // ── The ask is being judged ────────────────────────────────────────────────
  if (askPhase?.kind === 'judging') {
    return (
      <p className="text-[13px] text-ink-faint leading-relaxed animate-pulse">
        Judging it against the queue.
      </p>
    )
  }

  // ── The draft is being built ───────────────────────────────────────────────
  if (askPhase?.kind === 'building') {
    return <BuildingState />
  }

  // ── Nothing matched: offer to build it now ─────────────────────────────────
  if (askPhase?.kind === 'offer') {
    return (
      <BuildOfferCard
        reason={askPhase.reason}
        saving={saving}
        onBuild={startBuild}
        onManual={() => { setAskPhase(null); setHint(null) }}
        onKeepMine={keptWords ? () => { h.notifySuccess(); onCommit(keptWords) } : undefined}
      />
    )
  }

  // ── The queue is being consulted ───────────────────────────────────────────
  if (checkingQueue) {
    return (
      <p className="text-[13px] text-ink-faint leading-relaxed animate-pulse">
        Checking the queue for a ready draft.
      </p>
    )
  }

  // ── A real candidate, offered one at a time ────────────────────────────────
  if (candSource && cands && cands[candIdx]) {
    const c = cands[candIdx]
    return (
      <PublishCandidateCard
        candidate={c}
        saving={saving}
        submitLabel={submitLabel}
        preface={candSource === 'resolver'
          ? (judgeReason || 'The queue has a genuine match:')
          : candSource === 'freetext'
            ? (c.tier === 'ready'
              ? 'That names the intent, not the artifact. The queue has one ready:'
              : 'That names the intent, not the artifact. Nothing is fully fresh; the closest:')
            : (c.tier === 'ready'
              ? null
              : 'Nothing is both approved and fresh. The closest:')}
        onAccept={() => {
          h.notifySuccess()
          onCommit(candidateActionText(c), c.url ?? `#/content?idea=${c.id}`)
        }}
        onNext={() => {
          if (candSource === 'resolver') {
            // The judge offered its one genuine match; passing on it means the
            // deck really has nothing for this ask. Offer the build.
            setCandSource(null)
            setAskPhase({ kind: 'offer', reason: 'You passed on the closest match. The rest of the queue is further from the ask.' })
            return
          }
          if (candIdx + 1 < cands.length) {
            setCandIdx(candIdx + 1)
          } else {
            setCandSource(null)
            setHint('That was the whole queue. Name the artifact yourself.')
          }
        }}
        onManual={() => { setCandSource(null); setJudgeReason(null); setHint(null) }}
        onKeepMine={(candSource === 'freetext' || candSource === 'resolver') && keptWords
          ? () => { h.notifySuccess(); onCommit(keptWords) }
          : undefined}
      />
    )
  }

  // ── Free text, for when the starters do not fit ────────────────────────────
  if (freeform) {
    return (
      <div className="flex flex-col gap-4">
        <VoiceField
          value={text}
          onChange={v => { setText(v); setHint(null) }}
          placeholder="Verb, artifact, recipient"
          rows={3}
          autoFocus
        />
        {hint && (
          <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-ink">{hint}</p>
          </div>
        )}
        <Tap onTap={commitFree} disabled={saving || !text.trim()} feel="success">
          {saving ? 'Saving' : submitLabel}
        </Tap>
        <Tap
          variant="quiet"
          className="!min-h-[44px] text-[13px]"
          onTap={() => { h.tap(); setFreeform(false); setHint(null) }}
        >
          Pick from a list instead
        </Tap>
      </div>
    )
  }

  // ── Step 2: the starter is chosen, so only who and what remain ─────────────
  if (starter) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Tap
            variant="secondary"
            ariaLabel="Change the action"
            className="!min-h-[44px] !w-[44px] !px-0 flex items-center justify-center shrink-0"
            onTap={() => { h.tap(); setStarter(null); setRest(''); setHint(null) }}
          >
            <ArrowLeft size={16} />
          </Tap>
          <span className="font-display text-[20px] text-ink">{starter.verb}</span>
        </div>

        <VoiceField
          value={rest}
          onChange={v => { setRest(v); setHint(null) }}
          placeholder={starter.placeholder}
          rows={2}
          autoFocus
        />

        {composed && rest.trim() && (
          <p className="text-[13px] text-ink-faint leading-relaxed">
            Locking in: <span className="text-ink-muted">{composed}</span>
          </p>
        )}
        {hint && <p className="text-[13px] text-ink-muted leading-relaxed">{hint}</p>}

        <Tap onTap={commitGuided} disabled={saving || !rest.trim()} feel="success">
          {saving ? 'Saving' : submitLabel}
        </Tap>
      </div>
    )
  }

  // ── Step 1: pick the action. No keyboard, no rejection possible ────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5">
        {ACTION_STARTERS.map(s => (
          <Tap
            key={s.verb}
            variant="chip"
            className="justify-center flex items-center"
            onTap={() => { pickStarter(s) }}
          >
            {s.label}
          </Tap>
        ))}
      </div>
      <Tap
        variant="quiet"
        className="!min-h-[44px] text-[13px]"
        onTap={() => { h.tap(); setFreeform(true) }}
      >
        Type it myself
      </Tap>
    </div>
  )
}
