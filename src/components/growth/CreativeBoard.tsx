import { OptionChips } from '../goals/GoalPickers'
import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Film, Plus, Sparkles, X } from '@/lib/icons'
import { useToast } from '../shared/Toast'
import { BTN_GHOST, BTN_PRIMARY, Chip, EmptyNote, Field, INPUT_CLS, ProductChip, SectionHead } from './atoms'
import { Ask, ComposerShell, LINE_CLS, More, PARA_CLS } from './Composer'
import { VoiceField } from '../pilot/controls'
import { failureMessage, requestJson } from '../../lib/apiFetch'
import {
  BATCH_MAX, BATCH_MIN, BOARD_STAGES, PRODUCTS, PRODUCT_LABEL, STAGE_LABEL,
  mondayOf, shortDate,
  type CreativeCardRow, type ProductSlug, type Stage,
} from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'
import { BoardSkeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'
import { useWork } from '../../lib/loadingVoice'

/**
 * B) THE CREATIVE BOARD: the Higgsfield kanban.
 *
 * Krish produces the video himself, so the card exists to hand him the script
 * and the shot notes without a second click, and to take the asset and posted
 * URLs back. Stage moves either by drag or by the arrow buttons (the phone has
 * no drag), and both write through /api/growth/creative.
 *
 * The batch cap is the honest part: the agreed run is 3 to 5 script candidates
 * a week, so the header counts this week's batch and says plainly when it is
 * over the line.
 */

const STAGE_TONE: Record<Stage, string> = {
  brief: 'text-white/55 border-white/12',
  script: 'text-violet-300 border-violet-500/30',
  producing: 'text-amber-300 border-amber-500/30',
  produced: 'text-sky-300 border-sky-500/30',
  posted: 'text-emerald-300 border-emerald-500/30',
  dropped: 'text-white/30 border-white/[0.08]',
}

export function CreativeBoard({ g, variant, composeSignal = 0 }: { g: GrowthData; variant: 'desktop' | 'mobile'; composeSignal?: number }) {
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  // The + create sheet's "Add a clip" lands here (via GrowthTab).
  useEffect(() => { if (composeSignal > 0) setAdding(true) }, [composeSignal])
  const [openId, setOpenId] = useState<string | null>(null)
  const [showDropped, setShowDropped] = useState(false)
  const thisWeek = useMemo(() => mondayOf(new Date()), [])

  const live = useMemo(() => g.cards.filter(c => c.stage !== 'dropped'), [g.cards])
  const dropped = useMemo(() => g.cards.filter(c => c.stage === 'dropped'), [g.cards])
  const batch = useMemo(() => live.filter(c => c.batch_week === thisWeek), [live, thisWeek])
  const open = g.cards.find(c => c.id === openId) || null

  const move = async (card: CreativeCardRow, dir: 1 | -1) => {
    const i = BOARD_STAGES.indexOf(card.stage)
    const next = BOARD_STAGES[Math.min(BOARD_STAGES.length - 1, Math.max(0, i + dir))]
    if (!next || next === card.stage) return
    try { await g.patchCard(card.id, { stage: next }) } catch (e) { toast(`Could not move: ${String(e)}`, 'error') }
  }

  const dropOn = async (stage: Stage, id: string) => {
    const card = g.cards.find(c => c.id === id)
    if (!card || card.stage === stage) return
    try { await g.patchCard(id, { stage }) } catch (e) { toast(`Could not move: ${String(e)}`, 'error') }
  }

  const over = batch.length > BATCH_MAX
  const under = batch.length > 0 && batch.length < BATCH_MIN
  const capTone = over
    ? 'border-rose-500/30 bg-rose-500/[0.06]'
    : batch.length >= BATCH_MIN
      ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
      : 'border-white/[0.08] bg-white/[0.02]'

  // The board is lanes of cards, which is exactly what BoardSkeleton restores.
  if (g.loading) {
    return (
      <div className="space-y-4 pb-8">
        <BoardSkeleton lanes={4} cardsPerLane={2} hero={false} />
      </div>
    )
  }

  // Phone: a stacked list by stage, not a kanban. The desk's five columns at
  // 760px wide scrolled sideways inside the vertical scroller, and the h-full
  // frame squeezed them to a 30px sliver under the empty note (seen live,
  // 2026-09-08). On a phone the stages read top to bottom, only the ones
  // holding a card, and the arrows on each card move it.
  const phone = variant === 'mobile'

  return (
    <div className={`space-y-4 pb-8 min-h-0 flex flex-col ${phone ? '' : 'h-full'}`}>
      <SectionHead
        title={phone ? undefined : 'This week\'s clips'}
        sub={phone ? undefined : 'Brief to posted. Drag a card, or use the arrows. The script and shot notes live on the card because you are the one filming.'}
        action={
          // The desk gets an inline create; a phone does not. The + create sheet
          // already carries "Add a clip" through src/lib/quickCreate.ts, so an
          // inline button beside it was a second door to one room and the house
          // rule forbids it on a narrow viewport.
          phone ? undefined : (
            <button type="button" onClick={() => setAdding(a => !a)} className={BTN_PRIMARY}>
              <Plus size={13} className="inline -mt-0.5 mr-1" />{adding ? 'Close' : 'New clip'}
            </button>
          )
        }
      />

      <div className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 ${capTone}`}>
        <Film size={13} className={over ? 'text-rose-300' : 'text-white/45'} />
        <span className="text-label font-semibold text-white/85">Batch week of {shortDate(thisWeek)}</span>
        <span className="text-label tabular-nums text-white/70">{batch.length} of {BATCH_MAX}</span>
        <span className={`text-label ${over ? 'text-rose-300 font-semibold' : 'text-white/45'}`}>
          {over
            ? `Over the cap by ${batch.length - BATCH_MAX}. Drop one before you start producing.`
            : batch.length === 0
              ? `Nothing queued yet. The agreed run is ${BATCH_MIN} to ${BATCH_MAX} a week.`
              : under
                ? `The agreed run is ${BATCH_MIN} to ${BATCH_MAX} a week. Room for ${BATCH_MIN - batch.length} more.`
                : `Inside the agreed ${BATCH_MIN} to ${BATCH_MAX} run.`}
        </span>
        {dropped.length > 0 && (
          <button type="button" onClick={() => setShowDropped(s => !s)} className={`${BTN_GHOST} ml-auto`}>
            {showDropped ? 'Hide' : 'Show'} dropped ({dropped.length})
          </button>
        )}
      </div>

      <AddCard g={g} variant={variant} open={adding} thisWeek={thisWeek} onDone={() => setAdding(false)} />

      {/* One empty state. The strip above already says the week and the count,
          so the note that repeated both and then admitted emptiness a second
          time was the "two cards saying the same thing" on an empty board. This
          one says where a card actually comes from. */}
      {g.cards.length === 0 && (
        <EmptyNote>
          <span data-testid="board-empty">
            No clips yet. Sunday&rsquo;s review is where most of them start: rule on it and each move can
            become a card. {phone ? 'The + button' : 'New clip'} starts one from scratch.
          </span>
        </EmptyNote>
      )}
      {phone ? (
        live.length > 0 && (
          <div className="flex flex-col gap-3">
            {BOARD_STAGES.map(stage => {
              const inStage = live.filter(c => c.stage === stage)
              if (inStage.length === 0) return null
              return (
                <section key={stage} className="rounded-xl border border-white/[0.07] bg-white/[0.015]">
                  <header className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
                    <span className={`text-micro font-semibold uppercase tracking-[0.14em] ${STAGE_TONE[stage].split(' ')[0]}`}>
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="text-micro text-white/35 tabular-nums ml-auto">{inStage.length}</span>
                  </header>
                  <div className="p-2 space-y-2">
                    {inStage.map(c => (
                      <BoardCard key={c.id} card={c} thisWeek={thisWeek} onOpen={() => setOpenId(c.id)} onMove={move} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )
      ) : (
      /* The columns render even at zero cards on the desk: the pipeline is the
         point, and an empty board still has to show what the stages are and
         take a drop. */
      <div className="flex-1 min-h-0 overflow-x-auto">
          <div className="flex gap-3 min-h-0 h-full" style={{ minWidth: variant === 'desktop' ? 940 : 760 }}>
            {BOARD_STAGES.map(stage => {
              const inStage = live.filter(c => c.stage === stage)
              return (
                <div
                  key={stage}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) dropOn(stage, id) }}
                  className="flex-1 min-w-[180px] rounded-xl border border-white/[0.07] bg-white/[0.015] flex flex-col min-h-0"
                >
                  <header className="flex items-center gap-2 px-2.5 py-2 border-b border-white/[0.06]">
                    <span className={`text-micro font-semibold uppercase tracking-[0.14em] ${STAGE_TONE[stage].split(' ')[0]}`}>
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="text-micro text-white/35 tabular-nums ml-auto">{inStage.length}</span>
                  </header>
                  <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[120px]">
                    {inStage.map(c => (
                      <BoardCard
                        key={c.id}
                        card={c}
                        thisWeek={thisWeek}
                        onOpen={() => setOpenId(c.id)}
                        onMove={move}
                      />
                    ))}
                    {inStage.length === 0 && <p className="text-micro text-white/25 px-1 py-2">Nothing here.</p>}
                  </div>
                </div>
              )
            })}
          </div>
      </div>
      )}

      {showDropped && dropped.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
          <h3 className="text-micro uppercase tracking-[0.14em] text-white/35 font-semibold mb-2">Dropped</h3>
          <div className="space-y-1.5">
            {dropped.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-label text-white/40">
                <ProductChip slug={c.product_slug} />
                <span className="truncate">{c.title}</span>
                <button type="button" onClick={() => g.patchCard(c.id, { stage: 'brief' })} className={`${BTN_GHOST} ml-auto`}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && <CardDetail g={g} card={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function BoardCard({ card, thisWeek, onOpen, onMove }: {
  card: CreativeCardRow
  thisWeek: string
  onOpen: () => void
  onMove: (c: CreativeCardRow, dir: 1 | -1) => void
}) {
  const i = BOARD_STAGES.indexOf(card.stage)
  const otherWeek = card.batch_week && card.batch_week !== thisWeek
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', card.id)}
      onClick={onOpen}
      className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 cursor-pointer hover:bg-white/[0.06] transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <ProductChip slug={card.product_slug} />
        {otherWeek && <span className="text-micro text-white/30">{shortDate(card.batch_week)}</span>}
      </div>
      <p className="text-label font-medium text-white/90 leading-snug">{card.title}</p>
      {card.magic_sentence && <p className="text-micro text-white/45 leading-snug mt-1 italic">{card.magic_sentence}</p>}
      {card.target_account && <p className="text-micro text-white/35 mt-1">to {card.target_account}</p>}
      <div className="flex items-center gap-1 mt-1.5">
        {card.script ? <Chip tone="text-violet-300 border-violet-500/25">script</Chip> : null}
        {card.shot_notes ? <Chip tone="text-sky-300 border-sky-500/25">shots</Chip> : null}
        {card.posted_url ? <Chip tone="text-emerald-300 border-emerald-500/25">live</Chip> : null}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Move back a stage"
          onClick={e => { e.stopPropagation(); onMove(card, -1) }}
          disabled={i <= 0}
          className="text-white/35 hover:text-white/80 disabled:opacity-20 min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          aria-label="Move forward a stage"
          onClick={e => { e.stopPropagation(); onMove(card, 1) }}
          disabled={i >= BOARD_STAGES.length - 1}
          className="text-white/35 hover:text-white/80 disabled:opacity-20 min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

function CardDetail({ g, card, onClose }: { g: GrowthData; card: CreativeCardRow; onClose: () => void }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState({
    script: card.script || '',
    shot_notes: card.shot_notes || '',
    brief: card.brief || '',
    magic_sentence: card.magic_sentence || '',
    target_account: card.target_account || '',
    asset_url: card.asset_url || '',
    posted_url: card.posted_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [writing, setWriting] = useState(false)
  const scriptWork = useWork('growth.clipScript')
  const [scriptNote, setScriptNote] = useState<string | null>(null)
  const [duration, setDuration] = useState('60s')
  const [humour, setHumour] = useState('deadpan')
  const touchpoint = g.touchpoints.find(t => t.id === card.touchpoint_id) || null
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.value }))

  /**
   * Write the script onto the card.
   *
   * Two stages behind this, because api/_video.ts CUTS an existing piece and
   * cannot write from nothing: the route builds the argument from the buyer's
   * question and the offer, then cuts that into beats so the length ceiling,
   * the spoken rules and the number check all still apply. What comes back is
   * grounded in rows the OS already holds; it is not a live web sweep, and the
   * hint under the button says so rather than implying otherwise.
   */
  const writeScript = async () => {
    if (writing) return
    setWriting(true)
    setScriptNote(null)
    try {
      const { json } = await requestJson<{
        ok?: boolean; error?: string; detail?: string
        script?: string; shot_notes?: string
        word_count?: number; target_words?: number; unsupported_numbers?: string[]
      }>('/api/growth/clip-script', {
        method: 'POST',
        body: { card_id: card.id, duration, humour },
        // Two model calls in series. The default 15s abandons a good request.
        timeoutMs: 115_000,
      })
      if (!json?.ok) throw new Error(json?.detail || json?.error || 'could not write it')
      setDraft(d => ({ ...d, script: json.script || d.script, shot_notes: json.shot_notes || d.shot_notes }))
      // A figure the check could not find in the argument is the one thing
      // worth reading before filming, so it is said rather than swallowed.
      const unsupported = json.unsupported_numbers || []
      setScriptNote(unsupported.length
        ? `${json.word_count} words. Check these figures before you film: ${unsupported.join(', ')}.`
        : `${json.word_count} words against a target of ${json.target_words}.`)
      toast('Script written. Read it before you film it.', 'success')
      g.refresh?.()
    } catch (e) {
      setScriptNote(failureMessage(e, 'Could not write the script.'))
    } finally {
      setWriting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      await g.patchCard(card.id, draft)
      toast('Card saved.', 'success')
    } catch (e) {
      toast(`Could not save: ${String(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Creative card"
        className="fixed right-0 top-0 bottom-0 z-50 w-[520px] max-w-[94vw] overflow-y-auto bg-base border-l border-white/10 animate-fade-in"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2.5 bg-base/95 backdrop-blur border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            <ProductChip slug={card.product_slug} />
            <Chip tone={STAGE_TONE[card.stage]}>{STAGE_LABEL[card.stage]}</Chip>
            <span className="text-micro text-white/35">{shortDate(card.batch_week)}</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white/85 inline-flex items-center gap-1 text-label">
            <X size={14} /> Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          <h3 className="text-lede font-semibold text-white leading-snug">{card.title}</h3>
          {touchpoint && (
            <p className="text-micro text-white/40 leading-snug">
              Touchpoint: {touchpoint.icp_trigger}
              {touchpoint.watering_hole ? ` (${touchpoint.watering_hole})` : ''}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {BOARD_STAGES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => g.patchCard(card.id, { stage: s })}
                className={`rounded-lg border px-2.5 py-1 text-label font-medium transition-colors ${
                  card.stage === s ? 'btn-contrast border-white font-semibold' : 'border-white/10 text-white/60 hover:bg-white/[0.06]'
                }`}
              >
                {STAGE_LABEL[s]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { g.patchCard(card.id, { stage: 'dropped' }); onClose() }}
              className={BTN_GHOST}
            >
              Drop
            </button>
          </div>

          <Field label="Magic sentence">
            <input value={draft.magic_sentence} onChange={set('magic_sentence')} className={INPUT_CLS} placeholder="The one line the clip has to land" />
          </Field>
          <Field label="Target account">
            <input value={draft.target_account} onChange={set('target_account')} className={INPUT_CLS} placeholder="Where it posts" />
          </Field>
          <Field label="Brief">
            <textarea value={draft.brief} onChange={set('brief')} rows={3} className={INPUT_CLS} placeholder="What this piece is for" />
          </Field>
          <Field label="Script">
            {/* The verdict sits where the action is: the control, its two
                choices and what came back all live against the field they
                fill, not in a panel somewhere else. */}
            <div className="mb-2 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <OptionChips
                  options={[
                    { value: '30s', label: '30 sec' },
                    { value: '60s', label: '60 sec' },
                    { value: '3min', label: '3 min' },
                  ]}
                  value={duration}
                  onChange={setDuration}
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <OptionChips
                  options={[
                    { value: 'deadpan', label: 'Deadpan' },
                    { value: 'witty', label: 'Witty' },
                    { value: 'sarcastic', label: 'Sarcastic' },
                    { value: 'satirical', label: 'Satirical' },
                  ]}
                  value={humour}
                  onChange={setHumour}
                />
              </div>
              <button type="button" onClick={writeScript} disabled={writing} className={BTN_PRIMARY}>
                {writing ? <Working size={12} className="inline mr-1" /> : <Sparkles size={12} className="inline -mt-0.5 mr-1" />}
                {writing ? scriptWork.label : draft.script ? 'Write it again' : 'Write the script'}
              </button>
              <p className="text-micro text-white/40 leading-snug">
                Built from this card, the place on the map and what you sell. It reads what the OS already holds,
                not the live web, so check any figure before you film.
              </p>
              {writing && scriptWork.sub && (
                <p className="text-label text-white/45 leading-snug">{scriptWork.sub}</p>
              )}
              {scriptNote && <p className="text-label text-amber-100/80 leading-snug">{scriptNote}</p>}
            </div>
            <textarea
              value={draft.script}
              onChange={set('script')}
              rows={10}
              className={`${INPUT_CLS} font-mono text-label leading-relaxed`}
              placeholder="The script you read to camera"
            />
          </Field>
          <Field label="Shot notes">
            <textarea
              value={draft.shot_notes}
              onChange={set('shot_notes')}
              rows={5}
              className={`${INPUT_CLS} leading-relaxed`}
              placeholder="Framing, b-roll, Higgsfield prompt notes"
            />
          </Field>
          <Field label="Asset URL">
            <input value={draft.asset_url} onChange={set('asset_url')} className={INPUT_CLS} placeholder="The rendered file" />
          </Field>
          <Field label="Posted URL">
            <input value={draft.posted_url} onChange={set('posted_url')} className={INPUT_CLS} placeholder="Where it went live" />
          </Field>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
              {saving ? 'Saving…' : 'Save card'}
            </button>
            {card.posted_url && (
              <a href={card.posted_url} target="_blank" rel="noreferrer" className={BTN_GHOST}>Open post</a>
            )}
            {card.asset_url && (
              <a href={card.asset_url} target="_blank" rel="noreferrer" className={BTN_GHOST}>Open asset</a>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function AddCard({ g, variant, open, thisWeek, onDone }: { g: GrowthData; variant: 'desktop' | 'mobile'; open: boolean; thisWeek: string; onDone: () => void }) {
  const { toast } = useToast()
  const nextWeek = useMemo(() => mondayOf(new Date(Date.parse(`${thisWeek}T00:00:00Z`) + 7 * 86_400_000)), [thisWeek])
  const [form, setForm] = useState({
    product_slug: 'full-time' as ProductSlug,
    title: '',
    touchpoint_id: '',
    magic_sentence: '',
    target_account: '',
    brief: '',
    script: '',
    shot_notes: '',
    batch_week: thisWeek,
  })
  const [saving, setSaving] = useState(false)
  // Title candidates from /api/growth/clip-ideas. Krish picks one rather than
  // starting at a blank field, which is what the board asked for and never had:
  // its own empty state used to admit "nothing here is generated for you".
  const [ideas, setIdeas] = useState<Array<{ title: string; why: string }> | null>(null)
  const [ideasNote, setIdeasNote] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const ideasWork = useWork('growth.clipIdeas')
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }))
  const onText = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  // The places on the map for this product, as chips. The first version was a
  // native <select> of 70-character options, which a phone renders as a wheel
  // of truncated sentences.
  const places = g.touchpoints.filter(t => t.product_slug === form.product_slug && t.coverage_status !== 'retired')

  const suggest = async () => {
    if (suggesting) return
    setSuggesting(true)
    setIdeasNote(null)
    try {
      const { json } = await requestJson<{ ok?: boolean; error?: string; note?: string; ideas?: Array<{ title: string; why: string }> }>(
        '/api/growth/clip-ideas',
        {
          method: 'POST',
          body: { product_slug: form.product_slug, touchpoint_id: form.touchpoint_id || null },
          // The route runs two model calls behind it at worst; the default 15s
          // would abandon a request that was going to succeed.
          timeoutMs: 60_000,
        },
      )
      if (!json?.ok) throw new Error(json?.error || 'could not suggest')
      setIdeas(json.ideas || [])
      // An honest empty answer, not five invented titles: with no buyer
      // question and no ruling there is nothing to ground one in.
      if (json.note) setIdeasNote(json.note)
      else if (!json.ideas?.length) setIdeasNote('Nothing came back. Write the title yourself.')
    } catch (e) {
      setIdeasNote(failureMessage(e, 'Could not suggest titles.'))
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async () => {
    if (!form.title.trim()) { toast('Say what the clip is.', 'error'); return }
    setSaving(true)
    try {
      await g.addCard({ ...form, touchpoint_id: form.touchpoint_id || null })
      toast('On the board.', 'success')
      onDone()
    } catch (e) {
      toast(failureMessage(e, 'Could not add it.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ComposerShell
      variant={variant}
      open={open}
      onClose={onDone}
      label="Add a clip"
      primaryLabel="Add to the board"
      onPrimary={submit}
      busy={saving}
      canSubmit={Boolean(form.title.trim())}
    >
      {/* Which venture, then which place, then what it is. That order is the
          one Krish asked for and it is also the only order that works: the
          title suggestions below are grounded in the product and the place, so
          asking for the title first meant asking him to write the thing the OS
          could have proposed. */}
      <Ask label="Which product?">
        <OptionChips
          options={PRODUCTS.map(p => ({ value: p, label: PRODUCT_LABEL[p] }))}
          value={form.product_slug}
          onChange={v => { set('product_slug')(v as ProductSlug); set('touchpoint_id')(''); setIdeas(null); setIdeasNote(null) }}
        />
      </Ask>
      {places.length > 0 && (
        <Ask label="Which place on the map is it for?" hint="Optional, but it is what the title suggestions are built from.">
          <OptionChips
            // The buyer's question in full. It used to be cut at 46 characters
            // with an ellipsis, which hid the half that says what they want.
            options={[{ value: '', label: 'Not tied to one' }, ...places.map(t => ({ value: t.id, label: t.icp_trigger }))]}
            value={form.touchpoint_id}
            onChange={v => { set('touchpoint_id')(v); setIdeas(null); setIdeasNote(null) }}
          />
        </Ask>
      )}
      <Ask label="What is the clip?" hint="One line. The title on the card.">
        <VoiceField value={form.title} onChange={set('title')} rows={2} placeholder="Why 0 of 114 signups ever activated" autoFocus={variant === 'desktop'} />
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={suggest} disabled={suggesting} className={BTN_GHOST}>
            {suggesting ? <Working size={12} className="inline mr-1" /> : <Sparkles size={12} className="inline -mt-0.5 mr-1" />}
            {suggesting ? ideasWork.label : ideas ? 'Suggest again' : 'Suggest titles'}
          </button>
          {ideasNote && <span className="text-label text-white/45">{ideasNote}</span>}
        </div>
        {ideas && ideas.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {ideas.map(i => (
              <li key={i.title}>
                <button
                  type="button"
                  onClick={() => set('title')(i.title)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    form.title === i.title
                      ? 'border-violet-400/50 bg-violet-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="block text-label font-medium text-white/85 leading-snug">{i.title}</span>
                  {i.why && <span className="block text-micro text-white/45 leading-snug mt-0.5">{i.why}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Ask>
      <Ask label="Which week?">
        <OptionChips
          options={[
            { value: thisWeek, label: `This week, ${shortDate(thisWeek)}` },
            { value: nextWeek, label: `Next week, ${shortDate(nextWeek)}` },
          ]}
          value={form.batch_week}
          onChange={set('batch_week')}
        />
      </Ask>

      <More label="The line, the account, the script">
        <Ask label="The one line it has to land">
          <input value={form.magic_sentence} onChange={onText('magic_sentence')} className={LINE_CLS} placeholder="Optional" />
        </Ask>
        <Ask label="Where does it post?">
          <OptionChips
            options={ACCOUNTS.map(a => ({ value: a, label: a }))}
            value={form.target_account}
            onChange={v => set('target_account')(v === form.target_account ? '' : v)}
          />
        </Ask>
        <Ask label="What is it for?">
          <textarea value={form.brief} onChange={onText('brief')} rows={2} className={PARA_CLS} placeholder="Optional" />
        </Ask>
        <Ask label="Script" hint="What you read to camera. Can come later.">
          <textarea value={form.script} onChange={onText('script')} rows={4} className={`${PARA_CLS} font-mono text-label`} placeholder="Optional" />
        </Ask>
        <Ask label="Shot notes">
          <textarea value={form.shot_notes} onChange={onText('shot_notes')} rows={2} className={PARA_CLS} placeholder="Framing, b-roll, Higgsfield prompt notes" />
        </Ask>
      </More>
    </ComposerShell>
  )
}

/** Where a clip can post. Chips over a free box, with the box's old hint as the set. */
const ACCOUNTS = ['LinkedIn', 'TikTok', 'Reels', 'YouTube Shorts', 'Substack', 'X']
