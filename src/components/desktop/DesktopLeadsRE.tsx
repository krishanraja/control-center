import React, { useMemo, useState } from 'react'
import { HeartHandshake, X, Search, UserCog, Tag, Ban, FileSearch, Flame } from 'lucide-react'
import {
  useRealtimeContacts,
  type ContactRow,
  type ConsentTier,
} from '../../hooks/useRealtimeContacts'
import { isHandQueue } from '../../lib/contactTriage'
import { ContactCard } from '../ContactCard'
import { ContactImportDropzone } from '../ContactImportDropzone'
import { OutreachDraftSheet, type DraftTarget } from '../OutreachDraftSheet'
import { LeadSheet } from '../LeadSheet'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'

const VENTURES: Array<{ slug: string; label: string }> = [
  { slug: 'mindmaker', label: 'Mindmaker' },
  { slug: 'meliora', label: 'Meliora' },
  { slug: 'adfixus', label: 'AdFixus' },
  { slug: 'signal_noise', label: 'Signal & Noise' },
  { slug: 'builder_economy', label: 'Builder Economy' },
  { slug: 'fractionl', label: 'Fractionl' },
  { slug: 'investor', label: 'Investor' },
]

const TIERS: Array<{ value: ConsentTier; label: string }> = [
  { value: 'customer', label: 'Customer' },
  { value: 'warm', label: 'Warm' },
  { value: 'permissioned', label: 'Permissioned' },
  { value: 'cold_engaged', label: 'Cold · engaged' },
  { value: 'cold_scraped', label: 'Cold · scraped' },
]

const HEAT_STEPS = [0, 40, 60, 75]

const OWNER_OPTIONS = ['felix', 'nell', 'maya', 'krish'] as const

type BulkAction = 'assign_owner' | 'set_tier' | 'do_not_contact' | 'dismiss_plays' | 'queue_dossier'

const heatDesc = (a: ContactRow, b: ContactRow) => (b.heat_score ?? 0) - (a.heat_score ?? 0)

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

