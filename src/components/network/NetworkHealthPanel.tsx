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
  posts_read: number
  signalling: number
  hot_intent: number
  apify_due: number
  coresignal_due: number
  posts_due: number
  /** Null when the actor has no observed price. Never 0: zero reads as free. */
  apify_usd: number | null
  posts_usd: number | null
  coresignal_credits: number
}

interface Health {
  ok: boolean
  total: number
  invisible: number
  stale_embedding: number
  /** Summed across tiers by the route: the RPC emits it per tier only. */
  hot_intent: number
  posts_read: number
  signalling: number
  generated_at?: string
  tiers: Tier[]
  rates?: {
    apify_usd_per_profile: number | null
    apify_usd_per_posts_read: number | null
    priced_from_runs: number
    priced_to: string | null
  }
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
    //
    // Re-fetched on EVERY open rather than once per mount: these numbers move
    // whenever a backfill runs, and a panel that caches for the life of the tab
    // shows arbitrarily old figures in the present tense. The read is cheap.
    if (!open) return
    let live = true
    setBusy(true)
    fetch('/api/network/health')
      .then(r => r.json())
      .then((j: Health) => { if (live) setData(j) })
      .catch(() => { if (live) setData({ ok: false, total: 0, invisible: 0, stale_embedding: 0, hot_intent: 0, posts_read: 0, signalling: 0, tiers: [], error: 'Could not read the network.' }) })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        data-testid="network-health"
        className="min-h-[36px] rounded-lg border border-white/[0.12] px-3 text-label font-medium text-ink-muted transition-colors hover:bg-white/[0.04]"
      >
        {open ? 'Close' : 'Network health'}
      </button>

      {open && (
        <section
          className="absolute left-4 right-4 z-20 mt-2 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3 shadow-xl"
          data-testid="network-health-panel"
        >
          {busy && (
            <p className="flex items-center gap-2 text-label text-ink-faint">
              <Working size={12} /> Reading the network.
            </p>
          )}

          {data && !data.ok && (
            <p className="text-label text-rose-300">{data.error || 'Could not read the network.'}</p>
          )}

          {data?.ok && (
            <>
              <p className="text-label leading-relaxed text-ink-faint">
                {data.total.toLocaleString()} people.
                {' '}{data.posts_read.toLocaleString()} have had their posts read;
                {' '}{data.signalling.toLocaleString()} are signalling live intent right now
                {data.hot_intent > 0 && <>, {data.hot_intent.toLocaleString()} of them asking, stuck,
                hiring or piloting</>}.
                {' '}Completeness is the same score the ranker thresholds for its thin-evidence
                warning, so the counts below and the badges in results move together — except
                for the invisible, who score 0 here and never appear in results at all.
              </p>
              {data.rates?.apify_usd_per_profile != null && (
                <p className="mt-1 text-micro text-ink-faint">
                  Prices below are measured, not estimated: ${data.rates.apify_usd_per_profile.toFixed(4)} per profile
                  {data.rates.apify_usd_per_posts_read != null
                    && `, $${data.rates.apify_usd_per_posts_read.toFixed(4)} per posts read`}
                  , averaged over {data.rates.priced_from_runs.toLocaleString()} runs
                  {data.rates.priced_to && ` to ${data.rates.priced_to}`}.
                  {data.generated_at && ` Read ${new Date(data.generated_at).toLocaleTimeString()}.`}
                </p>
              )}

              {/* Invisible is first because it is the only failure that is total:
                  a contact with no intelligence row cannot be found at all, no
                  matter what is typed. Everything else on this panel is degree. */}
              {data.invisible > 0 && (
                <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-label text-amber-100">
                  {data.invisible.toLocaleString()} {data.invisible === 1 ? 'person is' : 'people are'} invisible to search:
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
                      <span className="text-label font-semibold text-ink-muted">
                        {TIER_LABEL[t.tier] || t.tier}
                      </span>
                      <span className="text-label text-ink-faint">{t.people.toLocaleString()} people</span>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-label text-ink-faint">LinkedIn {pct(t.linkedin, t.people)}%</p>
                        <Bar value={pct(t.linkedin, t.people)} tone="bg-violet-400/70" />
                      </div>
                      <div>
                        <p className="text-label text-ink-faint">Email {pct(t.email, t.people)}%</p>
                        <Bar value={pct(t.email, t.people)} tone="bg-emerald-400/70" />
                      </div>
                      <div>
                        <p className="text-label text-ink-faint">Complete {t.avg_completeness}/100</p>
                        <Bar value={t.avg_completeness} tone="bg-sky-400/70" />
                      </div>
                    </div>

                    <p className="mt-2 text-label text-ink-faint">
                      {t.weak.toLocaleString()} thin, {t.strong.toLocaleString()} strong.
                      {' '}
                      {t.posts_read > 0
                        ? <>{t.posts_read.toLocaleString()} read, <span className="text-emerald-300/80">{t.signalling.toLocaleString()} signalling</span>{t.hot_intent > 0 && <> ({t.hot_intent.toLocaleString()} asking, stuck, hiring or piloting)</>}. </>
                        : <>No posts read here. </>}
                    </p>
                    <p className="mt-1 text-label text-ink-faint">
                      {/* A null price is not a free one. An actor with no runs in
                          the meter has no observed price, and saying "$0.00"
                          would be the same class of lie as the hardcoded
                          estimate this replaced. */}
                      {t.apify_due > 0 && (
                        <>{t.apify_due.toLocaleString()} profiles to read{t.apify_usd != null
                          ? <> — ${t.apify_usd.toFixed(2)}</>
                          : ' — not yet priced'}. </>
                      )}
                      {t.posts_due > 0 && (
                        <>{t.posts_due.toLocaleString()} posts to re-read{t.posts_usd != null
                          ? <> — ${t.posts_usd.toFixed(2)}</>
                          : ' — not yet priced'}. </>
                      )}
                      {t.coresignal_due > 0 && (
                        <>{t.coresignal_due.toLocaleString()} have no URL — {t.coresignal_credits.toLocaleString()} Coresignal credits. </>
                      )}
                      {t.apify_due === 0 && t.posts_due === 0 && t.coresignal_due === 0 && 'Nothing outstanding.'}
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
