import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { preamble } from '../../_content.js'

// POST /api/content-ideas/:id/geo-publish
//
// Puts a drafted answer-engine page into the venture's own site repository,
// on a branch, behind a pull request, and records what it is expected to
// change before it can possibly change anything.
//
// WHY A BRANCH AND A PULL REQUEST
//
// Krish asked for no approval step, and this is not one. An open pull request
// is a standing veto rather than a gate: nobody has to act for the page to go
// live, and closing the PR is the one gesture that stops it. The autonomous
// loop merges it after the delay. That gives the delay a real mechanism
// instead of a timer nothing can interrupt, and it means the only irreversible
// step in the chain, putting a page on the public internet, has a handle on it
// that costs nothing when unused.
//
// WHY THE PREDICTION IS WRITTEN HERE AND NOT LATER
//
// The engine is supposed to work out which kinds of page get quoted. It cannot
// learn that from a log. A page ships, the citation rate later moves, and
// there is no way to separate the page from the week the assistants reshuffled
// their index. What separates them is a claim made in advance: this page
// targets this question, these hosts hold the answer today, expect to be named
// within four weeks. So geo_predictions is written in the same request that
// opens the pull request, from the state of the world at that moment, and it
// is never written retrospectively. A prediction recovered after the fact is
// not a prediction.
//
// The page is committed even when the prediction write fails, and the failure
// is reported: a published page with no prediction is a gap in the learning,
// while an unpublished page is a gap in the strategy. But both are said out
// loud rather than swallowed.
//
// Bearer-free like its siblings under content-ideas; the GitHub credential is
// server-side and never leaves this process.

export const config = { maxDuration: 60 }

type Row = Record<string, any>

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' })
  const dry = req.body?.dry === true
  const token = process.env.GITHUB_TOKEN
  if (!token && !dry) return res.status(500).json({ ok: false, error: 'github_token_not_configured' })
  const started = Date.now()

  try {
    const read = await supabase.from('content_ideas').select('id, idea, body, state, meta').eq('id', id).maybeSingle()
    if (read.error) throw new Error(read.error.message)
    const idea = read.data as Row | null
    if (!idea) return res.status(404).json({ ok: false, error: 'unknown_idea' })

    const meta = (idea.meta && typeof idea.meta === 'object' ? idea.meta : {}) as Row
    const geo = (meta.geo && typeof meta.geo === 'object' ? meta.geo : null) as Row | null
    const aeo = (meta.aeo && typeof meta.aeo === 'object' ? meta.aeo : null) as Row | null
    if (!geo || !geo.slug) {
      return res.status(409).json({ ok: false, error: 'not_drafted', detail: 'This idea carries no answer-engine draft. Run geo-draft first.' })
    }
    if (!idea.body || String(idea.body).trim().length < 400) {
      return res.status(409).json({ ok: false, error: 'no_body', detail: 'The idea has no body to publish.' })
    }

    const productSlug = String(aeo?.product_slug || '')
    const repo = SITE_REPO[productSlug]
    if (!repo) {
      return res.status(409).json({
        ok: false, error: 'no_site_for_subject',
        detail: `No site is mapped for "${productSlug || 'an unknown product'}", so there is nowhere for this page to answer the question. Add it to SITE_REPO.`,
      })
    }

    const publishedAt = new Date().toISOString()
    const page = renderPage({ ...geo, title: idea.idea, body_md: idea.body }, { idea: idea.idea }, publishedAt)
    const path = `${CONTENT_DIR}/${geo.slug}.md`
    const branch = `answers/${geo.slug}`.slice(0, 240)

    if (dry) {
      return res.status(200).json({ ok: true, dry: true, repo, path, branch, bytes: page.length, target_query: geo.target_query })
    }

    // The default branch, read rather than assumed: these repos are not all
    // the same age and main is a convention, not a guarantee.
    const repoRead = await gh(`https://api.github.com/repos/${repo}`, token!)
    if (repoRead.status === 403 || repoRead.status === 404) {
      return res.status(200).json({ ok: false, skipped: 'github_write_forbidden', status: repoRead.status, repo })
    }
    if (!repoRead.ok) throw new Error(`repo read failed: HTTP ${repoRead.status}`)
    const base = String(((await repoRead.json()) as { default_branch?: string }).default_branch || 'main')

    const refRead = await gh(`https://api.github.com/repos/${repo}/git/ref/heads/${base}`, token!)
    if (!refRead.ok) throw new Error(`base ref read failed: HTTP ${refRead.status}`)
    const baseSha = String(((await refRead.json()) as { object: { sha: string } }).object.sha)

    // A re-publish of the same page reuses its branch rather than opening a
    // second one, so a corrected page never becomes two competing pages.
    const branchRead = await gh(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`, token!)
    if (branchRead.status === 404) {
      const made = await gh(`https://api.github.com/repos/${repo}/git/refs`, token!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      })
      if (made.status === 403) return res.status(200).json({ ok: false, skipped: 'github_write_forbidden', status: 403, repo })
      if (!made.ok) throw new Error(`branch create failed: HTTP ${made.status} ${(await made.text().catch(() => '')).slice(0, 160)}`)
    } else if (!branchRead.ok) {
      throw new Error(`branch read failed: HTTP ${branchRead.status}`)
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
      return res.status(200).json({ ok: false, skipped: 'github_write_forbidden', status: write.status, repo, path })
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
      predicted_at: publishedAt,
      check_after: checkAfter,
      updated_at: publishedAt,
    }
    const pred = await supabase.from('geo_predictions')
      .upsert(prediction, { onConflict: 'content_idea_id,target_query' })
      .select('id').maybeSingle()
    const predictionWritten = !pred.error

    await supabase.from('content_ideas').update({
      meta: {
        ...meta,
        geo: { ...geo, staged_at: publishedAt, repo, path, branch, pr_url: prUrl, commit: commit.sha ?? null },
      },
      updated_at: publishedAt,
    }).eq('id', id)

    await supabase.from('audit_log').insert({
      event_type: 'geo_publish',
      actor: 'cleo',
      target: 'geo_predictions',
      display_message: `Staged an answer page for "${geo.target_query}" and recorded what it should change by ${checkAfter.slice(0, 10)}.`,
      details: JSON.stringify({ id, repo, path, branch, pr: prNumber, commit: commit.sha ?? null, prediction_written: predictionWritten }),
    }).then(r => { if (r.error) console.error('geo_publish audit write failed', r.error.message) })

    return res.status(200).json({
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
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }
}
