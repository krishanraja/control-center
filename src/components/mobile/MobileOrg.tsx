import React, { useEffect, useMemo, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader, HeroCard, FeedCard, FeedRow, EmptyState, MobileLoadingScreen } from './primitives'
import { DetailSheet } from './DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { supabase } from '../../lib/supabase'
import { usePendingCorrections, type PendingCorrection } from '../../hooks/usePendingCorrections'
import { NextOrgHero } from '../org/NextOrgHero'
import { SkillProposalsPanel } from '../shared/SkillProposalsPanel'
import { ProcessingOverlay } from '../shared/ProcessingOverlay'

interface Agent {
  id: string
  name: string
  role?: string
  pod?: string
  active?: boolean
  brief_content?: string
  last_run?: string
}

interface RunRow {
  id: string
  agent_id?: string
  agent?: string
  status?: string
  run_at?: string
}

const POD_ORDER = ['executive', 'ops', 'growth', 'unknown']
const POD_LABEL: Record<string, string> = {
  executive: 'Executive',
  ops:       'Ops',
  growth:    'Growth',
  unknown:   'Other',
}
const POD_DOT: Record<string, string> = {
  executive: 'bg-violet-400',
  ops:       'bg-amber-400',
  growth:    'bg-emerald-400',
  unknown:   'bg-white/40',
}

