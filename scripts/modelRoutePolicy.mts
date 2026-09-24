/**
 * The model routing policy, in one place, because it now has two readers.
 *
 * `check-model-routing.mts` asserts it against the checked-in mirrors and
 * `check-model-routing-live.mts` asserts the same thing against the n8n
 * runtime. Those two answer genuinely different questions — what we decided,
 * and what is actually running — and on 2026-09-24 they disagreed for the first
 * time: the 2026-09-12 audit moved the Task Lever Rater to Sonnet 5 at 2k
 * tokens, the mirror was committed, the runtime never received it, and
 * production called claude-opus-5 at 16k for twelve days with the static guard
 * green.
 *
 * Two readers of one policy is the whole point. Two COPIES of one policy would
 * be the bug this repo keeps re-learning: api/_prices.ts existed twice,
 * identical by luck rather than construction, and the failure was silent
 * because both kept reporting a number. A policy that has to agree with itself
 * and is edited in two files eventually disagrees, and the runtime half is the
 * copy nobody would notice going stale.
 */

export interface RouteAssertion {
  file: string
  rationale: string
  includes: string[]
  excludes?: string[]
}

export const ROUTES: RouteAssertion[] = [
  {
    file: 'krish-inbox-classifier.workflow.json',
    rationale: 'high-volume constrained classification belongs on Haiku',
    includes: ["model: 'claude-haiku-4-5'", 'Bearer {{N8N_PROXY_SECRET}}'],
    excludes: ['claude-sonnet-4-6'],
  },
  {
    file: 'krish-focus-calibrator.workflow.json',
    rationale: 'cross-table business relevance needs Sonnet, but not thinking',
    includes: ["model: 'claude-sonnet-5'", "thinking: { type: 'disabled' }", 'Bearer {{N8N_PROXY_SECRET}}'],
  },
  {
    file: 'sonnet-task-lever-rater.workflow.json',
    rationale: '20-row structured business scoring does not justify Opus',
    includes: ["model: 'claude-sonnet-5'", 'max_tokens: 2000', "thinking: { type: 'disabled' }"],
    excludes: ['claude-opus-5', 'max_tokens: 16000'],
  },
  {
    file: 'cleo-content-idea-capture.workflow.json',
    rationale: 'schema extraction is a nano task',
    includes: ['gpt-5.4-nano'],
  },
  {
    file: 'zara-layer-1-signal-inbox-drive-watcher.workflow.json',
    rationale: 'structured extraction and ranking are nano tasks',
    includes: ['gpt-5.4-nano'],
    excludes: ['gpt-4.1-nano'],
  },
  {
    file: 'cleo-omnichannel-content-factory.workflow.json',
    rationale: 'fallback drafting needs mini quality, not a legacy flagship',
    includes: ['gpt-5.4-mini'],
    excludes: ['model: \\"gpt-4o\\"'],
  },
]

export const API_ROUTES: RouteAssertion[] = [
  {
    file: 'api/_goalGate.ts',
    rationale: 'bounded rubric judgment belongs on the OpenAI judge route',
    includes: ['OPENAI_JUDGE_MODEL', 'process.env.OPENAI_JUDGE_MODEL'],
  },
  {
    file: 'api/_skill-prompt.ts',
    rationale: 'full skill generation belongs on the OpenAI generation route',
    includes: ['OPENAI_GENERATION_MODEL', 'process.env.OPENAI_SKILL_MODEL'],
  },
]

/**
 * Every model id the fleet may legitimately name, for inventory and matching.
 *
 * `4o` comes BEFORE `\d+` in the gpt alternation, and that ordering is the
 * whole correctness of the `gpt-4o` rule below. Regex alternation is first-match,
 * not longest-match: with `\d+` first, "gpt-4o" matches as "gpt-4" and the
 * `forbiddenActive` entry for `gpt-4o` can never fire. It never did. The only
 * reason gpt-4o was caught at all was a literal string assertion on one named
 * file, so any OTHER workflow could have run it with this guard green.
 * Verified after the fix: "gpt-4o" now matches as "gpt-4o".
 */
export const MODEL = /(?:claude-(?:opus|sonnet|haiku|fable)-\d+(?:-\d+)*(?:-\d{8})?|gpt-(?:4o|\d+(?:\.\d+)*)(?:-(?:nano|mini|transcribe))?|gemini-\d+(?:\.\d+)?-(?:flash|pro)|sonar(?:-pro)?)/g

/**
 * Models that must never appear in an ACTIVE workflow.
 *
 * `claude-opus-5` is here on cost grounds (MT-003, CFG-COST-001: exception
 * only, and no scheduled task justifies it). `gpt-4o` and `gpt-4.1-nano` are
 * superseded by cheaper, better models on the same task class.
 */
export const forbiddenActive = new Set(['gpt-4.1-nano', 'gpt-4o', 'claude-opus-5'])

/**
 * Mirror filename -> the workflow `name` n8n knows it by.
 *
 * The runtime has no idea what a file is called, so the live guard needs this
 * bridge. Built by reading each mirror rather than hardcoded, so it cannot go
 * stale on a rename.
 */
export function workflowNameFor(mirror: Record<string, unknown>): string {
  return String(mirror.name ?? '')
}
