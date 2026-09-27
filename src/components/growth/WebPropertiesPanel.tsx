import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Globe, RefreshCw } from '@/lib/icons'
import { BTN_GHOST, BTN_PRIMARY, Chip, EmptyNote, SectionHead } from './atoms'
import { Eyebrow } from '../shared/Eyebrow'
import { IconTile } from '../shared/IconTile'
import { Sparkline } from '../shared/Sparkline'
import { SkeletonList } from '../shared/Skeleton'
import { useDeferredPending } from '../shared/useDeferredPending'
import { Pending } from '../shared/Pending'
import { useToast } from '../shared/Toast'
import { useContainerWidth } from '../../hooks/useContainerWidth'
import { useElapsed } from '../../hooks/useAsyncAction'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { useWebInsights } from '../../hooks/useWebInsights'
import { useWork } from '../../lib/loadingVoice'
import { relativeTimeOr } from '../../lib/ageHelpers'
import { civilYmd } from '../../lib/civilDate'
import { requestOk, failureMessage } from '../../lib/apiFetch'
import { ventureLabel } from '../../lib/ventureOptions'
import { jobLabel } from '../../content/jobs'
import {
  DONE_HINT, FLAG_LINE, HEALTH_CHIP,
  type HealthVerdict, type KrishAction, type WebPropertyView, type WebRow,
} from '../../lib/webProperties'

/**
 * SITE VISITS: one honest read of each of the four sites, once a day.
 *
 * Krish tagged fulltime.fm and legibility.io on 2026-09-27 and asked for one
 * read of all four sites, what the OS fixed on its own, and the one thing only
 * he can do on each. So every card says, in this order: whether the property is
 * even being counted (the health chip), the one sentence worth reading (the
 * insight), the numbers only when the read succeeded, what was fixed without
 * him, and then his one action. The evidence folds underneath.
 *
 * Nothing here decides anything. The verdicts, the ladder and every sentence are
 * written by api/growth/web-insights.ts into web_property_insights; this panel
 * renders the view it is handed. An unmeasured site shows its health line and
 * no numbers, never a zero.
 *
 * The one write is "Put on today", through the same route the Home list uses
 * (POST /api/daily-focus/slot), which is also the done-detector for most growth
 * actions. It lives in ActionBlock so no daily_focus read happens unless an
 * action is actually on screen.
 */

/** Chip tone per verdict, 200 shades per DESIGN_SYSTEM.md. */
const HEALTH_TONE: Record<HealthVerdict, string> = {
  ok: 'text-emerald-200 border-emerald-300/30',
  quiet: 'text-emerald-200 border-emerald-300/30',
  provisional: 'text-sky-200 border-sky-300/30',
  api_disabled: 'text-amber-200 border-amber-300/30',
  no_access: 'text-rose-200 border-rose-300/30',
  wrong_stream: 'text-rose-200 border-rose-300/30',
  tag_missing: 'text-rose-200 border-rose-300/30',
  never_received: 'text-rose-200 border-rose-300/30',
}

/** Verdicts whose read succeeded, so a number under them means something. */
const READABLE: ReadonlySet<HealthVerdict> = new Set(['ok', 'quiet', 'provisional'])

const WIDE_PX = 720
const RING = ['ring-2', 'ring-amber-300/50']

type Navigate = (tab: string, params?: Record<string, string>) => void

