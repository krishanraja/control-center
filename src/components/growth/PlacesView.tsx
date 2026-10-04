/**
 * Growth: Places. Where buyers already go, per product (growth_touchpoints),
 * and the accounts that have to exist first (growth_social_accounts). What is
 * waiting on an answer comes first, because answering it is the work.
 * Writes: PATCH /api/growth/touchpoints (coverage, answer_assumption), POST to add.
 * On a phone a place is added through the one + button (CreateSheet).
 * Deep link: ?section=places (and the old ?section=map).
 */
import { useEffect, useMemo, useState } from 'react'
import { Check, Plus } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { FocusedEditor } from '../shared/FocusedEditor'
import { OptionChips } from '../goals/GoalPickers'
import { Button } from '../ui/button'
import { relativeTime } from '../../lib/ageHelpers'
import { failureMessage } from '../../lib/apiFetch'
import { ventureLabel } from '../../lib/ventureOptions'
import { CHANNELS, COVERAGES, PRODUCTS, type Channel, type Coverage, type ProductSlug, type TouchpointRow } from '../../lib/growth'
import { CHANNEL_WORDS, ProductTag, platformLabel } from './bits'
import { ScoreTicks } from './viz'
import type { GrowthTabModel } from './useGrowthTab'

const COVERAGE_WORDS: Record<Coverage, string> = {
  unaddressed: 'Not started', in_progress: 'Working on it', covered: 'Covered', retired: 'Retired',
}

/** Advisory first: it is the only product AI answers already name. */
const ORDER: ProductSlug[] = ['mindmake', ...PRODUCTS.filter(p => p !== 'mindmake')]

