import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Button } from '../ui/button'
import { SkeletonList } from '../shared/Skeleton'
import { WordChips } from '../shared/WordChips'
import {
  GEO_OPTIONS, ICP_FIELDS, SENIORITY_OPTIONS,
  type IcpConsumer, type IcpField, type ProductIcp,
} from '../../lib/icp'

/**
 * Growth, Buyers: who each product is for, defined once and read by the agents.
 *
 * Krish, 2026-10-05: "Can you add in Control Center somewhere I can define ICP
 * for each and it gets saved and acted on by the system durably?"
 *
 * WHY IT LIVES ON GROWTH. Growth is already the one surface keyed by product
 * that answers "is anyone finding this, and who are we trying to reach": the
 * places map holds a buyer trigger per channel, the Monday AI answer check asks
 * a buyer's questions, and the Sunday review judges both. The buyer belongs
 * beside the places you reach them, not in a tab of its own.
 *
 * The honest part is the right-hand column. A product with no ICP does not
 * render as an empty form: it names what is not running because of it, starting
 * with Maya's prospecting lane, which skips that product outright. Nothing
 * falls back to another product's buyer, here or anywhere downstream.
 */

interface Product {
  venture: string
  label: string
  tier: number | null
  tierLabel: string | null
  what: string | null
  icp: ProductIcp
}

interface Payload {
  products: Product[]
  consumers: IcpConsumer[]
  summary: { defined: number; total: number; undefined_products: string[] }
}

type Draft = Pick<ProductIcp, IcpField>

function draftOf(icp: ProductIcp): Draft {
  return {
    buyer_titles: [...icp.buyer_titles], seniorities: [...icp.seniorities], geos: [...icp.geos],
    who: icp.who, who_not: icp.who_not, company_shape: icp.company_shape,
    buying_trigger: icp.buying_trigger, notes: icp.notes,
  }
}

function same(a: Draft, b: Draft): boolean {
  return ICP_FIELDS.every(f => {
    const x = a[f], y = b[f]
    if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => v === y[i])
    return (x ?? '') === (y ?? '')
  })
}

