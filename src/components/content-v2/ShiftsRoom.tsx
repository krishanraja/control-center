import { useMemo, useState } from 'react'
import { X } from '@/lib/icons'
import { contentV2Api, useShiftEvidence, type useContentV2 } from '../../hooks/useContentV2'
import { monthLabel, shiftVerdict, VERDICT_LABEL, type ShiftRow } from '../../lib/contentV2'
import { SkeletonText, SkeletonList } from '../shared/Skeleton'

// The long-term memory with receipts (mockup set 1, mock 3). A shift is one
// durable object whose evidence and momentum accrue week over week; the
// provenance bar keeps the reconstructed-vs-lived split honest by construction.

function Sparkline({ shift }: { shift: ShiftRow }) {
  const points = Array.isArray(shift.momentum_history) ? shift.momentum_history : []
  if (points.length < 2) {
    return <span className="text-micro text-white/30">history accrues weekly</span>
  }
  const w = 120, h = 28, pad = 3
  const max = Math.max(...points.map(p => p.momentum), 1)
  const xy = points.map((p, i) => [
    pad + (i / (points.length - 1)) * (w - pad * 2),
    h - pad - (p.momentum / max) * (h - pad * 2),
  ])
  const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [ex, ey] = xy[xy.length - 1]
  const verdict = shiftVerdict(shift)
  const stroke = verdict === 'fading' ? '#E7B04A' : verdict === 'accelerating' ? '#2FBF96' : '#9AA3B4'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label={`Momentum, ${points.length} weeks, ${VERDICT_LABEL[verdict]}`}>
      <path d={`${path} L${ex.toFixed(1)} ${h - pad} L${xy[0][0].toFixed(1)} ${h - pad} Z`} fill={stroke} opacity="0.12" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r="3" fill={stroke} />
    </svg>
  )
}

function ProvenanceBar({ shift }: { shift: ShiftRow }) {
  if (shift.provenance === 'lived') {
    return <div className="mt-2.5 text-micro text-white/30">lived evidence only</div>
  }
  return (
    <div className="mt-2.5">
      <div className="flex h-1.5 rounded-full overflow-hidden">
        <span className="bg-emerald-900/70" style={{ flex: 7 }} />
        <span className="bg-emerald-400" style={{ flex: 3 }} />
      </div>
      <div className="flex justify-between text-micro text-white/30 mt-1">
        <span>reconstructed</span>
        <span>lived</span>
      </div>
    </div>
  )
}

const VERDICT_CLS: Record<string, string> = {
  accelerating: 'bg-emerald-400/15 text-emerald-300',
  steady: 'bg-white/[0.07] text-white/55',
  fading: 'bg-amber-400/15 text-amber-300',
  new: 'bg-sky-400/15 text-sky-300',
}

