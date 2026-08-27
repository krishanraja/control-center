import { supabase } from './_supabase.js'

/**
 * What each tab knows about itself.
 *
 * /api/ask-marcus grounds every question in the same four tables, which is
 * correct for one fixed question ("what should I do about the business?") and
 * wrong for seven. Asking the Growth tab about a stalled metric and getting an
 * answer built from the customer list is not a scoping bug, it is the whole
 * feature missing.
 *
 * So the grounding is a registry keyed on tab, and the chat endpoint is thin.
 * Each builder does the same three things: read the rows that tab is about,
 * format them small enough to spend on reasoning rather than transcription,
 * and say plainly when a table is empty. An empty table has to arrive as
 * "no rows", never as an omitted line: a model shown nothing infers nothing
 * is wrong, and "your fleet is healthy" because the query failed is the
 * worst answer this system can give.
 *
 * Every select lists its columns. `select('*')` here would ship
 * contact_intelligence.why_them and .risk — private assessments of named
 * people — into a prompt, which is exactly what that table's service-role-only
 * comment exists to prevent.
 */

/** The seven tabs, mirroring src/lib/tabs.ts. Keep in step with it. */
export const TAB_IDS = ['home', 'content', 'people', 'growth', 'os', 'focus', 'customers'] as const
export type TabId = (typeof TAB_IDS)[number]

export function isTabId(v: unknown): v is TabId {
  return typeof v === 'string' && (TAB_IDS as readonly string[]).includes(v)
}

