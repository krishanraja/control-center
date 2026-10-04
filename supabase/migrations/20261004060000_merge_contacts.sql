-- merge_contacts: two rows for one person become one, and nothing is lost.
--
-- Split out of 20261004040000_one_person_many_handles.sql, which holds the
-- identities, the ledger (contact_merges), merge_survivor() and the review
-- queue this function serves. That migration explains what a merge keeps and
-- why only a shared LinkedIn profile ever merges without Krish.
--
-- Its own file because it is the one destructive step: after the snapshot and
-- every move, the merged-away row is deleted. The live database asks for the
-- owner's confirmation before any statement that deletes, so this is applied
-- by Krish's say-so, separately from the additive machinery around it. Until
-- it is applied, "Same person" answers are refused with a plain message
-- (api/network/review.ts) and stay open, rather than being recorded and lost.
--
-- Ruling (Krish, 2026-10-04): merge the duplicates; only additive, accuracy of
-- what is additive is paramount.

BEGIN;

-- ── merge_contacts ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_survivor uuid, p_loser uuid, p_class text, p_evidence jsonb, p_decided_by text)
RETURNS bigint LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $fn$
DECLARE
  s public.contacts%ROWTYPE;
  l public.contacts%ROWTYPE;
  s_after public.contacts%ROWTYPE;
  sci public.contact_intelligence%ROWTYPE;
  lci public.contact_intelligence%ROWTYPE;
  has_sci boolean;
  has_lci boolean;
  tiers constant text[] := ARRAY['cold_scraped', 'cold_engaged', 'permissioned', 'warm', 'customer'];
  moved jsonb := '{}'::jsonb;
  dropped jsonb := '{}'::jsonb;
  ids jsonb;
  opp_ids uuid[];
  filled text[];
  changed text[];
  ci_changed text[];
  snap jsonb;
  same_profile boolean;
  s_enriched boolean;
  l_enriched boolean;
  take_profile boolean;
  blend_ok boolean;
  newer_posts boolean;
  merge_id bigint;
