-- A source type for research Krish asked for by name.
--
-- Every existing source_type is something the system found on its own:
-- inspiration_sweep, lane_sourcing, pool_headline, synthesis_hypothesis, a
-- zara_signal. There was no value for "Krish named a topic and told it to go
-- and research that", so the one thing he most wanted to be able to do had
-- nowhere to record that he had done it, and the resulting idea would have been
-- indistinguishable from a sweep result.
--
-- It matters beyond bookkeeping: a requested topic carries an explicit mandate
-- and should be ranked and reviewed differently from something the radar
-- happened to surface.

alter table public.content_ideas
  drop constraint if exists content_ideas_source_type_check;

alter table public.content_ideas
  add constraint content_ideas_source_type_check check (source_type = any (array[
    'signal_inbox',
    'cleo_chat',
    'agatha_chat',
    'openclaw_workspace',
    'zara_signal',
    'manual',
    'inspiration_sweep',
    'synthesis_hypothesis',
    'customer_voice',
    'crm_opportunity',
    'synthesis',
    'pool_headline',
    'lane_sourcing',
    -- New 2026-08-13: Krish asked for this topic explicitly.
    'requested_research'
  ]));
