import React, { useEffect, useMemo, useState } from 'react'
import { SlidersHorizontal, X, Check } from '@/lib/icons'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../shared/Toast'
import { useHaptics } from '../../../hooks/useHaptics'

type Domain = 'content' | 'lead' | 'visibility'

const DOMAIN_LABEL: Record<Domain, string> = {
  content: 'Content ideas',
  lead: 'Leads',
  visibility: 'Visibility targets',
}

const WEIGHT_KEYS = ['grader_weights_content', 'grader_weights_lead', 'grader_weights_visibility']
const SNOOZE_KEY = 'calibration_card_snoozed_until'
const SCREEN_SIZE = 4
const TARGET_SCREENS = 10

interface CalItem {
  id: string
  title: string
  summary: string
  profile: Record<string, number>
}

/**
 * Dismissable Home card prompting grader calibration, plus the best-worst
 * (MaxDiff) ranking flow itself. Each screen shows 4 REAL agent-generated
 * rows; Krish taps the best, then the worst. Responses persist server-side
 * (calibration_responses), so an abandoned session still counts; Finish fits
 * weights from everything recorded so far and writes grader_weights_<domain>
 * used by the nightly backburner sweep.
 */
export function CalibrationCard() {
  const [uncalibrated, setUncalibrated] = useState<Domain[]>([])
  const [snoozed, setSnoozed] = useState(() => {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return until > Date.now()
  })
  const [flowDomain, setFlowDomain] = useState<Domain | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('system_config').select('key').in('key', WEIGHT_KEYS).then(({ data }) => {
      if (cancelled) return
      const have = new Set((data || []).map(r => (r as any).key))
      const missing = (['content', 'lead', 'visibility'] as Domain[])
        .filter(d => !have.has(`grader_weights_${d}`))
      setUncalibrated(missing)
    })
    return () => { cancelled = true }
  }, [flowDomain])

  if (snoozed || uncalibrated.length === 0) return null

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000))
    setSnoozed(true)
  }

  return (
    <>
      <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4">
        <div className="flex items-start gap-3">
          <SlidersHorizontal size={16} className="text-violet-300 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-body text-white font-medium">Calibrate the grader to your taste</p>
            <p className="text-label text-white/55 mt-0.5 leading-snug">
              The nightly sweep buries low-value agent items using default weights. A 2-minute
              best/worst pass over your real items personalizes what counts as low-value.
            </p>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {uncalibrated.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFlowDomain(d)}
                  className="px-3 py-1.5 rounded-lg border border-violet-400/40 bg-violet-500/15 text-violet-100 text-label font-medium hover:bg-violet-500/25 transition-colors"
                >
                  {DOMAIN_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={snooze}
            className="text-white/35 hover:text-white/70 flex-shrink-0"
            aria-label="Snooze for a week"
            title="Snooze for a week"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {flowDomain && (
        <CalibrationFlow domain={flowDomain} onClose={() => setFlowDomain(null)} />
      )}
    </>
  )
}