export function PlacesView({ m, mobile, wide, compose, onComposed }: {
  m: GrowthTabModel; mobile: boolean; wide: boolean
  /** The + sheet asked for "Add a place": open the editor once, then say so. */
  compose: boolean; onComposed: () => void
}) {
  const [product, setProduct] = useState<'all' | ProductSlug>('all')
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    if (!compose) return
    setAdding(true)
    onComposed()
  }, [compose, onComposed])
  const all = m.g.touchpoints
  const last = useMemo(() => all.map(t => t.updated_at).filter(Boolean).sort().pop() ?? null, [all])

  if (m.growthError) {
    return (
      <div className="surface flex flex-wrap items-center gap-3 rounded-3xl p-5" data-testid="growth-places-error">
        <p className="min-w-0 flex-1 text-body text-ink-muted">The places could not be read just now.</p>
        <Button variant="outline" size="default" className="tap-44" onClick={m.retry}>Try again</Button>
      </div>
    )
  }

  const shown = all.filter(t => product === 'all' || t.product_slug === product)
  const waiting = shown
    .filter(t => t.assumption_flag && t.assumption_flag.trim() && t.coverage_status !== 'retired')
    .sort((a, b) => (b.cost_efficiency_score ?? 0) - (a.cost_efficiency_score ?? 0))
  const accounts = m.g.accounts.filter(a => product === 'all' || a.product_slug === product)
  const planned = accounts.filter(a => a.status === 'planned' && !(a.handle && a.handle.trim()))

  const filter = (
    <OptionChips
      label="Which product"
      value={product}
      onChange={v => setProduct(v as 'all' | ProductSlug)}
      options={[
        { value: 'all', label: `All ${all.length}` },
        ...ORDER.map(p => ({ value: p, label: `${ventureLabel(p) ?? p} ${all.filter(t => t.product_slug === p).length}` })),
      ]}
    />
  )

  const waitingBlock = (
    <section className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-places-waiting">
      <div className="flex items-center gap-3">
        <Eyebrow className="flex-1">Waiting on an answer</Eyebrow>
        <span className="font-mono text-label tabular-nums text-ink-muted">{waiting.length}</span>
      </div>
      {waiting.length === 0 ? (
        <p className="text-body text-ink-muted">Nothing here is waiting{product === 'all' ? '' : ` for ${ventureLabel(product) ?? product}`}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {waiting.map(t => <WaitingRow key={t.id} m={m} t={t} mobile={mobile} showProduct={product === 'all'} />)}
        </ul>
      )}
    </section>
  )

  const accountsBlock = (
    <section className="surface flex flex-col gap-3 rounded-3xl p-5" data-testid="growth-places-accounts">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">Accounts</Eyebrow>
        <span className="font-mono text-label tabular-nums text-ink-muted">{accounts.filter(a => a.status === 'live').length} made, {planned.length} to create</span>
      </div>
      {accounts.length === 0 ? (
        <p className="text-body text-ink-muted">No accounts are listed yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {accounts.map(a => (
            <li key={a.id} className={`inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-label ${a.status === 'live' ? 'border-violet-400/30 text-ink' : 'border-dashed border-white/20 text-ink-muted'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${a.status === 'live' ? 'bg-accent' : 'bg-white/25'}`} aria-hidden />
              {ventureLabel(a.product_slug) ?? a.product_slug} {platformLabel(a.platform)}
              {a.status === 'live' && a.handle ? <span className="text-ink-muted">{a.handle.startsWith('@') ? a.handle : `@${a.handle}`}</span> : null}
              {a.status !== 'live' && <span className="text-micro text-ink-muted">to create</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-label text-ink-muted">A place that needs an account waits until the account exists.</p>
    </section>
  )

  const groups = (product === 'all' ? ORDER : [product])
    .map(p => ({ p, rows: shown.filter(t => t.product_slug === p).sort((a, b) => (b.cost_efficiency_score ?? 0) - (a.cost_efficiency_score ?? 0)) }))
    .filter(x => x.rows.length)

  const list = (
    <section className="flex flex-col gap-4" data-testid="growth-places-list">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">Every place</Eyebrow>
        <span className="text-label text-ink-muted">Last changed {relativeTime(last) ?? 'never'}</span>
        {!mobile && <Button variant="outline" size="default" className="tap-44" onClick={() => setAdding(a => !a)} data-testid="growth-place-add"><Plus size={16} aria-hidden /> Add a place</Button>}
      </div>
      {!mobile && adding && <AddPlaceForm m={m} onDone={() => setAdding(false)} defaultProduct={product === 'all' ? 'mindmake' : product} />}
      {groups.length === 0 && <p className="text-body text-ink-muted">No places yet. Add the first one where your buyers already go.</p>}
      {groups.map(({ p, rows }) => (
        <div key={p} className="flex flex-col gap-2">
          {product === 'all' && <div className="flex items-center gap-2"><ProductTag slug={p} /><span className="font-mono text-micro tabular-nums text-ink-muted">{rows.length === 1 ? '1 place' : `${rows.length} places`}</span></div>}
          <ul className={wide ? 'grid grid-cols-2 items-start gap-2' : 'flex flex-col gap-2'}>
            {rows.map(t => <PlaceRow key={t.id} m={m} t={t} />)}
          </ul>
        </div>
      ))}
    </section>
  )

  return (
    <div className="flex flex-col gap-4">
      {filter}
      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] items-start gap-6">
          <div className="flex flex-col gap-4">{waitingBlock}{accountsBlock}</div>
          {list}
        </div>
      ) : (
        <>{waitingBlock}{accountsBlock}{list}</>
      )}
      {mobile && <AddPlaceSheet m={m} open={adding} onClose={() => setAdding(false)} />}
    </div>
  )
}

function WaitingRow({ m, t, mobile, showProduct }: { m: GrowthTabModel; t: TouchpointRow; mobile: boolean; showProduct: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [solved, setSolved] = useState<string | null>(null)
  const [line, setLine] = useState<string | null>(null)
  const save = async (a: string) => {
    setBusy(true)
    setLine(null)
    try {
      await m.g.answerAssumption(t.id, a)
      setSolved(a)
      setEditing(false)
      return true
    } catch (e) {
      setLine(failureMessage(e, 'Could not save the answer.'))
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {showProduct && <ProductTag slug={t.product_slug} />}
        {t.cost_efficiency_score != null && (
          <>
            <ScoreTicks score={t.cost_efficiency_score} label={`Rated ${t.cost_efficiency_score} of 10`} />
            <span className="font-mono text-micro tabular-nums text-ink-muted">{t.cost_efficiency_score}/10</span>
          </>
        )}
      </div>
      <p className="text-body font-semibold text-ink break-words">{t.watering_hole}</p>
      <p className="text-body text-accent-3 break-words">{t.assumption_flag}</p>
      {solved ? (
        <p role="status" className="inline-flex items-start gap-1.5 text-label font-semibold text-accent break-words"><Check size={14} className="mt-0.5 flex-shrink-0" aria-hidden /> Answered: {solved}</p>
      ) : !mobile && editing ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) void save(text.trim()) }}>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <span className="text-micro text-ink-muted">Your answer</span>
            <input autoFocus value={text} onChange={e => setText(e.target.value)} className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] px-3 text-ui text-ink focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
          </label>
          <Button type="submit" variant="contrast" size="default" loading={busy}>Save</Button>
        </form>
      ) : (
        <Button variant="secondary" size="sm" className="tap-44 self-start" onClick={() => setEditing(true)}>Answer it</Button>
      )}
      {line && <p role="status" className="text-label text-accent-3 break-words">{line}</p>}
      {mobile && (
        <FocusedEditor open={editing} onClose={() => setEditing(false)} label="Answer it" value="" placeholder="Your answer, for example: the account is made" saveLabel="Save" onSave={save} />
      )}
    </li>
  )
}