function Dossier({ shift, v2, onClose }: {
  shift: ShiftRow
  v2: ReturnType<typeof useContentV2>
  onClose: () => void
}) {
  const { evidence, loading } = useShiftEvidence(shift.id)
  const [seeding, setSeeding] = useState(false)
  const writeFromShift = async () => {
    setSeeding(true)
    try {
      const r = await contentV2Api<{ idea_id: string }>(`/api/shifts/${shift.id}/write`, { method: 'POST', body: '{}' })
      window.location.hash = `#/content?idea=${r.idea_id}`
    } finally {
      setSeeding(false)
    }
  }
  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.04] p-5 mt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-micro font-bold uppercase tracking-[0.14em] text-emerald-300">Dossier · {shift.category}</span>
          <h3 className="text-lede font-bold text-white mt-1">{shift.title}</h3>
          <p className="text-label text-white/55 mt-1 max-w-xl leading-relaxed">{shift.summary}</p>
          <p className="text-label text-emerald-200/80 mt-2 max-w-xl leading-relaxed"><span className="font-semibold">For your org:</span> {shift.implication}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="px-1 text-white/40 hover:text-white/80"><X size={16} /></button>
      </div>

      <div className="mt-4 max-h-64 overflow-y-auto pr-1">
        {loading ? <SkeletonText lines={3} /> : evidence.map(e => (
          <div key={e.id} className="flex gap-3 items-baseline py-2 border-t border-emerald-400/10 text-label">
            <span className="font-mono text-micro text-emerald-200/50 flex-shrink-0 w-20">{e.week_label || monthLabel(e.occurred_on)}</span>
            {e.url ? (
              <a href={e.url} target="_blank" rel="noreferrer" className="text-white/70 hover:text-white flex-1 min-w-0 leading-snug">{e.headline}</a>
            ) : (
              <span className="text-white/70 flex-1 min-w-0 leading-snug">{e.headline}</span>
            )}
            <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-micro font-semibold ${e.provenance === 'lived' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-900/50 text-emerald-200/60'}`}>
              {e.provenance}
            </span>
          </div>
        ))}
        {!loading && evidence.length === 0 ? <div className="text-white/35 text-xs py-3">No evidence rows yet.</div> : null}
      </div>

      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-emerald-400/10">
        <button onClick={writeFromShift} disabled={seeding} className="btn-contrast rounded-lg px-3.5 py-2 text-label font-semibold disabled:opacity-40">
          {seeding ? 'Seeding…' : 'Write from this shift'}
        </button>
        {shift.status === 'proposed' ? (
          <button onClick={() => v2.ruleShift(shift.id, 'accept')} className="rounded-lg px-3.5 py-2 text-label font-semibold bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25">Accept</button>
        ) : null}
        {['active', 'fading'].includes(shift.status) ? (
          <button onClick={() => v2.ruleShift(shift.id, 'retire')} className="rounded-lg px-3.5 py-2 text-label font-semibold bg-white/[0.06] text-white/70 hover:bg-white/[0.1]">Retire</button>
        ) : null}
        {shift.status === 'retired' ? (
          <button onClick={() => v2.ruleShift(shift.id, 'library')} className="rounded-lg px-3.5 py-2 text-label font-semibold bg-white/[0.06] text-white/70 hover:bg-white/[0.1]">Move to Library</button>
        ) : null}
      </div>
    </div>
  )
}

export function ShiftsRoom({ v2, variant, lane }: {
  v2: ReturnType<typeof useContentV2>
  variant: 'desktop' | 'mobile'
  /** Scope to one format. Omit for the whole register. A shift with no lane is
   *  shown in every lane rather than hidden: the detector has not classified it,
   *  and dropping it would silently shrink the register. */
  lane?: 'built' | 'paid'
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const shifts = useMemo(
    () => v2.shifts
      .filter(s => ['proposed', 'active', 'fading'].includes(s.status))
      .filter(s => !lane || !s.lane || s.lane === lane),
    [v2.shifts, lane],
  )
  const open = shifts.find(s => s.id === openId) || null

  if (v2.loading) return <SkeletonList rows={4} />
  if (!shifts.length) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-6 text-white/50 text-sm max-w-xl">
        No shifts yet. The detector runs every Friday and only counts something
        as a shift once it shows up over at least 3 days in at least 3 places.
      </div>
    )
  }

  return (
    <div>
      <div className={`grid gap-3 ${variant === 'desktop' ? 'grid-cols-[repeat(auto-fill,minmax(250px,1fr))]' : 'grid-cols-1'}`}>
        {shifts.map(s => {
          const verdict = shiftVerdict(s)
          return (
            <button
              key={s.id}
              onClick={() => setOpenId(openId === s.id ? null : s.id)}
              className={`text-left rounded-xl border p-4 transition-colors ${
                openId === s.id ? 'border-emerald-400/50 bg-emerald-400/[0.07]' : 'border-emerald-400/20 bg-emerald-400/[0.03] hover:bg-emerald-400/[0.06]'
              }`}
            >
              <span className="text-micro font-bold uppercase tracking-[0.14em] text-emerald-300/90">
                Shift · {s.category}{s.status === 'proposed' ? ' · awaiting your ruling' : ''}
              </span>
              <div className="text-ui font-semibold text-white/95 mt-1.5 leading-snug">{s.title}</div>
              <div className="flex items-center gap-2.5 mt-2.5">
                <Sparkline shift={s} />
                <span className={`rounded-md px-2 py-1 text-micro font-semibold ${VERDICT_CLS[verdict]}`}>{VERDICT_LABEL[verdict]}</span>
              </div>
              <div className="text-micro text-white/35 mt-2 tabular-nums">
                {s.story_count} stories · {s.day_span_total} distinct days · first seen {monthLabel(s.first_seen_on)}
              </div>
              <ProvenanceBar shift={s} />
            </button>
          )
        })}
      </div>
      {open ? <Dossier shift={open} v2={v2} onClose={() => setOpenId(null)} /> : null}
    </div>
  )
}
