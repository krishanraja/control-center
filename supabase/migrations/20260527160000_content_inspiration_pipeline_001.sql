-- Migration: content-inspiration-pipeline-001
-- Adds: content_pillars table, pillar/brand_fit/meta/body/concept_id columns on content_ideas,
--       expanded source_type CHECK, system_config seeds for Inspiration Sweep + Synthesis Engine.
-- Companion brief: Cleo Mindmaker OS content inspiration pipeline (Web Claude → Claude Code, 2026-05-27).

BEGIN;

-- 1. content_pillars table -------------------------------------------------

CREATE TABLE IF NOT EXISTS public.content_pillars (
  id                 text         PRIMARY KEY,
  name               text         NOT NULL,
  description        text         NOT NULL,
  good_looks_like    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  anti_patterns      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  evidence_required  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  active             boolean      NOT NULL DEFAULT true,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.content_pillars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_pillars_anon_select" ON public.content_pillars;
CREATE POLICY "content_pillars_anon_select" ON public.content_pillars
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "content_pillars_service_all" ON public.content_pillars;
CREATE POLICY "content_pillars_service_all" ON public.content_pillars
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Seed five pillars -----------------------------------------------------

INSERT INTO public.content_pillars (id, name, description, good_looks_like, anti_patterns, evidence_required) VALUES
  (
    'pillar:agentic_ops',
    'Agentic Operations',
    'Running a business with AI agent fleets: architecture, failure modes, what changes when machines do the work and what does not change.',
    jsonb_build_object(
      'voice',           'First-person operator. Real numbers, real names, real artifacts. Specific workflow IDs, specific agent names, specific cost figures.',
      'source_patterns', 'specific workflow names; named agents; concrete error states; actual cost numbers; agent count vs human count; observable failure modes',
      'angle_patterns',  'counter-intuitive failure modes; what does not work and why; the shape of the org chart now; where humans still beat agents; the meta-skill that agents do not yet have',
      'good_examples',   'The closed-loop failure my fleet caught (with the actual fix); why Vera fires once a week not once a day; the audit that found 4 silent failures my dashboards missed'
    ),
    jsonb_build_array(
      'generic AI hype',
      'buzzword soup',
      'AI is changing everything',
      'the future of work',
      'leveraging AI',
      'AI-powered anything',
      'vague vendor takes',
      '5 ways AI helps founders'
    ),
    jsonb_build_array(
      'specific cost figure',
      'workflow ID',
      'agent name',
      'named failure with date',
      'concrete protocol with steps'
    )
  ),
  (
    'pillar:open_web_econ',
    'Open Web Economics',
    'Publisher economics, identity infrastructure, attribution, the open web versus walled gardens. Krish lens is curiosity and optimism about open-web monetisation structures, not adtech-insider tribal identity.',
    jsonb_build_object(
      'voice',           'Strategic operator who has worked publisher side and platform side. Specific deals, specific numbers, specific identity infrastructure mentioned by name.',
      'source_patterns', 'named publishers; specific identity providers (LiveRamp, ID5, UID2, The Trade Desk); dated deals or shutdowns; actual CPM, yield, or attribution numbers; specific browser policy changes',
      'angle_patterns',  'where Safari or Chrome moves break which business model; publisher consolidation tells; the part of the deal nobody read; what open-web economics actually look like in 2026; identity infrastructure as a strategic acquisition surface',
      'good_examples',   'Why the Publicis acquisition of LiveRamp is about Safari, not LiveRamp; the three publisher M&A waves nobody is calling; identity infrastructure is now a strategic acquisition target'
    ),
    jsonb_build_array(
      'cookie deprecation is here',
      'first-party data is the future',
      'publishers must adapt',
      'AI will replace search',
      'doom-takes without a deal',
      'consultant abstraction without a named publisher'
    ),
    jsonb_build_array(
      'named publisher or platform',
      'specific dated deal or event',
      'actual yield/CPM/revenue or attribution figure'
    )
  ),
  (
    'pillar:builder_economy',
    'The Builder Economy',
    'The thesis: small teams plus AI plus capital equals a new venture topology. Founders are running operating models that previously required 15 to 30 people.',
    jsonb_build_object(
      'voice',           'Builder talking to other builders. Real founder names, real ARR figures, real product decisions, real funding events.',
      'source_patterns', 'named indie builders; specific ARR or MRR figures; concrete product decisions and what they cost; real funding events with date and amount',
      'angle_patterns',  'the deal structure nobody else is calling; what changes when a founder runs 5 ventures; where capital follows AI-native ops; the new shape of the venture topology; the skills that used to be free now have a price',
      'good_examples',   'Why a 5M solo-founder ARR is the new 50M team ARR; the fund structures that will eat venture; what I learned running 8 ventures with 13 agents'
    ),
    jsonb_build_array(
      'solopreneur lifestyle content',
      'passive income',
      'AI side hustles',
      '10 ways to use ChatGPT',
      'the creator economy as a category',
      'LinkedIn bro takes about hustle'
    ),
    jsonb_build_array(
      'named builder/founder with venture',
      'specific ARR/MRR or team size',
      'real deal or funding event from the last 90 days'
    )
  ),
  (
    'pillar:ai_decision_making',
    'AI-Native Decision Making',
    'How operators and executives should actually use AI to decide. Not what to delegate, but how to think with it. The meta-skill nobody is teaching.',
    jsonb_build_object(
      'voice',           'Coach to senior operators. Specific protocols, specific failure modes, specific anti-patterns observed in cohort or advisory work.',
      'source_patterns', 'specific decision protocols (Nested Briefs, AI-as-External-Consultant); named cohort or advisory clients (anonymized OK); concrete decisions made or unmade; real time-to-decision figures; before/after quality deltas',
      'angle_patterns',  'the operating habit most leaders get wrong with AI; why the brief is the bottleneck; what changes when you use AI to think versus to execute; the meta-skill nobody is teaching; the dangerous AI workflow that looks correct',
      'good_examples',   'Nested briefs: the technique I found in production; why most AI strategy decks are wrong about delegation; the three briefs every AI-using exec should have'
    ),
    jsonb_build_array(
      'AI literacy',
      'AI fluency as a buzzword',
      'prompt engineering tips',
      '10 prompts that will change your life',
      'use AI to be more productive',
      'bullet-pointed productivity hacks'
    ),
    jsonb_build_array(
      'named protocol or technique with description',
      'specific decision example',
      'before/after time or quality metric'
    )
  ),
  (
    'pillar:portfolio_operating',
    'Portfolio Operating',
    'How a founder actually runs multiple ventures at once with AI: the operating model, not the inspiration. The portfolio approach as a real thing, not a LinkedIn aesthetic.',
    jsonb_build_object(
      'voice',           'Practitioner. The thing Krish actually does, not the thing people say founders should do.',
      'source_patterns', 'specific ventures by name (Mindmaker, AdFixus, Meliora, Signal & Noise, Builder Economy, Fractionl); actual time allocation; actual hand-offs to agents or contractors; actual things that broke',
      'angle_patterns',  'what the operating model looks like under the hood; the cost of context switching across ventures; what AI lets you not do that you previously had to; where the model breaks; the venture you should kill',
      'good_examples',   'I run 8 ventures. Here is the actual operating model. The three things that broke when I added a sixth venture. What an AI fleet does NOT solve when you portfolio-operate.'
    ),
    jsonb_build_array(
      'multi-passionate',
      'polymath',
      'renaissance founder',
      'side projects to scale',
      'passive income portfolio',
      'how I do it all'
    ),
    jsonb_build_array(
      'specific venture and role',
      'actual hours/week or revenue split',
      'named tool or workflow that handles the multiplexing'
    )
  )
ON CONFLICT (id) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  good_looks_like   = EXCLUDED.good_looks_like,
  anti_patterns     = EXCLUDED.anti_patterns,
  evidence_required = EXCLUDED.evidence_required,
  updated_at        = now();

-- 3. Extend content_ideas --------------------------------------------------

ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS pillar_id        text     REFERENCES public.content_pillars(id),
  ADD COLUMN IF NOT EXISTS brand_fit_score  integer,
  ADD COLUMN IF NOT EXISTS meta             jsonb    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS body             text,
  ADD COLUMN IF NOT EXISTS concept_id       text;

ALTER TABLE public.content_ideas
  DROP CONSTRAINT IF EXISTS content_ideas_brand_fit_score_check;
ALTER TABLE public.content_ideas
  ADD CONSTRAINT content_ideas_brand_fit_score_check
  CHECK (brand_fit_score IS NULL OR (brand_fit_score >= 1 AND brand_fit_score <= 10));

CREATE INDEX IF NOT EXISTS idx_content_ideas_pillar  ON public.content_ideas(pillar_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_concept ON public.content_ideas(concept_id);

-- 4. Expand source_type vocabulary ----------------------------------------

ALTER TABLE public.content_ideas DROP CONSTRAINT IF EXISTS content_ideas_source_type_check;
ALTER TABLE public.content_ideas ADD CONSTRAINT content_ideas_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'signal_inbox'::text,
    'cleo_chat'::text,
    'agatha_chat'::text,
    'openclaw_workspace'::text,
    'zara_signal'::text,
    'manual'::text,
    'inspiration_sweep'::text,
    'synthesis_hypothesis'::text
  ]));

-- 5. system_config seeds ---------------------------------------------------

-- cleo_inspiration_folder_id was repaired to 1FNztJOU82M8zb6IIbUAbvuI6Kr0pF5Hu out-of-band on 2026-05-27.

INSERT INTO public.system_config (key, value) VALUES
  ('cleo_inspiration_min_brand_fit',      '6'),
  ('cleo_inspiration_gmail_label',        'AI Newsletters'),
  ('cleo_inspiration_gmail_lookback_days', '7'),
  ('cleo_inspiration_drive_lookback_days', '14'),
  ('cleo_inspiration_max_emails_per_run',  '20'),
  ('cleo_inspiration_max_docs_per_run',    '15'),
  ('cleo_synthesis_min_confidence',        '0.85'),
  ('cleo_synthesis_min_threads',           '3'),
  ('cleo_synthesis_min_named_entities',    '3'),
  ('cleo_synthesis_lookback_days',         '14')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
