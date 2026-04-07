import React from 'react'
import { FileText, ExternalLink, Target, Users, Zap } from 'lucide-react'
import { useHaptics } from '../hooks/useHaptics'

interface AgentPlan {
  id: string
  name: string
  role: string
  pod: string
  docUrl: string
  status: 'draft' | 'reviewed' | 'approved'
  keyKpis: string[]
}

const AGENT_PLANS: AgentPlan[] = [
  {
    id: 'cleo',
    name: 'Cleo',
    role: 'Content Production & Voice',
    pod: 'growth',
    docUrl: 'https://docs.google.com/document/d/1u48pMLOL9QarBVNZeFr7UJVlL4cKT4962727y7P67oM/edit',
    status: 'draft',
    keyKpis: ['4 weekly briefs', '≥12 LinkedIn angles', '≥4 newsletters', '≥24 Vibe scripts']
  },
  {
    id: 'vera',
    name: 'Vera',
    role: 'Chief of Staff',
    pod: 'ops',
    docUrl: 'https://docs.google.com/document/d/1laLdcVrcoMT0xzNbnk8C-OHvpAPHbHymiyjtxtDlFzw/edit',
    status: 'draft',
    keyKpis: ['4 clean audits', '0 failures', 'Phase 3 gate progress']
  },
  {
    id: 'marcus',
    name: 'Marcus',
    role: 'Intelligence Synthesist',
    pod: 'ops',
    docUrl: 'https://docs.google.com/document/d/1uMgZ_-jflSAXFnDEzq1F32RHQM5-XJUgiSlOad-yhTE/edit',
    status: 'draft',
    keyKpis: ['4 Monday reports', '≥3 insights each', 'Layer 3 processed']
  },
  {
    id: 'priya',
    name: 'Priya',
    role: 'Product Intelligence',
    pod: 'revenue',
    docUrl: 'https://docs.google.com/document/d/1DpENTw6pfdzH8YFcN7RPu_PJlM5iqOKo88huBu8cues/edit',
    status: 'draft',
    keyKpis: ['≥3 proposals', '≥1 approved', '0 regressions']
  },
  {
    id: 'leo',
    name: 'Leo',
    role: 'Revenue & Finance',
    pod: 'revenue',
    docUrl: 'https://docs.google.com/document/d/1bLqJkwZSosdzldNom-GANK26dZgwIB0Bmf0Bv4k14Tw/edit',
    status: 'draft',
    keyKpis: ['Report live Week 2', '$20K/mo tracked', 'Webhook alerts']
  },
  {
    id: 'zara',
    name: 'Zara',
    role: 'Signal Intelligence',
    pod: 'growth',
    docUrl: 'https://docs.google.com/document/d/1haiTun9gdto3_GWpbjzg_Uh8SjDyrxuOmJ_u0jgAOtE/edit',
    status: 'draft',
    keyKpis: ['≥50 signals', '≥5 warm paths', 'Layer 1 processed']
  },
  {
    id: 'felix',
    name: 'Felix',
    role: 'Enterprise Pipeline',
    pod: 'growth',
    docUrl: 'https://docs.google.com/document/d/1NuFgPyV12iVLpsie5UYWurGVdeaBxFoTpwQJto6t3a4/edit',
    status: 'draft',
    keyKpis: ['≥1 active proposal', 'Pipeline ≥$100K', 'Zero cold outreach']
  },
  {
    id: 'nova',
    name: 'Nova',
    role: 'Visibility & Speaking',
    pod: 'growth',
    docUrl: 'https://docs.google.com/document/d/1O94mCEO-jYg4c-ar1RINelTafcOXpOdo3GODZCmXhaI/edit',
    status: 'draft',
    keyKpis: ['≥8 pitches', '≥2 confirmations', '≥1 slot locked']
  },
  {
    id: 'maya',
    name: 'Maya',
    role: 'Marketing Intelligence',
    pod: 'growth',
    docUrl: 'https://docs.google.com/document/d/1P8YlWJP3MiRMniul2k7v8JsTtRkh-YjZTMLetQXeSv8/edit',
    status: 'draft',
    keyKpis: ['≥12 SEO briefs', '≥3 angles approved', 'Performance tracking']
  },
  {
    id: 'arlo',
    name: 'Arlo',
    role: 'Technical Operations',
    pod: 'ops',
    docUrl: 'https://docs.google.com/document/d/1TizhG1TvVOGLjSRjGotGXHD4rHBGb8lsEnP7bmM4Ntg/edit',
    status: 'draft',
    keyKpis: ['0 failures', '100% uptime', 'Webhooks live']
  }
]

const POD_COLORS: Record<string, string> = {
  ops: 'border-slate-500/20 bg-slate-500/5',
  revenue: 'border-emerald-500/20 bg-emerald-500/5',
  growth: 'border-violet-500/20 bg-violet-500/5'
}

const POD_ICONS: Record<string, React.ReactNode> = {
  ops: <Zap className="w-4 h-4" />,
  revenue: <Target className="w-4 h-4" />,
  growth: <Users className="w-4 h-4" />
}

export function AgentPlansPanel() {
  const h = useHaptics()
  
  const pods = ['ops', 'revenue', 'growth']
  
  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Agent Plans</h2>
          <p className="text-white/50 text-sm">April 2026 execution plans & KPIs</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
          <span className="text-xs text-amber-400 font-medium">Awaiting Review</span>
        </div>
      </div>

      {/* Plans by pod */}
      {pods.map(pod => {
        const podPlans = AGENT_PLANS.filter(p => p.pod === pod)
        const podLabel = pod === 'ops' ? 'Ops Pod' : pod === 'revenue' ? 'Revenue Pod' : 'Growth Pod'
        
        return (
          <div key={pod} className={`rounded-2xl border backdrop-blur-sm p-4 ${POD_COLORS[pod]}`}>
            <div className="flex items-center gap-2 mb-4">
              {POD_ICONS[pod]}
              <h3 className="font-bold text-white">{podLabel}</h3>
              <span className="text-xs text-white/40">({podPlans.length} agents)</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {podPlans.map(plan => (
                <AgentPlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </div>
        )
      })}
      
      {/* Summary stats */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{AGENT_PLANS.length}</div>
            <div className="text-xs text-white/40">Total Plans</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-400">0</div>
            <div className="text-xs text-white/40">Reviewed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">0</div>
            <div className="text-xs text-white/40">Approved</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentPlanCard({ plan }: { plan: AgentPlan }) {
  const h = useHaptics()
  
  const handleOpenDoc = () => {
    h.tap()
    window.open(plan.docUrl, '_blank', 'noopener,noreferrer')
  }
  
  const statusColor = {
    draft: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    reviewed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  }[plan.status]
  
  return (
    <button
      onClick={handleOpenDoc}
      className="w-full text-left bg-white/[0.04] border border-white/[0.08] rounded-xl p-3 
        hover:bg-white/[0.06] transition-all duration-200 group active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-semibold text-white text-sm">{plan.name}</h4>
          <p className="text-xs text-white/50">{plan.role}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
            {plan.status}
          </div>
          <ExternalLink className="w-3 h-3 text-white/30 group-hover:text-white/60 transition-colors" />
        </div>
      </div>
      
      <div className="space-y-1">
        {plan.keyKpis.slice(0, 3).map((kpi, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-white/40">
            <div className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0"></div>
            <span className="truncate">{kpi}</span>
          </div>
        ))}
        {plan.keyKpis.length > 3 && (
          <div className="text-xs text-white/30 italic">+{plan.keyKpis.length - 3} more</div>
        )}
      </div>
    </button>
  )
}