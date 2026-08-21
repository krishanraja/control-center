import React from 'react'
import {
  FileText,
  GitMerge,
  MessageSquare,
  Mic,
  PenLine,
  Radar,
  Sparkles,
  UploadCloud,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import type { LeadSourceType } from '../hooks/useRealtimeLeads'
import type { IdeaSourceType } from '../hooks/useRealtimeContentIdeas'

type AnySource = LeadSourceType | IdeaSourceType

const META: Record<AnySource, { label: string; icon: LucideIcon; tone: string }> = {
  // lead sources
  podcast_audience:   { label: 'Podcast audience',   icon: Mic,         tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20' },
  drive_import:       { label: 'Drive import',       icon: UploadCloud, tone: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
  manual:             { label: 'Manual',             icon: PenLine,     tone: 'text-white/70 bg-white/[0.06] border-white/10' },
  apollo:             { label: 'Apollo',             icon: Users,       tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' },
  nell_candidate:     { label: 'Nell candidate',     icon: Radar,       tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
  signal_inbox:       { label: 'Signal Inbox',       icon: FileText,    tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
  audience:           { label: 'Audience',           icon: Users,       tone: 'text-teal-300 bg-teal-500/10 border-teal-500/20' },

  // idea-only sources
  cleo_chat:          { label: 'Cleo chat',          icon: MessageSquare, tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20' },
  agatha_chat:        { label: 'Agatha chat',        icon: MessageSquare, tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
  openclaw_workspace: { label: 'Workspace note',     icon: FileText,    tone: 'text-amber-300 bg-amber-500/10 border-amber-500/20' },
  zara_signal:        { label: 'Zara signal',        icon: Radar,       tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' },
  inspiration_sweep:    { label: 'Inspiration sweep',    icon: Sparkles, tone: 'text-rose-300 bg-rose-500/10 border-rose-500/20' },
  synthesis_hypothesis: { label: 'Synthesis hypothesis', icon: Wand2,    tone: 'text-violet-300 bg-violet-500/10 border-violet-500/20' },
  synthesis:            { label: 'Synthesis',            icon: GitMerge, tone: 'text-violet-200 bg-violet-500/15 border-violet-400/30' },
  lane_sourcing:        { label: 'Lane sourcing',        icon: Wand2,    tone: 'text-sky-300 bg-sky-500/10 border-sky-500/20' },
}

interface Props {
  source: AnySource
  href?: string | null
  size?: 'xs' | 'sm'
}

/**
 * Provenance chip. Renders the source-of-record for a lead or content idea
 * with a colour-coded icon + label. Clickable when an origin URL exists
 * (deep-links back to Drive doc / Telegram thread / workspace file).
 */
export function LeadSourcePill({ source, href, size = 'xs' }: Props) {
  const meta = META[source] || META.manual
  const Icon = meta.icon
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-micro' : 'px-1 py-0.5 text-micro'
  const iconSize = size === 'sm' ? 11 : 10

  const inner = (
    <span className={`inline-flex items-center gap-1 rounded border ${meta.tone} ${padding} font-medium`}>
      <Icon size={iconSize} className="flex-shrink-0" />
      <span className="truncate max-w-[120px]">{meta.label}</span>
    </span>
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(e) => e.stopPropagation()}
        className="hover:opacity-90 transition-opacity"
        title={`Open source · ${meta.label}`}
      >
        {inner}
      </a>
    )
  }
  return inner
}
