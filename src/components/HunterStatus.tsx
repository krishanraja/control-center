import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, ExternalLink } from '@/lib/icons'
import { Eyebrow } from './shared/Eyebrow'

// Is hunter alive, and what is waiting on Krish. Verdicts are given in the
// Pipeline sheet (canon 9.13 makes it the approval surface), so the waiting
// count links there rather than pretending the decision happens here.

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1AQ8OyprIyJmJ9K7ezjIxkW0uzjGT0TqzRjKtG-NXNOk/edit#gid=708873267'

interface HunterStatusPayload {
  ok: boolean
  lastRun: {
    run_at: string
    status: string
    outcome: string | null
    cost_usd: number | null
    error_message: string | null
  } | null
  alert: { failure_type: string; detail: string | null; run_count: number } | null
  waitingOnKrish: number | null
  approvedAwaitingBuild: number | null
  packagesBuilt: number | null
  nextFireUtc: string
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function until(iso: string): string {
  if (!iso) return 'not scheduled'
  const hrs = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000)
  if (hrs < 24) return `in ${Math.max(hrs, 0)}h`
  return `in ${Math.round(hrs / 24)}d`
}

export function HunterStatus() {
  const [s, setS] = useState<HunterStatusPayload | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/hunter/status')
      .then(r => r.json())
      .then(j => { if (live && j?.ok) setS(j as HunterStatusPayload) })
      .catch(() => { /* the lane is useful without the strip */ })
    return () => { live = false }
  }, [])

  if (!s) return null
  const failing = !!s.alert || s.lastRun?.status === 'error'

  return (
    <section
      className={`rounded-xl border p-3 ${failing
        ? 'border-rose-500/30 bg-rose-500/[0.05]'
        : 'border-white/[0.08] bg-white/[0.02]'}`}
      data-testid="hunter-status"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Eyebrow>Hunter</Eyebrow>
        <span className="text-micro text-white/40">Next run {until(s.nextFireUtc)}</span>
      </div>

      <div className="flex items-center gap-1.5 mt-1.5">
        {failing
          ? <AlertTriangle size={12} className="text-rose-300 shrink-0" />
          : <CheckCircle2 size={12} className="text-emerald-300 shrink-0" />}
        <p className="text-label text-white/75">
          {s.lastRun
            ? failing
              ? `Last run failed ${ago(s.lastRun.run_at)}. ${s.alert?.detail || s.lastRun.error_message || ''}`
              : `Last run ${ago(s.lastRun.run_at)}: ${s.lastRun.outcome || 'completed'}`
            : 'No run has reported yet. The first Monday or Thursday run will fill this in.'}
        </p>
      </div>

      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {s.waitingOnKrish != null && (
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="group flex items-baseline gap-1.5 text-violet-300 hover:text-violet-200"
          >
            <span className="text-ui font-semibold tabular-nums">{s.waitingOnKrish}</span>
            <span className="text-label">
              waiting on your verdict
              <ExternalLink size={10} className="inline ml-1 align-baseline" />
            </span>
          </a>
        )}
        {s.approvedAwaitingBuild != null && s.approvedAwaitingBuild > 0 && (
          <span className="flex items-baseline gap-1.5 text-white/60">
            <span className="text-ui font-semibold tabular-nums text-white/80">{s.approvedAwaitingBuild}</span>
            <span className="text-label">approved, packages build next run</span>
          </span>
        )}
        {s.packagesBuilt != null && (
          <span className="flex items-baseline gap-1.5 text-white/45">
            <Clock size={11} className="self-center" />
            <span className="text-label tabular-nums">{s.packagesBuilt} packages built to date</span>
          </span>
        )}
      </div>
    </section>
  )
}
