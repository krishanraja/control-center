import React, { useMemo, useState } from 'react'
import { HelpCircle, Plus } from '@/lib/icons'
import { useToast } from '../shared/Toast'
import { BTN_GHOST, BTN_PRIMARY, Chip, EmptyNote, Field, INPUT_CLS, ProductChip, SectionHead, SELECT_CLS } from './atoms'
import {
  CHANNELS, CHANNEL_LABEL, COVERAGES, COVERAGE_LABEL, COVERAGE_TONE,
  PRODUCTS, PRODUCT_LABEL,
  type Channel, type Coverage, type ProductSlug, type TouchpointRow,
} from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'
import { Skeleton } from '../shared/Skeleton'

/**
 * A) THE TOUCHPOINT MAP: the primary view of the Growth tab.
 *
 * One row per place the ICP already is, grouped by product and ranked by cost
 * efficiency. Coverage and score are edited in place (every write goes through
 * /api/growth/touchpoints on the service role, because the browser holds the
 * anon key and cannot write these tables).
 *
 * assumption_flag is deliberately loud: those are the questions the map is
 * still guessing at. They render as prompts with an answer box, not as a badge.
 */

const SCORE_OPTIONS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]

export function TouchpointMap({ g, variant }: { g: GrowthData; variant: 'desktop' | 'mobile' }) {
  const { toast } = useToast()
  const [product, setProduct] = useState<'all' | ProductSlug>('all')
  const [openOnly, setOpenOnly] = useState(false)
  const [showRetired, setShowRetired] = useState(false)
  const [adding, setAdding] = useState(false)

  const openQuestions = useMemo(() => g.touchpoints.filter(t => t.assumption_flag), [g.touchpoints])

  const stats = useMemo(() => {
    const by: Record<string, number> = { unaddressed: 0, in_progress: 0, covered: 0, retired: 0 }
    for (const t of g.touchpoints) by[t.coverage_status] = (by[t.coverage_status] || 0) + 1
    return by
  }, [g.touchpoints])

  const visible = useMemo(() => g.touchpoints.filter(t => {
    if (product !== 'all' && t.product_slug !== product) return false
    if (openOnly && !t.assumption_flag) return false
    if (!showRetired && t.coverage_status === 'retired') return false
    return true
  }), [g.touchpoints, product, openOnly, showRetired])

  const groups = useMemo(
    () => PRODUCTS.map(p => ({ product: p, rows: visible.filter(t => t.product_slug === p) })).filter(gr => gr.rows.length),
    [visible],
  )

  const accounts = useMemo(
    () => g.accounts.filter(a => product === 'all' || a.product_slug === product),
    [g.accounts, product],
  )

  const save = async (id: string, patch: Record<string, unknown>) => {
    try { await g.patchTouchpoint(id, patch) } catch (e) { toast(`Could not save: ${String(e)}`, 'error') }
  }

  // The map is a table, so the placeholder is a table: a header rule and rows
  // at the real row height, rather than a centred word that reserves nothing
  // and lets the whole grid drop into place on arrival.
  if (g.loading) {
    return (
      <div className="space-y-4 pb-8" aria-busy="true" role="status" aria-label="Loading">
        <Skeleton h={14} w={180} r={5} />
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.05]"><Skeleton h={9} w="42%" r={4} /></div>
          <div className="divide-y divide-white/[0.05]">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="px-3 py-2.5 flex items-center gap-3">
                <Skeleton h={11} w={104} r={4} />
                <Skeleton h={11} w="34%" r={4} />
                <Skeleton h={11} w={62} r={4} className="ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8">
      <SectionHead
        title="Where your buyers already are"
        sub="Every place the ICP already is, per product. Coverage and cost efficiency save the moment you change them."
        action={
          <button type="button" onClick={() => setAdding(a => !a)} className={BTN_PRIMARY}>
            <Plus size={13} className="inline -mt-0.5 mr-1" />{adding ? 'Close' : 'Add touchpoint'}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-label text-white/45 tabular-nums">
        <span className="text-white/70 font-semibold">{g.touchpoints.length} mapped</span>
        <span>{stats.covered} covered</span>
        <span>{stats.in_progress} in progress</span>
        <span>{stats.unaddressed} unaddressed</span>
        <span>{stats.retired} retired</span>
        <span className="flex-1" />
        <select
          value={product}
          onChange={e => setProduct(e.target.value as 'all' | ProductSlug)}
          className={`${SELECT_CLS} border-white/10 text-white/70`}
          aria-label="Filter by product"
        >
          <option value="all">All products</option>
          {PRODUCTS.map(p => <option key={p} value={p}>{PRODUCT_LABEL[p]}</option>)}
        </select>
        <button type="button" onClick={() => setShowRetired(s => !s)} className={BTN_GHOST}>
          {showRetired ? 'Hide retired' : 'Show retired'}
        </button>
      </div>

      {adding && <AddTouchpoint g={g} onDone={() => setAdding(false)} />}

      {openQuestions.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <HelpCircle size={13} className="text-amber-300" />
            <h3 className="text-micro font-semibold uppercase tracking-[0.14em] text-amber-300">
              {openQuestions.length} open question{openQuestions.length === 1 ? '' : 's'}
            </h3>
            <span className="text-micro text-white/45">The map is guessing until you answer these.</span>
            <button
              type="button"
              onClick={() => setOpenOnly(o => !o)}
              className="ml-auto rounded-lg px-2.5 py-1 text-label font-medium text-amber-200 border border-amber-400/30 hover:bg-amber-400/10 transition-colors"
            >
              {openOnly ? 'Show the whole map' : 'Show only these'}
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyNote>
          No touchpoints match this filter. Clear the filters, or add the first touchpoint for this product.
        </EmptyNote>
      ) : groups.map(gr => (
        <section key={gr.product} className="rounded-xl border border-white/[0.07] bg-white/[0.015] overflow-hidden">
          <header className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
            <ProductChip slug={gr.product} />
            <span className="text-micro text-white/40 tabular-nums">{gr.rows.length} touchpoints</span>
            <span className="flex-1" />
            {gr.rows.some(r => r.assumption_flag) && (
              <span className="text-micro text-amber-300">{gr.rows.filter(r => r.assumption_flag).length} open</span>
            )}
          </header>

          {variant === 'desktop' && (
            <div className="grid grid-cols-[112px_minmax(0,1fr)_76px_62px_128px_72px] gap-x-3 px-3 py-1.5 text-micro uppercase tracking-[0.14em] text-white/30 font-semibold border-b border-white/[0.05]">
              <span>Channel</span><span>Trigger and watering hole</span><span>Owner</span><span>Score</span><span>Coverage</span><span />
            </div>
          )}

          <div>
            {gr.rows.map(t => (
              <Row key={t.id} t={t} variant={variant} onSave={save} onAnswer={g.answerAssumption} />
            ))}
          </div>
        </section>
      ))}

      {accounts.length > 0 && (
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
          <h3 className="text-micro uppercase tracking-[0.14em] text-white/35 font-semibold mb-2">Channel accounts</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-1.5 text-label">
                <ProductChip slug={a.product_slug} />
                <span className="text-white/70">{a.platform}</span>
                {a.profile_url ? (
                  <a href={a.profile_url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white/75 underline decoration-white/20">
                    {a.handle || 'profile'}
                  </a>
                ) : null}
                <Chip tone={
                  a.status === 'live' ? 'text-emerald-300 border-emerald-500/25'
                    : a.status === 'planned' ? 'text-amber-300 border-amber-500/25'
                      : 'text-white/30 border-white/[0.08]'
                }>
                  {a.status}
                </Chip>
              </div>
            ))}
          </div>
          <p className="text-micro text-white/30 mt-2">
            A planned account cannot carry a covered touchpoint. The account has to exist before the channel counts.
          </p>
        </section>
      )}
    </div>
  )
}

