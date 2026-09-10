-- The Room learns who can actually buy, and what to ask each person.
--
-- `/api/room/seed` ranks proposals on relationship tier, seniority and
-- industry, so anyone Krish knows well floats to the top. That is right for
-- warmth and wrong for revenue: it ranked his own podcast co-host as a sales
-- prospect and printed "already emails Krish" as though that were a discovery.
-- The list could not tell a person who can sign a fixed fee from a person who
-- can only open a door to one, so a close collaborator and a stranger rendered
-- identically and the card never said what to ask either of them.
--
-- ask_kind splits the list three ways and ask_line says the ask in one plain
-- sentence. Both are written by the seed route from fields the network search
-- already returns; neither is inferred at render time, so a card can always be
-- read back to the judgment that produced it.
--
-- Existing rows default to 'buyer', which is what the list meant before this
-- distinction existed. That is a deliberate, honest default rather than a
-- backfill: nothing has classified them, and 'buyer' is the assumption they
-- were listed under.

alter table public.room_targets
  add column if not exists ask_kind text not null default 'buyer'
    check (ask_kind in ('buyer', 'intro', 'collaborator')),
  add column if not exists ask_line text;

comment on column public.room_targets.ask_kind is
  'Who this person is to the door: buyer (can sign a fixed fee), intro (can open a door but does not buy), collaborator (already works with Krish). Written by /api/room/seed.';
comment on column public.room_targets.ask_line is
  'One plain sentence saying what to ask this person, grounded only in stored fields. Null when nothing classified them.';

-- The Monday run drafts for listed targets; buyers are the ones an approach is
-- actually for, so let that read stay cheap as the list grows to 100.
create index if not exists room_targets_ask_kind_state_idx
  on public.room_targets (ask_kind, state);
