-- Guest scout: formats and provenance.
--
-- Two problems this fixes.
--
-- 1. `guests` had no idea which SHOW a person was for. `podcast_target` carried
--    'signal_noise' | 'builder_economy' | 'either', which are a channel and a
--    retired venture, not the two formats that actually commission an episode.
--    Since the 2026-08-11 refocus the only formats are Mindmaker Live's Paid
--    (follow the money) and Built (builder conversations), and they want
--    genuinely different people: Paid wants whoever is closest to the pricing
--    and unit-economics decision, Built wants whoever actually shipped the
--    thing. One scout that cannot tell those apart books the wrong guests.
--
-- 2. `source` only recorded WHICH PIPE a row came in through
--    ('migration' | 'nell_outbound' | 'manual'), so once the scout had more than
--    one way of finding somebody there was nowhere to record which one found
--    them, whether they were already in the network, or what the claim rests on.
--    Without that you cannot tell a warm intro from a cold web result, and you
--    cannot tune a source that is producing badly.

alter table public.guests
  add column if not exists format text
    check (format is null or format in ('built', 'paid', 'either')),
  -- Which scout source surfaced this person. Deliberately separate from
  -- `source` (the pipe) so both survive: source='nell_outbound',
  -- discovery_source='network' is a real and useful combination.
  add column if not exists discovery_source text
    check (discovery_source is null or discovery_source in
      ('network', 'radar', 'web', 'linkedin', 'events', 'manual', 'import')),
  -- True when the person is already somewhere in Krish's network. Drives the
  -- "from within my network or outside it" split in the People lane, and it is
  -- a boolean rather than a join because the UI filters on it every render.
  add column if not exists in_network boolean not null default false,
  -- The contact this guest resolves to, when they are in the network. Lets the
  -- People lane show warmth, last touch and reachable_via without a fuzzy
  -- name match at read time.
  add column if not exists contact_id uuid
    references public.contacts(id) on delete set null,
  -- What the fit claim actually rests on: [{ kind, label, url, at }]. A scout
  -- that cannot show its working produces suggestions nobody trusts.
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists last_scouted_at timestamptz;

-- Backfill format from the retired podcast_target.
--   builder_economy -> built   (the Builder Economy thesis IS the Built format)
--   signal_noise    -> either  (a distribution channel, not a commission, so it
--                               says nothing about which format the person fits)
--   either          -> either
update public.guests
set format = case podcast_target
  when 'builder_economy' then 'built'
  when 'signal_noise' then 'either'
  else 'either'
end
where format is null;

-- Everything that predates the rebuilt scout came in through an import or a
-- paste, so it is honestly 'import' rather than a discovery source we invented
-- after the fact.
update public.guests
set discovery_source = case source
  when 'manual' then 'manual'
  else 'import'
end
where discovery_source is null;

-- Mark the rows that already resolve to a known contact, by normalised
-- LinkedIn URL first (exact) then by lowercased email. Name matching is
-- deliberately NOT used: two people share a name often enough that a wrong
-- link here would show the wrong warmth on a real pitch.
update public.guests g
set contact_id = c.id, in_network = true
from public.contacts c
where g.contact_id is null
  and g.linkedin_url is not null
  and c.linkedin_url_norm is not null
  and lower(regexp_replace(g.linkedin_url, '^https?://(www\.)?', '')) =
      lower(regexp_replace(c.linkedin_url_norm, '^https?://(www\.)?', ''));

update public.guests g
set contact_id = c.id, in_network = true
from public.contacts c
where g.contact_id is null
  and g.email is not null
  and c.email_normalized is not null
  and lower(g.email) = lower(c.email_normalized);

create index if not exists guests_format_status_idx
  on public.guests (format, status) where buried_at is null;
create index if not exists guests_discovery_source_idx
  on public.guests (discovery_source, created_at desc);
create index if not exists guests_in_network_idx
  on public.guests (in_network) where buried_at is null;

comment on column public.guests.format is
  'Which Mindmaker Live format this person suits: built (they shipped something) or paid (they are close to the money). "either" when the evidence supports both.';
comment on column public.guests.discovery_source is
  'Which scout source surfaced this person. Separate from `source`, which records the pipe they arrived through.';
comment on column public.guests.evidence is
  'What the fit claim rests on: [{ kind, label, url, at }]. The scout must show its working.';
