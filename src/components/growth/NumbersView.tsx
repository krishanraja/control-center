/**
 * Growth: Numbers. First the ranked products with the same six numbers
 * Subscriptions shows (PortfolioSection), then the ways people find you, each
 * opening on what it means, with the rows behind it one tap further:
 *   AI answers   growth_geo_probes (rate per product, trend, sites named
 *                instead, and on demand the questions a product was missed on)
 *   Site visits  the four sites, with Check now
 *   Google       GET /api/growth/seo-rank
 *   Clips        this week's, by step
 * plus the one line that replaced Spend limits.
 * Deep links: ?section=numbers (and the old ?section=signals, ?section=governance).
 */
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { Button } from '../ui/button'
import { relativeTime } from '../../lib/ageHelpers'
import { ventureLabel } from '../../lib/ventureOptions'
import { BATCH_MAX, BATCH_MIN } from '../../lib/growth'
import { missedQuestions, normaliseTaskText } from '../../lib/growthModel'
import { FLAG_LINE, HEALTH_CHIP } from '../../lib/webProperties'
import { Columns, DotGrid, Ring, ShareBar, WeekPair } from './viz'
import { ENGINE_WORDS, Overlay, ProductTag } from './bits'
import { SiteCheck } from './SiteCheck'
import { ClipStages } from './Why'
import { PortfolioSection } from './PortfolioSection'
import { ClipSlots, type NumberAnchor } from './NumbersStrip'
import { aiSummary, fmtSearches, googleSummary, spendLine, visitsSummary } from './numbers'
import type { Layout } from './NextView'
import type { GrowthTabModel } from './useGrowthTab'