BEGIN
  IF p_survivor IS NULL OR p_loser IS NULL OR p_survivor = p_loser THEN
    RAISE EXCEPTION 'merge_contacts: two different contacts are needed';
  END IF;
  IF coalesce(btrim(p_class), '') = '' OR coalesce(btrim(p_decided_by), '') = '' THEN
    RAISE EXCEPTION 'merge_contacts: class and decided_by are required';
  END IF;

  -- Lock both rows in a fixed order so two merges touching the same pair
  -- cannot deadlock.
  PERFORM 1 FROM public.contacts WHERE id IN (p_survivor, p_loser) ORDER BY id FOR UPDATE;
  SELECT * INTO s FROM public.contacts WHERE id = p_survivor;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_contacts: survivor % not found', p_survivor; END IF;
  SELECT * INTO l FROM public.contacts WHERE id = p_loser;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge_contacts: loser % not found', p_loser; END IF;
  IF s.status_reason = 'self' OR l.status_reason = 'self' THEN
    RAISE EXCEPTION 'merge_contacts: Krish''s own records are never merged';
  END IF;
  -- One drafted approach per person is a table rule. Two means two pieces of
  -- work, and which to keep is a person's call.
  IF EXISTS (SELECT 1 FROM public.pilot_deals WHERE contact_id = p_loser)
     AND EXISTS (SELECT 1 FROM public.pilot_deals WHERE contact_id = p_survivor) THEN
    RAISE EXCEPTION 'merge_contacts: both contacts have a pilot deal';
  END IF;

  SELECT * INTO sci FROM public.contact_intelligence WHERE contact_id = p_survivor FOR UPDATE;
  has_sci := FOUND;
  SELECT * INTO lci FROM public.contact_intelligence WHERE contact_id = p_loser FOR UPDATE;
  has_lci := FOUND;

  -- Whose profile is whose. Two rows on the same LinkedIn profile carry one
  -- profile between them, so either may fill the other's gaps. Two different
  -- profiles are never blended: the loser's comes across whole, and only to a
  -- survivor that has no profile at all.
  same_profile := public.linkedin_slug(s.linkedin_url) IS NOT NULL
                  AND public.linkedin_slug(s.linkedin_url) = public.linkedin_slug(l.linkedin_url);
  s_enriched := s.dossier IS NOT NULL OR (has_sci AND sci.enriched_at IS NOT NULL);
  l_enriched := l.dossier IS NOT NULL OR (has_lci AND lci.enriched_at IS NOT NULL);
  take_profile := NOT s_enriched AND l_enriched;
  blend_ok := same_profile OR NOT (s_enriched AND l_enriched);

  -- The loser whole, before anything moves. Vectors are left out: they are
  -- rebuilt from text and would triple the size of the ledger.
  snap := jsonb_build_object(
    'loser', to_jsonb(l) - 'identity_embedding',
    'loser_intelligence', CASE WHEN has_lci THEN to_jsonb(lci) - 'embedding' - 'intel_tsv' END,
    'survivor_before', to_jsonb(s) - 'identity_embedding',
    'survivor_intelligence_before', CASE WHEN has_sci THEN to_jsonb(sci) - 'embedding' - 'intel_tsv' END);

  -- ── Handles ──
  -- The loser's own two, in case the backfill gave them to an older duplicate
  -- or to nobody.
  IF l.email_normalized IS NOT NULL AND l.email_normalized <> '' THEN
    INSERT INTO public.contact_identities (contact_id, kind, value, source)
    VALUES (p_loser, 'email', l.email_normalized, 'contacts.email') ON CONFLICT DO NOTHING;
  END IF;
  IF public.linkedin_slug(l.linkedin_url) IS NOT NULL THEN
    INSERT INTO public.contact_identities (contact_id, kind, value, source)
    VALUES (p_loser, 'li_slug', public.linkedin_slug(l.linkedin_url), 'contacts.linkedin_url') ON CONFLICT DO NOTHING;
  END IF;
  -- A handle the survivor once had and retired, which the loser holds now,
  -- is live again on the survivor before the loser's copy goes.
  UPDATE public.contact_identities si SET retired_at = NULL
  WHERE si.contact_id = p_survivor AND si.retired_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.contact_identities li
                WHERE li.contact_id = p_loser AND li.kind = si.kind AND li.value = si.value AND li.retired_at IS NULL);
  WITH gone AS (
    DELETE FROM public.contact_identities li
    WHERE li.contact_id = p_loser
      AND EXISTS (SELECT 1 FROM public.contact_identities si
                  WHERE si.contact_id = p_survivor AND si.kind = li.kind AND si.value = li.value)
    RETURNING li.*)
  SELECT coalesce(jsonb_agg(to_jsonb(gone)), '[]'::jsonb) INTO ids FROM gone;
  dropped := dropped || jsonb_build_object('contact_identities', ids);
  WITH m AS (
    UPDATE public.contact_identities SET contact_id = p_survivor, merged_from = p_loser
    WHERE contact_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('contact_identities', ids);

  -- ── References with a foreign key ──
  WITH m AS (UPDATE public.opportunities SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING id)
  SELECT array_agg(id) INTO opp_ids FROM m;
  -- The play's concept id names the contact too ('concept:contact:<id>').
  UPDATE public.opportunities SET concept_id = replace(concept_id, p_loser::text, p_survivor::text)
  WHERE id = ANY(coalesce(opp_ids, '{}'::uuid[])) AND concept_id LIKE '%' || p_loser::text || '%';
  moved := moved || jsonb_build_object('opportunities', to_jsonb(coalesce(opp_ids, '{}'::uuid[])));
  -- Two machine proposals of the same play for one person are one proposal.
  -- Only untouched ones go (still 'proposed', still at the first stage), and
  -- only where the survivor already has that play. Anything Krish has picked,
  -- dismissed, moved or converted stays.
  WITH d AS (
    DELETE FROM public.opportunities o
    WHERE o.id = ANY(coalesce(opp_ids, '{}'::uuid[]))
      AND o.play_status = 'proposed'
      AND coalesce(o.stage, 'prospect') = 'prospect'
      AND EXISTS (SELECT 1 FROM public.opportunities k
                  WHERE k.contact_id = p_survivor
                    AND NOT (k.id = ANY(coalesce(opp_ids, '{}'::uuid[])))
                    AND k.venture IS NOT DISTINCT FROM o.venture
                    AND k.play_type IS NOT DISTINCT FROM o.play_type)
    RETURNING o.*)
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO ids FROM d;
  dropped := dropped || jsonb_build_object('opportunities', ids);

  WITH m AS (UPDATE public.guests SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('guests', ids);
  WITH m AS (UPDATE public.pilot_deals SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('pilot_deals', ids);
  WITH m AS (UPDATE public.relationship_signals SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('relationship_signals', ids);
  WITH m AS (UPDATE public.contact_role_history SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('contact_role_history', ids);
  WITH m AS (UPDATE public.contacted_persons SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('contacted_persons', ids);

  -- ── References without one, which would otherwise dangle silently ──
  WITH m AS (UPDATE public.network_contacts SET contact_id = p_survivor WHERE contact_id = p_loser RETURNING contact_key)
  SELECT coalesce(jsonb_agg(contact_key), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('network_contacts', ids);

  -- A bridge candidate is unique per (job, key, tier); where the survivor is
  -- already a candidate on the same job and tier, the loser's row is the same
  -- candidacy twice.
  WITH d AS (
    DELETE FROM public.bridge_candidates b
    WHERE b.contact_key = 'contact:' || p_loser::text
      AND EXISTS (SELECT 1 FROM public.bridge_candidates k
                  WHERE k.job_id = b.job_id AND k.path_tier IS NOT DISTINCT FROM b.path_tier
                    AND k.contact_key = 'contact:' || p_survivor::text)
    RETURNING b.*)
  SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO ids FROM d;
  dropped := dropped || jsonb_build_object('bridge_candidates', ids);
  WITH m AS (
    UPDATE public.bridge_candidates SET contact_key = 'contact:' || p_survivor::text
    WHERE contact_key = 'contact:' || p_loser::text RETURNING bridge_id)
  SELECT coalesce(jsonb_agg(bridge_id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('bridge_candidates', ids);

  -- Strategist reads and suggestions carry contact ids inside jsonb, in more
  -- than one place each. A uuid is 36 characters that cannot occur by accident,
  -- so a text replace is exact.
  WITH m AS (
    UPDATE public.strategist_reads
    SET sections = replace(sections::text, p_loser::text, p_survivor::text)::jsonb
    WHERE sections::text LIKE '%' || p_loser::text || '%' RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('strategist_reads', ids);
  WITH m AS (
    UPDATE public.suggestions
    SET proposed = CASE WHEN proposed IS NULL THEN NULL
                        ELSE replace(proposed::text, p_loser::text, p_survivor::text)::jsonb END,
        alternatives = CASE WHEN alternatives IS NULL THEN NULL
                            ELSE replace(alternatives::text, p_loser::text, p_survivor::text)::jsonb END,
        subject_id = CASE WHEN subject_id = p_loser::text THEN p_survivor::text ELSE subject_id END
    WHERE subject_id = p_loser::text
       OR proposed::text LIKE '%' || p_loser::text || '%'
       OR alternatives::text LIKE '%' || p_loser::text || '%'
    RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('suggestions', ids);
  WITH m AS (
    UPDATE public.feedback_queue
    SET source_id = p_survivor::text,
        original_item_id = CASE WHEN original_item_id = p_loser::text THEN p_survivor::text ELSE original_item_id END
    WHERE source_table = 'contacts' AND source_id = p_loser::text RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('feedback_queue', ids);
  WITH m AS (
    UPDATE public.email_drafts SET entity_id = p_survivor
    WHERE entity_type = 'contact' AND entity_id = p_loser RETURNING id)
  SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO ids FROM m;
  moved := moved || jsonb_build_object('email_drafts', ids);

  -- ── The person's own fields ──
  -- The unique email index allows one holder at a time, so the loser lets go
  -- before the survivor takes it.
  IF (s.email_normalized IS NULL OR s.email_normalized = '') AND l.email_normalized IS NOT NULL
     AND (blend_ok OR NOT l_enriched) THEN
    UPDATE public.contacts SET email = NULL WHERE id = p_loser;
  END IF;

  -- The survivor's dossier is its corroborated profile and is kept whole. Only
  -- a survivor with no profile at all takes the loser's, along with the status
  -- and date that describe it, or one on the same LinkedIn profile fills an
  -- empty dossier from its twin.
  --
  -- The same holds for the loser's email, title, company and location when
  -- they came with a different profile: two enriched rows on two profiles are
  -- one person (a merge says so) but two reads of them, and the survivor's
  -- read is not patched with the other's. The loser's address still moves
  -- across as a handle above, and the whole row is in the ledger.

  UPDATE public.contacts c SET
    -- "Ada L." becomes "Ada Lovelace"; nothing else about a name changes.
    full_name = CASE
      WHEN coalesce(btrim(s.full_name), '') = '' THEN l.full_name
      WHEN s.full_name ~ '^\S+\s+\S\.?$'
       AND l.full_name ~ '^\S+(\s+\S+)*\s+\S{2,}$'
       AND lower(split_part(btrim(s.full_name), ' ', 1)) = lower(split_part(btrim(l.full_name), ' ', 1))
       AND lower(left(split_part(btrim(s.full_name), ' ', 2), 1)) = lower(left(regexp_replace(btrim(l.full_name), '^.*\s', ''), 1))
        THEN l.full_name
      ELSE s.full_name END,
    first_name = coalesce(nullif(btrim(s.first_name), ''), l.first_name),
    last_name = coalesce(nullif(btrim(s.last_name), ''), l.last_name),
    email = CASE WHEN coalesce(s.email_normalized, '') = '' AND (blend_ok OR NOT l_enriched) THEN l.email ELSE s.email END,
    linkedin_url = coalesce(s.linkedin_url, l.linkedin_url),
    linkedin_url_norm = coalesce(nullif(s.linkedin_url_norm, ''), l.linkedin_url_norm),
    twitter_handle = coalesce(nullif(btrim(s.twitter_handle), ''), l.twitter_handle),
    title = CASE WHEN blend_ok OR NOT l_enriched THEN coalesce(nullif(btrim(s.title), ''), l.title) ELSE s.title END,
    -- A "company" of six words or more is post text from a sheet import, not
    -- an employer, and is never carried across.
    company = CASE WHEN coalesce(btrim(s.company), '') <> '' THEN s.company
                   WHEN NOT (blend_ok OR NOT l_enriched) THEN s.company
                   WHEN array_length(regexp_split_to_array(btrim(coalesce(l.company, '')), '\s+'), 1) <= 5
                    AND coalesce(btrim(l.company), '') <> '' THEN l.company
                   ELSE s.company END,
    location = CASE WHEN blend_ok OR NOT l_enriched THEN coalesce(nullif(btrim(s.location), ''), l.location) ELSE s.location END,
    origin_channel = coalesce(nullif(s.origin_channel, ''), l.origin_channel),
    origin_venture = coalesce(nullif(s.origin_venture, ''), l.origin_venture),
    origin_campaign = coalesce(nullif(s.origin_campaign, ''), l.origin_campaign),
    acquired_at = coalesce(s.acquired_at, l.acquired_at),
    sources = (
      SELECT coalesce(jsonb_agg(DISTINCT e), '[]'::jsonb)
      FROM jsonb_array_elements(
        (CASE WHEN jsonb_typeof(s.sources) = 'array' THEN s.sources ELSE '[]'::jsonb END)
        || (CASE WHEN jsonb_typeof(l.sources) = 'array' THEN l.sources ELSE '[]'::jsonb END)) e
    ) || jsonb_build_array(jsonb_build_object(
      'type', 'merge', 'from', p_loser, 'class', p_class, 'at', now())),
    consent_tier = CASE
      WHEN coalesce(array_position(tiers, l.consent_tier), 0) > coalesce(array_position(tiers, s.consent_tier), 0)
        THEN l.consent_tier ELSE s.consent_tier END,
    relationship_strength = greatest(s.relationship_strength, l.relationship_strength),
    -- '{}' is the column default, not a score.
    fit_scores = CASE WHEN s.fit_scores IS NULL OR s.fit_scores = '{}'::jsonb THEN l.fit_scores ELSE s.fit_scores END,
    primary_venture = coalesce(nullif(s.primary_venture, ''), l.primary_venture),
    primary_play_type = coalesce(nullif(s.primary_play_type, ''), l.primary_play_type),
    heat_score = greatest(s.heat_score, l.heat_score),
    -- A thumbs-down is Krish's judgment and survives the merge.
    triage_status = CASE
      WHEN 'skipped' IN (s.triage_status, l.triage_status) THEN 'skipped'
      WHEN 'triaged' IN (s.triage_status, l.triage_status) THEN 'triaged'
      ELSE s.triage_status END,
    triaged_at = greatest(s.triaged_at, l.triaged_at),
    enrichment_status = CASE WHEN take_profile OR (same_profile AND s.dossier IS NULL AND l.dossier IS NOT NULL)
                             THEN l.enrichment_status ELSE s.enrichment_status END,
    deep_enriched_at = CASE WHEN take_profile OR (same_profile AND s.dossier IS NULL AND l.dossier IS NOT NULL)
                            THEN l.deep_enriched_at ELSE s.deep_enriched_at END,
    dossier = CASE WHEN take_profile OR (same_profile AND s.dossier IS NULL) THEN coalesce(l.dossier, s.dossier) ELSE s.dossier END,
    -- Most restrictive wins: a do-not-contact on either row stands.
    status = CASE WHEN l.status = 'do_not_contact' THEN 'do_not_contact' ELSE s.status END,
    status_reason = CASE
      WHEN s.status = 'do_not_contact' AND l.status = 'do_not_contact' THEN coalesce(s.status_reason, l.status_reason)
      WHEN s.status = 'do_not_contact' THEN s.status_reason
      WHEN l.status = 'do_not_contact' THEN l.status_reason
      ELSE s.status_reason END,
    tags = (SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}'::text[])
            FROM unnest(coalesce(s.tags, '{}'::text[]) || coalesce(l.tags, '{}'::text[])) t),
    owner_agent = coalesce(nullif(s.owner_agent, ''), l.owner_agent),
    first_met_channel = coalesce(nullif(s.first_met_channel, ''), l.first_met_channel),
    first_met_context = coalesce(nullif(btrim(s.first_met_context), ''), l.first_met_context),
    last_touch_at = greatest(s.last_touch_at, l.last_touch_at),
    next_touch_due_at = least(s.next_touch_due_at, l.next_touch_due_at),
    concept_id = coalesce(nullif(s.concept_id, ''), l.concept_id),
    raw = CASE WHEN jsonb_typeof(s.raw) = 'object' AND jsonb_typeof(l.raw) = 'object' THEN l.raw || s.raw
               ELSE coalesce(s.raw, l.raw) END,
    source_guest_id = coalesce(s.source_guest_id, l.source_guest_id),
    identity_embedding = coalesce(s.identity_embedding, l.identity_embedding)
  WHERE c.id = p_survivor;

  SELECT * INTO s_after FROM public.contacts WHERE id = p_survivor;
  SELECT coalesce(array_agg(a.key ORDER BY a.key), '{}'::text[]) INTO filled
  FROM jsonb_each(to_jsonb(s_after) - 'updated_at' - 'identity_embedding' - 'sources' - 'tags') a
  WHERE jsonb_typeof(a.value) <> 'null' AND a.value <> '""'::jsonb
    AND (jsonb_typeof(to_jsonb(s) -> a.key) = 'null' OR (to_jsonb(s) -> a.key) = '""'::jsonb);
  IF s_after.full_name IS DISTINCT FROM s.full_name AND NOT ('full_name' = ANY(filled)) THEN
    filled := array_append(filled, 'full_name'::text);
  END IF;
  -- And every value that was set and is now different (a raised consent
  -- tier, a thumbs-down carried over), so the ledger names all of it.
  SELECT coalesce(array_agg(a.key ORDER BY a.key), '{}'::text[]) INTO changed
  FROM jsonb_each(to_jsonb(s_after) - 'updated_at' - 'identity_embedding') a
  WHERE jsonb_typeof(to_jsonb(s) -> a.key) <> 'null' AND (to_jsonb(s) -> a.key) <> '""'::jsonb
    AND (to_jsonb(s) -> a.key) IS DISTINCT FROM a.value;

  -- ── Intelligence ──
  IF has_lci AND NOT has_sci THEN
    UPDATE public.contact_intelligence SET contact_id = p_survivor, embed_stale = true WHERE contact_id = p_loser;
    -- Touch a rebuild column so the retrieval text is rebuilt for the new row.
    UPDATE public.contact_intelligence SET name_quality = name_quality WHERE contact_id = p_survivor;
  ELSIF has_lci AND has_sci THEN
    -- Two profiles are never blended (blend_ok, above). Profile fields only
    -- ever fill a blank, so no merge can manufacture a "new in seat" signal,
    -- and posts, intent and role changes come across only with the profile
    -- they were read from.
    newer_posts := (take_profile OR same_profile) AND lci.posts_checked_at IS NOT NULL
                   AND (sci.posts_checked_at IS NULL OR lci.posts_checked_at > sci.posts_checked_at);

    UPDATE public.contact_intelligence ci SET
      -- Measured beats inferred, never the larger number. Two guesses stay a
      -- guess, capped at 50 like every guess.
      warmth = CASE
        WHEN sci.warmth_source = 'measured' AND lci.warmth_source = 'measured' THEN greatest(sci.warmth, lci.warmth)
        WHEN sci.warmth_source = 'measured' THEN sci.warmth
        WHEN lci.warmth_source = 'measured' THEN lci.warmth
        WHEN greatest(sci.warmth, lci.warmth, sci.warmth_claimed, lci.warmth_claimed) IS NULL THEN NULL
        ELSE least(50, greatest(sci.warmth, lci.warmth, sci.warmth_claimed, lci.warmth_claimed)) END,
      warmth_source = CASE
        WHEN 'measured' IN (sci.warmth_source, lci.warmth_source) THEN 'measured'
        ELSE coalesce(sci.warmth_source, lci.warmth_source) END,
      warmth_claimed = greatest(sci.warmth_claimed, lci.warmth_claimed),
      email_inbound = greatest(sci.email_inbound, lci.email_inbound),
      email_outbound = greatest(sci.email_outbound, lci.email_outbound),
      email_last = greatest(sci.email_last, lci.email_last),
      reciprocated_email = coalesce(sci.reciprocated_email, false) OR coalesce(lci.reciprocated_email, false),
      network_tier = least(sci.network_tier, lci.network_tier),
      source_list = (SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::text[])
                     FROM unnest(coalesce(sci.source_list, '{}'::text[]) || coalesce(lci.source_list, '{}'::text[])) x),
      source_count = (SELECT count(DISTINCT x)::int
                      FROM unnest(coalesce(sci.source_list, '{}'::text[]) || coalesce(lci.source_list, '{}'::text[])) x),
      evidence = (SELECT coalesce(array_agg(DISTINCT x), '{}'::text[])
                  FROM unnest(coalesce(sci.evidence, '{}'::text[]) || coalesce(lci.evidence, '{}'::text[])) x),
      reachable_via = (SELECT coalesce(array_agg(DISTINCT x), '{}'::text[])
                       FROM unnest(coalesce(sci.reachable_via, '{}'::text[]) || coalesce(lci.reachable_via, '{}'::text[])) x),
      roles = (SELECT coalesce(array_agg(DISTINCT x), '{}'::text[])
               FROM unnest(coalesce(sci.roles, '{}'::text[]) || coalesce(lci.roles, '{}'::text[])) x),
      surface_when = (SELECT coalesce(array_agg(DISTINCT x), '{}'::text[])
                      FROM unnest(coalesce(sci.surface_when, '{}'::text[]) || coalesce(lci.surface_when, '{}'::text[])) x),
      who = coalesce(nullif(sci.who, ''), lci.who),
      why_them = coalesce(nullif(sci.why_them, ''), lci.why_them),
      hook = coalesce(nullif(sci.hook, ''), lci.hook),
      risk = coalesce(nullif(sci.risk, ''), lci.risk),
      venture_scores = CASE WHEN sci.venture_scores IS NULL OR sci.venture_scores = '{}'::jsonb
                            THEN lci.venture_scores ELSE sci.venture_scores END,
      primary_venture = coalesce(nullif(sci.primary_venture, ''), lci.primary_venture),
      mindmaker_buyer_family = coalesce(nullif(sci.mindmaker_buyer_family, ''), lci.mindmaker_buyer_family),
      priority = coalesce(sci.priority, lci.priority),
      fit = coalesce(sci.fit, lci.fit),
      seniority = coalesce(nullif(sci.seniority, ''), lci.seniority),
      country = coalesce(nullif(sci.country, ''), lci.country),
      industry = coalesce(nullif(sci.industry, ''), lci.industry),
      best_channel = coalesce(nullif(sci.best_channel, ''), lci.best_channel),
      is_person = coalesce(sci.is_person, lci.is_person),
      name_quality = CASE
        WHEN 'full' IN (sci.name_quality, lci.name_quality) THEN 'full'
        WHEN 'partial' IN (sci.name_quality, lci.name_quality) THEN 'partial'
        ELSE coalesce(sci.name_quality, lci.name_quality) END,
      confidence = CASE
        WHEN 'high' IN (sci.confidence, lci.confidence) THEN 'high'
        WHEN 'medium' IN (sci.confidence, lci.confidence) THEN 'medium'
        ELSE coalesce(sci.confidence, lci.confidence) END,
      headline = CASE WHEN blend_ok THEN coalesce(sci.headline, lci.headline) ELSE sci.headline END,
      summary = CASE WHEN blend_ok THEN coalesce(sci.summary, lci.summary) ELSE sci.summary END,
      followers = CASE WHEN blend_ok THEN coalesce(sci.followers, lci.followers) ELSE sci.followers END,
      experience_count = CASE WHEN blend_ok THEN coalesce(sci.experience_count, lci.experience_count) ELSE sci.experience_count END,
      is_influencer = CASE WHEN blend_ok THEN coalesce(sci.is_influencer, lci.is_influencer) ELSE sci.is_influencer END,
      is_creator = CASE WHEN blend_ok THEN coalesce(sci.is_creator, lci.is_creator) ELSE sci.is_creator END,
      recommendations_received = CASE WHEN blend_ok THEN coalesce(sci.recommendations_received, lci.recommendations_received) ELSE sci.recommendations_received END,
      enriched_source = CASE WHEN take_profile THEN lci.enriched_source ELSE sci.enriched_source END,
      enriched_at = CASE WHEN take_profile THEN lci.enriched_at ELSE sci.enriched_at END,
      current_title = CASE WHEN blend_ok THEN coalesce(sci.current_title, lci.current_title) ELSE sci.current_title END,
      current_company = CASE WHEN blend_ok THEN coalesce(sci.current_company, lci.current_company) ELSE sci.current_company END,
      role_changed_at = CASE WHEN take_profile OR same_profile THEN greatest(sci.role_changed_at, lci.role_changed_at) ELSE sci.role_changed_at END,
      intent_score = CASE WHEN newer_posts THEN lci.intent_score ELSE sci.intent_score END,
      intent_topics = CASE WHEN newer_posts THEN lci.intent_topics ELSE sci.intent_topics END,
      intent_summary = CASE WHEN newer_posts THEN lci.intent_summary ELSE sci.intent_summary END,
      intent_stance = CASE WHEN newer_posts THEN lci.intent_stance ELSE sci.intent_stance END,
      intent_evidence = CASE WHEN newer_posts THEN lci.intent_evidence ELSE sci.intent_evidence END,
      intent_evidence_url = CASE WHEN newer_posts THEN lci.intent_evidence_url ELSE sci.intent_evidence_url END,
      last_post_at = CASE WHEN newer_posts THEN lci.last_post_at ELSE sci.last_post_at END,
      posts_checked_at = CASE WHEN newer_posts THEN lci.posts_checked_at ELSE sci.posts_checked_at END,
      posts_sample = CASE WHEN newer_posts THEN lci.posts_sample ELSE sci.posts_sample END,
      sells_competing_services = CASE WHEN lci.competitor_source = 'model' AND sci.competitor_source IS DISTINCT FROM 'model'
                                      THEN lci.sells_competing_services ELSE sci.sells_competing_services END,
      competitor_source = CASE WHEN lci.competitor_source = 'model' AND sci.competitor_source IS DISTINCT FROM 'model'
                               THEN lci.competitor_source ELSE sci.competitor_source END,
      embed_stale = true
    WHERE ci.contact_id = p_survivor;
  END IF;

  -- What the merge changed on the survivor's intelligence, for the ledger.
  IF has_sci THEN
    SELECT coalesce(array_agg(a.key ORDER BY a.key), '{}'::text[]) INTO ci_changed
    FROM public.contact_intelligence n,
         jsonb_each(to_jsonb(n) - 'embedding' - 'intel_tsv' - 'intel_doc' - 'updated_at' - 'completeness' - 'tier_weight') a
    WHERE n.contact_id = p_survivor AND (to_jsonb(sci) -> a.key) IS DISTINCT FROM a.value;
  END IF;

  DELETE FROM public.contacts WHERE id = p_loser;

  INSERT INTO public.contact_merges (survivor_id, loser_id, class, evidence, decided_by, filled, snapshot)
  VALUES (p_survivor, p_loser, p_class, coalesce(p_evidence, '{}'::jsonb), p_decided_by, filled,
          snap || jsonb_build_object('moved', moved, 'dropped', dropped,
                                     'changed', to_jsonb(coalesce(changed, '{}'::text[])),
                                     'intelligence_changed', to_jsonb(coalesce(ci_changed, '{}'::text[])),
                                     'same_profile', same_profile, 'took_profile', take_profile))
  RETURNING id INTO merge_id;
  RETURN merge_id;
END
$fn$;

COMMENT ON FUNCTION public.merge_contacts(uuid, uuid, text, jsonb, text) IS
  'Merge p_loser into p_survivor without losing anything: snapshot, move every handle and reference, fill only the survivor''s blanks, then delete the loser and write contact_merges. Run refresh_relationship_rollup() and refresh_shared_history_and_plays() after a batch. Raises on Krish''s own rows and on two pilot deals.';

REVOKE ALL ON FUNCTION public.merge_contacts(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, text, jsonb, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
