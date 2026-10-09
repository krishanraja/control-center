-- The loop closes (ADR-030, phase 2 of the data-to-action audit).
--
-- Until now an accepted move became slot text in daily_focus and nothing could
-- say which move was done when he ticked the slot: suggestion_verdicts records
-- what he thought of a move, never what happened to it. The outcome ledger
-- already exists, walkthrough_steps (20261008090000), with suggestion_id and
-- the honest vocabulary (done_together, did_it, drafted, later, dropped). This
-- migration adds the one join that was missing, from a slot to the suggestion
-- it came from, and the ceiling on the autonomy ladder so a verdict can move a
-- surface up to assist and never past it.
--
-- Additive only. Nothing is dropped, renamed or rewritten.

alter table public.daily_focus
  add column if not exists target_1_suggestion_id uuid references public.suggestions(id) on delete set null,
  add column if not exists target_2_suggestion_id uuid references public.suggestions(id) on delete set null,
  add column if not exists target_3_suggestion_id uuid references public.suggestions(id) on delete set null;

comment on column public.daily_focus.target_1_suggestion_id is
  'The suggestion this slot was taken from (ADR-028 daily move, ADR-026 next step), so a tick on the slot can be recorded as did_it against it in walkthrough_steps. Null when he wrote the slot himself.';
comment on column public.daily_focus.target_2_suggestion_id is
  'See target_1_suggestion_id.';
comment on column public.daily_focus.target_3_suggestion_id is
  'See target_1_suggestion_id.';

-- The highest rung a verdict may move a surface to. Only a migration raises
-- it. autonomous is never reached by a verdict: nothing that touches a wall
-- (send, post, spend, delete, permission) is autonomous, and the review route
-- has no code path that writes the word.
alter table public.autonomy_ladder
  add column if not exists max_rung text not null default 'assist'
    references public.autonomy_rungs(slug) on update cascade;

comment on column public.autonomy_ladder.max_rung is
  'The ceiling a verdict on an autonomy_promotion suggestion may move this surface to. Default assist. Raised only by a migration, never by a route.';
