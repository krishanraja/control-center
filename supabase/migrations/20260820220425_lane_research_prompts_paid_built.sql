-- Paid and Built ask harder research questions.
--
-- These two rows have never had a migration. They were written straight into
-- system_config and the repo has only ever referenced them by key, which is
-- how MINDMAKER_OS_ARCHITECTURE.md ended up recording a live defect where a
-- mis-keyed row silently fell back to a generic audience. This file is the
-- current text, so the next person can see it without a database session.
--
-- research_prompt is the whole automatic pipeline for a lane: n8n's Content
-- Lane Sourcing workflow feeds it verbatim to Perplexity as the ONLY query,
-- then hands the findings to draft_system to write from. So whatever this
-- string does not ask for, the piece is never grounded in.
--
-- What changed, and why:
--
--   Paid  asked for "an emerging monetization or unit-economics shift" and
--         "compare at least two approaches". Both true, neither time-bound, so
--         it returned snapshots: what a thing costs, not what it cost before.
--         The format exists for the second question. It now demands dated
--         figures at BOTH ends and the direction of travel named.
--
--   Built asked for "1-3 people" with no comparison contract at all, so three
--         builders came back described one after another on whatever axes each
--         write-up happened to use. It now asks for 3 to 5, compared like for
--         like on fixed axes, and prefers post-mortems to launch posts.
--
-- Both now say "unknown" rather than dropping an incomplete case. Dropping
-- them is how a comparison quietly becomes a highlight reel of whoever
-- published most, which is the failure mode that makes a comparison table read
-- as rigorous while being the opposite.
--
-- Mirrors the contract in api/content-ideas/[id]/deepen.ts, which is the
-- on-demand version of the same question. Keep the two in step.

UPDATE public.system_config
SET value = jsonb_set(value::jsonb, '{research_prompt}', to_jsonb($p$Investigate, with citations, an emerging AI-era MONETIZATION or unit-economics shift, and above all how it has MOVED OVER TIME: what the price, take rate, or cost of serving was 12 to 24 months ago against what it is now, with dated figures at both ends and the direction of travel named out loud. Cover who pays, who collects, the unit of revenue, what the shift does to gross margin, and how buying or consumption behaviour changed as a result. Compare at least two named companies on the SAME axes, like for like; where the record is silent say "unknown" rather than dropping that company, because dropping incomplete cases turns a comparison into a highlight reel of whoever published most. Hold the strongest counter-case: where these economics do not hold and which numbers are disputed. Reject anything whose whole story is a capability announcement, a benchmark, or a funding round; an event is only the story if it repriced something. Return the strongest investigation angle plus 8 or more cited sources.$p$::text))::text,
    updated_at = now()
WHERE key = 'content_lane_mindmaker_live_paid';

UPDATE public.system_config
SET value = jsonb_set(value::jsonb, '{research_prompt}', to_jsonb($p$Find 3 to 5 people who have actually SHIPPED something real with AI recently (solo founders, indie builders, small teams with live products, revenue, or launches), and compare them like for like on the SAME axes: what they built, the stack and tools, what it cost, how long it took, what broke or was abandoned, and what it replaced. Where the record is silent say "unknown" rather than dropping that builder. Prioritise concrete named examples with a link to the thing itself and a quote in their own words, including the documented personal reason behind the build rather than just the feature. Favour post-mortems, build logs and honest write-ups over launch posts, because the friction is the part worth reading. Product Hunt, Show HN, founder launches, long-form interviews. Return 8 or more cited sources.$p$::text))::text,
    updated_at = now()
WHERE key = 'content_lane_mindmaker_live_built';