function PlaceRow({ m, t }: { m: GrowthTabModel; t: TouchpointRow }) {
  const [line, setLine] = useState<string | null>(null)
  return (
    <li className="surface flex flex-col gap-2 rounded-2xl p-3" data-testid="growth-place">
      <p className="text-body font-semibold text-ink break-words">{t.watering_hole}</p>
      <p className="text-label text-ink-muted break-words">{t.icp_trigger}</p>
      <p className="flex flex-wrap items-center gap-2 text-micro text-ink-muted">
        <span>{CHANNEL_WORDS[t.channel] ?? t.channel}</span>
        {t.cost_efficiency_score != null && <><ScoreTicks score={t.cost_efficiency_score} label={`Rated ${t.cost_efficiency_score} of 10`} /><span className="font-mono tabular-nums">{t.cost_efficiency_score}/10</span></>}
        {t.assumption_flag && t.assumption_flag.trim() && <span className="text-accent-3">Waiting on an answer</span>}
      </p>
      <OptionChips
        value={t.coverage_status}
        onChange={v => {
          setLine(null)
          m.g.patchTouchpoint(t.id, { coverage_status: v as Coverage }).catch(e => setLine(failureMessage(e, 'Could not save that.')))
        }}
        options={COVERAGES.map(c => ({ value: c, label: COVERAGE_WORDS[c] }))}
      />
      {line && <p role="status" className="text-label text-accent-3 break-words">{line}</p>}
    </li>
  )
}

function AddPlaceForm({ m, onDone, defaultProduct }: { m: GrowthTabModel; onDone: () => void; defaultProduct: ProductSlug }) {
  const [place, setPlace] = useState('')
  const [who, setWho] = useState('')
  const [product, setProduct] = useState<ProductSlug>(defaultProduct)
  const [channel, setChannel] = useState<Channel>('community')
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<string | null>(null)
  const submit = async () => {
    if (!place.trim() || !who.trim()) return
    setBusy(true)
    setLine(null)
    try {
      await m.g.addTouchpoint({ product_slug: product, channel, watering_hole: place.trim(), icp_trigger: who.trim(), coverage_status: 'unaddressed' })
      onDone()
    } catch (e) {
      setLine(failureMessage(e, 'Could not add the place.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="surface flex flex-col gap-3 rounded-2xl p-4" onSubmit={e => { e.preventDefault(); void submit() }} data-testid="growth-place-form">
      <label className="flex flex-col gap-1">
        <span className="text-micro text-ink-muted">Where do your buyers already go?</span>
        <input autoFocus value={place} onChange={e => setPlace(e.target.value)} placeholder="For example: r/jobs threads about layoffs" className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] px-3 text-ui text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-micro text-ink-muted">Who is there</span>
        <input value={who} onChange={e => setWho(e.target.value)} placeholder="For example: people in their first month after a layoff" className="min-h-[44px] rounded-xl border border-white/10 bg-white/[0.03] px-3 text-ui text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-violet-400/50" />
      </label>
      <OptionChips label="Product" value={product} onChange={v => setProduct(v as ProductSlug)} options={ORDER.map(p => ({ value: p, label: ventureLabel(p) ?? p }))} />
      <OptionChips label="Kind of place" value={channel} onChange={v => setChannel(v as Channel)} options={CHANNELS.map(c => ({ value: c, label: CHANNEL_WORDS[c] }))} />
      {line && <p role="status" className="text-label text-accent-3 break-words">{line}</p>}
      <div className="flex gap-2">
        <Button type="submit" variant="contrast" size="default" loading={busy} disabled={!place.trim() || !who.trim()}>Add the place</Button>
        <Button type="button" variant="ghost" size="default" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

/** Phone: the + sheet's "Add a place" lands here, in the house editor. */
function AddPlaceSheet({ m, open, onClose }: { m: GrowthTabModel; open: boolean; onClose: () => void }) {
  const [product, setProduct] = useState<ProductSlug>('mindmake')
  return (
    <FocusedEditor
      open={open}
      onClose={onClose}
      label="Add a place"
      value=""
      placeholder="Where do your buyers already go? For example: r/jobs threads about layoffs"
      saveLabel="Add the place"
      header={<OptionChips label="For which product" value={product} onChange={v => setProduct(v as ProductSlug)} options={ORDER.map(p => ({ value: p, label: ventureLabel(p) ?? p }))} />}
      onSave={async text => {
        try {
          // Who is there is asked for on the desk form; the phone asks one
          // thing, and the row says plainly that the rest is still to come.
          await m.g.addTouchpoint({ product_slug: product, channel: 'community', watering_hole: text.trim(), icp_trigger: 'Not said yet', coverage_status: 'unaddressed' })
          return true
        } catch {
          return false
        }
      }}
    />
  )
}
