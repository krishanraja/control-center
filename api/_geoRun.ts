// _geoRun, the two steps of the answer-engine pipeline as callable functions.
//
// They started as route handlers and were proven live in that form. They were
// lifted here unchanged the moment a second caller appeared: the weekly job
// that runs the whole thing unattended. The alternative was for that job to
// call its own deployment over HTTP, which fails the first time a deployment
// sits behind access protection and fails silently at that. A function call
// has no such edge.
//
// Both return { status, body } so the routes stay honest wrappers and the
// behaviour a caller sees is identical whether it arrived over HTTP or not.

import { supabase } from './_supabase.js'
import { callClaude, loadConfig, loadVoiceBlock, robustJson, sanitizeVoice } from './_content.js'
import { SYNTHESIS_MODEL } from './_models.js'
import {
  buildGeoRepair, buildGeoSystem, buildGeoUser, checkGeoDraft,
  type GeoContext, type GeoDraft, type GeoFailure,
} from './_geoPrompt.js'
import { citationsOf, hostLabel } from './_aeo.js'

export interface GeoRunResult { status: number; body: Record<string, unknown> }
const respond = (status: number, body: Record<string, unknown>): GeoRunResult => ({ status, body })

const PROBE_WINDOW_DAYS = 30
type Row = Record<string, any>

interface AeoMeta {
  subject_id?: string
  subject_slug?: string
  product_slug?: string | null
  target_query?: string
  query_id?: string
  angle?: string
  evidence?: string[]
  demand?: number
  why_you_can_win?: string | null
}

/** Where a piece for this subject will live. The research machine already
 *  knows the subject's domains; the first is the canonical host. */
function siteOf(subject: Row | null): string {
  const domains = Array.isArray(subject?.domains) ? subject!.domains as string[] : []
  return domains[0] || 'the site'
}

