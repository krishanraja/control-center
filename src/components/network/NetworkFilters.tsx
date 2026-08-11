import { useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// Filters, and a switch for what a filter MEANS.
//
// Soft by default: a filter is a weighted preference the scorer trades off, so
// narrowing never empties the list. Hard mode makes it a real WHERE clause, and
// is the only path in this feature that can return nothing. It is a deliberate
// choice with a visible label rather than the default behaviour.

const TIERS: Array<[string, string]> = [
  ['1_reciprocated', 'Replied'],
  ['2_core_network', 'Core'],
  ['3_known_network', 'Known'],
  ['4_owned_network', 'Your list'],
  ['5_cold_lead', 'Cold'],
]
const ROLES: Array<[string, string]> = [
  ['buyer', 'Buyer'], ['partner', 'Partner'], ['introducer', 'Introducer'],
  ['guest', 'Guest'], ['investor', 'Investor'], ['operator_peer', 'Peer'], ['hire', 'Hire'],
]
export const VENTURES: Array<[string, string]> = [
  ['mindmaker', 'Mindmaker'], ['adfixus', 'AdFixus'],
  ['signal_noise', 'Signal & Noise'], ['builder_economy', 'Builder Economy'],
]

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[30px] rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
        on ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
           : 'border-white/10 text-white/50 hover:border-white/20 hover:text-white/80'}`}
    >
      {children}
    </button>
  )
}

export interface FilterState {
  venture: string | null
  roles: string[]
  tiers: string[]
  hard: boolean
}

export const EMPTY_FILTERS: FilterState = { venture: null, roles: [], tiers: [], hard: false }

export function NetworkFilters({ value, onChange, collapsible }: {
  value: FilterState
  onChange: (next: FilterState) => void
  /** Phone layout. Three rows of chips push every result below the fold on a
   *  390px screen, so on narrow they collapse behind a summary that states how
   *  many are on. The desktop layout keeps them open: there is room, and the
   *  whole point of that shell is seeing the controls and the results at once. */
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(false)
  const active = value.roles.length + value.tiers.length + (value.venture ? 1 : 0)
  const toggle = (key: 'roles' | 'tiers', v: string) => {
    const cur = value[key]
    onChange({ ...value, [key]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] })
  }

  if (collapsible && !open) {
    return (
      <div className="px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex min-h-[38px] w-full items-center gap-2 rounded-form border border-white/10 px-3 text-[12.5px] text-white/55 transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
        >
          <SlidersHorizontal size={13} aria-hidden />
          <span>Filters</span>
          {active > 0 && <Badge variant="accent">{active}</Badge>}
          {active > 0 && (
            <span className="truncate text-white/35">{value.hard ? 'hard' : 'soft'}</span>
          )}
          <ChevronDown size={14} className="ml-auto shrink-0 text-white/30" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2.5 px-4 py-3">
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="flex w-full items-center gap-2 text-[12.5px] text-white/55 focus-visible:outline-none"
        >
          <SlidersHorizontal size={13} aria-hidden />
          <span>Filters</span>
          <ChevronDown size={14} className="ml-auto rotate-180 text-white/30" aria-hidden />
        </button>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Venture</span>
        {VENTURES.map(([slug, label]) => (
          <Chip key={slug} on={value.venture === slug}
                onClick={() => onChange({ ...value, venture: value.venture === slug ? null : slug })}>
            {label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Role</span>
        {ROLES.map(([slug, label]) => (
          <Chip key={slug} on={value.roles.includes(slug)} onClick={() => toggle('roles', slug)}>{label}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Tier</span>
        {TIERS.map(([slug, label]) => (
          <Chip key={slug} on={value.tiers.includes(slug)} onClick={() => toggle('tiers', slug)}>{label}</Chip>
        ))}
      </div>

      {active > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
          <button
            type="button"
            onClick={() => onChange({ ...value, hard: !value.hard })}
            aria-pressed={value.hard}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 rounded-badge"
          >
            <Badge variant={value.hard ? 'danger' : 'default'}>
              {value.hard ? 'Hard filter' : 'Soft filter'}
            </Badge>
          </button>
          <span className="text-[11px] text-white/40">
            {value.hard
              ? 'Excludes anyone who does not match. This can return nothing.'
              : 'Ranks matches higher. Close matches still appear.'}
          </span>
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, hard: value.hard })}
            className="ml-auto text-[11px] text-white/40 underline underline-offset-2 hover:text-white/70"
          >
            Clear {active}
          </button>
        </div>
      )}
    </div>
  )
}
