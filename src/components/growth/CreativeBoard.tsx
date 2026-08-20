import React, { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Film, Plus, X } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { BTN_GHOST, BTN_PRIMARY, Chip, EmptyNote, Field, INPUT_CLS, ProductChip, SectionHead } from './atoms'
import {
  BATCH_MAX, BATCH_MIN, BOARD_STAGES, PRODUCTS, PRODUCT_LABEL, STAGE_LABEL,
  mondayOf, shortDate,
  type CreativeCardRow, type ProductSlug, type Stage,
} from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'
import { BoardSkeleton } from '../shared/Skeleton'

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

export function CreativeBoard({ g, variant }: { g: GrowthData; variant: 'desktop' | 'mobile' }) {
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
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

  return (
    <div className="space-y-4 pb-8 min-h-0 flex flex-col h-full">
      <SectionHead
        title="Creative board"
        sub="Brief to posted. Drag a card, or use the arrows. The script and shot notes live on the card because you are the one filming."
        action={
          <button type="button" onClick={() => setAdding(a => !a)} className={BTN_PRIMARY}>
            <Plus size={13} className="inline -mt-0.5 mr-1" />{adding ? 'Close' : 'New card'}
          </button>
        }
      />

      <div className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 ${capTone}`}>
        <Film size={13} className={over ? 'text-rose-300' : 'text-white/45'} />
        <span className="text-[12px] font-semibold text-white/85">Batch week of {shortDate(thisWeek)}</span>
        <span className="text-[12px] tabular-nums text-white/70">{batch.length} of {BATCH_MAX}</span>
        <span className={`text-[11.5px] ${over ? 'text-rose-300 font-semibold' : 'text-white/45'}`}>
          {over
            ? `Over the cap by ${batch.length - BATCH_MAX}. Drop one before you start producing.`
            : under
              ? `The agreed run is ${BATCH_MIN} to ${BATCH_MAX} a week. Room for ${BATCH_MIN - batch.length} more.`
              : batch.length === 0
                ? `Nothing queued for this week. The agreed run is ${BATCH_MIN} to ${BATCH_MAX} script candidates.`
                : `Inside the agreed ${BATCH_MIN} to ${BATCH_MAX} run.`}
        </span>
        {dropped.length > 0 && (
          <button type="button" onClick={() => setShowDropped(s => !s)} className={`${BTN_GHOST} ml-auto`}>
            {showDropped ? 'Hide' : 'Show'} dropped ({dropped.length})
          </button>
        )}
      </div>

      {adding && <AddCard g={g} thisWeek={thisWeek} onDone={() => setAdding(false)} />}

      {g.cards.length === 0 && (
        <EmptyNote>
          No creative cards yet. Nothing here is generated for you: a card exists once you or an agent writes one,
          and the board stays empty until then. Start one with New card, capped at {BATCH_MIN} to {BATCH_MAX} script
          candidates for the week.
        </EmptyNote>
      )}
      {/* The columns render even at zero cards: the pipeline is the point, and an
          empty board still has to show what the stages are and take a drop. */}
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
                    <span className={`text-[10.5px] font-semibold uppercase tracking-[0.12em] ${STAGE_TONE[stage].split(' ')[0]}`}>
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="text-[10.5px] text-white/35 tabular-nums ml-auto">{inStage.length}</span>
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
                    {inStage.length === 0 && <p className="text-[10.5px] text-white/25 px-1 py-2">Nothing here.</p>}
                  </div>
                </div>
              )
            })}
          </div>
      </div>

      {showDropped && dropped.length > 0 && (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
          <h3 className="text-[10px] uppercase tracking-[0.13em] text-white/35 font-semibold mb-2">Dropped</h3>
          <div className="space-y-1.5">
            {dropped.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-[11.5px] text-white/40">
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
        {otherWeek && <span className="text-[9.5px] text-white/30">{shortDate(card.batch_week)}</span>}
      </div>
      <p className="text-[12px] font-medium text-white/90 leading-snug">{card.title}</p>
      {card.magic_sentence && <p className="text-[10.5px] text-white/45 leading-snug mt-1 italic">{card.magic_sentence}</p>}
      {card.target_account && <p className="text-[10px] text-white/35 mt-1">to {card.target_account}</p>}
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
          className="text-white/35 hover:text-white/80 disabled:opacity-20 p-0.5"
        >
          <ChevronLeft size={13} />
        </button>
        <button
          type="button"
          aria-label="Move forward a stage"
          onClick={e => { e.stopPropagation(); onMove(card, 1) }}
          disabled={i >= BOARD_STAGES.length - 1}
          className="text-white/35 hover:text-white/80 disabled:opacity-20 p-0.5"
        >
          <ChevronRight size={13} />
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
  const touchpoint = g.touchpoints.find(t => t.id === card.touchpoint_id) || null
  const set = (k: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft(d => ({ ...d, [k]: e.target.value }))

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
            <span className="text-[10.5px] text-white/35">{shortDate(card.batch_week)}</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white/85 inline-flex items-center gap-1 text-[12px]">
            <X size={14} /> Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          <h3 className="text-[16px] font-semibold text-white leading-snug">{card.title}</h3>
          {touchpoint && (
            <p className="text-[11px] text-white/40 leading-snug">
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
                className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
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
            <textarea
              value={draft.script}
              onChange={set('script')}
              rows={10}
              className={`${INPUT_CLS} font-mono text-[12px] leading-relaxed`}
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

function AddCard({ g, thisWeek, onDone }: { g: GrowthData; thisWeek: string; onDone: () => void }) {
  const { toast } = useToast()
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
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const options = g.touchpoints.filter(t => t.product_slug === form.product_slug && t.coverage_status !== 'retired')

  const submit = async () => {
    if (!form.title.trim()) { toast('Give the card a title.', 'error'); return }
    setSaving(true)
    try {
      await g.addCard({ ...form, touchpoint_id: form.touchpoint_id || null })
      toast('Card on the board.', 'success')
      onDone()
    } catch (e) {
      toast(`Could not add: ${String(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Product">
          <select value={form.product_slug} onChange={set('product_slug')} className={`${INPUT_CLS} cursor-pointer`}>
            {PRODUCTS.map(p => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
          </select>
        </Field>
        <Field label="Batch week (Monday)">
          <input type="date" value={form.batch_week} onChange={set('batch_week')} className={INPUT_CLS} />
        </Field>
        <Field label="Title" wide>
          <input value={form.title} onChange={set('title')} className={INPUT_CLS} placeholder="What the clip is" />
        </Field>
        <Field label="Touchpoint" wide>
          <select value={form.touchpoint_id} onChange={set('touchpoint_id')} className={`${INPUT_CLS} cursor-pointer`}>
            <option value="">Not tied to a touchpoint</option>
            {options.map(t => <option key={t.id} value={t.id}>{t.icp_trigger.slice(0, 70)}</option>)}
          </select>
        </Field>
        <Field label="Magic sentence" wide>
          <input value={form.magic_sentence} onChange={set('magic_sentence')} className={INPUT_CLS} placeholder="The one line it has to land" />
        </Field>
        <Field label="Target account">
          <input value={form.target_account} onChange={set('target_account')} className={INPUT_CLS} placeholder="TikTok, Reels, LinkedIn" />
        </Field>
        <Field label="Brief">
          <textarea value={form.brief} onChange={set('brief')} rows={2} className={INPUT_CLS} />
        </Field>
        <Field label="Script" wide>
          <textarea value={form.script} onChange={set('script')} rows={4} className={`${INPUT_CLS} font-mono text-[12px]`} />
        </Field>
        <Field label="Shot notes" wide>
          <textarea value={form.shot_notes} onChange={set('shot_notes')} rows={2} className={INPUT_CLS} />
        </Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={submit} disabled={saving} className={BTN_PRIMARY}>
          {saving ? 'Adding…' : 'Add to board'}
        </button>
        <button type="button" onClick={onDone} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  )
}
