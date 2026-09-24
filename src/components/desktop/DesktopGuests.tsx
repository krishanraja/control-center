import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Megaphone, Layers, Upload, MapPin } from '@/lib/icons'
import { isTestRecord } from '../../lib/recordHygiene'
import { useRealtimeGuests, type GuestRow, type GuestStatus, type GuestPodcastTarget } from '../../hooks/useRealtimeGuests'
import { useVisibilityTargets, type VisibilityTargetRow, type VisibilityTargetStatus } from '../../hooks/useVisibilityTargets'
import { SwipeCockpit } from '../shared/SwipeCockpit'
import { buildGuestsTriageConfig, buildVisibilityTargetsTriageConfig } from '../../lib/triageConfig'
import { dismissTriageToday, triageDismissedToday } from '../../lib/triageDismissal'
import { useToast } from '../shared/Toast'
import { GuestImportDropzone } from '../GuestImportDropzone'
import { VisibilityImportDropzone } from '../VisibilityImportDropzone'
import { StatusLane, EmptyLanes } from './StatusLane'
import { DecisionDetail } from '../DecisionDetail'
import { NextVisibilityHero } from '../guests/NextVisibilityHero'
import { SlideOver } from '../shared/SlideOver'
import { BackburnerSection } from '../shared/BackburnerSection'
import { navigateDecision } from '../../lib/routeDecision'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useFocusMode, isFocusModeEnabled } from '../../hooks/useFocusMode'
import { FocusLanes, FocusModeToggle } from '../focus/FocusLanes'
import { GuestCard } from '../GuestCard'
import { VisibilityTargetCard } from '../VisibilityTargetCard'
import { BoardSkeleton } from '../shared/Skeleton'
import { FreshnessLine } from '../shared/FreshnessLine'
import { AppFrame } from '../shared/AppFrame'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { Eyebrow } from '../shared/Eyebrow'
import { EventsLane } from '../events/EventsLane'
import { useEvents } from '../../hooks/useEvents'

// Three lanes as of 2026-09-24. The lane called Events used to read
// visibility_targets, whose live queue that day was 46 press contacts, 9 podcasts
// and one expired call for papers: no events at all. The name now belongs to the
// `events` table, which has carried the city, the date verification and the two
// axes since August and had never been rendered anywhere.
type Lane = 'inbound' | 'events' | 'outbound'

// Recorded/published guests leave Visibility — they're promoted into the Network
// (contacts) as relationships, not opportunities.
const PRIMARY_STATUSES: GuestStatus[] = ['scouted', 'enriched', 'pitched', 'responded', 'scheduled', 'confirmed', 'dropped']

const STATUS_META: Record<GuestStatus, { title: string; description: string }> = {
  scouted: { title: 'Scouted', description: 'Surfaced by Nell or imported, not yet enriched.' },
  enriched: { title: 'Enriched', description: 'Apollo-enriched, ready for outreach.' },
  pitched: { title: 'Pitched', description: 'Outreach sent, awaiting reply.' },
  responded: { title: 'Responded', description: 'Replied, awaiting scheduling.' },
  scheduled: { title: 'Scheduled', description: 'On the calendar. Confirm to fire the cascade.' },
  confirmed: { title: 'Confirmed', description: 'Cascade fired (prep, recording, promo drafts, email, follow-up).' },
  recorded: { title: 'Recorded', description: 'Episode in the can.' },
  published: { title: 'Published', description: 'Live in the feed.' },
  dropped: { title: 'Dropped', description: 'Not a fit, archived.' },
  skipped: { title: 'Skipped', description: 'Passed during triage.' },
}

const TARGET_META: Record<GuestPodcastTarget, { title: string }> = {
  signal_noise: { title: 'Signal & Noise' },
  builder_economy: { title: 'Builder Economy (retired)' },
  either: { title: 'Either show' },
}

const VIS_STATUSES: VisibilityTargetStatus[] = ['sourced', 'queued', 'applied', 'accepted', 'rejected', 'done', 'dropped']

