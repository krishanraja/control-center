-- Step 7: the forty ranked ideas become data the engine can be measured against.
--
-- Krish ran a separate Claude session to generate forty candidate pieces, ranked
-- every one of them lead / yes / maybe / no, and returned the lot. Until now only
-- his commentary on that exercise had reached this repo, which is why the eleven
-- folders carry seed_items referencing M and B codes that existed nowhere in the
-- database. This migration puts the actual forty rows in, so the codes resolve
-- and the verdicts are countable.
--
-- ---------------------------------------------------------------------------
-- What this is, and the one thing it is not
--
-- This is a PRECISION set. It says which of forty generated ideas Krish would
-- publish, so the engine can be checked for producing the wrong kind of thing.
--
-- It is NOT the golden ten, and it cannot be made into it. The golden ten was a
-- RECALL test: ten stories Krish chose himself, from his own reading, used to
-- ask what the engine never surfaced. This set cannot answer that question,
-- because every item in it was generated first and judged second. Agreement
-- with a generated list is precisely the failure mode the original work request
-- named. Recording that here rather than in a commit message, because the
-- temptation to treat seventeen approvals as proof the engine works will
-- outlive this migration.
--
-- ---------------------------------------------------------------------------
-- Why the verdicts are stored raw rather than folded into a score
--
-- The anti-echo rule says a stated interest must never boost a candidate's
-- rank. Seventeen approvals are the most concentrated statement of interest in
-- this system, so wiring them into scoreArc() would be the single fastest way
-- to turn the proposer into a mirror. They stay as a record to be measured
-- against, and api/_formats.ts reads only the FORM dimension (which shape of
-- piece converts), never the subject.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.content_slate_rulings (
  item_id       text primary key,
  -- Which ranking exercise. A later slate gets its own label rather than
  -- overwriting this one, so drift in Krish's taste stays visible.
  slate         text not null default 'ranker-v1',
  -- The arc grouping the generator proposed. Kept because Krish's own kept-arc
  -- list is derived from it, and two of the twelve arcs he dropped entirely.
  arc           text not null,
  channel       text not null check (channel in ('built', 'paid')),
  format        text not null,
  outlet        text not null check (outlet in ('Substack', 'Shorts')),
  purpose       text not null check (purpose in ('GTM', 'Brain')),
  headline      text not null,
  thesis        text not null,
  evidence_tier text not null check (evidence_tier in ('sourced', 'owned', 'partial', 'needs_work')),
  verdict       text not null check (verdict in ('lead', 'yes', 'maybe', 'no')),
  -- Set below from content_themes.seed_items. Null means the item seeded no
  -- folder, which is true of eleven of the forty and is not a fault.
  theme_id      uuid references public.content_themes(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists content_slate_rulings_verdict_idx
  on public.content_slate_rulings (slate, verdict);

alter table public.content_slate_rulings enable row level security;
drop policy if exists "content_slate_rulings anon read" on public.content_slate_rulings;
create policy "content_slate_rulings anon read" on public.content_slate_rulings for select to anon using (true);
drop policy if exists "content_slate_rulings service all" on public.content_slate_rulings;
create policy "content_slate_rulings service all" on public.content_slate_rulings for all to service_role using (true) with check (true);

comment on table public.content_slate_rulings is
  'Forty generated ideas with Krish''s verdict on each, from the ranker artifact of 27 Aug 2026. A precision set: it measures whether the engine produces the wrong kind of thing. It is NOT a recall test and must never be described as one, because every item was generated before it was judged.';

insert into public.content_slate_rulings
  (item_id, arc, channel, format, outlet, purpose, headline, thesis, evidence_tier, verdict)
values
  ('B01', 'Selling in an agentic world', 'built', 'The Threshold', 'Substack', 'GTM', 'When the software can rebuild itself, what is a salesperson for', 'As interfaces become living and agentic the seller stops demonstrating what exists and starts imagining what could exist, which kills the product demo and promotes the solutions engineer to the front of the deal.', 'owned', 'yes'),
  ('B02', 'Defaults left on', 'built', 'The Word For It', 'Shorts', 'Brain', 'Slop is not laziness, it is defaults left on', 'AI slop comes from uncustomised templates, prompts and skills rather than lack of effort, which makes it a systems problem you can audit instead of a character flaw you have to confess.', 'owned', 'yes'),
  ('B03', 'The threshold to try', 'built', 'The Threshold', 'Substack', 'Brain', 'The threshold for worth trying just dropped', 'Prototyping was never gated on code quality, it was gated on the cost of showing someone your idea, and lowering that lets weirder and more human ideas survive contact with other people.', 'owned', 'maybe'),
  ('B04', 'Teardown of my own engine', 'built', 'The Teardown', 'Substack', 'Brain', 'My idea engine ran for six weeks and I accepted nothing from it', 'Fifty four proposals, zero acceptances, zero rejections, and the reason was that its vocabulary had words for governance and none for pricing, so it could not see the stories I wanted.', 'owned', 'maybe'),
  ('B05', 'Teardown of my own engine', 'built', 'The Word For It', 'Shorts', 'Brain', 'You cannot find what you have no word for', 'In any system that proposes rather than retrieves, the taxonomy is the product, and most teams tune prompts when the ontology is what is broken.', 'owned', 'yes'),
  ('B06', 'Teardown of my own engine', 'built', 'The Teardown', 'Substack', 'Brain', 'Little brains beat big memory', 'Compounding understanding on a few named questions beats a system that re-derives everything weekly, and the difference is whether a subject is a durable object or a snapshot.', 'owned', 'maybe'),
  ('B07', 'Who owns the eval', 'built', 'The Word For It', 'Shorts', 'Brain', 'Finished is not succeeded', 'Agents report completion at a rate with almost no relationship to whether the task worked, and the gap between those two numbers is where production breaks.', 'partial', 'yes'),
  ('B08', 'Internal agent fleets', 'built', 'The Teardown', 'Substack', 'Brain', 'A thousand internal agents and a twentyfold cycle cut', 'Applied Intuition''s result argues the moat is the internal build rather than the model, and the interesting question is what they had to change about the team to run it.', 'partial', 'yes'),
  ('B09', 'Teardown of my own engine', 'built', 'The Teardown', 'Substack', 'Brain', 'Your AI tool has never learned anything', 'Most deployed AI systems have no feedback path at all, so months of use produce zero improvement, and the fix is a one-click dismiss rather than a rating nobody uses.', 'owned', 'yes'),
  ('B10', 'The threshold to try', 'built', 'The Threshold', 'Substack', 'Brain', 'The friend who had all the ideas and never shipped one', 'Twenty years of divergent thinking people nodded politely at, then prototyping let him show rather than describe, and what changed was who takes him seriously.', 'owned', 'yes'),
  ('B11', 'Who owns the eval', 'built', 'Nobody''s Taken This', 'Shorts', 'GTM', 'Nobody owns the eval', 'Evals sit between engineering, product and the domain expert, and the businesses getting agents into production are the ones that gave the job a name and a person.', 'needs_work', 'maybe'),
  ('B12', 'Defaults left on', 'built', 'How It Actually Works', 'Shorts', 'Brain', 'Defaults on is how you get slop at scale', 'Every uncustomised skill, template and prompt compounds into output that is fluent, on topic and worthless, and the audit for it takes an afternoon.', 'owned', 'yes'),
  ('B13', 'Teardown of my own engine', 'built', 'The Receipt', 'Substack', 'Brain', 'I published a false number under my own name', 'My own engine credited a figure belonging to one company to the newsletter that reported it, published it verbatim, and the fix reveals how most AI-assisted attribution actually works.', 'owned', 'no'),
  ('B14', 'Selling in an agentic world', 'built', 'The Threshold', 'Substack', 'GTM', 'The demo is the product now', 'When a working prototype costs an afternoon, the demo stops being a sales asset representing the product and starts being the first version of it, which changes who needs to be in the room.', 'partial', 'maybe'),
  ('B15', 'Selling in an agentic world', 'built', 'How It Actually Works', 'Shorts', 'GTM', 'Three ways to sell software and only one survives an agent', 'Service delivered on your platform, static self serve, and agentic self serve are three different businesses with three different cost structures, and most teams are running one while pricing another.', 'owned', 'yes'),
  ('B16', 'The threshold to try', 'built', 'The Threshold', 'Substack', 'Brain', 'What a ninety second prototype does to a meeting', 'The argument stops being about whether the idea is good and starts being about whether this specific version is, which is a different and much faster conversation.', 'owned', 'yes'),
  ('M01', 'The licensing market', 'paid', 'Follow the Money', 'Substack', 'GTM', 'The 250 million dollar corpus and the long tail that gets nothing', 'OpenAI has signed roughly two dozen publisher deals led by a reported 250 million with News Corp, and every serious 2026 analysis says small and mid-size publishers will see none of it, which makes licensing a leverage story rather than a revenue story.', 'sourced', 'yes'),
  ('M02', 'The licensing market', 'paid', 'The Receipt', 'Substack', 'GTM', 'What one citation is actually worth', 'Divide the disclosed deal values by cited volume and you get an implied per-citation rate far above any marketplace price, which is the first real number anyone has for what an AI answer owes a source.', 'sourced', 'no'),
  ('M03', 'The licensing market', 'paid', 'The Receipt', 'Substack', 'Brain', 'One payment set the price of everything that followed', 'Springer Nature''s reported 23 million from Google in 2024 became the benchmark every later negotiation referenced, which means an entire market was anchored by a single undisclosed-methodology number.', 'sourced', 'maybe'),
  ('M04', 'The unwritten bargain', 'paid', 'One Number', 'Shorts', 'Brain', 'The most cited site on the internet is losing readers', 'Wikipedia is the single most-cited domain in AI Overviews and its human pageviews fell about 8 percent, which is citation without click stated as plainly as it will ever be stated.', 'sourced', 'no'),
  ('M05', 'The unwritten bargain', 'paid', 'The Lag', 'Substack', 'Brain', 'Zero click went from half to two thirds and nobody renegotiated', 'The zero-click rate ran 49 percent in 2019, 60 percent in 2024 and about 68 percent by early 2026, which is the fastest move in a decade against a bargain that was never written down.', 'sourced', 'maybe'),
  ('M06', 'The unwritten bargain', 'paid', 'Follow the Money', 'Substack', 'GTM', 'The traffic collapse is regressive and that is the story', 'Small publishers lost roughly 60 percent of Google referrals, mid-size 47 percent and large only 22 percent, so the same event is an inconvenience at the top and an extinction at the bottom.', 'sourced', 'yes'),
  ('M07', 'The unwritten bargain', 'paid', 'One Number', 'Shorts', 'Brain', 'Chatbot referrals grew 200 percent and still round to zero', 'ChatGPT referrals to publishers more than tripled and remain under 1 percent of all page views, so the replacement traffic everyone was promised has not arrived and is not going to.', 'sourced', 'no'),
  ('M08', 'The unwritten bargain', 'paid', 'Follow the Money', 'Substack', 'Brain', 'Google is disincentivising the web it needs', 'Search advertising cleared more than 50 billion in a single quarter while AI Overviews reduce the reason to publish the pages that make search worth using, which is a loop eating its own input.', 'sourced', 'maybe'),
  ('M09', 'The unwritten bargain', 'paid', 'The Lag', 'Substack', 'Brain', 'The deal was always a handshake and now somebody is testing it in court', 'Penske''s filing argues Google never promised to deliver referral traffic at all, which exposes that two decades of publisher economics rested on an arrangement nobody ever signed.', 'sourced', 'no'),
  ('M10', 'The price of done', 'paid', 'One Number', 'Shorts', 'GTM', 'Per seat pricing fell from 21 percent to 15 percent in twelve months', 'That is not a fashion cycle, it is a market repricing a model that was designed to be sold by the seats the software now removes.', 'sourced', 'yes'),
  ('M11', 'The price of done', 'paid', 'Follow the Money', 'Substack', 'GTM', 'The price of done is being set right now and almost nobody is bidding', 'Zendesk is at 1.50 per committed resolution, HubSpot dropped to 0.50, and the range between them is the entire negotiating room for outcome pricing in every category that follows.', 'sourced', 'lead'),
  ('M12', 'The price of done', 'paid', 'How It Actually Works', 'Shorts', 'GTM', 'One word is the whole contract', 'In outcome pricing the definition of resolution decides who wins the deal, and if you do not define it the vendor will define it for you.', 'sourced', 'maybe'),
  ('M13', 'The price of done', 'paid', 'One Number', 'Shorts', 'Brain', 'Atlassian reported its first ever fall in seats', 'When the company that sells seats reports fewer of them, the argument about whether agents replace headcount stops being a forecast.', 'sourced', 'yes'),
  ('M14', 'The price of done', 'paid', 'One Number', 'Shorts', 'GTM', 'Vendors still on per seat are posting about 40 percent lower gross margins', 'The pricing model is now visible in the accounts, which means it is a diligence question rather than a positioning preference.', 'sourced', 'maybe'),
  ('M15', 'The price of done', 'paid', 'Nobody''s Taken This', 'Shorts', 'GTM', 'The cheap and good position in publishing is empty', 'The price floor collapsed months ago and nobody selling into media has repositioned around it, which leaves the most defensible slot in the category unclaimed.', 'partial', 'no'),
  ('M16', 'Engineered extraction', 'paid', 'The Receipt', 'Substack', 'GTM', 'Loneliness has an ARPU now', 'Revenue per paying user on AI companion apps went from about 15 dollars a month to 25 in roughly a year, the fastest extraction rate rise in consumer software, and no media business has named the category.', 'owned', 'yes'),
  ('M17', 'Engineered extraction', 'paid', 'The Lag', 'Substack', 'Brain', 'A government took back a vice industry''s margin in one budget', 'Remote gaming duty went from 21 to 40 percent, Flutter fell more than 60 percent and FanDuel''s martech spend fell 87 percent, which makes regulatory margin risk a forecastable line rather than a tail risk.', 'owned', 'maybe'),
  ('M18', 'Engineered extraction', 'paid', 'Follow the Money', 'Substack', 'Brain', 'Retail is not exploiting the anomaly, retail is the anomaly', 'Five percent of Polymarket wallets took 75 percent of volume while over a hundred thousand accounts lost a thousand or more, and the AI tools sold to the losing side make the transfer more efficient rather than fairer.', 'owned', 'no'),
  ('M19', 'Engineered extraction', 'paid', 'The Receipt', 'Substack', 'Brain', 'Sponsorship follows the compulsive, not the affluent', 'The biggest and most trusted sports podcasts are structurally the most gambling saturated, which says advertisers price attention by susceptibility rather than spending power.', 'owned', 'maybe'),
  ('M20', 'Engineered extraction', 'paid', 'The Lag', 'Substack', 'Brain', 'Nineteen years is how long the correction took last time', 'Gambling ran from 2005 deregulation to the 2025 tax correction, AI companions are three years in with no equivalent anywhere, and the gap is measurable rather than moral.', 'owned', 'no'),
  ('M21', 'Two compute markets', 'paid', 'How It Actually Works', 'Shorts', 'Brain', 'There are two compute markets now and you are in one of them', 'Committed buyers and metered buyers are diverging into a permanent cost gap, which turns procurement timing into a competitive act rather than a finance chore.', 'partial', 'maybe'),
  ('M22', 'The machine reader', 'paid', 'Follow the Money', 'Substack', 'GTM', 'What your rate card is worth when the reader is a machine', 'Machine readers do not scroll, do not see ads and do not convert, which breaks the pricing assumption under most publisher inventory while the inventory is still being sold as though they do.', 'partial', 'maybe'),
  ('M23', 'The price of done', 'paid', 'Nobody''s Taken This', 'Shorts', 'GTM', 'The margin moved to the harness and the pricing never followed', 'Value now sits in orchestration, evals and context, and almost everyone still bills as though the model is the product.', 'partial', 'yes'),
  ('M24', 'The licensing market', 'paid', 'Follow the Money', 'Substack', 'Brain', 'One lab stayed out of licensing entirely and settled instead', 'Anthropic avoided publisher deals and agreed a proposed 1.5 billion copyright settlement, which is a completely different bet on the same problem and worth pricing against the deal-makers.', 'sourced', 'maybe')
on conflict (item_id) do nothing;

-- Resolve the M and B codes the folders were seeded with.
update public.content_slate_rulings r
set theme_id = t.id
from public.content_themes t
where r.item_id = any (t.seed_items);

-- ============ how much of the slate actually backs each folder ============
--
-- A folder is a question Krish asked, not a verdict on an item, so thin support
-- is not grounds for deleting one. It is grounds for SEEING it. Two folders are
-- seeded partly or wholly by items he rejected, and without this column that
-- fact is invisible behind eleven folders that all look equally founded.
alter table public.content_themes add column if not exists slate_support jsonb not null default '{}'::jsonb;

update public.content_themes t
set slate_support = coalesce((
  select jsonb_build_object(
    'lead',  count(*) filter (where r.verdict = 'lead'),
    'yes',   count(*) filter (where r.verdict = 'yes'),
    'maybe', count(*) filter (where r.verdict = 'maybe'),
    'no',    count(*) filter (where r.verdict = 'no')
  )
  from public.content_slate_rulings r
  where r.item_id = any (t.seed_items)
), jsonb_build_object('lead', 0, 'yes', 0, 'maybe', 0, 'no', 0));

comment on column public.content_themes.slate_support is
  'Verdict counts across the ranked-slate items that seeded this folder. how-media-makes-money-now scores zero lead and zero yes: it is Krish''s own question ("the whole media channel is the impact of AI on...") and both its seed items were rejected or downgraded. Kept deliberately, with the weakness recorded rather than hidden.';

insert into public.audit_log (event_type, actor, target, details)
values (
  'content_slate_rulings_imported',
  'krish',
  'content_slate_rulings,content_themes',
  jsonb_build_object(
    'items', 40,
    'lead', 1, 'yes', 16, 'maybe', 15, 'no', 8,
    'note', 'precision set, not the golden ten; verdicts are deliberately NOT wired into scoreArc because of the anti-echo rule',
    'migration', '2026-08-27-slate-rulings.sql'
  )::text
);

commit;
