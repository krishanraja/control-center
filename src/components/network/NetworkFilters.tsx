import { useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { Eyebrow } from '../shared/Eyebrow'
import { Badge } from '@/components/ui/badge'
import { BottomSheet } from '../mobile/BottomSheet'
import { ChipOverflow, Chip, type ChipItem } from '../shared/ChipOverflow'
import { useNetworkGeo, FALLBACK_FEATURED, geoLabel } from '../../hooks/useNetworkGeo'
import { VENTURE_OPTIONS } from '../../lib/ventureOptions'

// Filters, and a switch for what a filter MEANS.
//
// Soft by default: a filter is a weighted preference the scorer trades off, so
// narrowing never empties the list. Hard mode makes it a real WHERE clause, and
// is the only path in this feature that can return nothing. It is a deliberate
// choice with a visible label rather than the default behaviour.
//
// ── The phone layout is a different information architecture, not a squeeze ──
//
// Four dimensions (geo, venture, role, tier) at five to seventy-two values each
// cannot all be on screen at 390px, and the previous answer — one summary
// button that expanded into three full-width rows of chips — traded one problem
// for another: opening the filters hid every result, so narrowing a list meant
// losing sight of the list you were narrowing.
//
// The split is by FREQUENCY, not by category:
//
//   Level 1, always visible, one horizontally scrolling line
//     The three markets (UK, AU, USA) as direct chips, because geography is the
//     cut Krish reaches for by name, plus a button carrying the count of
//     everything else that is on.
//   Level 1b, only when something else is on
//     Removable pills for the active non-geo filters. Turning a filter OFF
//     never requires opening anything, which is the half people get wrong.
//   Level 2, on demand
//     A content-height bottom sheet with every dimension. It sits under the
//     thumb and leaves the results visible behind it.
//
// Desktop keeps the expanded rows: there is room, and the whole point of that
// shell is seeing the controls and the results at once.

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
// Filter chips for the live portfolio only. Retired ventures are deliberately
// absent: a contact tagged with one still SHOWS its pill (the label maps keep
// resolving), it just cannot be filtered for, which is the honest trade for
// not putting a dead brand back in the UI.
export const VENTURES: Array<[string, string]> = VENTURE_OPTIONS.map(
  v => [v.slug, v.label] as [string, string],
)

const LABEL: Record<string, string> = {
  ...Object.fromEntries(TIERS), ...Object.fromEntries(ROLES), ...Object.fromEntries(VENTURES),
}

export interface FilterState {
  venture: string | null
  roles: string[]
  tiers: string[]
  /** ISO-3166 alpha-2. Hard mode sends these as a real filter; soft mode leaves
   *  them to the scorer as a weighted preference. */
  countries: string[]
  hard: boolean
}

export const EMPTY_FILTERS: FilterState = { venture: null, roles: [], tiers: [], countries: [], hard: false }

function nf(n: number): string {
  return n.toLocaleString('en-AU')
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Eyebrow className="mr-1">{label}</Eyebrow>
      {children}
    </div>
  )
}