function latestAnswer(t: TouchpointRow): { question?: string; answer?: string } | null {
  const ev = (t.evidence || {}) as Record<string, unknown>
  const list = Array.isArray(ev.resolved_assumptions) ? ev.resolved_assumptions : []
  const last = list[list.length - 1]
  return last && typeof last === 'object' ? (last as { question?: string; answer?: string }) : null
}

function Row({ t, variant, onSave, onAnswer }: {
  t: TouchpointRow
  variant: 'desktop' | 'mobile'
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>
  onAnswer: (id: string, answer: string) => Promise<void>
}) {
  const { toast } = useToast()
  const [answering, setAnswering] = useState(false)
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)
  const answered = latestAnswer(t)
  const retired = t.coverage_status === 'retired'

  const submitAnswer = async () => {
    if (!answer.trim()) return
    setSaving(true)
    try {
      await onAnswer(t.id, answer.trim())
      setAnswering(false)
      setAnswer('')
      toast('Answered. The question is off the map.', 'success')
    } catch (e) {
      toast(`Could not save the answer: ${String(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const scoreSelect = (
    <select
      value={t.cost_efficiency_score ?? ''}
      onChange={e => onSave(t.id, { cost_efficiency_score: e.target.value === '' ? null : Number(e.target.value) })}
      className={`${SELECT_CLS} border-white/10 text-white/80 tabular-nums w-full`}
      aria-label="How cheap is it to reach them here (1 to 10)"
      title="How cheap to reach them (1 to 10)"
    >
      <option value="">-</option>
      {SCORE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )

  const coverageSelect = (
    <select
      value={t.coverage_status}
      onChange={e => onSave(t.id, { coverage_status: e.target.value as Coverage })}
      className={`${SELECT_CLS} w-full ${COVERAGE_TONE[t.coverage_status]}`}
      aria-label="Coverage status"
    >
      {COVERAGES.map(c => <option key={c} value={c}>{COVERAGE_LABEL[c]}</option>)}
    </select>
  )

  const retireBtn = (
    <button
      type="button"
      onClick={() => onSave(t.id, { coverage_status: retired ? 'unaddressed' : 'retired' })}
      className={`${BTN_GHOST} w-full`}
    >
      {retired ? 'Restore' : 'Retire'}
    </button>
  )

  const prompt = t.assumption_flag ? (
    <div className="mt-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] px-2.5 py-2">
      <p className="text-label text-amber-100/90 leading-snug">
        <span className="font-semibold text-amber-300">Open question. </span>{t.assumption_flag}
      </p>
      {answering ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Your answer. It gets saved here as evidence."
            className={INPUT_CLS}
          />
          <div className="flex gap-2">
            <button type="button" onClick={submitAnswer} disabled={saving || !answer.trim()} className={BTN_PRIMARY}>
              {saving ? 'Saving…' : 'Save answer'}
            </button>
            <button type="button" onClick={() => { setAnswering(false); setAnswer('') }} className={BTN_GHOST}>Cancel</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAnswering(true)}
          className="mt-1.5 text-micro font-semibold text-amber-300 hover:text-amber-200"
        >
          Answer this
        </button>
      )}
    </div>
  ) : answered?.answer ? (
    <p className="mt-1 text-micro text-emerald-300/70 leading-snug">Answered: {answered.answer}</p>
  ) : null

  const body = (
    <>
      <div className="text-label text-white/90 leading-snug">{t.icp_trigger}</div>
      {t.watering_hole && <div className="text-micro text-white/40 leading-snug mt-0.5">{t.watering_hole}</div>}
      {t.rationale && <div className="text-micro text-white/30 leading-snug mt-0.5">{t.rationale}</div>}
      {prompt}
    </>
  )

  if (variant === 'mobile') {
    return (
      <div className={`px-3 py-2.5 border-t border-white/[0.05] ${retired ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 mb-1">
          <Chip>{CHANNEL_LABEL[t.channel] || t.channel}</Chip>
          {t.owner_agent && <span className="text-micro text-white/40">{t.owner_agent}</span>}
        </div>
        {body}
        <div className="grid grid-cols-[62px_minmax(0,1fr)_78px] gap-2 mt-2">
          {scoreSelect}{coverageSelect}{retireBtn}
        </div>
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-[112px_minmax(0,1fr)_76px_62px_128px_72px] gap-x-3 items-start px-3 py-2 border-t border-white/[0.05] hover:bg-white/[0.02] ${retired ? 'opacity-50' : ''}`}>
      <div className="pt-0.5"><Chip>{CHANNEL_LABEL[t.channel] || t.channel}</Chip></div>
      <div className="min-w-0">{body}</div>
      <div className="text-micro text-white/45 pt-1 truncate">{t.owner_agent || ''}</div>
      <div>{scoreSelect}</div>
      <div>{coverageSelect}</div>
      <div>{retireBtn}</div>
    </div>
  )
}

function AddTouchpoint({ g, onDone }: { g: GrowthData; onDone: () => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState({
    product_slug: 'circle' as ProductSlug,
    channel: 'seo' as Channel,
    icp_trigger: '',
    watering_hole: '',
    cost_efficiency_score: '',
    coverage_status: 'unaddressed' as Coverage,
    owner_agent: '',
    rationale: '',
    assumption_flag: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async () => {
    if (!form.icp_trigger.trim()) { toast('The trigger is the row. Write one.', 'error'); return }
    setSaving(true)
    try {
      await g.addTouchpoint({
        ...form,
        cost_efficiency_score: form.cost_efficiency_score === '' ? null : Number(form.cost_efficiency_score),
      })
      toast('Touchpoint added to the map.', 'success')
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
        <Field label="Channel">
          <select value={form.channel} onChange={set('channel')} className={`${INPUT_CLS} cursor-pointer`}>
            {CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="ICP trigger" wide>
          <input value={form.icp_trigger} onChange={set('icp_trigger')} className={INPUT_CLS} placeholder="What they are already asking, in their words" />
        </Field>
        <Field label="Where they gather" wide>
          <input value={form.watering_hole} onChange={set('watering_hole')} className={INPUT_CLS} placeholder="Where exactly: the search, the subreddit, the newsletter, the event" />
        </Field>
        <Field label="How cheap to reach them (1 to 10)">
          <select value={form.cost_efficiency_score} onChange={set('cost_efficiency_score')} className={`${INPUT_CLS} cursor-pointer`}>
            <option value="">Not scored yet</option>
            {SCORE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Coverage">
          <select value={form.coverage_status} onChange={set('coverage_status')} className={`${INPUT_CLS} cursor-pointer`}>
            {COVERAGES.map(c => <option key={c} value={c}>{COVERAGE_LABEL[c]}</option>)}
          </select>
        </Field>
        <Field label="Owner agent">
          <input value={form.owner_agent} onChange={set('owner_agent')} className={INPUT_CLS} placeholder="cleo, maya, nell, krish" />
        </Field>
        <Field label="Open question (optional)">
          <input value={form.assumption_flag} onChange={set('assumption_flag')} className={INPUT_CLS} placeholder="What we are still guessing about this" />
        </Field>
        <Field label="Rationale" wide>
          <textarea value={form.rationale} onChange={set('rationale')} rows={2} className={INPUT_CLS} placeholder="Why this place is worth your time" />
        </Field>
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={submit} disabled={saving} className={BTN_PRIMARY}>
          {saving ? 'Adding…' : 'Add touchpoint'}
        </button>
        <button type="button" onClick={onDone} className={BTN_GHOST}>Cancel</button>
      </div>
    </div>
  )
}