export function MobileOrg() {
  const h = useHaptics()
  const [agents, setAgents] = useState<Agent[]>([])
  const [runs, setRuns] = useState<RunRow[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [triggering, setTriggering] = useState<Record<string, 'idle' | 'loading' | 'ok' | 'err'>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [a, r] = await Promise.all([
        supabase.from('agents').select('*').eq('active', true),
        supabase.from('workflow_runs').select('id,agent_id,status,run_at').order('run_at', { ascending: false }).limit(200),
      ])
      if (cancelled) return
      setAgents((a.data as Agent[]) || [])
      setRuns((r.data as RunRow[]) || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const agentRunHealth = useMemo(() => {
    // For each agent, look at the most recent 5 runs and compute error count.
    const out = new Map<string, { lastRunAt?: string; recent: RunRow[]; errorCount: number }>()
    for (const a of agents) {
      const matchTokens = [a.id, a.id?.toLowerCase(), a.name, a.name?.toLowerCase()].filter(Boolean) as string[]
      const own = runs.filter(r => matchTokens.includes(r.agent_id || '')).slice(0, 5)
      const errorCount = own.filter(r => r.status === 'error' || r.status === 'failed').length
      out.set(a.id, { lastRunAt: own[0]?.run_at, recent: own, errorCount })
    }
    return out
  }, [agents, runs])

  const grouped = useMemo(() => {
    const m = new Map<string, Agent[]>()
    for (const a of agents) {
      const key = (a.pod || 'unknown').toLowerCase()
      const bucket = POD_ORDER.includes(key) ? key : 'unknown'
      const arr = m.get(bucket) || []
      arr.push(a)
      m.set(bucket, arr)
    }
    return m
  }, [agents])

  const erroredAgents = useMemo(() =>
    agents.filter(a => (agentRunHealth.get(a.id)?.errorCount ?? 0) > 0)
          .sort((a, b) => (agentRunHealth.get(b.id)?.errorCount ?? 0) - (agentRunHealth.get(a.id)?.errorCount ?? 0))
  , [agents, agentRunHealth])

  const heroErr = erroredAgents[0] || null

  const open = openId ? agents.find(a => a.id === openId) ?? null : null

  // Pending corrections from Vera — same surface as desktop. Approve/reject UI
  // lives on the desktop Org route, so the hero hands off via hash with the
  // correction id; desktop then scrolls and outlines the row.
  const pendingCorrections = usePendingCorrections(5)

  const openCorrection = (correction: PendingCorrection) => {
    h.select()
    if (typeof window !== 'undefined') {
      window.location.hash = `#/org?correction=${correction.id}`
    }
  }

  const triggeringName = Object.entries(triggering).find(([, s]) => s === 'loading')?.[0] || null

  const triggerAgent = async (name: string) => {
    h.heavy()
    setTriggering(prev => ({ ...prev, [name]: 'loading' }))
    try {
      const res = await fetch('/api/trigger-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: name }),
      })
      if (res.ok) { h.success() } else { h.error() }
      setTriggering(prev => ({ ...prev, [name]: res.ok ? 'ok' : 'err' }))
    } catch {
      h.error()
      setTriggering(prev => ({ ...prev, [name]: 'err' }))
    }
    setTimeout(() => setTriggering(prev => ({ ...prev, [name]: 'idle' })), 2500)
  }

  if (loading && agents.length === 0) {
    return <MobileLoadingScreen title="Organisation" subtitle="Waking the roster…" />
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Organisation"
          subtitle={loading ? 'Loading…' : `${agents.length} agents · ${runs.length} runs in last batch`}
        />
      }
    >
      {triggeringName && <ProcessingOverlay label={`Triggering ${triggeringName}`} sub="Starting the agent run" />}
      <NextOrgHero
        corrections={pendingCorrections.data}
        agentCount={agents.length}
        onReview={openCorrection}
      />

      <SkillProposalsPanel />

      {heroErr && (
        <HeroCard
          eyebrow="Most errors recently"
          accent="red"
          title={heroErr.name}
          detail={heroErr.role || heroErr.brief_content?.slice(0, 140) || 'Recent runs erroring — investigate.'}
          meta={`${agentRunHealth.get(heroErr.id)?.errorCount ?? 0} of last 5 runs failed`}
          cta="Open"
          onClick={() => { h.select(); setOpenId(heroErr.id) }}
        />
      )}

      {agents.length === 0 && !loading && <EmptyState label="No active agents." />}

      {POD_ORDER.map(pod => {
        const list = grouped.get(pod) || []
        if (list.length === 0) return null
        return (
          <FeedCard
            key={pod}
            title={`${POD_LABEL[pod]} · ${list.length}`}
          >
            {list.map(a => {
              const h2 = agentRunHealth.get(a.id)
              const failed = h2?.errorCount ?? 0
              const dot = failed > 0 ? 'bg-red-400' : POD_DOT[pod]
              return (
                <FeedRow
                  key={a.id}
                  dotColor={dot}
                  title={a.name}
                  detail={a.role || 'No role set'}
                  trailing={
                    failed > 0 ? (
                      <span className="text-[14px] font-semibold text-red-300">{failed} err</span>
                    ) : h2?.lastRunAt ? (
                      <span className="text-[14px] text-white/35 tabular-nums">{humanAgo(h2.lastRunAt)}</span>
                    ) : null
                  }
                  onClick={() => { h.select(); setOpenId(a.id) }}
                />
              )
            })}
          </FeedCard>
        )
      })}

      <DetailSheet
        open={open != null}
        onClose={() => setOpenId(null)}
        eyebrow={open?.pod ? POD_LABEL[(open.pod || '').toLowerCase()] || open.pod : undefined}
        title={open?.name || ''}
        body={
          open
            ? [
                open.role ? `Role: ${open.role}` : null,
                open.brief_content ? truncate(open.brief_content, 600) : null,
              ].filter(Boolean).join('\n\n')
            : undefined
        }
        agent={open?.name}
        actions={
          open
            ? [
                {
                  label: triggering[open.name] === 'loading' ? 'Triggering…' : 'Trigger run',
                  variant: 'primary',
                  onClick: () => triggerAgent(open.name),
                },
                {
                  label: 'Edit brief',
                  variant: 'secondary',
                  onClick: async () => {
                    const next = window.prompt('Edit brief:', open.brief_content || '')
                    if (next == null || next === open.brief_content) return
                    h.heavy()
                    try {
                      const { error } = await supabase
                        .from('agents')
                        .update({ brief_content: next, brief_updated_at: new Date().toISOString() })
                        .eq('id', open.id)
                      if (error) throw new Error(error.message)
                      h.success()
                      setAgents(prev => prev.map(x => x.id === open.id ? { ...x, brief_content: next } : x))
                    } catch (e: any) {
                      h.error()
                    }
                  },
                },
              ]
            : []
        }
      />
    </MobileShellPrim>
  )
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.floor(ms / 60_000)}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
