-- 2026-06-02 — Industrialized Transform (CONTENT_TAB_SPEC §5.5): parent->child
-- link for lane outputs. A transformed lane piece is a content_ideas row with
-- parent_idea_id pointing at the researched parent (also mirrored in
-- related_idea_ids). Idempotent.
alter table public.content_ideas add column if not exists parent_idea_id text;
create index if not exists content_ideas_parent_idx on public.content_ideas(parent_idea_id);