export function NetworkFilters({ value, onChange, collapsible }: {
  value: FilterState
  onChange: (next: FilterState) => void
  /** Phone layout. Switches to the two-level architecture described above. */
  collapsible?: boolean
}) {
  const [sheet, setSheet] = useState(false)
  const geo = useNetworkGeo()

  const active = value.roles.length + value.tiers.length + value.countries.length + (value.venture ? 1 : 0)
  const nonGeoActive = value.roles.length + value.tiers.length + (value.venture ? 1 : 0)

  const toggle = (key: 'roles' | 'tiers' | 'countries', v: string) => {
    const cur = value[key]
    onChange({ ...value, [key]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] })
  }

  // Featured countries first (the three markets), then the rest by size, so the
  // overflow sheet reads as "who else is in here" rather than as an alphabet.
  const geoItems: ChipItem[] = useMemo(() => {
    const rows = geo.countries.length ? geo.countries : FALLBACK_FEATURED
    return [...rows]
      .sort((a, b) => Number(b.featured) - Number(a.featured) || b.n - a.n)
      .map(c => ({
        id: c.code,
        label: geoLabel(c.code, c.name),
        fullLabel: c.name,
        meta: c.n ? nf(c.n) : undefined,
      }))
  }, [geo.countries])

  // The number the filter must never hide. Geography resolves for well under
  // half the corpus, so a country filter silently excludes thousands of people
  // whose location was simply never recorded, and "nobody in the UK" would
  // otherwise read as a fact about the network rather than about the data.
  const unknownNote = geo.unknown
    ? `${nf(geo.unknown)} of ${nf(geo.total)} people have no location on file. A country filter cannot match them.`
    : undefined

  const geoChips = (
    <ChipOverflow
      items={geoItems}
      selected={value.countries}
      onToggle={c => toggle('countries', c)}
      inline={3}
      title="Countries"
      testIdPrefix="network-geo"
      emptyNote={unknownNote}
    />
  )

  // ── Every dimension, for the phone sheet and the desktop rows alike ────────
  const allSections = (
    <div className="space-y-2.5">
      <Section label="Where">{geoChips}</Section>
      <Section label="Venture">
        {VENTURES.map(([slug, label]) => (
          <Chip key={slug} on={value.venture === slug} testId={`network-venture-chip-${slug}`}
                onClick={() => onChange({ ...value, venture: value.venture === slug ? null : slug })}>
            {label}
          </Chip>
        ))}
      </Section>
      <Section label="Role">
        {ROLES.map(([slug, label]) => (
          <Chip key={slug} on={value.roles.includes(slug)} testId={`network-role-chip-${slug}`}
                onClick={() => toggle('roles', slug)}>{label}</Chip>
        ))}
      </Section>
      <Section label="Tier">
        {TIERS.map(([slug, label]) => (
          <Chip key={slug} on={value.tiers.includes(slug)} testId={`network-tier-chip-${slug}`}
                onClick={() => toggle('tiers', slug)}>{label}</Chip>
        ))}
      </Section>
    </div>
  )

  const modeRow = (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
      <button
        type="button"
        onClick={() => onChange({ ...value, hard: !value.hard })}
        aria-pressed={value.hard}
        data-testid="network-filter-mode"
        className="rounded-badge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
      >
        <Badge variant={value.hard ? 'danger' : 'default'}>
          {value.hard ? 'Hard filter' : 'Soft filter'}
        </Badge>
      </button>
      <span className="text-micro text-white/40">
        {value.hard
          ? 'Excludes anyone who does not match. This can return nothing.'
          : 'Ranks matches higher. Close matches still appear.'}
      </span>
      <button
        type="button"
        onClick={() => onChange({ ...EMPTY_FILTERS, hard: value.hard })}
        data-testid="network-filter-clear"
        className="ml-auto text-micro text-white/40 underline underline-offset-2 hover:text-white/70"
      >
        Clear {active}
      </button>
    </div>
  )

  // ── Desktop ───────────────────────────────────────────────────────────────
  if (!collapsible) {
    return (
      <div className="space-y-2.5 px-4 py-3">
        {allSections}
        {active > 0 && modeRow}
      </div>
    )
  }

  // ── Phone ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-1.5 py-2">
      {/* Level 1. One line, horizontally scrollable, never wraps. The negative
          margin plus matching padding lets chips scroll edge to edge while the
          first one still lines up with the content above it. */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          data-testid="network-filters-open"
          aria-haspopup="dialog"
          className={`flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-label font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
            nonGeoActive > 0 || value.hard
              ? 'border-violet-400/40 bg-violet-500/15 text-violet-100'
              : 'border-white/10 text-white/50'}`}
        >
          <SlidersHorizontal size={12} aria-hidden />
          <span>Filters</span>
          {nonGeoActive > 0 && <Badge variant="accent">{nonGeoActive}</Badge>}
        </button>
        <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden />
        {/* Geography sits at level 1 rather than in the sheet: it is the cut
            asked for by name, and burying a one-tap decision two taps deep is
            the thing this layout exists to stop. */}
        <div className="flex shrink-0 items-center gap-1.5">{geoChips}</div>
      </div>

      {/* Level 1b. Removing an active filter never needs the sheet. */}
      {(nonGeoActive > 0 || value.hard) && (
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {value.venture && (
            <ActivePill label={LABEL[value.venture] || value.venture}
                        onRemove={() => onChange({ ...value, venture: null })} />
          )}
          {value.roles.map(r => (
            <ActivePill key={r} label={LABEL[r] || r} onRemove={() => toggle('roles', r)} />
          ))}
          {value.tiers.map(t => (
            <ActivePill key={t} label={LABEL[t] || t} onRemove={() => toggle('tiers', t)} />
          ))}
          {value.hard && (
            <button
              type="button"
              onClick={() => onChange({ ...value, hard: false })}
              data-testid="network-filter-mode"
              className="shrink-0 rounded-badge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <Badge variant="danger">Hard filter</Badge>
            </button>
          )}
        </div>
      )}

      {/* Level 2. fullHeight={false} is the point: the sheet is as tall as its
          contents, so the results stay on screen behind it. */}
      <BottomSheet open={sheet} onClose={() => setSheet(false)} fullHeight={false} ariaLabel="Filters">
        <div className="max-h-[72vh] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
          <div className="flex items-center gap-2 pb-3">
            <h2 className="text-ui font-semibold text-white">Filters</h2>
            {active > 0 && <span className="text-label text-white/40">{active} on</span>}
            <button
              type="button"
              onClick={() => setSheet(false)}
              aria-label="Close filters"
              data-testid="network-filters-close"
              className="ml-auto rounded-full p-1.5 text-white/40 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
          {allSections}
          <div className="mt-2.5">{modeRow}</div>
        </div>
      </BottomSheet>
    </div>
  )
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${label} filter`}
      className="flex min-h-[26px] shrink-0 items-center gap-1 rounded-full border border-violet-400/30 bg-violet-500/10 pl-2.5 pr-1.5 text-label font-medium text-violet-100 transition-colors hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
    >
      {label}
      <X size={11} className="text-violet-200/60" aria-hidden />
    </button>
  )
}
