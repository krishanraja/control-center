import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

interface MetricsData {
  north_star: {
    goal: number
    current_mrr: number
    deadline: string
    note: string
  }
  monthly: {
    label: string
    revenue_mtd: number
    revenue_target: number
    content_pieces_live: number
    content_target: number
    pipeline_value: number
    pipeline_target: number
    guest_confirmations: number
    guest_target: number
    deals_in_proposal: number
    clean_vera_audits: number
    vera_audit_target: number
  }
  skyview?: {
    status: string
    value: number
    next_step: string
    owner: string
  }
}

function pct(current: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
}

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
}

function fmt(n: number, prefix = '£'): string {
  if (n >= 1000) return `${prefix}${(n / 1000).toFixed(0)}K`
  return `${prefix}${n}`
}

interface TileProps {
  label: string
  current: string
  target: string
  pct: number
  color?: string
}
function Tile({ label, current, target, pct: p, color = 'bg-violet-500' }: TileProps) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
      <p className="text-[11px] text-white/35 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-[22px] font-bold text-white leading-none">{current}</span>
        <span className="text-[12px] text-white/30">/ {target}</span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${p}%` }}
        />
      </div>
      <p className="text-[10px] text-white/25 mt-1.5">{p}% to target</p>
    </div>
  )
}

export function NorthStar() {
  const [data, setData] = useState<MetricsData | null>(null)

  useEffect(() => {
    const load = () => fetch('/api/metrics', { cache: 'no-cache' }).then(r => r.json()).then(setData).catch(() => {})
    load()
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [])

  if (!data) return (
    <div className="flex items-center gap-2 text-white/30 py-4">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">Loading metrics...</span>
    </div>
  )

  const { north_star: ns, monthly: m } = data
  const mrrPct = pct(ns.current_mrr, ns.goal)
  const days = daysUntil(ns.deadline)

  return (
    <div className="space-y-4">
      {/* North star banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent border border-violet-500/20 p-5">
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl -translate-y-12 translate-x-12 pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mb-1">North Star</p>
              <p className="text-[15px] font-semibold text-white">£0 → £20,000/month</p>
              <p className="text-[12px] text-white/40 mt-0.5">by {new Date(ns.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="text-right">
              <p className="text-[28px] font-black text-white leading-none">{days}</p>
              <p className="text-[11px] text-white/40">days left</p>
            </div>
          </div>
          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-700"
              style={{ width: `${Math.max(mrrPct, 1)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-white/50 font-mono">
              £{ns.current_mrr.toLocaleString()} MRR
            </p>
            <p className="text-[12px] text-white/30">{mrrPct}% of goal</p>
          </div>
          {ns.note && (
            <p className="text-[11px] text-violet-300/50 mt-2 leading-relaxed">{ns.note}</p>
          )}
        </div>
      </div>

      {/* Skyview highlight if active */}
      {data.skyview && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Skyview — £{(data.skyview.value / 1000).toFixed(0)}K</p>
            <p className="text-[12px] text-white/60 mt-0.5">{data.skyview.next_step}</p>
          </div>
          <span className="text-[11px] text-amber-400/70 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-lg flex-shrink-0 ml-4">
            {data.skyview.status}
          </span>
        </div>
      )}

      {/* Monthly metrics tiles */}
      <div>
        <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-3">{m.label} — Monthly Targets</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile
            label="Revenue MTD"
            current={fmt(m.revenue_mtd)}
            target={fmt(m.revenue_target)}
            pct={pct(m.revenue_mtd, m.revenue_target)}
            color="bg-emerald-500"
          />
          <Tile
            label="Pipeline"
            current={fmt(m.pipeline_value)}
            target={fmt(m.pipeline_target)}
            pct={pct(m.pipeline_value, m.pipeline_target)}
            color="bg-amber-500"
          />
          <Tile
            label="Content Live"
            current={String(m.content_pieces_live)}
            target={String(m.content_target)}
            pct={pct(m.content_pieces_live, m.content_target)}
            color="bg-violet-500"
          />
          <Tile
            label="Guest Confirmations"
            current={String(m.guest_confirmations)}
            target={String(m.guest_target)}
            pct={pct(m.guest_confirmations, m.guest_target)}
            color="bg-blue-500"
          />
        </div>
      </div>

      {/* Vera audit gate */}
      <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3">
        <div className="flex gap-1">
          {Array.from({ length: m.vera_audit_target }).map((_, i) => (
            <div
              key={i}
              className={`w-6 h-2 rounded-full transition-colors ${i < m.clean_vera_audits ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}
            />
          ))}
        </div>
        <p className="text-[12px] text-white/40">
          <span className="text-white/70">{m.clean_vera_audits}/{m.vera_audit_target}</span> clean Vera audits — Phase 3 gate
        </p>
      </div>
    </div>
  )
}
