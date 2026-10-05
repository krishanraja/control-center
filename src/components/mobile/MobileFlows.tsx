import React, { useEffect, useMemo, useState } from 'react'
import { MobileShell as MobileShellPrim, TabHeader,
  HeaderSubtitleSkeleton, FeedCard, FeedRow, EmptyState, MobileLoadingScreen } from './primitives'
import { DetailSheet } from './DetailSheet'
import { useHaptics } from '../../hooks/useHaptics'
import { supabase, logKrishAction } from '../../lib/supabase'
import { useToast } from '../shared/Toast'
import { FleetHealthStrip } from '../flows/FleetHealthStrip'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { humanize } from '../shared/tokens'
import { flowsMove } from '../../lib/surfaceMoves'

interface Run {
  id: string
  workflow_id: string
  workflow_name: string
  agent_id?: string
  agent?: string
  run_at: string
  status: string
  outcome?: string
  error_message?: string
}

interface Proposal {
  id: string
  title: string
  description?: string
  status: string
  proposal_type?: string
  agent_id?: string
  created_at: string
}

interface GroupedRun {
  workflow_id: string
  workflow_name: string
  agent_id?: string
  status: string
  lastRun: string
  runCount: number
  errorCount: number
}

export function MobileFlows() {
  const h = useHaptics()
  const { toast } = useToast()
  const [runs, setRuns] = useState<Run[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [openProposalId, setOpenProposalId] = useState<string | null>(null)
  const [openFlowId, setOpenFlowId] = useState<string | null>(null)

  const reload = async () => {
    const [r, p] = await Promise.all([
      supabase.from('workflow_runs').select('*').order('run_at', { ascending: false }).limit(80),
      supabase.from('workflow_proposals').select('*').in('status', ['proposed', 'pending']).order('created_at', { ascending: false }),
    ])
    const normalized = ((r.data as any[]) || []).map(row => ({
      ...row,
      agent_id: row.agent_id || row.agent || null,
    })) as Run[]
    setRuns(normalized)
    setProposals((p.data as Proposal[]) || [])
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const grouped: GroupedRun[] = useMemo(() => (
    Object.values(runs.reduce((acc: Record<string, GroupedRun>, r) => {
      const k = r.workflow_id
      if (!acc[k]) acc[k] = { workflow_id: r.workflow_id, workflow_name: r.workflow_name, agent_id: r.agent_id, status: r.status, lastRun: r.run_at, runCount: 0, errorCount: 0 }
      acc[k].runCount += 1
      if (r.status === 'error' || r.status === 'failed') acc[k].errorCount += 1
      if (new Date(r.run_at) > new Date(acc[k].lastRun)) {
        acc[k].lastRun = r.run_at
        acc[k].status = r.status
      }
      return acc
    }, {}))
  ), [runs])

  const errors = grouped.filter(g => g.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount)
  const healthy = grouped.filter(g => g.errorCount === 0)
  const errorRun24h = runs.filter(r => {
    if (r.status !== 'error' && r.status !== 'failed') return false
    const ms = Date.now() - new Date(r.run_at).getTime()
    return Number.isFinite(ms) && ms < 24 * 60 * 60 * 1000
  }).length

  const heroProposal = proposals[0] || null
  const failingNow = grouped.filter(g => g.status === 'error').sort((a, b) => b.errorCount - a.errorCount)
  const heroError = failingNow[0] || null
  const move = flowsMove({
    proposals: proposals.map(p => ({ id: p.id, title: p.title, agent: p.agent_id ?? null })),
    failing: failingNow.map(g => ({ id: g.workflow_id, name: humanize(g.workflow_name) || g.workflow_name || 'A workflow', errors: g.errorCount, runs: g.runCount })),
    workflows: grouped.length,
  })

  const open = openProposalId ? proposals.find(p => p.id === openProposalId) ?? null : null
  const openFlow = openFlowId ? grouped.find(g => g.workflow_id === openFlowId) ?? null : null

  const decideProposal = async (id: string, status: 'approved' | 'rejected') => {
    h.heavy()
    try {
      await supabase.from('workflow_proposals').update({
        status,
        approved_by: 'krish',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      await logKrishAction(id, status, 'system', 'Workflow proposal ' + status)
      h.success()
      toast(status === 'approved' ? 'Approved.' : 'Rejected.', 'success')
      setOpenProposalId(null)
      reload()
    } catch {
      h.error()
      toast('Could not update proposal.', 'error')
    }
  }

  if (loading && grouped.length === 0) {
    return <MobileLoadingScreen title="Flows" subtitle="Gathering workflow activity…" />
  }

  return (
    <MobileShellPrim
      header={
        <TabHeader
          title="Flows"
          subtitle={loading ? <HeaderSubtitleSkeleton w={208} /> : `${grouped.length} workflows · ${proposals.length} proposals waiting`}
        />
      }
    >
      {/* n8n's own view of the fleet, above the self-reported runs. */}
      <FleetHealthStrip />
      {/* The same one move as the desk (src/lib/surfaceMoves.ts `flowsMove`),
          including the honest line when nothing waits, which the two hero
          cards it replaced simply left out. */}
      {!loading && (
        <DoThisNextHero
          testId="flows-move"
          stackAction
          narrow
          descriptor={{ headline: move.headline, sub: move.sub, actionLabel: move.clear ? undefined : 'Open', tone: move.tone, clear: move.clear }}
          onAct={heroProposal ? () => { h.select(); setOpenProposalId(heroProposal.id) }
            : heroError ? () => { h.select(); setOpenFlowId(heroError.workflow_id) } : undefined}
          why={move.why}
        />
      )}

      {/* The counts live in the header line and the move. Three pills
          repeated them at a size that broke "Workflows" over two lines on a
          390 phone and printed a large 0 for no proposals. */}
      {errorRun24h > 0 && (
        <p className="flex-shrink-0 px-1 text-label text-ink-muted">{errorRun24h} failed {errorRun24h === 1 ? 'run' : 'runs'} in the last 24 hours.</p>
      )}

      {grouped.length === 0 && !loading && <EmptyState label="No workflow activity yet." />}

      {proposals.length > 0 && (
        <FeedCard title={`Proposals · ${proposals.length}`}>
          {proposals.map(p => (
            <FeedRow
              key={p.id}
              dotColor="bg-amber-400"
              title={p.title}
              detail={p.description?.slice(0, 120)}
              onClick={() => { h.select(); setOpenProposalId(p.id) }}
            />
          ))}
        </FeedCard>
      )}

      {errors.length > 0 && (
        <FeedCard title={`Erroring · ${errors.length}`}>
          {errors.map(g => (
            <FeedRow
              key={g.workflow_id}
              dotColor="bg-red-400"
              title={humanize(g.workflow_name) || g.workflow_name}
              detail={g.agent_id ? `Owner: ${humanize(g.agent_id)}` : undefined}
              trailing={
                <span className="text-title font-bold tabular-nums text-red-300">
                  {g.errorCount}/{g.runCount}
                </span>
              }
              onClick={() => { h.select(); setOpenFlowId(g.workflow_id) }}
            />
          ))}
        </FeedCard>
      )}

      {healthy.length > 0 && (
        <FeedCard title={`Healthy · ${healthy.length}`}>
          {healthy.slice(0, 12).map(g => (
            <FeedRow
              key={g.workflow_id}
              dotColor="bg-emerald-400"
              title={humanize(g.workflow_name) || g.workflow_name}
              detail={g.agent_id ? `Owner: ${humanize(g.agent_id)}` : undefined}
              trailing={
                <span className="text-ui text-ink-faint tabular-nums">{humanAgo(g.lastRun)}</span>
              }
              onClick={() => { h.select(); setOpenFlowId(g.workflow_id) }}
            />
          ))}
          {healthy.length > 12 && (
            <div className="px-7 py-4 text-ui text-ink-faint text-center">
              +{healthy.length - 12} more
            </div>
          )}
        </FeedCard>
      )}

      <DetailSheet
        open={open != null}
        onClose={() => setOpenProposalId(null)}
        eyebrow={open?.proposal_type || 'Proposal'}
        title={open?.title || ''}
        body={open?.description}
        agent={open?.agent_id}
        actions={
          open
            ? [
                { label: 'Approve', variant: 'primary', onClick: () => decideProposal(open.id, 'approved') },
                { label: 'Reject',  variant: 'danger',  onClick: () => decideProposal(open.id, 'rejected') },
              ]
            : []
        }
      />

      <DetailSheet
        open={openFlow != null}
        onClose={() => setOpenFlowId(null)}
        eyebrow={openFlow?.agent_id ? `Owner: ${openFlow.agent_id}` : 'Workflow'}
        title={openFlow?.workflow_name || ''}
        body={
          openFlow
            ? `${openFlow.errorCount} errors out of last ${openFlow.runCount} runs.\nLast run: ${humanAgo(openFlow.lastRun)} ago.`
            : undefined
        }
        actions={openFlow ? [
          {
            label: 'Rerun',
            variant: 'primary',
            onClick: async () => {
              h.heavy()
              try {
                const r = await fetch(`/api/automations/${openFlow.workflow_id}/rerun`, { method: 'POST' })
                const body = await r.json().catch(() => ({}))
                if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`)
                h.success()
                toast('Rerun queued.', 'success')
              } catch (e: any) {
                h.error()
                toast(`Could not rerun: ${e?.message || 'try again'}`, 'error')
              }
            },
          },
        ] : []}
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