function dayMonth(ymd: string) {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function NumbersView({ m, mobile, layout, anchor }: { m: GrowthTabModel; mobile: boolean; layout: Layout; anchor: NumberAnchor | null }) {
  const [missed, setMissed] = useState<string | null>(null)
  useEffect(() => {
    if (!anchor) return
    document.getElementById(`growth-numbers-${anchor}`)?.scrollIntoView({ block: 'start' })
  }, [anchor])
  const { products, totals } = m.signals
  const ai = aiSummary(products, totals)
  const visits = visitsSummary(m.web.data, totals)
  const google = googleSummary(m.seo.rows)
  const maxRival = totals.citedInstead[0]?.times ?? 1
  const maxRate = Math.max(0.01, ...ai.byProduct.map(p => p.aiAnswers.rate ?? 0))
  const cols = layout === 'xwide' ? 'grid grid-cols-3 items-start gap-6' : layout === 'wide' ? 'grid grid-cols-2 items-start gap-6' : 'flex flex-col gap-4'

  const aiBlock = (
    <section id="growth-numbers-ai" className="surface flex scroll-mt-4 flex-col gap-4 rounded-3xl p-5" data-testid="growth-numbers-ai">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">AI answers that name you</Eyebrow>
        <span className="text-label text-ink-muted">Last 30 days</span>
      </div>
      {m.growthError ? (
        <p className="text-body text-ink-muted">The answer checks could not be read just now.</p>
      ) : ai.asked === 0 ? (
        <p className="text-body text-ink-muted">No AI answer has been checked in the last 30 days. The check asks ChatGPT, Perplexity and Google every Monday.</p>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Ring value={ai.mentioned} max={ai.asked} size={64} stroke={6} label={`${ai.mentioned} of ${ai.asked} answers named you`} />
            <div className="min-w-0">
              <p className="flex items-baseline gap-1.5"><span className="font-display text-display font-semibold tabular-nums text-ink">{ai.mentioned}</span><span className="text-ui text-ink-muted">of {ai.asked}</span></p>
              <p className="text-body text-ink-muted">answers named one of your products.</p>
            </div>
          </div>
          {ai.weekly.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Columns values={ai.weekly.map(w => w.mentioned)} w={200} h={40} label={`Named by week: ${ai.weekly.map(w => w.mentioned).join(', ')}`} />
              <div className="flex w-[200px] justify-between font-mono text-micro text-ink-muted">
                {ai.weekly.map(w => <span key={w.week}>{dayMonth(w.week)}</span>)}
              </div>
              <p className="text-label text-ink-muted">
                Asked every week. {ai.trend === 'flat' ? `${ai.last} a week, no change.` : `${ai.trend === 'up' ? 'Up' : 'Down'} from ${ai.first} a week to ${ai.last}.`}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
            <Eyebrow>By product</Eyebrow>
            <ul className="flex flex-col gap-3">
              {ai.byProduct.map(p => {
                const left = p.aiAnswers.asked - p.aiAnswers.mentioned
                return (
                  <li key={p.slug} className="flex flex-col gap-1.5" data-testid={`growth-ai-product-${p.slug}`}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-body font-semibold text-ink break-words">{p.label}</span>
                      <span className="font-mono text-label tabular-nums text-ink-muted">{p.aiAnswers.mentioned} of {p.aiAnswers.asked}</span>
                    </div>
                    <ShareBar value={p.aiAnswers.rate ?? 0} max={maxRate} label={`${p.aiAnswers.mentioned} of ${p.aiAnswers.asked}`} />
                    {left > 0 && (
                      <Button variant="ghost" size="sm" className="tap-44 -ml-2 self-start whitespace-normal px-2 text-left text-label" onClick={() => setMissed(p.slug)} data-testid={`growth-missed-${p.slug}`}>
                        See the questions where {p.label} was missed <ArrowRight size={14} aria-hidden />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          {totals.citedInstead.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
              <Eyebrow>Sites named instead</Eyebrow>
              <ul className="flex flex-col gap-2.5">
                {totals.citedInstead.map(r => (
                  <li key={r.domain} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                    <span className="text-body text-ink break-words">{r.domain}</span>
                    <span className="font-mono text-label tabular-nums text-ink-muted">{r.times}</span>
                    <div className="col-span-2"><ShareBar value={r.times} max={maxRival} tone="amber" label={`${r.domain} named in ${r.times} answers`} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )

  const visitsBlock = (
    <section id="growth-numbers-visits" className="surface flex scroll-mt-4 flex-col gap-4 rounded-3xl p-5" data-testid="growth-numbers-visits">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">Visits to your sites</Eyebrow>
        {visits.cur != null && <span className="font-mono text-label tabular-nums text-ink-muted">{visits.cur} this week</span>}
      </div>
      <SiteCheck m={m} />
      {visits.sites.length === 0 ? (
        <p className="text-body text-ink-muted" data-testid="growth-web-empty">{m.web.error ? 'The site visits could not be read just now.' : 'The sites have not been checked yet. The check runs once a day.'}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visits.sites.map(s => {
            const cur = s.totals?.cur.sessions ?? 0
            const prev = s.totals?.prev.sessions ?? 0
            return (
              <li key={s.prefix} className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3" data-testid={`growth-site-${s.prefix}`} data-health={s.health ?? 'none'}>
                <div className="flex flex-col items-start gap-1">
                  <span className="text-body font-semibold text-ink break-words">{s.label}</span>
                  <ProductTag slug={s.venture} />
                </div>
                {s.totals ? (
                  <>
                    <WeekPair cur={cur} prev={prev} max={Math.max(3, cur, prev)} />
                    <Columns values={(s.series ?? []).map(d => d.sessions ?? 0)} w={140} h={18} tone="neutral" label={`Visits a day for 28 days on ${s.label}`} />
                  </>
                ) : (
                  <p className="text-label text-ink-muted break-words">{s.health_line}</p>
                )}
                <span className="self-start rounded-full border border-white/10 px-2 py-0.5 text-micro font-semibold text-ink-muted">{s.health ? HEALTH_CHIP[s.health] : 'Not read yet'}</span>
                {s.flags.map(f => <p key={f} className="text-label text-accent-3 break-words">{FLAG_LINE[f]}</p>)}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )

  const googleBlock = (
    <section id="growth-numbers-google" className="surface flex scroll-mt-4 flex-col gap-4 rounded-3xl p-5" data-testid="growth-numbers-google">
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">Searches that find you on Google</Eyebrow>
        <span className="text-label text-ink-muted">Checked {relativeTime(m.seo.checkedAt) ?? 'never'}</span>
      </div>
      {google.total === 0 ? (
        <p className="text-body text-ink-muted">{m.seo.error ? 'The Google check could not be read just now.' : 'No searches are tracked yet.'}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <DotGrid total={google.total} lit={google.ranking} cols={layout === 'phone' ? 15 : 25} dot={layout === 'phone' ? 8 : 7} gap={3} label={`${google.ranking} of ${google.total} searches find you`} />
            <p className="min-w-0 flex-1 text-body text-ink">{google.ranking} of {google.total} searches you care about show you at all. {google.top10 === 1 ? 'One is' : `${google.top10} are`} in the top 10.</p>
          </div>
          <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-4">
            <Eyebrow>The biggest searches</Eyebrow>
            <ul className="flex flex-col gap-1.5">
              {google.bySearches.slice(0, 8).map(r => (
                <li key={r.id} className="flex flex-col gap-1 rounded-xl border border-white/[0.06] px-3 py-2">
                  <span className="text-body text-ink break-words">"{r.keyword}"</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ProductTag slug={r.product} />
                    <span className="font-mono text-micro tabular-nums text-ink-muted">{fmtSearches(r.monthly_searches)}</span>
                    <span className={`text-micro font-semibold ${r.position != null ? 'text-accent' : 'text-ink-muted'}`}>
                      {r.position != null ? `Shows at number ${r.position}` : 'Not in the results it checks'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )

  const clipsBlock = (
    <section id="growth-numbers-clips" className="surface flex scroll-mt-4 flex-col gap-4 rounded-3xl p-5" data-testid="growth-numbers-clips">
      <div className="flex items-center gap-3">
        <Eyebrow className="flex-1">Clips this week</Eyebrow>
        <ClipSlots have={totals.clips.made} />
      </div>
      <p className="text-body text-ink">{totals.clips.made} of {BATCH_MIN} picked, {totals.clips.posted} posted. The aim is {BATCH_MIN} to {BATCH_MAX} a week.</p>
      <ClipStages m={m} />
    </section>
  )

  const spend = (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/[0.08] px-4 py-3" data-testid="growth-spend-line">
      <p className="min-w-0 flex-1 text-label text-ink-muted break-words">
        {m.acq.error && !m.acq.data ? 'Spend could not be read just now. It is kept in Intel.' : m.acq.loading && !m.acq.data ? 'Reading this month\'s spend.' : spendLine(m.integrations)}
      </p>
      <Button asChild variant="ghost" size="default" className="tap-44">
        <a href="#/os?sub=intel">Open Intel <ArrowRight size={14} aria-hidden /></a>
      </Button>
    </section>
  )

  return (
    <div className="flex flex-col gap-4">
      <PortfolioSection m={m} mobile={mobile} layout={layout} />
      <div className={cols}>
        {aiBlock}
        {layout === 'xwide'
          ? <>{visitsBlock}<div className="flex flex-col gap-4">{googleBlock}{clipsBlock}</div></>
          : layout === 'wide'
            ? <div className="flex flex-col gap-4">{visitsBlock}{googleBlock}{clipsBlock}</div>
            : <>{visitsBlock}{googleBlock}{clipsBlock}</>}
      </div>
      {spend}
      <Overlay open={missed != null} onClose={() => setMissed(null)} label="Questions where you were missed" mobile={mobile}>
        {missed && <MissedQuestions m={m} slug={missed} />}
      </Overlay>
    </div>
  )
}

/** The exact questions, newest first. What an engine said stays folded until asked for. */
function MissedQuestions({ m, slug }: { m: GrowthTabModel; slug: string }) {
  const questions = useMemo(() => missedQuestions(m.g.probes, slug, m.now), [m.g.probes, slug, m.now])
  const [open, setOpen] = useState<string | null>(null)
  const name = ventureLabel(slug) ?? slug
  const said = (q: string) => m.g.probes
    .filter(p => !p.we_cited && normaliseTaskText(p.question) === normaliseTaskText(q))
    .sort((a, b) => (a.run_at < b.run_at ? 1 : -1))[0]
  return (
    <div className="flex flex-col gap-3 pt-1" data-testid="growth-missed-questions">
      <Eyebrow>{name}: missed on {questions.length === 1 ? '1 question' : `${questions.length} questions`}</Eyebrow>
      <p className="text-label text-ink-muted">Each one was asked in the last 30 days, and the answer did not name {name}.</p>
      <ul className="flex flex-col gap-2">
        {questions.map(q => {
          const latest = said(q.question)
          const isOpen = open === q.question
          const engine = latest ? ENGINE_WORDS[latest.engine] ?? latest.engine : null
          return (
            <li key={q.question} className="flex flex-col gap-1.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
              <p className="text-body font-semibold text-ink break-words">{q.question}</p>
              <p className="text-micro text-ink-muted">Missed by {q.engines.map(e => ENGINE_WORDS[e] ?? e).join(', ')}. Last asked {relativeTime(q.lastAsked) ?? 'recently'}.</p>
              {latest?.answer_snapshot && (
                <>
                  <button type="button" onClick={() => setOpen(isOpen ? null : q.question)} aria-expanded={isOpen} className="tap-44 inline-flex min-h-[36px] items-center gap-1.5 self-start text-label font-semibold text-ink-muted hover:text-ink">
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
                    {isOpen ? 'Hide the answer' : `Show what ${engine} said`}
                  </button>
                  {isOpen && <p className="text-body leading-relaxed text-ink-muted break-words">{latest.answer_snapshot}</p>}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