export function DesktopLeadsRE(_props: Props = {}) {
  const { toast } = useToast()
  const h = useHaptics()

  const [ventureIn, setVentureIn] = useState<string[]>([])
  const [tierIn, setTierIn] = useState<ConsentTier[]>([])
  const [minHeat, setMinHeat] = useState<number>(0)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null)
  const [leadContact, setLeadContact] = useState<ContactRow | null>(null)

  const openDraft = (c: ContactRow) => {
    const name = c.full_name || c.company || (c.email ? c.email.split('@')[0] : '—')
    const subtitle = [c.title, c.company].filter(Boolean).join(' @ ')
    setDraftTarget({ id: c.id, name, subtitle: subtitle || null, email: c.email, venture: c.primary_venture })
  }

  const { contacts, loading } = useRealtimeContacts({
    ventureIn: ventureIn.length ? ventureIn : undefined,
    tierIn: tierIn.length ? tierIn : undefined,
    minHeat: minHeat > 0 ? minHeat : undefined,
    search: search || undefined,
  })

  // Split into the personal 1-by-1 queue (warm/customer OR heat ≥ 75) and the
  // bulk review list (everything else). Both sorted hottest-first.
  const { handQueue, reviewList } = useMemo(() => {
    const hand: ContactRow[] = []
    const review: ContactRow[] = []
    for (const c of contacts) {
      if (isHandQueue(c)) hand.push(c)
      else review.push(c)
    }
    hand.sort(heatDesc)
    review.sort(heatDesc)
    return { handQueue: hand, reviewList: review }
  }, [contacts])

  const toggleVenture = (slug: string) =>
    setVentureIn(prev => (prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]))
  const toggleTier = (t: ConsentTier) =>
    setTierIn(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]))

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const clearSelection = () => setSelected(new Set())

  const selectAllReview = () => setSelected(new Set(reviewList.map(c => c.id)))

  const runBulk = async (action: BulkAction, value?: string) => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    h.heavy()
    setBusy(true)
    try {
      const r = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, value }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${r.status}`)
      h.success()
      const labels: Record<BulkAction, string> = {
        assign_owner: `Assigned ${data.updated} to ${value}.`,
        set_tier: `Set tier on ${data.updated}.`,
        do_not_contact: `Marked ${data.updated} do-not-contact.`,
        dismiss_plays: `Dismissed plays for ${data.updated}.`,
        queue_dossier: `Queued ${data.updated} for dossier.`,
      }
      toast(labels[action] || 'Updated.', 'success')
      clearSelection()
    } catch (e: any) {
      h.error()
      toast(`Bulk action failed — ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const total = contacts.length
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
      active
        ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
        : 'border-white/10 text-white/60 hover:bg-white/[0.06]'
    }`

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-3rem)] min-h-0">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <HeartHandshake size={20} className="text-rose-300" />
            Leads
          </h1>
          <p className="text-[13px] text-white/55 mt-1">
            The relationship spine — every contact, where they came from, and how warm they are.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/55 tabular-nums">
            {loading ? '…' : `${total} contacts`}
          </span>
          <button
            type="button"
            onClick={() => setShowImport(s => !s)}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold border border-white/15 text-white/85 hover:bg-white/[0.06] transition-colors"
          >
            Import
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 mr-1">Venture</span>
          {VENTURES.map(v => (
            <button key={v.slug} type="button" className={chip(ventureIn.includes(v.slug))} onClick={() => toggleVenture(v.slug)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 mr-1">Tier</span>
          {TIERS.map(t => (
            <button key={t.value} type="button" className={chip(tierIn.includes(t.value))} onClick={() => toggleTier(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 mr-1">Min heat</span>
            {HEAT_STEPS.map(step => (
              <button key={step} type="button" className={chip(minHeat === step)} onClick={() => setMinHeat(step)}>
                {step === 0 ? 'Any' : `${step}+`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company, campaign…"
              className="w-full rounded-md border border-white/10 bg-[#141416] pl-7 pr-2 py-1.5 text-[12px] text-white/85 placeholder:text-white/30 focus:border-violet-400/50 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <section className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.03] overflow-hidden flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
            <span className="text-[11px] uppercase tracking-[0.16em] text-violet-200/85">Import contacts</span>
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="text-white/50 hover:text-white/85 inline-flex items-center gap-1 text-[12px]"
              aria-label="Close import"
            >
              <X size={14} /> Close
            </button>
          </div>
          <div className="p-4 max-h-[42vh] overflow-y-auto">
            <ContactImportDropzone />
          </div>
        </section>
      )}

      {/* Scroll region */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
        {/* 1-by-1 pinned section */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Flame size={13} className="text-rose-300" />
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-rose-200/85">
              Handle 1-by-1 — warm &amp; high-value
            </h2>
            <span className="text-[11px] text-white/40 tabular-nums">{handQueue.length}</span>
          </div>
          {handQueue.length === 0 ? (
            <p className="text-[12px] text-white/35 px-1 py-2">No warm or high-heat contacts in this filter.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {handQueue.map(c => (
                <ContactCard key={c.id} contact={c} onOpen={() => setLeadContact(c)} />
              ))}
            </div>
          )}
        </section>

        {/* Bulk review section */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Review &amp; bulk-action
            </h2>
            <span className="text-[11px] text-white/40 tabular-nums">{reviewList.length}</span>
            {reviewList.length > 0 && (
              <button
                type="button"
                onClick={selectAllReview}
                className="ml-auto text-[11px] text-white/45 hover:text-white/75"
              >
                Select all
              </button>
            )}
          </div>
          {reviewList.length === 0 ? (
            <p className="text-[12px] text-white/35 px-1 py-2">
              {loading ? 'Loading contacts…' : 'Nothing else to review in this filter.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {reviewList.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  selected={selected.has(c.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={() => setLeadContact(c)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={busy}
          onClear={clearSelection}
          onAction={runBulk}
        />
      )}

      <LeadSheet
        contact={leadContact}
        onClose={() => setLeadContact(null)}
        onDraft={(c) => { setLeadContact(null); openDraft(c) }}
      />
      <OutreachDraftSheet target={draftTarget} onClose={() => setDraftTarget(null)} />
    </div>
  )
}

interface BarProps {
  count: number
  busy: boolean
  onClear: () => void
  onAction: (action: BulkAction, value?: string) => void
}

function BulkActionBar({ count, busy, onClear, onAction }: BarProps) {
  const [menu, setMenu] = useState<null | 'owner' | 'tier'>(null)
  const closeMenu = () => setMenu(null)

  const btn =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium border border-white/15 text-white/80 hover:bg-white/[0.08] disabled:opacity-40 transition-colors'

  return (
    <div className="flex-shrink-0 flex items-center gap-2 rounded-xl border border-violet-400/30 bg-[#16131d] px-3 py-2 shadow-2xl">
      <span className="text-[12px] font-semibold text-white tabular-nums">{count} selected</span>

      <div className="relative" onMouseLeave={closeMenu}>
        <button type="button" disabled={busy} className={btn} onClick={() => setMenu(m => (m === 'owner' ? null : 'owner'))}>
          <UserCog size={12} /> Assign owner…
        </button>
        {menu === 'owner' && (
          <div className="absolute bottom-full mb-1 left-0 rounded-md border border-white/10 bg-[#141416] shadow-2xl p-1 flex flex-col min-w-[110px] z-30">
            {OWNER_OPTIONS.map(o => (
              <button key={o} type="button" onClick={() => { closeMenu(); onAction('assign_owner', o) }} className="text-left px-2 py-1 rounded text-[11px] text-white/75 hover:bg-white/[0.06]">
                {o}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative" onMouseLeave={closeMenu}>
        <button type="button" disabled={busy} className={btn} onClick={() => setMenu(m => (m === 'tier' ? null : 'tier'))}>
          <Tag size={12} /> Set tier…
        </button>
        {menu === 'tier' && (
          <div className="absolute bottom-full mb-1 left-0 rounded-md border border-white/10 bg-[#141416] shadow-2xl p-1 flex flex-col min-w-[150px] z-30">
            {TIERS.map(t => (
              <button key={t.value} type="button" onClick={() => { closeMenu(); onAction('set_tier', t.value) }} className="text-left px-2 py-1 rounded text-[11px] text-white/75 hover:bg-white/[0.06]">
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button type="button" disabled={busy} className={btn} onClick={() => onAction('do_not_contact')}>
        <Ban size={12} /> Mark do_not_contact
      </button>
      <button type="button" disabled={busy} className={btn} onClick={() => onAction('queue_dossier')}>
        <FileSearch size={12} /> Generate dossier
      </button>
      <button type="button" disabled={busy} className={btn} onClick={() => onAction('dismiss_plays')}>
        <X size={12} /> Dismiss plays
      </button>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto text-[11px] text-white/45 hover:text-white/80"
      >
        Clear
      </button>
    </div>
  )
}
