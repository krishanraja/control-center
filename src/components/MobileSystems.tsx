import React, { useState, useEffect } from 'react'
import { Server } from 'lucide-react'

interface Service {
  id: string; name: string; url?: string; status: string; note?: string; last_checked?: string
}
interface Category {
  id: string; label: string; services: Service[]
}
interface SystemsData {
  updated_at: string; categories: Category[]
}

const STATUS_DOT: Record<string, string> = {
  green: 'bg-emerald-400',
  amber: 'bg-amber-400',
  red:   'bg-red-400',
}
const STATUS_RING: Record<string, string> = {
  green: 'ring-emerald-400/20',
  amber: 'ring-amber-400/20',
  red:   'ring-red-400/20',
}

function fmtTime(iso?: string) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export function MobileSystems() {
  const [data, setData] = useState<SystemsData | null>(null)

  const refresh = () => {
    fetch(`/data/systems-status.json?t=${Date.now()}`).then(r => r.json())
      .then(setData).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  if (!data) return (
    <Card>
      <p className="text-[12px] text-white/30">Loading systems…</p>
    </Card>
  )

  const allServices = data.categories.flatMap(c => c.services)
  const greenCount  = allServices.filter(s => s.status === 'green').length
  const amberCount  = allServices.filter(s => s.status === 'amber').length
  const redCount    = allServices.filter(s => s.status === 'red').length

  return (
    <div className="space-y-3">

      {/* ── OVERVIEW ──────────────────────────────────── */}
      <Card>
        <SectionLabel
          icon={<Server className="w-3.5 h-3.5" />}
          color="text-white/50"
          label={`Systems (${allServices.length})`}
        />
        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {[
            { label: 'Healthy',  value: greenCount, color: 'text-emerald-400' },
            { label: 'Warning',  value: amberCount, color: 'text-amber-400'  },
            { label: 'Down',     value: redCount,   color: 'text-red-400'    },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.03] rounded-lg px-2 py-2 text-center">
              <p className={`text-[20px] font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-white/25 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── CATEGORIES ────────────────────────────────── */}
      {data.categories.map(cat => (
        <Card key={cat.id}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2.5">{cat.label}</p>
          <div className="space-y-1">
            {cat.services.map((svc, i) => (
              <div key={svc.id}>
                <div className="flex items-start gap-2.5 py-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ring-2 ${STATUS_DOT[svc.status] ?? 'bg-white/20'} ${STATUS_RING[svc.status] ?? 'ring-white/10'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-white/80 truncate">
                        {svc.url ? (
                          <a href={svc.url} target="_blank" rel="noreferrer"
                            className="hover:text-white transition-colors">
                            {svc.name}
                          </a>
                        ) : svc.name}
                      </p>
                      {svc.last_checked && (
                        <span className="text-[10px] text-white/20 flex-shrink-0">
                          {fmtTime(svc.last_checked)}
                        </span>
                      )}
                    </div>
                    {svc.note && (
                      <p className={`text-[11px] mt-0.5 leading-relaxed ${
                        svc.status === 'red'   ? 'text-red-400/70' :
                        svc.status === 'amber' ? 'text-amber-400/70' :
                        'text-white/35'
                      }`}>{svc.note}</p>
                    )}
                  </div>
                </div>
                {i < cat.services.length - 1 && (
                  <div className="border-t border-white/[0.04]" />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-sm">
      {children}
    </div>
  )
}

function SectionLabel({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      {icon}
      <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
    </div>
  )
}
