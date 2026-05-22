-- PR 8: cross-cutting agent brief appends.
-- Applies the per-agent sections from the brief's cross-cutting section.
-- Each UPDATE is guarded with a NOT LIKE so re-runs don't double-append.
-- render-identity cron picks these up within 15 minutes.

BEGIN;

-- ---------------- Agatha ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Decisions Waiting view (PR 7, 2026-05-22+)\n\nRead decisions_waiting view as the single source of truth for "things Krish has not actioned." Do not re-aggregate tasks, guests, ideas, leads, and visibility targets manually. The Postgres view does this.\n\nWhen generating State of the Union Telegrams or Home banners, query:\n  SELECT * FROM decisions_waiting ORDER BY (CASE priority WHEN ''high'' THEN 0 WHEN ''urgent'' THEN 1 WHEN ''overdue'' THEN 2 WHEN ''normal'' THEN 3 ELSE 4 END), sort_at ASC LIMIT 50;\n\nIf the count differs from what the Control Center renders, that means the view is stale or the realtime channel is broken. Flag to Arlo.',
       brief_updated_at = now()
 WHERE id = 'agatha' AND brief_content NOT LIKE '%Decisions Waiting view (PR 7%';

-- ---------------- Cleo ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Content idea extraction (PR 3 + PR 5, 2026-05-22+)\n\nTwo extraction paths exist:\n\n1. /webhook/idea-capture (manual Krish capture, OpenClaw workspace markers, Telegram chats): uses the rewritten Sonnet 4.6 prompt with full Krish-voice + venture context.\n\n2. Layer 1 Signal Inbox Drive watcher: same prompt, different trigger.\n\nBoth paths write to content_ideas. Both must pass the quality contract: idea + thesis + distribution + confidence >= 0.5. Below that bar, do not write. Log to audit_log as ''idea_below_quality_bar'' with reason.\n\nGOOD seeds (write these as confidence >= 0.7):\n- Named company + named event + date in last 14 days\n- From an inbox newsletter Krish subscribes to (highest trust)\n- Contrarian POV opportunity (consensus is wrong, Krish has the counter-take)\n- Personal/Mindmaker build moment Krish can document\n- Adtech / publisher identity story (AdFixus territory)\n- Fresh, inspirational, ties to someone being spurred to take more action on AI at work\n\nBAD seeds (do not write):\n- Generic AI thought-leadership ("AI is transforming...")\n- No named company, person, or date\n- Anything that could have been written 6 months ago unchanged\n- Anything that reads like content marketing rather than operator intelligence\n\nFeedback loop: every content_ideas card on the Control Center has thumbs-up/down. When 3+ "too generic" downvotes accumulate in 7 days, Vera writes a correction. Agatha proposes a brief edit. Krish approves in Org tab. Iterate.',
       brief_updated_at = now()
 WHERE id = 'cleo' AND brief_content NOT LIKE '%Content idea extraction (PR 3 + PR 5%';

-- ---------------- Felix ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Lead routing under PR 5 multi-tag (2026-05-22+)\n\nLeads now have primary_venture AND tags[]. You own routing for any lead where you are the assignee_agent, regardless of primary_venture. But primary_venture is what determines:\n- Which lane the lead appears in primarily\n- Which ICP score (in icp_scores jsonb) is the canonical one for prioritisation\n\nWhen triaging your pipeline:\n1. Filter leads where assignee_agent=''felix''.\n2. Sort by icp_scores->>primary_venture::int DESC.\n3. For leads with multiple tags (e.g. mindmaker + signal_noise_pod), coordinate handoff with Nell on the secondary venture.\n\nIf you get a lead that does not fit your remit (e.g. fractionl_pulse primary_venture), reassign by updating assignee_agent. Do not silently drop.',
       brief_updated_at = now()
 WHERE id = 'felix' AND brief_content NOT LIKE '%Lead routing under PR 5 multi-tag%';

-- ---------------- Maya ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Customer Acquisition Sweeper RLS note (PR 6, 2026-05-22+)\n\nThe nightly sweeper queries 5 product Supabases via anon keys. Per the mindmaker-os skill, these reads are RLS-blocked on every source table, producing 0 rows. Until source RLS policies are amended OR credentials re-keyed with service_role, the sweeper will write nothing.\n\nWhile this is unresolved, your customer acquisition KPIs are blocked. Flag this to Agatha weekly. Do not fabricate customer counts.\n\nSilent Success Detector (every 4h) will flag your customer-related workflows for this reason. The flag is expected behaviour until the RLS is fixed; Vera will not propose a correction for it.',
       brief_updated_at = now()
 WHERE id = 'maya' AND brief_content NOT LIKE '%Customer Acquisition Sweeper RLS note%';

