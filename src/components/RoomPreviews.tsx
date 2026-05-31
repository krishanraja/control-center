import React, { useMemo } from 'react'
import { Sparkles, TrendingUp, Eye, Mic, ArrowUpRight } from 'lucide-react'
import { useRealtimeContentIdeas, type ContentIdeaRow } from '../hooks/useRealtimeContentIdeas'
import { useRealtimeLeads, type LeadRow } from '../hooks/useRealtimeLeads'
import { useVisibilityTargets, type VisibilityTargetRow } from '../hooks/useVisibilityTargets'
import { useRealtimeGuests, type GuestRow } from '../hooks/useRealtimeGuests'
import { useHaptics } from '../hooks/useHaptics'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

interface Props {
  onNavigate?: NavigateFn
  variant?: 'desktop' | 'mobile'
}

/**
 * Room previews — three column previews of Content, Leads, Visibility.
 * Replaces PipelineLanes on the Mission Control Home. Two items per room,
 * plus a "+N more" tail and an "Open room" CTA. Each preview row routes to
 * its kind-correct detail (kind-aware routing per Phase 3).
 *
 * Guests-to-host live as a small ribbon under Content because the user's
 * stated complaint was "podcast guests on Home, in raw form" — they belong
 * inside Content (Krish hosting) not on Home as their own room.
 */
