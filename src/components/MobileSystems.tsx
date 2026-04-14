import React, { useState, useEffect } from 'react'
import {
  MobileShell, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState,
} from './mobile/primitives'

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

export function MobileSystems() {
  const [data, setData] = useState<SystemsData | null>(null)

  const refresh = () => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('system_health').select('*').then(({ data: rows }) => {
        const catMap = new Map<string, Service[]>()
        for (const r of rows || []) {
          const details = typeof r.details === 'string' ? JSON.parse(r.details) : (r.details || {})
          const catName = details.category || r.component?.split('-')[0] || 'General'
          if (!catMap.has(catName)) catMap.set(catName, [])
          catMap.get(catName)!.push({
            id: r.id,
            name: details.name || r.component,
            url: details.url,
            status: r.status === 'healthy' ? 'green' : r.status === 'degraded' ? 'amber' : r.status === 'failing' ? 'red' : 'unknown',
            note: r.message || details.note || details.status || '',
            last_checked: r.last_check,
          })
        }
        const categories: Category[] = []
        catMap.forEach((services, label) => {
          categories.push({ id: label.toLowerCase().replace(/\s/g, '-'), label, services })
        })
        setData({ updated_at: new Date().toISOString(), categories })
      })
    }).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  if (!data) {
    return (
      <MobileShell header={<TabHeader title="Systems" />}>
        <EmptyState label="Loading systems…" />
      </MobileShell>
    )
  }

  const all = data.categories.flatMap(c => c.services.map(s => ({ ...s, category: c.label })))
  const red   = all.filter(s => s.status === 'red')
  const amber = all.filter(s => s.status === 'amber')
  const green = all.filter(s => s.status === 'green')

  const hero = red[0] ?? amber[0]

  return (
    <MobileShell
      header={<TabHeader title="Systems" subtitle={`${all.length} services · monitored by Arlo`} />}
    >
      {hero ? (
        <HeroCard
          eyebrow={`${hero.category} · ${hero.status === 'red' ? 'Down' : 'Degraded'}`}
          accent={hero.status === 'red' ? 'red' : 'amber'}
          dotColor={STATUS_DOT[hero.status]}
          title={hero.name}
          detail={hero.note}
          cta={hero.url ? 'Open' : undefined}
          onClick={hero.url ? () => window.open(hero.url, '_blank') : undefined}
        />
      ) : (
        <HeroCard
          eyebrow="All systems"
          accent="emerald"
          dotColor="bg-emerald-400"
          title="All green"
          detail={`${green.length} services healthy.`}
        />
      )}

      <div className="flex gap-3">
        <StatPill label="Green" value={green.length} color="text-emerald-400" />
        <StatPill label="Amber" value={amber.length} color={amber.length > 0 ? 'text-amber-400' : 'text-white/60'} />
        <StatPill label="Red"   value={red.length}   color={red.length > 0 ? 'text-red-400' : 'text-white/60'} />
      </div>

      {data.categories.map(cat => (
        <FeedCard key={cat.id} title={cat.label}>
          {cat.services.map(s => (
            <FeedRow
              key={s.id}
              dotColor={STATUS_DOT[s.status] ?? 'bg-white/20'}
              title={s.name}
              detail={s.note}
              onClick={s.url ? () => window.open(s.url, '_blank') : undefined}
              trailing={<span className={`text-[12px] font-semibold uppercase tracking-wider ${
                s.status === 'green' ? 'text-emerald-300' :
                s.status === 'amber' ? 'text-amber-300' :
                s.status === 'red'   ? 'text-red-300' : 'text-white/45'
              }`}>{s.status}</span>}
            />
          ))}
        </FeedCard>
      ))}
    </MobileShell>
  )
}