function CalibrationFlow({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [items, setItems] = useState<CalItem[] | null>(null)
  const [screenIdx, setScreenIdx] = useState(0)
  const [bestId, setBestId] = useState<string | null>(null)
  const [worstId, setWorstId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [recorded, setRecorded] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/triage/calibrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'items', domain, count: TARGET_SCREENS * SCREEN_SIZE }),
    })
      // Parse defensively — an HTML error page must not surface a raw
      // "Unexpected token '<'…" to the user (see useFleetFunnel).
      .then(async r => {
        const raw = await r.text()
        let json: any = null
        try { json = raw ? JSON.parse(raw) : null } catch { json = null }
        if (cancelled) return
        if (!r.ok || json == null || !json.ok) {
          throw new Error(json?.error || (r.ok ? 'Unexpected response.' : `Unavailable (HTTP ${r.status}).`))
        }
        setItems(json.items as CalItem[])
      })
      .catch(e => {
        if (cancelled) return
        const m = String(e?.message || '')
        setError(/HTTP \d|unexpected|unavailable/i.test(m) ? m : 'Couldn’t load calibration — try again shortly.')
      })
    return () => { cancelled = true }
  }, [domain])

  const screens = useMemo(() => {
    if (!items) return []
    const out: CalItem[][] = []
    for (let i = 0; i + SCREEN_SIZE <= items.length; i += SCREEN_SIZE) {
      out.push(items.slice(i, i + SCREEN_SIZE))
    }
    return out.slice(0, TARGET_SCREENS)
  }, [items])

  const screen = screens[screenIdx] || null
  const done = items !== null && (screenIdx >= screens.length)

  const pick = (id: string) => {
    h.tap()
    if (!bestId) { setBestId(id); return }
    if (id === bestId) { setBestId(null); return }
    setWorstId(prev => (prev === id ? null : id))
  }

  const submitScreen = async () => {
    if (!screen || !bestId || !worstId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/triage/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record',
          domain,
          shown_profiles: screen.map(i => ({ item_id: i.id, profile: i.profile })),
          best_id: bestId,
          worst_id: worstId,
          reason: reason.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      h.success()
      setRecorded(n => n + 1)
      setBestId(null)
      setWorstId(null)
      setReason('')
      setScreenIdx(i => i + 1)
    } catch (e) {
      h.error()
      toast(`Could not record — ${e instanceof Error ? e.message : 'try again'}.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const fit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/triage/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fit', domain }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`)
      h.success()
      toast(`${DOMAIN_LABEL[domain]} grader calibrated from ${json.responses} screens.`, 'success')
      onClose()
    } catch (e) {
      h.error()
      toast(`Could not fit weights — ${e instanceof Error ? e.message : 'try again'}.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const canFinish = recorded >= 3

  return (
    <div className="fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[calc(90vh/var(--z,1))] overflow-y-auto rounded-2xl border border-white/10 bg-base p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-ui font-semibold text-white">
            Calibrate · {DOMAIN_LABEL[domain]}
          </h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/80" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-label text-white/45 mb-4">
          {screen
            ? bestId
              ? 'Now tap the LEAST valuable.'
              : 'Tap the MOST valuable of these four.'
            : ''}
          {screens.length > 0 && ` Screen ${Math.min(screenIdx + 1, screens.length)} of ${screens.length}.`}
        </p>

        {error && <p className="text-label text-rose-300">{error}</p>}
        {!items && !error && <p className="text-label text-white/35">Loading your items…</p>}
        {items && screens.length === 0 && (
          <p className="text-label text-white/55">
            Not enough agent-generated items in this domain to calibrate yet (need at least 4).
          </p>
        )}

        {screen && (
          <div className="space-y-2">
            {screen.map(item => {
              const isBest = item.id === bestId
              const isWorst = item.id === worstId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isBest
                      ? 'border-emerald-400/60 bg-emerald-500/[0.08]'
                      : isWorst
                        ? 'border-rose-400/60 bg-rose-500/[0.08]'
                        : 'border-white/[0.08] bg-white/[0.015] hover:border-white/[0.18]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-body text-white/85 leading-snug">{item.title}</p>
                    {isBest && <span className="text-micro font-bold text-emerald-300 uppercase flex-shrink-0">Best</span>}
                    {isWorst && <span className="text-micro font-bold text-rose-300 uppercase flex-shrink-0">Worst</span>}
                  </div>
                  {item.summary && <p className="text-micro text-white/40 mt-1">{item.summary}</p>}
                </button>
              )
            })}

            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why? (optional, one line)"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-label text-white/80 focus:outline-none focus:border-violet-500/40 placeholder-white/25"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={submitScreen}
                disabled={!bestId || !worstId || busy}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/35 text-violet-200 text-label font-medium hover:bg-violet-500/30 disabled:opacity-40 transition-colors"
              >
                <Check size={12} /> Next
              </button>
              {canFinish && (
                <button
                  type="button"
                  onClick={fit}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg border border-white/10 text-white/60 text-label hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
                >
                  Finish with {recorded} screens
                </button>
              )}
            </div>
          </div>
        )}

        {done && screens.length > 0 && (
          <div className="text-center py-6 space-y-3">
            <p className="text-body text-white/75">All {recorded} screens recorded.</p>
            <button
              type="button"
              onClick={fit}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-500/35 text-violet-200 text-body font-medium hover:bg-violet-500/30 disabled:opacity-40 transition-colors"
            >
              {busy ? 'Fitting…' : 'Fit weights & finish'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