export function RoomPreviews({ onNavigate, variant = 'desktop' }: Props) {
  const { ideas } = useRealtimeContentIdeas({
    stateIn: ['seeded', 'researching', 'drafting', 'review', 'approved'],
  })
  const { leads } = useRealtimeLeads({
    statusIn: ['new', 'enriching', 'ready', 'contacted', 'conversation'],
  })
  const { targets } = useVisibilityTargets()
  const { guests } = useRealtimeGuests({ statusIn: ['scouted', 'enriched'] })

  return (
    <section
      aria-label="Room previews"
      className={`grid gap-3 ${variant === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}
    >
      <ContentRoom
        ideas={ideas}
        guests={guests}
        onNavigate={onNavigate}
        variant={variant}
      />
      <VisibilityRoom
        targets={targets}
        onNavigate={onNavigate}
        variant={variant}
      />
      <LeadsRoom
        leads={leads}
        onNavigate={onNavigate}
        variant={variant}
      />
    </section>
  )
}

// ── Content room ────────────────────────────────────────────────────────────

function ContentRoom({
  ideas, guests, onNavigate, variant = 'desktop',
}: {
  ideas: ContentIdeaRow[]
  guests: GuestRow[]
  onNavigate?: NavigateFn
  variant?: 'desktop' | 'mobile'
}) {
  const top = useMemo(() => {
    return [...ideas]
      .filter(i => i.state === 'seeded' || i.state === 'researching' || i.state === 'review')
      .sort((a, b) => {
        const w = (i: ContentIdeaRow) => i.state === 'review' ? 3 : i.state === 'researching' ? 2 : 1
        const dw = w(b) - w(a)
        if (dw !== 0) return dw
        const at = a.created_at ? new Date(a.created_at).getTime() : 0
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
        return bt - at
      })
      .slice(0, 2)
  }, [ideas])
  const remaining = Math.max(0, ideas.length - top.length)
  const guestCount = guests.length

  return (
    <Room
      icon={<Sparkles size={12} className="text-rose-300" />}
      label="Content"
      total={ideas.length}
      ribbon={guestCount > 0 ? (
        <button
          type="button"
          onClick={() => onNavigate?.('guests')}
          className="flex items-center gap-1 text-[10px] text-rose-200/70 hover:text-rose-200 transition-colors"
        >
          <Mic size={10} />
          {guestCount} guest{guestCount === 1 ? '' : 's'} to host
          <ArrowUpRight size={9} />
        </button>
      ) : null}
      onOpenAll={() => onNavigate?.('content')}
      empty={ideas.length === 0 ? 'No ideas seeded.' : undefined}
    >
      {top.map(i => (
        <PreviewRow
          key={i.id}
          dotColor="bg-rose-400/70"
          title={i.idea}
          detail={i.thesis ?? undefined}
          metaRight={i.state === 'review' ? 'review' : undefined}
          onClick={() => onNavigate?.('content', { idea: i.id })}
          variant={variant}
        />
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-white/30 px-2 py-1 tabular-nums">
          +{remaining} more
        </p>
      )}
    </Room>
  )
}

// ── Visibility room ─────────────────────────────────────────────────────────

function VisibilityRoom({
  targets, onNavigate, variant = 'desktop',
}: {
  targets: VisibilityTargetRow[]
  onNavigate?: NavigateFn
  variant?: 'desktop' | 'mobile'
}) {
  const top = useMemo(() => {
    return [...targets]
      .filter(t => t.status !== 'dropped' && t.status !== 'done')
      .sort((a, b) => {
        const aDl = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity
        const bDl = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity
        if (aDl !== bDl) return aDl - bDl
        const ar = a.relevance_score ?? 0
        const br = b.relevance_score ?? 0
        return br - ar
      })
      .slice(0, 2)
  }, [targets])
  const remaining = Math.max(0, targets.filter(t => t.status !== 'dropped' && t.status !== 'done').length - top.length)

  return (
    <Room
      icon={<Eye size={12} className="text-amber-300" />}
      label="Visibility"
      total={targets.filter(t => t.status !== 'dropped' && t.status !== 'done').length}
      onOpenAll={() => onNavigate?.('guests')}
      empty={top.length === 0 ? 'No live opportunities.' : undefined}
    >
      {top.map(t => (
        <PreviewRow
          key={t.id}
          dotColor="bg-amber-400/70"
          title={t.title}
          detail={t.why_relevant ?? t.audience ?? undefined}
          metaRight={t.deadline_at ? formatDeadline(t.deadline_at) : t.quality_score ?? undefined}
          onClick={() => onNavigate?.('guests', { target: t.id })}
          variant={variant}
        />
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-white/30 px-2 py-1 tabular-nums">
          +{remaining} more
        </p>
      )}
    </Room>
  )
}

// ── Leads room ─────────────────────────────────────────────────────────────

function LeadsRoom({
  leads, onNavigate, variant = 'desktop',
}: {
  leads: LeadRow[]
  onNavigate?: NavigateFn
  variant?: 'desktop' | 'mobile'
}) {
  const top = useMemo(() => {
    return [...leads]
      .filter(l => l.status !== 'closed_won' && l.status !== 'closed_lost' && l.status !== 'superseded')
      .sort((a, b) => {
        const aw = scoreFor(a)
        const bw = scoreFor(b)
        if (bw !== aw) return bw - aw
        const at = a.updated_at ? new Date(a.updated_at).getTime() : 0
        const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0
        return bt - at
      })
      .slice(0, 2)
  }, [leads])
  const remaining = Math.max(
    0,
    leads.filter(l => l.status !== 'closed_won' && l.status !== 'closed_lost' && l.status !== 'superseded').length
      - top.length,
  )

  return (
    <Room
      icon={<TrendingUp size={12} className="text-emerald-300" />}
      label="Leads"
      total={leads.length}
      onOpenAll={() => onNavigate?.('leads')}
      empty={top.length === 0 ? 'No active leads.' : undefined}
    >
      {top.map(l => (
        <PreviewRow
          key={l.id}
          dotColor="bg-emerald-400/70"
          title={l.full_name || l.company || 'Untitled lead'}
          detail={l.title || l.company || l.why_relevant || undefined}
          metaRight={typeof l.icp_score === 'number' && l.icp_score > 0 ? `ICP ${l.icp_score}` : l.tier ?? undefined}
          onClick={() => onNavigate?.('leads', { lead: l.id })}
          variant={variant}
        />
      ))}
      {remaining > 0 && (
        <p className="text-[10px] text-white/30 px-2 py-1 tabular-nums">
          +{remaining} more
        </p>
      )}
    </Room>
  )
}

// ── Primitives ──────────────────────────────────────────────────────────────

function Room({
  icon, label, total, ribbon, onOpenAll, empty, children,
}: {
  icon: React.ReactNode
  label: string
  total: number
  ribbon?: React.ReactNode
  onOpenAll?: () => void
  empty?: string
  children?: React.ReactNode
}) {
  const h = useHaptics()
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3 flex flex-col min-w-0">
      <header className="flex items-center gap-2 px-1 mb-2 min-w-0">
        {icon}
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-white/55 font-semibold">
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-white/35">{total}</span>
        {ribbon && <span className="ml-auto truncate flex-shrink-0">{ribbon}</span>}
      </header>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {empty
          ? (
            <div className="rounded-lg border border-dashed border-white/[0.06] px-3 py-3 text-[11px] text-white/40 text-center">
              {empty}
            </div>
          )
          : children}
      </div>

      <button
        type="button"
        onClick={() => { h.tap(); onOpenAll?.() }}
        className="mt-2 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] text-white/55 hover:text-white hover:bg-white/[0.05] transition-colors min-h-[44px]"
      >
        Open room
        <ArrowUpRight size={11} />
      </button>
    </div>
  )
}

function PreviewRow({
  dotColor, title, detail, metaRight, onClick, variant = 'desktop',
}: {
  dotColor: string
  title: string
  detail?: string
  metaRight?: string
  onClick?: () => void
  variant?: 'desktop' | 'mobile'
}) {
  const h = useHaptics()
  const mobile = variant === 'mobile'
  return (
    <button
      type="button"
      onClick={() => { h.select(); onClick?.() }}
      className={`w-full text-left rounded-lg hover:bg-white/[0.04] active:bg-white/[0.05] transition-colors flex items-start gap-2.5 min-w-0 ${
        mobile ? 'px-3 py-3 min-h-[56px]' : 'px-2 py-2 min-h-[44px] sm:min-h-0'
      }`}
    >
      <span className={`${mobile ? 'mt-2 w-2 h-2' : 'mt-1.5 w-1.5 h-1.5'} rounded-full flex-shrink-0 ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-white/90 leading-snug truncate ${mobile ? 'text-[15px] font-medium' : 'text-[13px]'}`}>{title}</p>
        {detail && (
          <p className={`text-white/50 leading-snug line-clamp-2 break-words mt-0.5 ${mobile ? 'text-[13px]' : 'text-[11px]'}`}>
            {detail}
          </p>
        )}
      </div>
      {metaRight && (
        <span className={`tabular-nums uppercase tracking-[0.1em] text-white/40 flex-shrink-0 mt-1 ${mobile ? 'text-[11px]' : 'text-[10px]'}`}>
          {metaRight}
        </span>
      )}
    </button>
  )
}

function scoreFor(l: LeadRow): number {
  if (typeof l.icp_score === 'number') return l.icp_score
  if (typeof l.fit_score === 'number') return l.fit_score
  return 0
}

function formatDeadline(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return `${Math.abs(days)}d ago`
  if (days === 0) return 'today'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  return `${Math.round(days / 7)}w`
}