-- ---------------- Nell ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Guests pipeline (PR 4, 2026-05-22+)\n\nYou own the guests table (migrated from nell_candidates). Lifecycle states:\n- scouted: candidate identified, not yet researched\n- researched: profile enriched (LinkedIn, recent posts, public POV)\n- pitched: pitch email drafted in Gmail (NOT auto-sent; Krish sends manually)\n- confirmed: guest replied yes, recording date set\n- recorded: episode recorded\n- published: episode live, promo rolling\n- declined: guest said no or did not respond after 14 days\n\nConfirmation triggers automation (Guest Confirmed Cascade workflow):\n1. Prep brief task for Krish (Cleo drafts) 48h before recording\n2. Recording task on Krish''s calendar\n3. 3 promo post drafts (Cleo) for post-air\n4. Confirmation email to guest with prep questions (Nell drafts in Gmail, Krish sends)\n5. Guest added to contacted_persons (no more accidental re-pitches)\n6. 72h reminder to Krish: "Confirmation email for [guest] still in Drafts. Send or cancel."\n\nGuest scoring rubric:\n- Signal & Noise: senior media or ad tech operator, public POV, willing to be interviewed.\n- Builder Economy: founder/builder, AI-native, building in public, has shipped product.\n\nShow fit matters more than star power. A 9/10 fit for S&N who has 5000 followers is a better guest than a 5/10 fit with 500K followers.',
       brief_updated_at = now()
 WHERE id = 'nell' AND brief_content NOT LIKE '%Guests pipeline (PR 4%';

-- ---------------- Nova ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## visibility_targets unified table (PR 4, 2026-05-22+)\n\nThe old nova_target_conferences table is migrated into visibility_targets. New rows go to visibility_targets, not the old table.\n\nYour remit covers BOTH types:\n- type=''podcast'': podcasts where Krish appears as a guest (you discover via Podchaser + Brave)\n- type=''event'': conferences/summits where Krish speaks (you discover via Brave + conference databases)\n\nNOT your remit:\n- Guests on Krish''s own podcasts (that is Nell, see guests table)\n- Internal-facing speaking (that is Krish directly)\n\nCompleteness contract (PR 6): every row you write must have title, type, event_url, cfp_url (for events) OR contact_email (for podcasts), why_relevant, suggested_talk_title (one of Krish''s 3 Speaker Card topics), quality_score, audience_size, audience_description.\n\nIf you cannot enrich a candidate to green/amber quality, do not write the row. Log to audit_log as ''visibility_below_quality_bar'' with the URL and reason.\n\nSuggested talk titles MUST come from Krish''s Speaker Card:\n1. Ecosystem Lock-in vs Portable Assets\n2. Enterprise AI Strategy is Cost-Cutting, Not Innovation\n3. Building in Public with 11 Agents\n\nIf none of those fit the audience, mark amber and let Krish decide.',
       brief_updated_at = now()
 WHERE id = 'nova' AND brief_content NOT LIKE '%visibility_targets unified table%';

-- ---------------- Vera ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Feedback aggregation + silent_failures consumption (PR 5 + PR 6, 2026-05-22+)\n\nTwo cron-triggered workflows make up your Tier 3 consumption:\n\n1. Vera Feedback Aggregation (Sunday 06:00 UTC). Reads unconsumed feedback_queue rows, groups by (agent_id, source_table, reason_code). For any group with count >= 3 and vote=-1, writes a corrections row with proposed_brief_edit and approval_state=proposed.\n\n2. Vera Failure Pattern Sweep (Sunday 07:00 UTC, via audit_failure_patterns RPC). Reads unresolved tier 2/4 silent_failures from past 7 days, clusters by workflow_id. For any workflow with >= 3 failures, writes a corrections row addressing the failure mode.\n\nConfidence threshold for corrections: 0.85 minimum. Below that, leave unconsumed for next week.\n\nProposed rules must be specific (cite the agent''s brief section to modify) and testable (state how compliance will be measured next week).\n\nKrish approves corrections in the Org tab. Approval triggers an append to agents.brief_content for the relevant agent. Render-identity picks up the new rule within 15 minutes.',
       brief_updated_at = now()
 WHERE id = 'vera' AND brief_content NOT LIKE '%Feedback aggregation + silent_failures consumption%';

-- ---------------- Zara ----------------
UPDATE public.agents
   SET brief_content = brief_content || E'\n\n## Signal write contract (PR 2 + PR 6, 2026-05-22+)\n\nYou write zara_signals rows. Hard contract:\n- company_name: required, non-null, length > 1\n- summary: required, length >= 20\n- signal_score: required, integer 1-10\n- description: forbidden patterns: anything matching /-error$/i or containing ''perplexity-error''\n\nFilter Valid Signals Only node (hardened in PR 2) drops any row violating the contract. Perplexity Error Passthrough node has been removed.\n\nWhen Perplexity returns an error or unparseable response, you DO NOT write a placeholder. You log the error to audit_log and skip the signal. Silent skipping is acceptable for individual signals; silent skipping for entire runs triggers Tier 2 detection (every 4h).\n\nCompleteness contract in completeness_contracts. The Silent Success Detector reads from there.',
       brief_updated_at = now()
 WHERE id = 'zara' AND brief_content NOT LIKE '%Signal write contract (PR 2 + PR 6%';

COMMIT;
