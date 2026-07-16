-- Per-lane voice + marketing strategy as DATA every copy-producing path reads
-- (sequence proposals, nurture scheduler personalization, reply drafts,
-- win-back drafts). No lane ever borrows another lane's voice, and none
-- depends on Krish's personal brand in public (standing rule, 2026-07-16).
--
-- Shape: { sender, mailbox, voice, icp, strategy, channels[], never_say[] }
-- Krish edits these directly in venture_registry; agents must conform.
alter table public.venture_registry
  add column if not exists voice_profile jsonb;

update public.venture_registry set voice_profile = '{
  "sender": "the CTRL team",
  "mailbox": "ctrl@themindmaker.ai",
  "voice": "Sharp, signal-over-noise, decision-first. Show a real corroborated decision, never generic AI hype.",
  "icp": "Leaders and prosumers drowning in AI news who need decision clarity",
  "strategy": "Content-to-capture SEO/GEO on ctrl.themindmaker.ai; the corroborated headlines pool as citation magnet; email nurture demonstrates the decision spine with live data",
  "channels": ["seo_geo", "product_intelligence_page", "email_nurture"],
  "never_say": ["revolutionary", "game-changing", "AI-powered insights", "personal brand references"]
}'::jsonb where slug = 'mm_ctrl';

update public.venture_registry set voice_profile = '{
  "sender": "the Fractionl Pulse team",
  "mailbox": "pulse@fractionl.ai",
  "voice": "Senior peer-to-peer, relationship-first, zero pitch until trust. One sharp operational insight per touch.",
  "icp": "Operators and founders evaluating fractional executive support",
  "strategy": "Demand-test gated (3 qualified meetings). Value-first touches, Calendly ask at touch 3. LinkedIn organic is PRODUCT-brand only",
  "channels": ["email_nurture", "calendly"],
  "never_say": ["synergy", "circle back", "solutions", "personal brand references"]
}'::jsonb where slug = 'fractionl_pulse';

update public.venture_registry set voice_profile = '{
  "sender": "the Fractionl Circle team",
  "mailbox": "circle@fractionl.ai",
  "voice": "Community-warm, builder-to-builder. Circle is the destination Pulse conversations graduate into.",
  "icp": "Builders/founders who want an operator community",
  "strategy": "Parked lane: rides the Pulse pipeline; activates as conversion destination after Gate 1",
  "channels": ["email_nurture"],
  "never_say": ["exclusive", "limited spots", "personal brand references"]
}'::jsonb where slug = 'fractionl_circle';

update public.venture_registry set voice_profile = '{
  "sender": "the Plinth team",
  "mailbox": "hello@themindmaker.ai",
  "voice": "Developer-terse. Code first, zero marketing copy. API key in the first email, working curl example, done.",
  "icp": "Developers and AI-agent builders needing typed product-data endpoints via MCP",
  "strategy": "Agent-native distribution: llms.txt + MCP directories (mcp.so, Smithery, Anthropic registry). Docs are the funnel. Never send relationship emails",
  "channels": ["mcp_directories", "llms_txt", "email_nurture"],
  "never_say": ["unlock", "supercharge", "empower", "marketing adjectives", "personal brand references"]
}'::jsonb where slug = 'plinth';

update public.venture_registry set voice_profile = '{
  "sender": "the Full Time team",
  "mailbox": "fulltime@themindmaker.ai",
  "voice": "Football-fan banter, sharp and knowing. Lead with the moment/prediction, never sell before entertaining.",
  "icp": "Football fans who want AI-generated recaps and predictions",
  "strategy": "Content-led: episode SEO with PodcastEpisode/FAQ schema, podcast directories, weekly recap rhythm. Upgrade prompt only after habit forms",
  "channels": ["podcast_directories", "episode_seo", "email_nurture"],
  "never_say": ["content", "leverage", "personal brand references"]
}'::jsonb where slug = 'full_time';
