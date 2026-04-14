import React, { useState, useEffect } from 'react'
import {
  MobileShell, TabHeader, HeroCard, StatPill, FeedCard, FeedRow, EmptyState,
} from './mobile/primitives'

interface Kpi { label: string; current: string | number; target: string | number }
interface Workstream {
  id: string; name: string; category?: string; categoryLabel?: string
  owner: string; supporting?: string[]; status: string
  lastUpdate?: string; nextAction?: string
  kpi?: Kpi; actionLabel?: string; actionUrl?: string; briefUrl?: string
}

const STATUS_DOT: Record<string, string> = {
  active:    'bg-emerald-400',
  running:   'bg-emerald-400',
  needs_you: 'bg-amber-400',
  blocked:   'bg-red-400',
  waiting:   'bg-white/30',
  pending:   'bg-white/30',
  complete:  'bg-white/20',
  done:      'bg-white/20',
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Active',
  running:   'Running',
  needs_you: 'Needs you',
  blocked:   'Blocked',
  waiting:   'Waiting',
  pending:   'Pending',
  complete:  'Done',
  done:      'Done',
}

export function MobilePlans() {
  const [workstreams, setWorkstreams] = useState<Workstream[]>([])

  const refresh = () => {
    fetch('/data/workstreams.json', { cache: 'no-cache' }).then(r => r.json())
      .then(d => setWorkstreams(d.workstreams || d.items || []))
      .catch(() => {})
  }

  useEffect(() => {
    refresh()
    const iv = setInterval(refresh, 30000)
    return () => clearInterval(iv)
  }, [])

  const needsYou = workstreams.filter(w => w.status === 'needs_you')
  const active   = workstreams.filter(w => w.status === 'active' || w.status === 'running')
  const pending  = workstreams.filter(w => w.status === 'waiting' || w.status === 'pending')
  const other    = workstreams.filter(w => !['needs_you', 'active', 'running', 'waiting', 'pending'].includes(w.status))

  const hero = needsYou[0] ?? active[0]

  return (
    <MobileShell
      header={<TabHeader title="Plans" subtitle={`${workstreams.length} workstreams · ${needsYou.length} need you`} />}
    >
      {hero ? (
        <HeroCard
          eyebrow={`${hero.categoryLabel ?? hero.category ?? ''} · ${STATUS_LABEL[hero.status] ?? hero.status}`}
          accent={hero.status === 'needs_you' ? 'amber' : 'violet'}
          dotColor={STATUS_DOT[hero.status] ?? 'bg-white/30'}
          title={hero.name}
          detail={hero.nextAction}
          meta={`${hero.owner}${hero.supporting?.length ? ' +' + hero.supporting.join(', ') : ''}`}
          cta={hero.actionLabel ?? 'Open'}
          onClick={hero.actionUrl ? () => window.open(hero.actionUrl, '_blank') : undefined}
        />
      ) : (
        <HeroCard
          eyebrow="Plans"
          accent="neutral"
          title="No active workstreams"
          detail="Nothing in flight right now."
        />
      )}

      <div className="flex gap-3">
        <StatPill label="Your move" value={needsYou.length} color={needsYou.length > 0 ? 'text-amber-400' : 'text-white/60'} />
        <StatPill label="Active" value={active.length} color="text-emerald-400" />
        <StatPill label="Pending" value={pending.length} color="text-white/60" />
      </div>

      {needsYou.length > 1 && (
        <FeedCard title={`Needs you · ${needsYou.length - 1} more`}>
          {needsYou.slice(1).map(w => (
            <FeedRow
              key={w.id}
              dotColor={STATUS_DOT[w.status]}
              title={w.name}
              detail={w.nextAction}
              trailing={<span className="text-[12px] font-semibold text-white/55">{w.owner}</span>}
              onClick={w.actionUrl ? () => window.open(w.actionUrl, '_blank') : undefined}
            />
          ))}
        </FeedCard>
      )}

      {active.length > 0 && (
        <FeedCard title={`Active · ${active.length}`}>
          {active.map(w => (
            <FeedRow
              key={w.id}
              dotColor={STATUS_DOT[w.status]}
              title={w.name}
              detail={w.nextAction}
              trailing={<span className="text-[12px] font-semibold text-white/55">{w.owner}</span>}
              onClick={w.briefUrl ? () => window.open(w.briefUrl, '_blank') : undefined}
            />
          ))}
        </FeedCard>
      )}

      {pending.length > 0 && (
        <FeedCard title={`Pending · ${pending.length}`}>
          {pending.map(w => (
            <FeedRow
              key={w.id}
              dotColor={STATUS_DOT[w.status]}
              title={w.name}
              detail={w.nextAction}
              trailing={<span className="text-[12px] font-semibold text-white/55">{w.owner}</span>}
            />
          ))}
        </FeedCard>
      )}

      {other.length > 0 && (
        <FeedCard title={`Done · ${other.length}`}>
          {other.map(w => (
            <FeedRow
              key={w.id}
              dotColor={STATUS_DOT[w.status] ?? 'bg-white/20'}
              title={w.name}
              trailing={<span className="text-[12px] font-medium text-white/45">{STATUS_LABEL[w.status] ?? w.status}</span>}
            />
          ))}
        </FeedCard>
      )}

      {workstreams.length === 0 && <EmptyState label="No workstreams yet." />}
    </MobileShell>
  )
}
