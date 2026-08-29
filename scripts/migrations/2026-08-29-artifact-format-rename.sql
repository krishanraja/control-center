-- The Teardown becomes The Artifact.
--
-- Canon (github.com/krishanraja/mindmake, project-documentation/02_PUBLICATION.md)
-- retires the word "Teardown" as a format name outright: The Teardown was a
-- Mindmake advisory offer, and reusing the word for a format revives a name the
-- canon retires. The publication's investigative format is called The Artifact
-- for exactly this reason, and the slate's format record has to agree with it.
--
-- The seed migration 2026-08-27-slate-rulings.sql is NOT edited. It is the
-- historical record of the forty verdicts Krish returned, and rewriting it
-- would falsify what he actually ranked. This migration maps forward instead,
-- and scripts/check-slate-calibration.mts applies the same rename when it reads
-- the seed, so the guard compares like for like.
--
-- Four rows. Applied 2026-08-29.

update public.content_slate_rulings
   set format = 'The Artifact'
 where format = 'The Teardown';

insert into public.audit_log (event_type, actor, target, details)
values (
  'format_rename',
  'claude',
  'content_slate_rulings.format',
  jsonb_build_object(
    'from', 'The Teardown',
    'to', 'The Artifact',
    'rows', 4,
    'reason', 'canon retires Teardown as a format name because it was a retired advisory offer',
    'seed_migration_left_intact', '2026-08-27-slate-rulings.sql'
  )::text
);
