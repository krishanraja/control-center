import type { Page, Route } from '@playwright/test'
import { contentTables, mockPopulatedContent } from './populated'
import { videoStudioReviewFixture } from './video-studio'

/**
 * The Content tab's morning, for the specs that exercise today's calls.
 *
 * On top of the shared populated tables (src fixtures/populated.ts): one
 * Studio video waiting for review, the judges' marks for the three pieces a
 * pick call lays side by side, and an engine fact gate that answers for every
 * draft. A test that needs a write to land registers its own route after this.
 */

/** The Studio review as the actionable list returns it (no detail fields). */
export function videoListItem(overrides: Record<string, unknown> = {}) {
  const {
    editorial_state: _e, runner_state: _r, review_payload: _p, preview: _pv, comparison: _c,
    prepare_command: _pc, decision_command: _dc, recovery: _rc,
    ...item
  } = videoStudioReviewFixture as Record<string, unknown>
  return { ...item, series: 'follow_the_money', ...overrides }
}

/** Eight model judges and the prosecutor, for one panel run. */
function marks(run: string, praised: number) {
  const judges = ['novelty', 'evidence', 'consequence', 'reader', 'buyer', 'connection', 'fun', 'standing']
  return judges.map((judge, k) => ({
    panel_run_id: run,
    judge,
    score: k < praised ? 8 : judge === 'consequence' ? 4 : 6,
    verdict: k < praised
      ? ['A payments lead would forward this to their team the same day.', 'Quotes the rule text and the date it takes effect.', 'Nobody has tied these numbers together yet.', 'A finance reader would act on it this quarter.'][k % 4]
      : 'Solid, with one gap the draft has to close.',
    the_one_fix: judge === 'consequence' ? 'Name one kind of company that changes its prices because of this.' : null,
    evidence: [],
    deterministic: false,
  })).concat([{
    panel_run_id: run, judge: 'prosecutor', score: 5,
    verdict: 'The numbers are from vendors with a stake in them.', the_one_fix: null, evidence: [], deterministic: false,
  }])
}

export const JUDGE_VERDICTS = [
  ...marks('run-ftm-1', 4),
  ...marks('run-ftm-2', 2),
  ...marks('run-ftm-3', 2),
]

export async function mockContentMorning(page: Page, opts: { reviews?: unknown[]; tables?: Record<string, unknown[]> } = {}) {
  await mockPopulatedContent(page, { ...contentTables(), judge_verdicts: JUDGE_VERDICTS, ...opts.tables })
  await page.route('**/api/video-studio/reviews?*', (r: Route) => r.fulfill({ json: {
    ok: true, schema_version: 1, reviews: opts.reviews ?? [videoListItem()], server_time: new Date().toISOString(),
  } }))
  // The engine's gate, read for each real draft. The approved and in-review
  // pieces passed on these exact words; the drafting one was never checked.
  await page.route('**/api/content-ideas/*/fact-check', (r: Route) => {
    const id = decodeURIComponent(new URL(r.request().url()).pathname.split('/')[3] || '')
    if (r.request().method() !== 'GET') return r.fallback()
    const passed = id !== 'idea-uth-drafting'
    return r.fulfill({ json: {
      ok: true,
      gate: { ok: passed, reason: passed ? null : 'No fact check has run on this draft yet.' },
      ready: passed,
      next_run: { fresh_sentences: passed ? 0 : 14 },
      fact_check: passed ? { ran_at: new Date(Date.now() - 6 * 3_600_000).toISOString() } : null,
    } })
  })
}
