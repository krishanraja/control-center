import { useEffect, useState } from 'react'
import { Working } from '../shared/Working'

// "Network health" — the state of the data, in the tab that depends on it.
//
// Every enrichment decision up to now was made by someone running SQL and
// reporting a number back. That is a bad arrangement for the person whose
// network it is: he could not see coverage without asking, and could not tell
// whether a run he paid for actually landed.
//
// What it deliberately shows, per consent tier rather than in total:
//   - coverage of the two things the row needs to be clickable (LinkedIn, email)
//   - average completeness, and how many records are still WEAK (< 50), which
//     is the same test the ranker uses for thin_evidence, so the panel and the
//     search results can never tell different stories
//   - what enrichment is outstanding and what it would cost, split by provider
//
// Per tier, because the decision is always "is THIS tier worth enriching". A
// single grand total is the number that talks people into paying to enrich ten
// thousand cold records.

interface Tier {
  tier: string
  people: number
  linkedin: number
  email: number
  invisible: number
  avg_completeness: number
  weak: number
  strong: number
  apify_due: number
  coresignal_due: number
  apify_usd: number
  coresignal_credits: number
}

interface Health {
  ok: boolean
  total: number
  invisible: number
  stale_embedding: number
  tiers: Tier[]
  error?: string
}

const TIER_LABEL: Record<string, string> = {
  warm: 'Warm',
  permissioned: 'Communities',
  cold_engaged: 'Engaged',
  cold_scraped: 'Scraped',
  unset: 'Unclassified',
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function NetworkHealthPanel() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Health | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Fetched on open, not on mount. This tab's job is search; a health read on
    // every page load is a query nobody asked for.
    if (!open || data) return
    let live = true
    setBusy(true)
    fetch('/api/network/health')
      .then(r => r.json())
      .then((j: Health) => { if (live) setData(j) })
      .catch(() => { if (live) setData({ ok: false, total: 0, invisible: 0, stale_embedding: 0, tiers: [], error: 'Could not read the network.' }) })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [open, data])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        data-testid="network-health"
        className="min-h-[36px] rounded-lg border border-white/[0.12] px-3 text-label font-medium text-white/75 transition-colors hover:bg-white/[0.04]"
      >
        {open ? 'Close' : 'Network health'}
      </button>

      {open && (
        <section
          className="absolute left-4 right-4 z-20 mt-2 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3 shadow-xl"
          data-testid="network-health-panel"
        >
          {busy && (
            <p className="flex items-center gap-2 text-label text-white/55">
              <Working size={12} /> Reading the network.
            </p>
          )}

          {data && !data.ok && (
            <p className="text-label text-rose-300">{data.error || 'Could not read the network.'}</p>
          )}

          {data?.ok && (
            <>
              <p className="text-label leading-relaxed text-white/55">
                {data.total.toLocaleString()} people.
                {' '}Completeness is the same score the ranker uses: a record under 50 is shown
                with a thin-evidence warning in results, so these counts and the badges agree
                by construction.
              </p>

              {/* Invisible is first because it is the only failure that is total:
                  a contact with no intelligence row cannot be found at all, no
                  matter what is typed. Everything else on this panel is degree. */}
              {data.invisible > 0 && (
                <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-label text-amber-100">
                  {data.invisible} {data.invisible === 1 ? 'person is' : 'people are'} invisible to search:
                  they have a contact record but no intelligence row, so no query can reach them.
                </p>
              )}

              {data.stale_embedding > 0 && (
                <p className="mt-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-label text-sky-100">
                  {data.stale_embedding} records were enriched since their last embedding.
                  Their new detail is stored but not yet searchable.
                </p>
              )}

              <ul className="mt-3 space-y-2" data-testid="network-health-tiers">
                {data.tiers.map(t => (
                  <li key={t.tier} className="rounded-lg border border-white/[0.06] px-3 py-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-label font-semibold text-white/85">
                        {TIER_LABEL[t.tier] || t.tier}
                      </span>
                      <span className="text-label text-white/45">{t.people.toLocaleString()} people</span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-label text-white/45">LinkedIn {pct(t.linkedin, t.people)}%</p>
                        <Bar value={pct(t.linkedin, t.people)} tone="bg-violet-400/70" />
                      </div>
                      <div>
                        <p className="text-label text-white/45">Email {pct(t.email, t.people)}%</p>
                        <Bar value={pct(t.email, t.people)} tone="bg-emerald-400/70" />
                      </div>
                      <div>
                        <p className="text-label text-white/45">Complete {t.avg_completeness}/100</p>
                        <Bar value={t.avg_completeness} tone="bg-sky-400/70" />
                      </div>
                    </div>

                    <p className="mt-2 text-label text-white/45">
                      {t.weak.toLocaleString()} thin, {t.strong.toLocaleString()} strong.
                      {' '}
                      {t.apify_due > 0 && (
                        <>Scraping the {t.apify_due.toLocaleString()} with a profile URL costs about ${t.apify_usd.toFixed(2)}. </>
                      )}
                      {t.coresignal_due > 0 && (
                        <>Finding the {t.coresignal_due.toLocaleString()} without one costs {t.coresignal_credits.toLocaleString()} Coresignal credits.</>
                      )}
                      {t.apify_due === 0 && t.coresignal_due === 0 && 'Nothing outstanding.'}
                    </p>
                  </li>
                ))}
              </ul>

              {/* No "enrich everything" button. Enrichment spends real money on
                  a provider that cannot be un-called, and the runs are long
                  enough to outlive a serverless function, so they stay
                  deliberate rather than one click from a summary screen. */}
            </>
          )}
        </section>
      )}
    </>
  )
}