/** Human label per tab, used in the prompt so the model names the tab as Krish does. */
export const TAB_LABELS: Record<TabId, string> = {
  home: 'Home',
  content: 'Content',
  people: 'People',
  growth: 'Growth',
  os: 'OS',
  focus: 'Focus',
  customers: 'Subscriptions',
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** "3 of these" or an explicit none. Never silence. */
function block(title: string, rows: unknown[] | null | undefined, render: () => string): string {
  if (!rows || rows.length === 0) return `${title}: no rows.`
  return `${title}:\n${render()}`
}

function ago(ts: string | null | undefined): string {
  if (!ts) return 'never'
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

// ── Per-tab builders ────────────────────────────────────────────────────────

async function groundHome(): Promise<string> {
  const [focus, intel, failures] = await Promise.all([
    supabase.from('daily_focus')
      .select('focus_date, status, target_1_text, target_1_completed_at, target_2_text, target_2_completed_at, target_3_text, target_3_completed_at')
      .order('focus_date', { ascending: false }).limit(1),
    supabase.from('home_intelligence').select('summary, daily_brief, top_three').eq('id', 'current').maybeSingle(),
    supabase.from('silent_failures')
      .select('workflow_name, tier, failure_type, detail, detected_at')
      .is('resolved_at', null).gte('tier', 2)
      .order('detected_at', { ascending: false }).limit(12),
  ])

  const f = focus.data?.[0]
  const focusBlock = f
    ? `Today's three (${f.focus_date}, ${f.status}):\n` + [1, 2, 3]
        .map(i => {
          const text = (f as any)[`target_${i}_text`]
          const done = (f as any)[`target_${i}_completed_at`]
          return text ? `  ${i}. ${text} — ${done ? 'done' : 'open'}` : null
        }).filter(Boolean).join('\n')
    : "Today's three: not set."

  return [
    focusBlock,
    intel.data?.summary
      ? `Marcus synthesis: ${typeof intel.data.summary === 'string' ? intel.data.summary : JSON.stringify(intel.data.summary)}`.slice(0, 1200)
      : 'Marcus synthesis: none stored.',
    block('Unresolved fleet failures', failures.data, () =>
      (failures.data || []).map(r => `  tier ${r.tier} · ${r.workflow_name} · ${r.failure_type} · ${ago(r.detected_at)} · ${String(r.detail || '').slice(0, 110)}`).join('\n')),
  ].join('\n\n')
}

async function groundContent(): Promise<string> {
  const [shifts, arcs, brief, ideas] = await Promise.all([
    supabase.from('shifts')
      .select('title, status, lane, arc_state, momentum, source_count_total, implication, last_evidence_on')
      .order('updated_at', { ascending: false }).limit(12),
    supabase.from('arc_cards')
      .select('headline, week, score, surfaced, surface_reason, reader_decision, format')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('weekly_briefs').select('week, title, status, assembled_at')
      .order('week', { ascending: false }).limit(1),
    supabase.from('content_ideas').select('lane, state, quality_score')
      .is('buried_at', null).limit(600),
  ])

  const byLane = (ideas.data || []).reduce<Record<string, number>>((a, r) => {
    const k = (r.lane as string) || 'unlaned'; a[k] = (a[k] || 0) + 1; return a
  }, {})
  const scored = (ideas.data || []).filter(r => n(r.quality_score) > 0)
  const avg = scored.length ? Math.round(scored.reduce((s, r) => s + n(r.quality_score), 0) / scored.length) : null

  return [
    block('Shift register (the arcs being tracked)', shifts.data, () =>
      (shifts.data || []).map(r => `  ${r.title} — ${r.status}/${r.arc_state || 'no arc state'}, lane ${r.lane || '?'}, ${n(r.source_count_total)} sources, last evidence ${r.last_evidence_on || '?'}${r.implication ? `\n     implication: ${r.implication}` : ''}`).join('\n')),
    block('Arc cards (composed, most recent first)', arcs.data, () =>
      (arcs.data || []).map(r => `  [${r.surfaced ? 'SURFACED' : 'held'}] ${r.headline} — week ${r.week}, score ${r.score}${r.surfaced ? '' : ` (${r.surface_reason || 'no reason recorded'})`}`).join('\n')),
    brief.data?.[0]
      ? `Latest weekly brief: ${brief.data[0].week} "${brief.data[0].title}" — ${brief.data[0].status}, assembled ${ago(brief.data[0].assembled_at)}.`
      : 'Latest weekly brief: none.',
    `Idea queue: ${(ideas.data || []).length} live ideas${avg !== null ? `, mean quality ${avg}` : ', none scored'}. By lane: ${Object.entries(byLane).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}.`,
  ].join('\n\n')
}

async function groundPeople(): Promise<string> {
  const [leads, guests, vis, intel] = await Promise.all([
    supabase.from('leads')
      .select('full_name, company, title, tier, status, icp_score, why_relevant, next_step, follow_up_at')
      .is('buried_at', null).order('icp_score', { ascending: false, nullsFirst: false }).limit(60),
    supabase.from('guests').select('name, status, fit_score, podcast_target, scheduled_at')
      .is('buried_at', null).order('fit_score', { ascending: false, nullsFirst: false }).limit(20),
    supabase.from('visibility_targets')
      .select('title, type, status, deadline_at, relevance_score, recommended_next_step')
      .is('buried_at', null).in('status', ['new', 'shortlisted', 'applied']).order('deadline_at', { ascending: true, nullsFirst: false }).limit(15),
    supabase.from('contact_intelligence').select('network_tier').limit(2000),
  ])

  const leadRows = leads.data || []
  const byStatus = leadRows.reduce<Record<string, number>>((a, r) => {
    const k = (r.status as string) || 'unknown'; a[k] = (a[k] || 0) + 1; return a
  }, {})
  const tiers = (intel.data || []).reduce<Record<string, number>>((a, r) => {
    const k = (r.network_tier as string) || 'untiered'; a[k] = (a[k] || 0) + 1; return a
  }, {})

  return [
    `Leads: ${leadRows.length} live. By status: ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}.`,
    block('Top leads by ICP score', leadRows.slice(0, 8), () =>
      leadRows.slice(0, 8).map(r => `  ${r.full_name || '?'}${r.company ? ` (${r.company}${r.title ? `, ${r.title}` : ''})` : ''} — tier ${r.tier || '?'}, ICP ${r.icp_score ?? '?'}, ${r.status}${r.why_relevant ? `\n     why: ${r.why_relevant}` : ''}${r.next_step ? `\n     next step on file: ${r.next_step}` : ''}`).join('\n')),
    `Network: ${(intel.data || []).length} people with intelligence. Tiers: ${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}.`,
    block('Guests', guests.data, () =>
      (guests.data || []).map(r => `  ${r.name} — ${r.status}, fit ${r.fit_score ?? '?'}${r.scheduled_at ? `, scheduled ${r.scheduled_at.slice(0, 10)}` : ''}`).join('\n')),
    block('Open visibility targets (soonest deadline first)', vis.data, () =>
      (vis.data || []).map(r => `  ${r.title} — ${r.type || '?'}, ${r.status}, deadline ${r.deadline_at ? r.deadline_at.slice(0, 10) : 'none'}, relevance ${r.relevance_score ?? '?'}${r.recommended_next_step ? `\n     recommended: ${r.recommended_next_step}` : ''}`).join('\n')),
  ].join('\n\n')
}

async function groundGrowth(): Promise<string> {
  const [touch, council, stalls, probes, metrics] = await Promise.all([
    supabase.from('growth_touchpoints')
      .select('product_slug, channel, watering_hole, coverage_status, cost_efficiency_score, assumption_flag, rationale')
      .order('cost_efficiency_score', { ascending: false, nullsFirst: false }).limit(25),
    supabase.from('growth_council_reviews')
      .select('week_start, product_slug, findings, kill_list, double_down, krish_decision')
      .order('week_start', { ascending: false }).limit(3),
    supabase.from('growth_stalls')
      .select('metric_key, baseline_value, latest_value, window_days, status, started_at, moves')
      .eq('status', 'open').order('started_at', { ascending: false }).limit(10),
    supabase.from('growth_geo_probes').select('engine, we_cited, run_at')
      .gte('run_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(400),
    supabase.from('growth_metrics').select('metric_key, metric_date, value')
      .order('metric_date', { ascending: false }).limit(60),
  ])

  const probeRows = probes.data || []
  const cited = probeRows.filter(r => r.we_cited).length

  const latestByKey = new Map<string, { d: string; v: number }>()
  for (const r of metrics.data || []) {
    const k = r.metric_key as string
    if (!latestByKey.has(k)) latestByKey.set(k, { d: r.metric_date as string, v: n(r.value) })
  }

  return [
    block('Touchpoints (where buyers already are)', touch.data, () =>
      (touch.data || []).map(r => `  ${r.product_slug || '?'} · ${r.channel || '?'} · ${r.watering_hole || '?'} — ${r.coverage_status || '?'}, efficiency ${r.cost_efficiency_score ?? '?'}${r.assumption_flag ? ' [ASSUMPTION, unverified]' : ''}`).join('\n')),
    block('Growth council reviews (most recent first)', council.data, () =>
      (council.data || []).map(r => {
        const f: any = r.findings || {}
        const kill = Array.isArray(r.kill_list) ? r.kill_list : []
        const dd = Array.isArray(r.double_down) ? r.double_down : []
        return `  week ${r.week_start} · ${r.product_slug || 'all'} — ${f.headline || '(no headline)'}${f.degraded ? ` [${f.degraded}]` : ''}\n     kill: ${kill.length ? kill.map((k: any) => k.what || k).join('; ') : 'nothing'}\n     double down: ${dd.length ? dd.map((k: any) => k.what || k).join('; ') : 'nothing'}\n     decision: ${r.krish_decision || 'undecided'}`
      }).join('\n')),
    block('Open stalls', stalls.data, () =>
      (stalls.data || []).map(r => `  ${r.metric_key}: ${r.baseline_value} → ${r.latest_value} over ${r.window_days}d, open since ${ago(r.started_at)}, ${Array.isArray(r.moves) ? r.moves.length : 0} moves drafted`).join('\n')),
    probeRows.length
      ? `GEO citation: cited in ${cited}/${probeRows.length} probes over 30d (${Math.round((cited / probeRows.length) * 100)}%).`
      : 'GEO citation: no probes in 30d.',
    latestByKey.size
      ? `Latest growth metrics: ${[...latestByKey.entries()].map(([k, v]) => `${k} ${v.v} (${v.d})`).join(' · ')}`
      : 'Latest growth metrics: none.',
  ].join('\n\n')
}

async function groundOs(): Promise<string> {
  const [health, runs, agents, sys] = await Promise.all([
    // The external-truth table. DISTINCT ON per workflow is done client-side
    // here because the reconcile sweep writes a different checked_at per page,
    // so "the latest checked_at" is one arbitrary page of the fleet, not the
    // fleet. See src/hooks/useWorkflowHealth.ts for the same rule.
    supabase.from('workflow_health')
      .select('workflow_id, workflow_name, status, active, runs_28d, errors_28d, failure_class, last_error_node, last_error_message, last_success_at, checked_at')
      .order('checked_at', { ascending: false }).limit(600),
    supabase.from('workflow_runs').select('workflow_name, status, outcome, run_at, error_message')
      .order('run_at', { ascending: false }).limit(20),
    supabase.from('agents').select('name, role, active, last_run, kpi_label, kpi_current, kpi_target').eq('active', true).limit(20),
    supabase.from('system_health').select('component, status, message, last_check').limit(20),
  ])

  const latest = new Map<string, any>()
  for (const r of health.data || []) if (!latest.has(r.workflow_id as string)) latest.set(r.workflow_id as string, r)
  const fleet = [...latest.values()]
  const broken = fleet.filter(r => ['failing', 'dead', 'degraded'].includes(String(r.status)))

  return [
    fleet.length
      ? `Fleet external truth (n8n executions API, ${fleet.length} workflows): ${fleet.filter(r => r.status === 'healthy').length} healthy, ${broken.length} failing/dead/degraded, ${fleet.filter(r => r.status === 'idle').length} idle.`
      : 'Fleet external truth: no rows — the reconcile sweep has not written.',
    block('Broken workflows', broken, () =>
      broken.map(r => `  ${r.workflow_name} — ${r.status}, ${n(r.errors_28d)}/${n(r.runs_28d)} runs failed in 28d, class ${r.failure_class || 'unclassified'}, last success ${ago(r.last_success_at)}${r.last_error_node ? `\n     failing node: ${r.last_error_node} — ${String(r.last_error_message || '').slice(0, 120)}` : ''}`).join('\n')),
    block('Last 20 self-reported runs', runs.data, () =>
      (runs.data || []).map(r => `  ${r.workflow_name} — ${r.status || r.outcome || '?'} ${ago(r.run_at)}${r.error_message ? ` (${String(r.error_message).slice(0, 80)})` : ''}`).join('\n')),
    block('Active agents', agents.data, () =>
      (agents.data || []).map(r => `  ${r.name} (${r.role || '?'}) — last run ${ago(r.last_run)}${r.kpi_label ? `, ${r.kpi_label} ${r.kpi_current ?? '?'}/${r.kpi_target ?? '?'}` : ''}`).join('\n')),
    block('System health', sys.data, () =>
      (sys.data || []).map(r => `  ${r.component}: ${r.status}${r.message ? ` — ${String(r.message).slice(0, 100)}` : ''}`).join('\n')),
  ].join('\n\n')
}

async function groundFocus(): Promise<string> {
  const [focus, checkins, asks, worries, ships] = await Promise.all([
    supabase.from('daily_focus').select('focus_date, status, target_1_text, target_2_text, target_3_text')
      .order('focus_date', { ascending: false }).limit(5),
    supabase.from('pilot_checkins').select('kind, energy, anxiety, one_word, mode, shipped_today, tomorrow_one, checkin_date')
      .order('checkin_date', { ascending: false }).limit(6),
    supabase.from('pilot_asks').select('ask_date, ask_text, predicted_no_pct, sent_at, outcome')
      .is('resolved_at', null).order('ask_date', { ascending: false }).limit(8),
    supabase.from('worries').select('raw_text, state, belief, prediction, test_due_date, action_text, closed_at')
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('ships').select('description, channel, occurred_at')
      .gte('occurred_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(20),
  ])

  return [
    block('Recent daily focus', focus.data, () =>
      (focus.data || []).map(r => `  ${r.focus_date} (${r.status}): ${[r.target_1_text, r.target_2_text, r.target_3_text].filter(Boolean).join(' | ') || 'not set'}`).join('\n')),
    block('Pilot check-ins', checkins.data, () =>
      (checkins.data || []).map(r => `  ${r.checkin_date} ${r.kind} — energy ${r.energy ?? '?'}, anxiety ${r.anxiety ?? '?'}, "${r.one_word || ''}"${r.shipped_today ? `, shipped: ${r.shipped_today}` : ''}${r.tomorrow_one ? `, tomorrow: ${r.tomorrow_one}` : ''}`).join('\n')),
    block('Open asks', asks.data, () =>
      (asks.data || []).map(r => `  ${r.ask_date}: ${r.ask_text} — ${r.sent_at ? 'sent' : 'NOT SENT'}, predicted no ${r.predicted_no_pct ?? '?'}%`).join('\n')),
    block('Worries', worries.data, () =>
      (worries.data || []).map(r => `  [${r.state}]${r.closed_at ? ' (closed)' : ''} ${String(r.raw_text || '').slice(0, 100)}${r.action_text ? `\n     action: ${r.action_text}` : ''}${r.test_due_date ? `\n     test due: ${r.test_due_date}` : ''}`).join('\n')),
    block('Shipped in the last 7 days', ships.data, () =>
      (ships.data || []).map(r => `  ${String(r.occurred_at || '').slice(0, 10)} ${r.channel || ''} — ${r.description}`).join('\n')),
  ].join('\n\n')
}

async function groundCustomers(): Promise<string> {
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0)
  const [custs, events, subs, spend, product] = await Promise.all([
    supabase.from('customers').select('product, kind, mrr_usd, churned_at, plan, became_paid_at, needs_outreach_at').limit(500),
    supabase.from('revenue_events').select('kind, occurred_at, usd_cents, product')
      .gte('occurred_at', new Date(Date.now() - 30 * 86_400_000).toISOString()).limit(200),
    supabase.from('revenue_subscriptions').select('product, status, mrr_usd_cents, current_period_end, canceled_at').limit(200),
    supabase.from('spend_invoices').select('service_key, amount_usd, paid_at')
      .gte('paid_at', monthStart.toISOString()).limit(200),
    supabase.from('product_metrics').select('product, metric_date, active_users, pageviews')
      .order('metric_date', { ascending: false }).limit(40),
  ])

  const rows = custs.data || []
  const paid = rows.filter(r => r.kind === 'paid' && !r.churned_at)
  const churned = rows.filter(r => r.kind === 'churned')
  const mrr = paid.reduce((s, r) => s + n(r.mrr_usd), 0)
  const byProduct = paid.reduce<Record<string, { c: number; m: number }>>((a, r) => {
    const k = (r.product as string) || 'unknown'
    if (!a[k]) a[k] = { c: 0, m: 0 }
    a[k].c += 1; a[k].m += n(r.mrr_usd); return a
  }, {})
  const spendTotal = (spend.data || []).reduce((s, r) => s + n(r.amount_usd), 0)

  const latestProduct = new Map<string, any>()
  for (const r of product.data || []) if (!latestProduct.has(r.product as string)) latestProduct.set(r.product as string, r)

  return [
    `Customers: ${paid.length} paid, $${Math.round(mrr)}/mo MRR, ${churned.length} churned all-time.`,
    `By product: ${Object.entries(byProduct).map(([p, v]) => `${p} ${v.c} paid $${Math.round(v.m)}/mo`).join(' · ') || 'none'}.`,
    block('Revenue events, last 30d', events.data, () => {
      const total = (events.data || []).reduce((s, r) => s + n(r.usd_cents), 0) / 100
      const byKind = (events.data || []).reduce<Record<string, number>>((a, r) => {
        const k = (r.kind as string) || '?'; a[k] = (a[k] || 0) + 1; return a
      }, {})
      return `  $${Math.round(total)} across ${(events.data || []).length} events (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')}).`
    }),
    block('Active subscriptions', (subs.data || []).filter(r => r.status === 'active'), () => {
      const act = (subs.data || []).filter(r => r.status === 'active')
      const m = act.reduce((s, r) => s + n(r.mrr_usd_cents), 0) / 100
      return `  ${act.length} active, $${Math.round(m)}/mo. Cancelling: ${(subs.data || []).filter(r => r.canceled_at).length}.`
    }),
    `Spend month-to-date: $${Math.round(spendTotal)} across ${(spend.data || []).length} invoices.`,
    latestProduct.size
      ? `Product usage (latest 7d window per product): ${[...latestProduct.values()].map(r => `${r.product} ${r.active_users ?? '?'} active / ${r.pageviews ?? '?'} views (${r.metric_date})`).join(' · ')}`
      : 'Product usage: no rows.',
    rows.filter(r => r.needs_outreach_at).length
      ? `Flagged for outreach: ${rows.filter(r => r.needs_outreach_at).length} customers.`
      : 'Flagged for outreach: none.',
  ].join('\n\n')
}

const BUILDERS: Record<TabId, () => Promise<string>> = {
  home: groundHome,
  content: groundContent,
  people: groundPeople,
  growth: groundGrowth,
  os: groundOs,
  focus: groundFocus,
  customers: groundCustomers,
}

/**
 * Build the grounding block for one tab.
 *
 * `lane` is the sub-navigation the user is actually looking at (People's lane,
 * OS's sub). It is passed to the model as context rather than used to filter,
 * because a question asked from the Network lane is usually still about the
 * tab: filtering the rows away would make "how does this compare to the
 * pipeline?" unanswerable.
 *
 * A builder that throws returns its failure as text rather than propagating.
 * The chat is still worth having with four of five blocks, and a model told
 * "this read failed" will say so, where a model handed a truncated context
 * silently answers from the half it got.
 */
export async function groundTab(tab: TabId, lane?: string | null): Promise<string> {
  let body: string
  try {
    body = await BUILDERS[tab]()
  } catch (err: any) {
    body = `Grounding read failed: ${String(err?.message || err)}. Say so rather than answering from memory.`
  }
  const header = lane
    ? `Tab: ${TAB_LABELS[tab]} (Krish is on the "${lane}" section).`
    : `Tab: ${TAB_LABELS[tab]}.`
  return `${header}\n\n${body}`
}