const VIS_STATUS_META: Record<VisibilityTargetStatus, { title: string; description: string }> = {
  sourced:  { title: 'Sourced',  description: 'Nova found it. Not yet deep-enriched or triaged.' },
  queued:   { title: 'Queued',   description: 'Enriched, awaiting Krish decision.' },
  applied:  { title: 'Applied',  description: 'Pitch sent, waiting on a reply.' },
  accepted: { title: 'Accepted', description: 'Confirmed. Time to prep.' },
  rejected: { title: 'Rejected', description: 'No fit this round.' },
  done:     { title: 'Done',     description: 'Delivered.' },
  dropped:  { title: 'Dropped',  description: 'Not pursued.' },
}

interface Props {
  onOpenGuest?: (id: string) => void
  onOpenTarget?: (id: string) => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  guestId?: string | null
  targetId?: string | null
  onClearDetail?: () => void
}

export function DesktopGuests({ onOpenGuest, onOpenTarget, onNavigate, guestId, targetId, onClearDetail }: Props = {}) {
  const [lane, setLane] = useState<Lane>('inbound')
  const { toast } = useToast()
  const [triageOpen, setTriageOpen] = useState(false)
  // Import is a once-a-week action. It used to hold the top-left 400x160px of
  // the board — the most valuable real estate on the tab — above a table of
  // zeros. It lives in a sheet behind a header button now.
  const [importOpen, setImportOpen] = useState(false)
  // Coherence wave 1 (v2 idiom): bounded typed queue first, lanes as browse.
  const autoOpenedRef = useRef(false)
  const { guests: allGuests, loading: guestsLoading } = useRealtimeGuests()
  const { targets: allTargets, loading: targetsLoading } = useVisibilityTargets({ includeArchived: false })
  const guests = useMemo(() => allGuests.filter(g => !g.buried_at && !isTestRecord(g)), [allGuests])
  const targets = useMemo(() => allTargets.filter(t => !t.buried_at && !isTestRecord(t)), [allTargets])
  const buriedGuests = useMemo(() => allGuests.filter(g => g.buried_at && !isTestRecord(g)), [allGuests])
  const buriedTargets = useMemo(() => allTargets.filter(t => t.buried_at && !isTestRecord(t)), [allTargets])
  const { mode, setMode } = useFocusMode()
  const { today: focusToday } = useDailyFocus()
  const calibrated = focusToday?.status === 'calibrated' || focusToday?.status === 'complete'

  useEffect(() => {
    if (guestId) setLane('inbound')
    if (targetId) setLane('outbound')
  }, [guestId, targetId])

  const detailDecision = guestId
    ? `guest:${guestId}`
    : targetId
      ? `visibility:${targetId}`
      : null

  const byStatus = useMemo(() => groupByStatus(guests), [guests])
  const byTarget = useMemo(() => groupByTarget(guests), [guests])
  const inboundActive = guests.filter(g => g.status !== 'dropped' && g.status !== 'published').length

  const byVisStatus = useMemo(() => groupByVisStatus(targets), [targets])
  const outboundActive = targets.filter(t => t.status !== 'dropped' && t.status !== 'done').length

  const { home: eventsHere, loading: eventsLoading } = useEvents()
  const eventsHereCount = eventsHere.length

  const loading = lane === 'inbound' ? guestsLoading : lane === 'events' ? eventsLoading : targetsLoading
  const activeCount = lane === 'inbound' ? inboundActive : lane === 'events' ? eventsHereCount : outboundActive

  // Desktop triage cockpit — the active lane's untriaged queue (guests to pitch
  // / targets to apply), same swipe grammar as mobile.
  const guestConfig = useMemo(() => buildGuestsTriageConfig(guests, { toast }, guestsLoading), [guests, toast, guestsLoading])
  const targetConfig = useMemo(() => buildVisibilityTargetsTriageConfig(targets, { toast }, targetsLoading), [targets, toast, targetsLoading])
  const triageConfig = lane === 'inbound' ? guestConfig : targetConfig
  const triageSurface = lane === 'inbound' ? 'guests' : 'visibility'
  // Events is a board, never a deck. The decision on a room is not binary:
  // "away, needs a trip" is a real third answer, and a swipe that cleared it
  // would discard the row a booked trip makes live.
  const deckable = lane === 'inbound' || lane === 'outbound'

  // v2 idiom: land in the bounded typed queue when one is waiting; closing it
  // browses the status lanes without a mid-session re-open.
  useEffect(() => {
    if (loading || autoOpenedRef.current) return
    // Landing decision happens exactly once, on the first settled load; a
    // later realtime arrival must never yank the user into the deck mid-task.
    autoOpenedRef.current = true
    // A ref only survives this mount, so leaving the tab and returning used to
    // re-trigger the deck. Dismissal is now remembered for the civil day.
    if (triageDismissedToday(triageSurface)) return
    if (triageConfig.items.length > 8) setTriageOpen(true)
  }, [loading, triageConfig.items.length])

  const handleOpenGuest = onOpenGuest || ((id: string) => navigateDecision(onNavigate || (() => {}), 'guest', id))
  const openTarget = onOpenTarget || ((id: string) => navigateDecision(onNavigate || (() => {}), 'visibility', id))

  // Next action targets the most-urgent decision waiting.
  // Inbound: scheduled guests awaiting confirmation (the "RSVP" moment).
  // Outbound: queued visibility targets closest to deadline.
  const inboundDecision = useMemo(() => {
    const scheduled = guests.filter(g => g.status === 'scheduled')
    return scheduled.sort((a, b) => {
      const aSched = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity
      const bSched = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity
      return aSched - bSched
    })[0] || null
  }, [guests])

  const outboundDecision = useMemo(() => {
    const queued = targets.filter(t => t.status === 'queued')
    return queued.sort((a, b) => {
      const aDl = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity
      const bDl = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity
      return aDl - bDl
    })[0] || null
  }, [targets])

  const scheduledCount = guests.filter(g => g.status === 'scheduled').length
  const queuedCount = targets.filter(t => t.status === 'queued').length

  const insightInbound = inboundDecision
    ? `${scheduledCount} scheduled · top: ${inboundDecision.name || inboundDecision.email || 'unnamed'}`
    : `${inboundActive} active · no scheduled guests awaiting confirmation`
  const insightOutbound = outboundDecision
    ? `${queuedCount} queued · top: ${outboundDecision.title}${outboundDecision.deadline_at ? ` (${daysUntil(outboundDecision.deadline_at)})` : ''}`
    : `${outboundActive} active · no queued opportunities awaiting decision`

  // Focus Mode (Phase 3): when enabled and the day is calibrated, the active
  // lane's list regroups into the 3 daily-target lanes via relevance_index.
  // Inbound keys off 'guests' (not yet pooled, so lanes may be empty until then),
  // outbound off 'visibility_targets' (already pooled by the calibrator).
  const showFocus = isFocusModeEnabled() && !!calibrated && mode === 'focus'
  const renderGuestRow = (g: GuestRow) => <GuestCard guest={g} onOpen={handleOpenGuest} />
  const renderTargetRow = (t: VisibilityTargetRow) => <VisibilityTargetCard target={t} onOpen={openTarget} />

  // Desktop loads the board's architecture at once — inbound + outbound breadth.
  if ((guestsLoading || targetsLoading) && allGuests.length === 0 && allTargets.length === 0) {
    return (
      <AppFrame
        header={<SurfaceHeader title="Visibility" icon={<Mic size={18} className="text-accent" />} meta={<span className="text-micro text-ink-faint">Gathering people and events…</span>} className="pb-4" />}
      >
        <BoardSkeleton lanes={2} cardsPerLane={3} hero={false} />
      </AppFrame>
    )
  }

  // Triage is a stage, not a page: the cockpit fills whatever height is left
  // under its one-line header and never scrolls. `scroll='none'` is what lets
  // the cockpit's rails size themselves off the real frame instead of the
  // `h-[calc(100vh-170px)]` guess they used to carry.
  if (triageOpen && deckable) {
    return (
      <AppFrame
        scroll="none"
        header={
          <SurfaceHeader
            eyebrow="Visibility"
            title="Triage"
            description={lane === 'inbound' ? 'Right pitches, left skips with a reason.' : 'Right applies, left passes with a reason.'}
            icon={lane === 'inbound' ? <Mic size={18} className="text-accent" /> : <Megaphone size={18} className="text-accent" />}
            className="pb-3"
          />
        }
      >
        {lane === 'inbound' ? (
          <SwipeCockpit config={guestConfig} onExit={() => { dismissTriageToday(triageSurface); setTriageOpen(false) }} onNavigate={onNavigate} />
        ) : (
          <SwipeCockpit config={targetConfig} onExit={() => { dismissTriageToday(triageSurface); setTriageOpen(false) }} onNavigate={onNavigate} />
        )}
      </AppFrame>
    )
  }

  // ── The board ───────────────────────────────────────────────────────────
  //
  // One fixed instrument panel over one scrolling board. What changed on
  // 2026-09-23, measured against the live surface at 1440x900:
  //
  // * The page used to scroll. Five stacked bands — nav, title, description,
  //   lane tabs, hero — put the first row of data at y=330, and the seven
  //   status lanes ran past the fold, so the instruction in the hero scrolled
  //   off the screen exactly when the reader went looking for the row it was
  //   about. Header and hero are now fixed chrome; only the board moves.
  // * Seven empty lanes were seven bordered cards, ~82px each. They are one
  //   line at the foot of the board now (`EmptyLanes`).
  // * The reference rail was on the LEFT, so the first thing the eye met was
  //   an import dropzone and a table of zeros, with the actual pipeline pushed
  //   right. Board leads; the rail is secondary and sits where secondary goes.
  // * Import is a once-a-week action that held the most valuable 400x160px on
  //   the tab. It is a header button that opens a sheet.
  const lanes = lane === 'inbound'
    ? PRIMARY_STATUSES.map(s => ({ key: s, title: STATUS_META[s].title, description: STATUS_META[s].description, rows: byStatus[s] || [] }))
    : VIS_STATUSES.map(s => ({ key: s, title: VIS_STATUS_META[s].title, description: VIS_STATUS_META[s].description, rows: byVisStatus[s] || [] }))
  const filled = lanes.filter(l => l.rows.length > 0)
  const empty = lanes.filter(l => l.rows.length === 0).map(l => l.title)

  // The rail says what THIS lane is made of. It used to read
  // `lane === 'inbound' ? shows : target types`, so the events lane would have
  // been handed a breakdown of calls for papers and newsletters: the same
  // cross-lane mismatch the hero note above records, where the Guests board
  // offered an Apply button for a row the reader could not see.
  //
  // For a room the useful decomposition is who hosts it, because host kind is the
  // shortest answer to "will this be owners or sellers".
  const breakdown = lane === 'inbound'
    ? (Object.keys(TARGET_META) as GuestPodcastTarget[]).map(t => ({ label: TARGET_META[t].title, count: (byTarget[t] || []).length }))
    : lane === 'events'
      ? ([
          ['operator', 'Owner-run rooms'],
          ['community', 'Community'],
          ['media', 'Media'],
          ['vendor', 'Vendor-hosted'],
          ['unknown', 'Not judged yet'],
        ] as const).map(([k, label]) => ({ label, count: eventsHere.filter(e => (e.host_kind || 'unknown') === k).length }))
      : (['cfp', 'conference', 'podcast', 'newsletter', 'guest_appearance', 'other'] as const)
          .map(t => ({ label: t.replace('_', ' '), count: targets.filter(x => x.type === t).length }))

  return (
    <AppFrame
      header={
        <div className="pb-4 space-y-3">
          <SurfaceHeader
            title="Visibility"
            description="Podcast guests to invite, rooms worth being in, and the stages and press to pitch."
            icon={lane === 'inbound' ? <Mic size={18} className="text-accent" /> : lane === 'events' ? <MapPin size={18} className="text-accent" /> : <Megaphone size={18} className="text-accent" />}
            meta={<FreshnessLine lane="visibility" />}
            actions={
              <>
                {isFocusModeEnabled() && calibrated && <FocusModeToggle mode={mode} onChange={setMode} />}
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] hover:border-white/25 hover:bg-white/[0.04] px-3 py-1.5 text-label font-medium text-ink-muted hover:text-ink transition-colors"
                >
                  <Upload size={14} /> Import
                </button>
                {deckable && triageConfig.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTriageOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/[0.12] hover:bg-accent/20 px-3 py-1.5 text-label font-semibold text-ink transition-colors"
                  >
                    <Layers size={14} className="text-accent" /> Handle 1-by-1 · {triageConfig.items.length}
                  </button>
                )}
              </>
            }
          />

          {/* The lane switch carries the active count, so the orphaned
              "70 active" that used to float alone in the top-right corner —
              unaligned with anything and attached to no noun — is gone. */}
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.015] p-1">
              <LaneTab active={lane === 'inbound'} onClick={() => setLane('inbound')}>
                Guests <span className="ml-1.5 text-micro font-mono tabular-nums text-ink-faint">{inboundActive}</span>
              </LaneTab>
              <LaneTab active={lane === 'events'} onClick={() => setLane('events')}>
                {/* The count is rooms in the city he is in. An away room is real
                    but it is not something he can do this week, and a badge over
                    both would overstate the lane. */}
                Events <span className="ml-1.5 text-micro font-mono tabular-nums text-ink-faint">{eventsHereCount}</span>
              </LaneTab>
              <LaneTab active={lane === 'outbound'} onClick={() => setLane('outbound')}>
                Speaking &amp; press <span className="ml-1.5 text-micro font-mono tabular-nums text-ink-faint">{outboundActive}</span>
              </LaneTab>
            </div>
            <span className="text-micro text-ink-faint">
              {loading ? 'Loading…' : lane === 'events' ? `${activeCount} where you are` : `${activeCount} active in this lane`}
            </span>
          </div>

          {/* One visibility engine — same hero as every tab. It now speaks for
              the lane on screen: on the Guests board it used to read "Apply to
              Section AI Strategy Summit", an event from the other half, with an
              Apply button acting on a row the reader could not see. */}
          {/* Events orders itself: the room he can walk into is already at the
              top of its board, so a second "do this next" above it would be two
              answers to one question. */}
          {lane !== 'events' && (
            <NextVisibilityHero
              guests={guests}
              targets={targets}
              lane={lane === 'inbound' ? 'inbound' : 'outbound'}
            />
          )}
        </div>
      }
    >
      <SlideOver open={!!detailDecision} onClose={() => onClearDetail?.()}>
        {detailDecision && <DecisionDetail key={detailDecision} decision={detailDecision} actionsEnabled />}
      </SlideOver>

      <SlideOver open={importOpen} onClose={() => setImportOpen(false)} ariaLabel="Import" label="Import">
        <div className="p-5 space-y-3">
          <Eyebrow>Import {lane === 'inbound' ? 'guests' : 'opportunities'}</Eyebrow>
          {lane === 'inbound' ? <GuestImportDropzone /> : <VisibilityImportDropzone />}
          {lane === 'events' && (
            <p className="text-micro text-ink-faint leading-snug">
              This door writes a speaking or press row, not an event. Events arrive
              from the nightly sweep, or from an invite in your inbox.
            </p>
          )}
        </div>
      </SlideOver>

      <div className="grid grid-cols-1 lg:[grid-template-columns:minmax(0,2.4fr)_minmax(240px,1fr)] gap-5 items-start pb-2">
        <div className="space-y-3 min-w-0">
          {/* Events groups by ACTIONABILITY, not by status. Every other board here
              groups by workflow status because the question is "where has this got
              to"; for a room the question is "can I actually be there", which is a
              function of where he is standing this week and of nothing on the row.
              Focus Mode does not apply for the same reason: it regroups by
              relevance_index, and the attend lane's own ordering already answers a
              sharper question. */}
          {lane === 'events' ? (
            <EventsLane />
          ) : showFocus ? (
            lane === 'inbound' ? (
              <FocusLanes
                rows={guests}
                table="guests"
                keyOf={(r) => String(r.id)}
                renderItem={renderGuestRow}
                fallback={null}
                mutedLabel="Off focus"
              />
            ) : (
              <FocusLanes
                rows={targets}
                table="visibility_targets"
                keyOf={(r) => String(r.id)}
                renderItem={renderTargetRow}
                fallback={null}
                mutedLabel="Off focus"
              />
            )
          ) : (
            <>
              {filled.map(l => (
                <StatusLane
                  key={l.key}
                  status={l.key}
                  title={l.title}
                  description={l.description}
                  items={l.rows as Array<GuestRow | VisibilityTargetRow>}
                  keyOf={(r) => String(r.id)}
                  renderItem={(r) =>
                    lane === 'inbound'
                      ? renderGuestRow(r as GuestRow)
                      : renderTargetRow(r as VisibilityTargetRow)}
                  defaultCollapsed={l.key === 'dropped' || l.key === 'done'}
                />
              ))}
              <EmptyLanes names={empty} />
            </>
          )}
          {/* Events has no backburner. A room is archived only when it is DEAD
              (the date passed, the deadline passed, a temporary claim expired), and
              a dead room is not something to restore. The lane it would otherwise
              need is "away, needs a trip", and that is a lane on the board rather
              than a drawer under it, because a booked trip makes those live. */}
          {lane !== 'events' && (
            <BackburnerSection
              table={lane === 'inbound' ? 'guests' : 'visibility_targets'}
              items={lane === 'inbound'
                ? buriedGuests.map(g => ({ id: g.id, title: g.name || '(unnamed)', buried_reason: g.buried_reason }))
                : buriedTargets.map(t => ({ id: t.id, title: t.title || '(untitled)', buried_reason: t.buried_reason }))}
            />
          )}
        </div>

        {/* The rail: what the lane is made of, and nothing that asks for a
            decision. Secondary material on the secondary side. */}
        <aside className="space-y-4 min-w-0">
          <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <Eyebrow>{lane === 'inbound' ? 'By show' : lane === 'events' ? 'Who hosts them' : 'By type'}</Eyebrow>
            <ul className="mt-2 space-y-1">
              {breakdown.map(b => (
                <li key={b.label} className="flex items-center justify-between gap-2 py-0.5 text-label">
                  <span className={`capitalize ${b.count > 0 ? 'text-ink-muted' : 'text-ink-faint'}`}>{b.label}</span>
                  <span className={`font-mono tabular-nums ${b.count > 0 ? 'text-ink-muted' : 'text-ink-faint'}`}>{b.count}</span>
                </li>
              ))}
            </ul>
          </section>

          {lane === 'events' && (
            <section className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
              <Eyebrow>How a room is judged</Eyebrow>
              <p className="mt-2 text-label text-ink-muted leading-snug">
                Peers is how much of the room runs a business with real revenue. Buyers is
                how much of it could hire you or buy a pilot. A room of engineers scores
                zero on Peers however good the talk is, and a room of sellers is marked
                down on both. Rooms in other cities stay on the board, because a booked
                trip makes them live.
              </p>
            </section>
          )}

          {lane === 'outbound' && (
            <section className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
              <Eyebrow>Enrichment</Eyebrow>
              <p className="mt-2 text-label text-ink-muted leading-snug">
                Nova fires deep enrichment on each sourced target twice daily. Each row gets strategic value, angle, proposed talk, audience snapshot, CFP requirements, and a prep checklist. Click any card to view the deep detail.
              </p>
            </section>
          )}
        </aside>
      </div>
    </AppFrame>
  )
}


function LaneTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-label rounded-md transition-colors ${
        active
          ? 'bg-violet-500/20 border border-violet-400/40 text-violet-100'
          : 'border border-transparent text-ink-faint hover:text-ink-muted'
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function daysUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'today'
  return `${days}d`
}

// Best-worth-it first: weak (low-triage) guests sink to the bottom of each group.
function byTriageDesc(a: GuestRow, b: GuestRow): number {
  return (b.triage_score ?? -1) - (a.triage_score ?? -1)
}

function groupByStatus(guests: GuestRow[]): Partial<Record<GuestStatus, GuestRow[]>> {
  const out: Partial<Record<GuestStatus, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.status] || (out[g.status] = [])
    arr.push(g)
  }
  for (const k of Object.keys(out) as GuestStatus[]) out[k]!.sort(byTriageDesc)
  return out
}

function groupByTarget(guests: GuestRow[]): Partial<Record<GuestPodcastTarget, GuestRow[]>> {
  const out: Partial<Record<GuestPodcastTarget, GuestRow[]>> = {}
  for (const g of guests) {
    const arr = out[g.podcast_target] || (out[g.podcast_target] = [])
    arr.push(g)
  }
  return out
}

function groupByVisStatus(targets: VisibilityTargetRow[]): Partial<Record<VisibilityTargetStatus, VisibilityTargetRow[]>> {
  const out: Partial<Record<VisibilityTargetStatus, VisibilityTargetRow[]>> = {}
  for (const t of targets) {
    const arr = out[t.status] || (out[t.status] = [])
    arr.push(t)
  }
  return out
}
