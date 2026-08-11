import { Mail, Linkedin, Phone, Instagram, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScoreBreakdown } from './ScoreBreakdown'
import type { NetworkResult } from '../../hooks/useNetworkSearch'

// One person in a result list. Structure referenced from Relume's stacked-list6,
// retyped in house tokens: Relume's version is an avatar, a name, an email and a
// job title, which is a directory row. This has to answer "why am I looking at
// this person", so the judgment carries the row and the identity supports it.

const TIER_LABEL: Record<string, string> = {
  '1_reciprocated': 'Replied to you',
  '2_core_network': 'Core network',
  '3_known_network': 'Known',
  '4_owned_network': 'Your list',
  '5_cold_lead': 'Cold',
}
const TIER_VARIANT: Record<string, 'accent' | 'solid' | 'default' | 'outline'> = {
  '1_reciprocated': 'accent',
  '2_core_network': 'solid',
  '3_known_network': 'default',
  '4_owned_network': 'outline',
  '5_cold_lead': 'outline',
}
const CHANNEL_ICON: Record<string, typeof Mail> = {
  email: Mail, linkedin_dm: Linkedin, phone: Phone, instagram_dm: Instagram,
}

export function NetworkResultRow({ r, onOpen, weak }: {
  r: NetworkResult
  onOpen?: (r: NetworkResult) => void
  weak?: boolean
}) {
  const name = r.full_name || r.company || 'Unnamed contact'
  const sub = [r.title, r.company].filter(Boolean).join(' · ')
  const Channel = r.best_channel ? CHANNEL_ICON[r.best_channel] : null
  // why_match is the reranker answering THIS question. why_them is the stored
  // judgment. Prefer the former; fall back so a row is never reasonless.
  const reason = r.why_match || r.why_them

  return (
    <div className="group flex items-start gap-3 border-b border-white/[0.06] px-4 py-3.5 transition-colors last:border-b-0 hover:bg-white/[0.02]">
      <ScoreBreakdown score={r.match_score} terms={r} tone={weak ? 'weak' : 'default'} />

      <button
        type="button"
        onClick={() => onOpen?.(r)}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-lg"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-[14px] font-semibold text-white">{name}</span>
          {Channel && <Channel size={12} className="shrink-0 text-white/30" aria-hidden />}
          <Badge variant={TIER_VARIANT[r.network_tier] || 'outline'}>{TIER_LABEL[r.network_tier] || r.network_tier}</Badge>
          {r.thin_evidence && (
            // Never hidden, always labelled. rules_v1 means nobody read a
            // profile: the title and company were pattern-matched and the rest
            // is inference. Saying so is the difference between a ranked list
            // and a confident wrong answer.
            <Badge variant="warning" className="gap-1">
              <AlertTriangle size={9} aria-hidden /> thin evidence
            </Badge>
          )}
        </div>

        {sub && <p className="mt-0.5 truncate text-[12px] text-white/50">{sub}</p>}
        {reason && <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/75">{reason}</p>}
        {r.hook && (
          <p className="mt-1 text-[12px] leading-relaxed text-white/45">
            <span className="text-white/30">Open with</span> {r.hook}
          </p>
        )}
        {r.risk && (
          <p className="mt-1 text-[11.5px] leading-relaxed text-amber-200/85">
            <span className="text-white/30">Risk</span> {r.risk}
          </p>
        )}
      </button>
    </div>
  )
}