export async function draftIdea(id: string, opts: { overwrite?: boolean } = {}): Promise<GeoRunResult> {

  const started = Date.now()

  try {
    const read = await supabase.from('content_ideas')
      .select('id, idea, thesis, state, lane, lane_slot, body, meta')
      .eq('id', id).maybeSingle()
    if (read.error) throw new Error(read.error.message)
    const idea = read.data as Row | null
    if (!idea) return respond(404, { ok: false, error: 'unknown_idea' })

    const meta = (idea.meta && typeof idea.meta === 'object' ? idea.meta : {}) as Row
    const aeo = (meta.aeo && typeof meta.aeo === 'object' ? meta.aeo : null) as AeoMeta | null
    if (!aeo || !aeo.target_query) {
      return respond(409, {
        ok: false, error: 'not_an_aeo_idea',
        detail: 'This idea did not come from the research run, so there is no question for the page to win and no measurement to move.',
      })
    }
    // Overwriting a draft someone is working on is not this route's business.
    if (typeof idea.body === 'string' && idea.body.trim().length > 200 && opts.overwrite !== true) {
      return respond(409, { ok: false, error: 'body_exists', detail: 'This idea already carries a draft. Pass overwrite true to replace it.' })
    }

    const [voice, cfg, subjectRead] = await Promise.all([
      loadVoiceBlock().catch(() => ''),
      loadConfig(['mindmake_canon']).catch(() => ({} as Record<string, unknown>)),
      aeo.subject_id
        ? supabase.from('growth_aeo_subjects').select('id, name, slug, domains, never_say, product_slug').eq('id', aeo.subject_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (subjectRead.error) throw new Error(subjectRead.error.message)
    const subject = subjectRead.data as Row | null

    // Who the assistants name on this exact question today. This is the thing
    // the page is written against, and it is measured rather than guessed.
    const since = new Date(Date.now() - PROBE_WINDOW_DAYS * 86_400_000).toISOString()
    let probeQ = supabase.from('growth_geo_probes')
      .select('question, competitors_cited, we_cited, query_id')
      .gte('run_at', since)
      .limit(200)
    probeQ = aeo.query_id ? probeQ.eq('query_id', aeo.query_id) : probeQ.eq('question', aeo.target_query)
    const probes = await probeQ
    if (probes.error) throw new Error(probes.error.message)

    const tally = new Map<string, number>()
    for (const p of (probes.data || []) as Row[]) {
      for (const c of citationsOf(p.competitors_cited)) {
        const host = hostLabel(c)
        if (host) tally.set(host, (tally.get(host) || 0) + 1)
      }
    }
    const cited_hosts = [...tally.entries()]
      .map(([host, times]) => ({ host, times }))
      .sort((a, b) => b.times - a.times)
      .slice(0, 8)

    const ctx: GeoContext = {
      voice,
      canon: typeof cfg.mindmake_canon === 'string' ? cfg.mindmake_canon : '',
      entity: String(subject?.name || 'Mindmake'),
      site: siteOf(subject),
      cited_hosts,
      never_say: Array.isArray(subject?.never_say) ? subject!.never_say as string[] : [],
      aeo: {
        target_query: String(aeo.target_query),
        angle: String(aeo.angle || idea.thesis || ''),
        evidence: Array.isArray(aeo.evidence) ? aeo.evidence.map(String) : [],
        why_you_can_win: typeof aeo.why_you_can_win === 'string' && aeo.why_you_can_win.trim() ? aeo.why_you_can_win : null,
        demand: Number(aeo.demand) || 0,
      },
    }

    // A recommendation with no argument is refused before a single token is
    // spent, because there is nothing for the page to say.
    const preflight = checkGeoDraft({}, ctx).filter(f => f.code === 'no_winnability_reason')
    if (preflight.length) {
      return respond(409, { ok: false, error: 'no_winnability_reason', detail: preflight[0].why })
    }

    const system = buildGeoSystem(ctx)
    let raw = await callClaude({
      system, user: buildGeoUser(ctx), model: SYNTHESIS_MODEL, maxTokens: 8000, timeoutMs: 120_000,
    })
    let draft = robustJson(raw) as Partial<GeoDraft> | null
    let failures: GeoFailure[] = checkGeoDraft(draft, ctx)
    let repaired = false

    const hard = failures.filter(f => f.hard)
    if (!hard.length && failures.length) {
      repaired = true
      raw = await callClaude({
        system,
        user: `${buildGeoUser(ctx)}\n\nYour previous attempt:\n${JSON.stringify(draft)}\n\n${buildGeoRepair(failures)}`,
        model: SYNTHESIS_MODEL, maxTokens: 8000, timeoutMs: 120_000,
      })
      const second = robustJson(raw) as Partial<GeoDraft> | null
      const secondFailures = checkGeoDraft(second, ctx)
      // Keep the better of the two rather than the later of the two.
      if (secondFailures.length < failures.length) { draft = second; failures = secondFailures }
    }

    if (failures.length) {
      // Reported, never published weaker. The failures are written onto the
      // idea so the next run can see what this one could not fix.
      await supabase.from('content_ideas').update({
        meta: { ...meta, geo_draft: { attempted_at: new Date().toISOString(), repaired, failures, model: SYNTHESIS_MODEL } },
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      return respond(422, {
        ok: false, error: 'draft_failed_checks', repaired,
        failures, ms: Date.now() - started,
      })
    }

    const good = draft as GeoDraft
    const bodyMd = sanitizeVoice(good.body)
    const update: Row = {
      idea: sanitizeVoice(good.title).slice(0, 200),
      body: bodyMd,
      state: idea.state === 'published' || idea.state === 'dropped' ? idea.state : 'review',
      meta: {
        ...meta,
        geo: {
          slug: good.slug,
          answer: sanitizeVoice(good.answer),
          claim: sanitizeVoice(good.claim),
          first_party: good.first_party.map(s => sanitizeVoice(s)),
          meta_description: sanitizeVoice(good.meta_description),
          faq: good.faq.map(f => ({ q: sanitizeVoice(f.q), a: sanitizeVoice(f.a) })),
          target_query: ctx.aeo.target_query,
          cited_hosts,
          entity: ctx.entity,
          site: ctx.site,
          written_at: new Date().toISOString(),
          model: SYNTHESIS_MODEL,
          repaired,
        },
        geo_draft: { attempted_at: new Date().toISOString(), repaired, failures: [], model: SYNTHESIS_MODEL },
      },
      updated_at: new Date().toISOString(),
    }
    const wrote = await supabase.from('content_ideas').update(update).eq('id', id).select('id, state').single()
    if (wrote.error) throw new Error(wrote.error.message)

    await supabase.from('audit_log').insert({
      event_type: 'geo_draft',
      actor: 'cleo',
      target: 'content_ideas',
      display_message: `Wrote an answer-engine page for "${ctx.aeo.target_query}"${repaired ? ', after one repair pass' : ''}.`,
      details: JSON.stringify({ id, slug: good.slug, target_query: ctx.aeo.target_query, cited_hosts, repaired }),
    }).then(r => { if (r.error) console.error('geo_draft audit write failed', r.error.message) })

    return respond(200, {
      ok: true,
      id,
      state: (wrote.data as Row).state,
      slug: good.slug,
      claim: good.claim,
      words: bodyMd.trim().split(/\s+/).filter(Boolean).length,
      cited_hosts,
      repaired,
      ms: Date.now() - started,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    console.error('geo-draft failed', msg)
    return respond(500, { ok: false, error: msg.slice(0, 300) })
  }
}


/** Which site answers which venture's buyer questions. A question a CTRL buyer
 *  asks belongs on the CTRL site, so the map is the subject registry's
 *  product_slug and nothing cleverer. */
export const SITE_REPO: Record<string, string> = {
  'ctrl': 'krishanraja/mm-ctrl',
  'circle': 'krishanraja/fractionl-circle',
  'pulse': 'krishanraja/fractionl-pulse',
  'full-time': 'krishanraja/full-time',
  'mindmake': 'krishanraja/mindmake',
}

/** Where a page lives in a venture repo. One directory, flat, slug-named, so
 *  a site can glob it without a manifest to keep in step. */
export const CONTENT_DIR = 'src/content/answers'

const CHECK_AFTER_DAYS = 28
const COMMITTER = { name: 'Krish Raja', email: 'hello@krishraja.com' }

function gh(url: string, token: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'control-center',
      ...(init.headers || {}),
    },
  })
}

function yamlString(s: string): string {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Front matter a static site can read without a build-time manifest, and a
 *  human can read without a parser. The target question is on the page
 *  because it is the thing the page is accountable to. */
export function renderPage(geo: Row, meta: Row, publishedAt: string): string {
  const faq = Array.isArray(geo.faq) ? geo.faq as Array<{ q: string; a: string }> : []
  const firstParty = Array.isArray(geo.first_party) ? geo.first_party as string[] : []
  const front = [
    '---',
    `title: ${yamlString(geo.title || meta.idea || '')}`,
    `slug: ${yamlString(geo.slug || '')}`,
    `description: ${yamlString(geo.meta_description || '')}`,
    `answer: ${yamlString(geo.answer || '')}`,
    `claim: ${yamlString(geo.claim || '')}`,
    `target_query: ${yamlString(geo.target_query || '')}`,
    `published_at: ${yamlString(publishedAt)}`,
    firstParty.length ? 'first_party:' : '',
    ...firstParty.map(f => `  - ${yamlString(f)}`),
    faq.length ? 'faq:' : '',
    ...faq.flatMap(f => [`  - q: ${yamlString(f.q)}`, `    a: ${yamlString(f.a)}`]),
    '---',
    '',
  ].filter(Boolean).join('\n')
  const body = String(geo.body_md || '')
  const faqSection = faq.length
    ? ['', '## Questions people ask next', '', ...faq.flatMap(f => [`### ${f.q}`, '', f.a, ''])].join('\n')
    : ''
  return `${front}${body}\n${faqSection}`
}

export async function publishIdea(id: string, opts: { dry?: boolean } = {}): Promise<GeoRunResult> {

  const dry = opts.dry === true
  const token = process.env.GITHUB_TOKEN
  if (!token && !dry) return respond(500, { ok: false, error: 'github_token_not_configured' })
  const started = Date.now()

  try {
    const read = await supabase.from('content_ideas').select('id, idea, body, state, meta').eq('id', id).maybeSingle()
    if (read.error) throw new Error(read.error.message)
    const idea = read.data as Row | null
    if (!idea) return respond(404, { ok: false, error: 'unknown_idea' })

    const meta = (idea.meta && typeof idea.meta === 'object' ? idea.meta : {}) as Row
    const geo = (meta.geo && typeof meta.geo === 'object' ? meta.geo : null) as Row | null
    const aeo = (meta.aeo && typeof meta.aeo === 'object' ? meta.aeo : null) as Row | null
    if (!geo || !geo.slug) {
      return respond(409, { ok: false, error: 'not_drafted', detail: 'This idea carries no answer-engine draft. Run geo-draft first.' })
    }
    if (!idea.body || String(idea.body).trim().length < 400) {
      return respond(409, { ok: false, error: 'no_body', detail: 'The idea has no body to publish.' })
    }

    const productSlug = String(aeo?.product_slug || '')
    const repo = SITE_REPO[productSlug]
    if (!repo) {
      return respond(409, {
        ok: false, error: 'no_site_for_subject',
        detail: `No site is mapped for "${productSlug || 'an unknown product'}", so there is nowhere for this page to answer the question. Add it to SITE_REPO.`,
      })
    }

    // The date on the page, which is not the same as the moment of the commit.
    //
    // A page carries the date it was written, and geo.written_at is that. Using
    // the publish moment instead would stamp a whole seeded backlog with one
    // timestamp, and a set of pages all dated the same minute reads as a dump
    // rather than a publication, to a reader and to a crawler. So the written
    // date wins where there is one, and only a page with no recorded writing
    // date falls back to now.
    const now = new Date().toISOString()
    const writtenAt = typeof geo.written_at === 'string' && geo.written_at ? geo.written_at : now
    const publishedAt = writtenAt
    const page = renderPage({ ...geo, title: idea.idea, body_md: idea.body }, { idea: idea.idea }, publishedAt)
    const path = `${CONTENT_DIR}/${geo.slug}.md`
    const baseBranch = `answers/${geo.slug}`.slice(0, 200)

    if (dry) {
      return respond(200, { ok: true, dry: true, repo, path, branch: baseBranch, bytes: page.length, target_query: geo.target_query })
    }

    // The default branch, read rather than assumed: these repos are not all
    // the same age and main is a convention, not a guarantee.
    const repoRead = await gh(`https://api.github.com/repos/${repo}`, token!)
    if (repoRead.status === 403 || repoRead.status === 404) {
      return respond(200, { ok: false, skipped: 'github_write_forbidden', status: repoRead.status, repo })
    }
    if (!repoRead.ok) throw new Error(`repo read failed: HTTP ${repoRead.status}`)
    const base = String(((await repoRead.json()) as { default_branch?: string }).default_branch || 'main')

    const refRead = await gh(`https://api.github.com/repos/${repo}/git/ref/heads/${base}`, token!)
    if (!refRead.ok) throw new Error(`base ref read failed: HTTP ${refRead.status}`)
    const baseSha = String(((await refRead.json()) as { object: { sha: string } }).object.sha)

    // A re-publish of the same page reuses its branch rather than opening a
    // second one, so a corrected page never becomes two competing pages.
    //
    // Unless that branch has gone stale, which happens the moment a previous
    // version of the page reaches the default branch: the branch is then
    // behind, both sides have touched the same file, and every future publish
    // opens a pull request nobody can merge. Resetting the ref would be the
    // tidy fix and is not available, because moving a ref needs a permission
    // that writing a file does not. So a stale branch is abandoned and a fresh
    // one is cut from the base instead. The suffix is the day, which keeps the
    // name readable and stable within a day's retries.
    let branch = baseBranch
    const branchRead = await gh(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`, token!)
    if (branchRead.ok) {
      const cmp = await gh(`https://api.github.com/repos/${repo}/compare/${base}...${branch}`, token!)
      const status = cmp.ok ? String(((await cmp.json()) as { status?: string }).status || '') : ''
      if (status === 'behind' || status === 'diverged') {
        branch = `${baseBranch}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`.slice(0, 240)
      }
    } else if (branchRead.status !== 404) {
      throw new Error(`branch read failed: HTTP ${branchRead.status}`)
    }

    const exists = branch === baseBranch && branchRead.ok
    if (!exists) {
      const made = await gh(`https://api.github.com/repos/${repo}/git/refs`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      })
      if (made.status === 403) return respond(200, { ok: false, skipped: 'github_write_forbidden', status: 403, repo })
      // 422 is "already exists", which a same-day retry hits and which is fine.
      if (!made.ok && made.status !== 422) {
        throw new Error(`branch create failed: HTTP ${made.status} ${(await made.text().catch(() => '')).slice(0, 160)}`)
      }
    }

    const existing = await gh(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, token!)
    const existingSha = existing.ok ? String(((await existing.json()) as { sha: string }).sha) : undefined

    const write = await gh(`https://api.github.com/repos/${repo}/contents/${path}`, token!, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Answer the question buyers are asking: ${geo.target_query}\n\nWritten by the research engine against the sites an assistant names on this question today. The claim: ${String(geo.claim || '').slice(0, 300)}`,
        content: Buffer.from(page, 'utf8').toString('base64'),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
        committer: COMMITTER,
      }),
    })
    if (write.status === 403 || write.status === 404) {
      return respond(200, { ok: false, skipped: 'github_write_forbidden', status: write.status, repo, path })
    }
    if (!write.ok) throw new Error(`content write failed: HTTP ${write.status} ${(await write.text().catch(() => '')).slice(0, 200)}`)
    const commit = ((await write.json()) as { commit?: { sha?: string; html_url?: string } }).commit || {}

    // The standing veto. Closing this stops the page; nobody has to act for it
    // to go ahead.
    let prUrl: string | null = null
    let prNumber: number | null = null
    const openPrs = await gh(`https://api.github.com/repos/${repo}/pulls?head=${repo.split('/')[0]}:${branch}&state=open`, token!)
    const already = openPrs.ok ? ((await openPrs.json()) as Array<{ number: number; html_url: string }>) : []
    if (already.length) {
      prNumber = already[0].number
      prUrl = already[0].html_url
    } else {
      const pr = await gh(`https://api.github.com/repos/${repo}/pulls`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Answer: ${geo.target_query}`,
          head: branch,
          base,
          body: [
            `An assistant was asked **${geo.target_query}** and did not name this business.`,
            '',
            `**It named these instead:** ${(Array.isArray(geo.cited_hosts) ? geo.cited_hosts as Array<{ host: string; times: number }> : []).map(h => `${h.host} (${h.times})`).join(', ') || 'nothing recorded'}`,
            '',
            `**The claim this page makes that they cannot:** ${geo.claim || 'not recorded'}`,
            '',
            `**Why it was judged winnable:** ${aeo?.why_you_can_win || 'not recorded'}`,
            '',
            `This is a standing veto, not an approval gate. Close it to stop the page. Left alone, it merges after ${CHECK_AFTER_DAYS / 7} weeks of nobody objecting, and the engine checks four weeks later whether the answer actually changed.`,
            '',
            '---',
            '_Generated by [Claude Code](https://claude.ai/code)_',
          ].join('\n'),
        }),
      })
      if (pr.ok) {
        const j = (await pr.json()) as { number: number; html_url: string }
        prNumber = j.number
        prUrl = j.html_url
      }
    }

    // The prediction, from the state of the world at this moment.
    const checkAfter = new Date(Date.now() + CHECK_AFTER_DAYS * 86_400_000).toISOString()
    // predicted_at is the real moment the page went out, never the page's own
    // date: the four-week check counts from when a crawler could first see it.
    const prediction = {
      content_idea_id: id,
      subject_id: aeo?.subject_id ?? null,
      product_slug: productSlug,
      repo,
      path,
      published_url: prUrl,
      commit_sha: commit.sha ?? null,
      target_query: String(geo.target_query || ''),
      query_id: aeo?.query_id ?? null,
      hosts_before: Array.isArray(geo.cited_hosts) ? geo.cited_hosts : [],
      cited_before: false,
      claim: geo.claim ?? null,
      why_you_can_win: aeo?.why_you_can_win ?? null,
      predicted_at: now,
      check_after: checkAfter,
      updated_at: now,
    }
    const pred = await supabase.from('geo_predictions')
      .upsert(prediction, { onConflict: 'content_idea_id,target_query' })
      .select('id').maybeSingle()
    const predictionWritten = !pred.error

    await supabase.from('content_ideas').update({
      meta: {
        ...meta,
        geo: { ...geo, staged_at: now, published_at: publishedAt, repo, path, branch, pr_url: prUrl, commit: commit.sha ?? null },
      },
      updated_at: now,
    }).eq('id', id)

    await supabase.from('audit_log').insert({
      event_type: 'geo_publish',
      actor: 'cleo',
      target: 'geo_predictions',
      display_message: `Staged an answer page for "${geo.target_query}" and recorded what it should change by ${checkAfter.slice(0, 10)}.`,
      details: JSON.stringify({ id, repo, path, branch, pr: prNumber, commit: commit.sha ?? null, prediction_written: predictionWritten }),
    }).then(r => { if (r.error) console.error('geo_publish audit write failed', r.error.message) })

    return respond(200, {
      ok: true,
      repo,
      path,
      branch,
      commit: commit.sha ?? null,
      commit_url: commit.html_url ?? null,
      pr_url: prUrl,
      pr_number: prNumber,
      target_query: geo.target_query,
      check_after: checkAfter,
      prediction_written: predictionWritten,
      // Said out loud rather than swallowed: a page with no prediction is a
      // gap in the learning even though the page itself is fine.
      prediction_error: predictionWritten ? null : (pred.error?.message || 'unknown').slice(0, 200),
      ms: Date.now() - started,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    console.error('geo-publish failed', msg)
    return respond(500, { ok: false, error: msg.slice(0, 300) })
  }
}