/** '2026-09-27' -> '27 September'; anything unparseable comes back as given. */
function dayMonth(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function WebPropertiesPanel({ variant, focus, onNavigate }: {
  variant: 'desktop' | 'mobile'
  /** The Growth hero's "Show me": `n` bumps on every press, `prefix` names the
   *  card ('shared' for the step at the top). */
  focus?: { prefix: string; n: number }
  onNavigate?: Navigate
}) {
  const { data, loaded, error, empty, refreshing, refresh } = useWebInsights()
  const { toast } = useToast()
  const readWork = useWork('web.read')
  const refreshWork = useWork('web.refresh')
  const pending = useDeferredPending(!loaded)
  // A check runs for about a minute; past three seconds it says how long, and
  // past its expected time it says so (the loading ladder).
  const refreshMs = useElapsed(refreshing)

  // One element carries both the width observer and the focus lookup. The
  // observer is on the panel root, not the grid: the grid is what gets resized.
  const [widthRef, width] = useContainerWidth<HTMLElement>()
  const rootRef = useRef<HTMLElement | null>(null)
  const setRoot = useCallback((node: HTMLElement | null) => {
    rootRef.current = node
    widthRef(node)
  }, [widthRef])

  // The CouncilFeed focusSignal pattern: bring the named action into view and
  // ring it briefly. Waits for the data if the press came before the read.
  const handled = useRef(0)
  const ringTimer = useRef<number | undefined>(undefined)
  const n = focus?.n ?? 0
  const prefix = focus?.prefix ?? ''
  useEffect(() => {
    if (n <= handled.current || !loaded) return
    const root = rootRef.current
    if (!root) return
    const target = prefix === 'shared'
      ? root.querySelector<HTMLElement>('[data-testid="growth-web-shared-action"]')
      : root.querySelector<HTMLElement>(`[data-testid="growth-web-action-${prefix}"]`)
        ?? root.querySelector<HTMLElement>(`[data-testid="growth-web-card-${prefix}"]`)
    if (!target) return
    handled.current = n
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add(...RING)
    window.clearTimeout(ringTimer.current)
    ringTimer.current = window.setTimeout(() => target.classList.remove(...RING), 1600)
  }, [n, prefix, loaded, data])
  useEffect(() => () => window.clearTimeout(ringTimer.current), [])

  // Never a dead button: when a check ran under ten minutes ago the route says
  // so with a 429, and the toast carries the wait.
  const check = async () => {
    const r = await refresh()
    if (r.result === 'ok') toast('Checked. The cards are up to date.', 'success')
    else if (r.result === 'too_soon') {
      const m = Math.max(1, Math.ceil((r.retryAfterS ?? 600) / 60))
      toast(`Checked less than 10 minutes ago. Try again in ${plural(m, 'minute', 'minutes')}.`, 'info')
    } else toast(r.message || 'Could not check the sites.', 'error')
  }

  const desk = variant === 'desktop'
  const wide = width >= WIDE_PX
  const tableMissing = data?.setup === 'table_missing'

  return (
    <section ref={setRoot} data-testid="growth-web" className="space-y-3">
      <SectionHead
        title={desk ? 'Site visits' : undefined}
        sub={desk ? 'Four sites, read once a day after Google finishes counting.' : undefined}
        action={
          <button
            type="button"
            data-testid="growth-web-check"
            onClick={() => void check()}
            disabled={refreshing}
            aria-busy={refreshing || undefined}
            className={`${BTN_GHOST} tap-44 inline-flex items-center gap-1.5`}
          >
            {refreshing
              ? <Pending label={refreshWork.label} elapsedMs={refreshMs} expectedMs={refreshWork.expectedMs} />
              : <><RefreshCw size={14} /> Check now</>}
          </button>
        }
      />

      {!loaded ? (
        <div aria-label={readWork.label} aria-busy="true">
          <SkeletonList rows={2} card={false} quiet={!pending} />
        </div>
      ) : (
        <>
          {error && <p className="text-label text-rose-300">{error}</p>}

          {!data && empty && (
            <EmptyNote>
              <span data-testid="growth-web-empty">
                Nothing has been checked yet. Control Center reads the four sites every day at 13:20 UTC, or now if you press Check now.
              </span>
            </EmptyNote>
          )}

          {data && (
            <>
              <p className="text-micro text-ink-faint">
                {data.last_run?.run_at
                  ? `Last checked ${relativeTimeOr(data.last_run.run_at, 'recently')}. Next check at 13:20 UTC.`
                  : 'Not checked yet. Next check at 13:20 UTC.'}
              </p>

              {tableMissing ? (
                <EmptyNote>
                  <span data-testid="growth-web-empty">
                    The table these checks are stored in is not in the database yet. It arrives with this change&apos;s migration.
                  </span>
                </EmptyNote>
              ) : (
                <>
                  {data.shared_action && (
                    <div data-testid="growth-web-shared-action" className="rounded-lg transition-shadow">
                      <ActionBlock action={data.shared_action} testKey="shared" onNavigate={onNavigate} />
                    </div>
                  )}
                  <div className={wide ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
                    {data.properties.map(p => (
                      <PropertyCard key={p.prefix} view={p} evidenceOpenAtStart={desk} onNavigate={onNavigate} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function PropertyCard({ view, evidenceOpenAtStart, onNavigate }: {
  view: WebPropertyView
  evidenceOpenAtStart: boolean
  onNavigate?: Navigate
}) {
  const [open, setOpen] = useState(evidenceOpenAtStart)
  const { prefix, health, totals, series } = view
  const readable = health != null && READABLE.has(health)
  const settled = health === 'ok' || health === 'quiet'
  const points = (series ?? []).map(s => s.sessions).filter((v): v is number => v != null)
  const flagText = view.flags.map(f => FLAG_LINE[f]).join(' ')

  return (
    <article
      data-testid={`growth-web-card-${prefix}`}
      className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 flex flex-col gap-3 min-w-0"
    >
      <div className="flex flex-wrap gap-2 items-center">
        <IconTile icon={Globe} size="sm" />
        <h3 className="text-ui font-semibold text-ink">{view.label}</h3>
        {/* ventureLabel takes the venture slug, never the metric prefix: 'site'
            and 'mymu' are key prefixes, not ventures. */}
        <Chip>{ventureLabel(view.venture)}</Chip>
        <Chip tone={health ? HEALTH_TONE[health] : undefined}>
          <span data-testid={`growth-web-health-${prefix}`} data-health={health ?? 'none'}>
            {health ? HEALTH_CHIP[health] : 'Not checked'}
          </span>
        </Chip>
      </div>

      <p data-testid={`growth-web-insight-${prefix}`} className="text-body text-ink leading-snug">{view.insight}</p>

      {/* A card never checked already says so in its insight; the health line
          would say it a second time. */}
      {health != null && !readable && <p className="text-label text-ink-faint">{view.health_line}</p>}

      {totals && (
        <div data-testid={`growth-web-numbers-${prefix}`} className="flex items-center gap-3 flex-wrap">
          <p className="text-label text-ink-muted tabular-nums">
            {plural(totals.cur.sessions, 'visit', 'visits')} in 7 days, {totals.prev.sessions} the week before
          </p>
          {settled && points.length >= 2 && (
            <Sparkline
              data={points}
              positive={totals.cur.sessions >= totals.prev.sessions}
              w={84}
              h={22}
              ariaLabel="Daily visits, last 4 weeks"
            />
          )}
        </div>
      )}

      <p className="text-micro text-ink-faint">
        {flagText ? `${flagText} ` : ''}Read {relativeTimeOr(view.run_at, 'not yet')}.
      </p>

      {view.closed.map((c, i) => (
        <p key={`${c.title}-${c.closed_at}-${i}`} className="text-label text-ink-muted inline-flex gap-1.5">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <span>{c.how === 'done' ? `Done: ${c.title}` : `Retired unacted: ${c.title}`}</span>
        </p>
      ))}

      {view.fixed.length > 0 && (
        <div data-testid={`growth-web-fixed-${prefix}`} className="flex flex-col gap-1">
          <Eyebrow>Fixed on its own</Eyebrow>
          {view.fixed.slice(0, 3).map(f => (
            <p key={f.id} className="text-label text-ink-faint">
              {f.line} <span className="text-micro">{relativeTimeOr(f.at, '')}</span>
            </p>
          ))}
        </div>
      )}

      {view.action ? (
        <ActionBlock action={view.action} testKey={prefix} onNavigate={onNavigate} />
      ) : view.wait_line ? (
        <p data-testid={`growth-web-waiting-${prefix}`} className="text-label text-ink-faint">{view.wait_line}</p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-testid={`growth-web-evidence-${prefix}`}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="tap-44 self-start inline-flex items-center gap-1.5 text-label text-ink-muted"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} /> The evidence
        </button>
        {open && <Evidence view={view} />}
      </div>
    </article>
  )
}

function Rows({ title, rows }: { title: string; rows: WebRow[] }) {
  if (!rows.length) return null
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{title}</Eyebrow>
      {rows.map(r => (
        <p key={r.name} className="text-label text-ink-muted tabular-nums break-words">{r.name}: {r.sessions}</p>
      ))}
    </div>
  )
}

function Evidence({ view }: { view: WebPropertyView }) {
  const { top, crosscheck: cc } = view
  const nothing = !top.sources.length && !top.pages.length && !top.ai.length && !cc.posthog && !cc.plausible
    && !view.later.length && !view.drafted.length
  return (
    <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-3">
      {nothing && <p className="text-label text-ink-faint">Nothing read yet.</p>}
      <Rows title="Where visits came from" rows={top.sources} />
      <Rows title="Where they landed" rows={top.pages} />
      <Rows title="From AI answers" rows={top.ai} />
      {(cc.posthog || cc.plausible) && (
        <div className="flex flex-col gap-1">
          {cc.posthog && (
            <p className="text-label text-ink-muted">
              PostHog counted {cc.posthog.pageviews_7d} page views from {cc.posthog.users_7d} people in the 7 days to {dayMonth(cc.posthog.date)}.
            </p>
          )}
          {cc.plausible && (
            <p className="text-label text-ink-muted">Plausible counted {cc.plausible.visits_7d} visits this week.</p>
          )}
        </div>
      )}
      {view.later.length > 0 && (
        <div className="flex flex-col gap-1">
          <Eyebrow>Also needs you, later</Eyebrow>
          {view.later.map(l => <p key={l.id} className="text-label text-ink-muted">{l.line}</p>)}
        </div>
      )}
      {view.drafted.length > 0 && (
        <div className="flex flex-col gap-1">
          <Eyebrow>Handed to Maya</Eyebrow>
          {view.drafted.map(d => (
            <p key={d.id} className="text-label text-ink-muted">
              {d.line}{d.routed === 'unrouted' ? ' Kept here: no Maya row on the map for this site yet.' : ' On the map.'}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

/** '#/people?lane=pilots' -> ['people', { lane: 'pilots' }]. */
function inAppTarget(href: string): [string, Record<string, string>] {
  const [path, qs = ''] = href.slice(2).split('?')
  return [path, Object.fromEntries(new URLSearchParams(qs))]
}

/**
 * The one thing only Krish can do on a site (or, for `shared`, on all of them).
 * Mounts useDailyFocus here and nowhere else in the panel.
 */
function ActionBlock({ action, testKey, onNavigate }: { action: KrishAction; testKey: string; onNavigate?: Navigate }) {
  const { toast } = useToast()
  const { today, refresh: refreshFocus } = useDailyFocus()
  const [acting, setActing] = useState(false)

  // CouncilFeed.putOnToday, with the action's own job: first empty slot, and a
  // full day says so instead of overwriting one.
  const putOnToday = async () => {
    const free = ([1, 2, 3] as const).find(k => !(today?.[`target_${k}_text`] as string | null)?.trim())
    if (!free) { toast("Today's 3 are full. Finish one first, or edit a slot on Home.", 'info'); return }
    setActing(true)
    try {
      await requestOk('/api/daily-focus/slot', {
        method: 'POST',
        body: { date: today?.focus_date ?? civilYmd(new Date()), slot: free, text: action.title.slice(0, 240), job: action.job },
        timeoutMs: 12_000,
      })
      refreshFocus()
      toast(`On today's list, slot ${free}.`, 'success', { action: { label: 'Open Home', onClick: () => onNavigate?.('home') } })
    } catch (e) {
      toast(failureMessage(e, 'Could not put it on today.'), 'error')
    } finally {
      setActing(false)
    }
  }

  const link = action.link
  return (
    <div
      data-testid={`growth-web-action-${testKey}`}
      className={action.rung <= 4
        ? 'rounded-lg border border-amber-300/20 bg-amber-500/[0.06] p-3 flex flex-col gap-2'
        : 'rounded-lg border border-violet-300/20 bg-violet-500/[0.06] p-3 flex flex-col gap-2'}
    >
      <Eyebrow tone="accent">Only you can do this</Eyebrow>
      <p className="text-ui font-semibold text-ink">{action.title}</p>
      <p className="text-label text-ink-muted">{action.why}</p>
      <p className="text-label text-ink-faint">First step: {action.first_step}</p>
      <div className="flex flex-wrap gap-2">
        {jobLabel(action.job) && <Chip>{jobLabel(action.job)}</Chip>}
        <Chip>{action.minutes} min</Chip>
        <Chip>Asked {relativeTimeOr(action.issued_at, 'today')}</Chip>
      </div>
      <p className="text-micro text-ink-faint">
        {DONE_HINT[action.detector.kind]}
        {action.expires_at ? ' If nothing shows it done in 14 days, a fresh one replaces it.' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid={`growth-web-today-${testKey}`}
          onClick={() => void putOnToday()}
          disabled={acting}
          className={`${BTN_PRIMARY} tap-44`}
        >
          Put on today
        </button>
        {link && (link.href.startsWith('#/') ? (
          <button
            type="button"
            onClick={() => { const [tab, params] = inAppTarget(link.href); onNavigate?.(tab, params) }}
            className={`${BTN_GHOST} tap-44`}
          >
            {link.label}
          </button>
        ) : (
          <a className={`${BTN_GHOST} tap-44`} href={link.href} target="_blank" rel="noreferrer">{link.label}</a>
        ))}
      </div>
      {action.alternate && (
        <details>
          <summary className="tap-44 text-label text-ink-muted cursor-pointer">Or, a swing</summary>
          <p className="text-label text-ink-muted mt-1">{action.alternate.title}</p>
          <p className="text-label text-ink-faint">{action.alternate.why}</p>
        </details>
      )}
    </div>
  )
}