export function BuyersView({ mobile, wide }: { mobile: boolean; wide: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/icp')
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'The buyers did not load.')
      setData(j)
      setPicked(p => p ?? (j.products.find((x: Product) => !x.icp.defined)?.venture ?? j.products[0]?.venture ?? null))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The buyers did not load.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const product = useMemo(() => data?.products.find(p => p.venture === picked) ?? null, [data, picked])
  const base = useMemo(() => (product ? draftOf(product.icp) : null), [product])

  // The form always shows what the database holds, including straight after a
  // save, when the re-read is what tells us whether `defined` flipped.
  useEffect(() => { setDraft(base ? { ...base } : null) }, [base])
  // The confirmation belongs to the product, not to the row. Clearing it on
  // every `base` change cleared it on the re-read a save triggers, so the one
  // line saying whether the lane was unblocked vanished the instant it was
  // earned.
  useEffect(() => { setSaved(null) }, [picked])

  const dirty = !!draft && !!base && !same(draft, base)

  const set = <K extends IcpField>(k: K, v: Draft[K]) => setDraft(d => (d ? { ...d, [k]: v } : d))

  const save = async () => {
    if (!product || !draft) return
    setSaving(true)
    try {
      const r = await fetch('/api/icp', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venture: product.venture, patch: draft }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'It did not save.')
      setSaved(j.unblocked
        ? `Saved. ${product.label} has a buyer now, and the prospecting run will use it.`
        : 'Saved. It still needs buyer titles and a line on who they are before anything acts on it.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It did not save.')
    } finally {
      setSaving(false)
    }
  }

  if (error && !data) {
    return (
      <div className="surface flex max-w-[640px] flex-col gap-3 rounded-2xl p-6" role="alert" data-testid="buyers-error">
        <h2 className="text-title font-display font-semibold text-ink">The buyers did not load.</h2>
        <p className="text-ui text-ink-muted">{error}</p>
        <Button variant="secondary" size="touch" onClick={() => void load()} className="w-fit px-6">Try again</Button>
      </div>
    )
  }
  if (!data) return <div data-testid="buyers-loading" aria-busy="true"><SkeletonList rows={4} /></div>

  const { summary } = data
  const gap = summary.total - summary.defined

  const list = (
    <nav aria-label="Products" className="flex flex-col gap-1.5" data-testid="buyers-products">
      {data.products.map(p => {
        const on = p.venture === picked
        return (
          <button
            key={p.venture}
            type="button"
            aria-current={on || undefined}
            data-testid={`buyers-product-${p.venture}`}
            onClick={() => setPicked(p.venture)}
            className={`tap-44 flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              on ? 'border-violet-400/50 bg-violet-500/15' : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-ui font-semibold text-ink">{p.label}</span>
              <span className="text-micro text-ink-faint">{p.tierLabel ?? 'Not ranked'}</span>
            </span>
            <span className={`flex items-center gap-1 text-label ${p.icp.defined ? 'text-ink-muted' : 'text-amber-300'}`}>
              {p.icp.defined
                ? <><Check size={11} aria-hidden /> {p.icp.buyer_titles.length} buyer titles</>
                : <><AlertTriangle size={11} aria-hidden /> No buyer set</>}
            </span>
          </button>
        )
      })}
    </nav>
  )

  const editor = product && draft && (
    <div className="flex min-w-0 flex-col gap-6" data-testid="buyers-editor" data-venture={product.venture} data-defined={product.icp.defined ? 'yes' : 'no'}>
      <div className="flex flex-col gap-2">
        <Eyebrow>{product.tierLabel ?? 'Tracked, not ranked'}</Eyebrow>
        <h2 className="text-title font-display font-semibold text-ink">{product.label}</h2>
        {product.what && <p className="text-ui text-ink-muted">{product.what}</p>}
      </div>

      {!product.icp.defined && (
        <section
          className="surface flex flex-col gap-3 rounded-2xl border border-amber-400/30 p-5"
          role="note"
          data-testid="buyers-blocked"
        >
          <h3 className="flex items-center gap-2 text-ui font-semibold text-amber-200">
            <AlertTriangle size={14} aria-hidden />
            No buyer is set for {product.label}, so these are not running.
          </h3>
          <ul className="flex flex-col gap-2">
            {data.consumers.map(c => (
              <li key={c.id} className="text-label text-ink-muted" data-testid={`buyers-blocked-${c.id}`}>
                <span className="font-semibold text-ink">{c.what}{c.hard ? ' (stopped)' : ' (weakened)'}.</span> {c.blocked}
              </li>
            ))}
          </ul>
          <p className="text-label text-ink-faint">
            Nothing borrows another product's buyer to fill the gap. Give it buyer titles and one line on who they are, and all four start using it.
          </p>
        </section>
      )}

      <WordChips
        label="Buyer titles"
        hint="The job titles the prospecting run searches for. This is the field that unblocks it."
        value={draft.buyer_titles}
        onChange={v => set('buyer_titles', v)}
        placeholder="Founder, Head of Partnerships..."
        disabled={saving}
        testId="buyers-titles"
      />

      <Field label="Who they are" hint="One plain line. Who is this for?" value={draft.who} onChange={v => set('who', v)} disabled={saving} testId="buyers-who" rows={3} />
      <Field label="Who it is not for" hint="The people who look close but are not the buyer." value={draft.who_not} onChange={v => set('who_not', v)} disabled={saving} testId="buyers-whonot" rows={2} />
      <Field label="What their company looks like" hint="Size, kind of business, anything that narrows it." value={draft.company_shape} onChange={v => set('company_shape', v)} disabled={saving} testId="buyers-shape" rows={2} />
      <Field label="What makes them buy now" hint="The thing that has to be true for them to act this month." value={draft.buying_trigger} onChange={v => set('buying_trigger', v)} disabled={saving} testId="buyers-trigger" rows={2} />

      <WordChips label="Seniority" hint="How senior they are, in the words the prospecting tool uses." value={draft.seniorities} onChange={v => set('seniorities', v)} options={SENIORITY_OPTIONS} disabled={saving} testId="buyers-seniority" />
      <WordChips label="Where they are" hint="Countries to search in." value={draft.geos} onChange={v => set('geos', v)} options={GEO_OPTIONS.map(g => ({ id: g, label: g }))} disabled={saving} testId="buyers-geos" />

      <Field label="Anything else the agents should know" value={draft.notes} onChange={v => set('notes', v)} disabled={saving} testId="buyers-notes" rows={3} />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="touch" disabled={!dirty || saving} onClick={() => void save()} data-testid="buyers-save" className={mobile ? 'w-full' : 'w-fit px-6'}>
          {saving ? 'Saving' : 'Save'}
        </Button>
        {saved && <p className="text-label text-ink-muted" data-testid="buyers-saved">{saved}</p>}
        {!saved && product.icp.updated_at && (
          <p className="text-label text-ink-faint">Last changed {new Date(product.icp.updated_at).toLocaleDateString()}.</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5 pb-2" data-testid="buyers-view">
      <p className="text-ui text-ink-muted" data-testid="buyers-summary">
        {gap === 0
          ? `Every product has a buyer. All ${summary.total} are being prospected against their own.`
          : `${summary.defined} of ${summary.total} products have a buyer. ${summary.undefined_products.join(', ')} ${summary.undefined_products.length === 1 ? 'has' : 'have'} none, so nothing prospects for ${summary.undefined_products.length === 1 ? 'it' : 'them'}.`}
      </p>
      <div className={!mobile && wide ? 'grid items-start gap-8 grid-cols-[280px_minmax(0,1fr)]' : 'flex flex-col gap-6'}>
        {list}
        {editor}
      </div>
    </div>
  )
}

function Field({ label, hint, value, onChange, disabled, testId, rows }: {
  label: string
  hint?: string
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  testId: string
  rows: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <p className="text-micro text-ink-faint">{label}</p>
        {hint && <p className="text-micro text-ink-faint">{hint}</p>}
      </div>
      <textarea
        rows={rows}
        value={value ?? ''}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        onChange={e => onChange(e.target.value.length ? e.target.value : null)}
        className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-ui leading-relaxed text-ink placeholder:text-ink-faint focus-visible:border-violet-400/40 focus-visible:outline-none"
      />
    </div>
  )
}
