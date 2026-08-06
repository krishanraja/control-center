-- Techonomic: a spending cap is not a finding.
--
-- The descent loop had three run-side exits (model call cap reached, Anthropic
-- error, unparseable response) and all three recorded terminal_reason
-- 'evidence_exhausted'. That reason publishes, verbatim, as "Past this point the
-- record runs out. N searches across M domains produced nothing citable on X",
-- and G6 hard blocks any draft that omits the terminal statement. So a run that
-- stopped because it ran out of budget printed a false claim about how hard the
-- system had looked, in the one paragraph the pipeline promises to keep honest.
--
-- 'budget_exhausted' gives those exits somewhere truthful to land.

alter table investigations drop constraint if exists investigations_terminal_reason_check;

alter table investigations add constraint investigations_terminal_reason_check
  check (terminal_reason = any (array[
    'cap','motive_not_mechanism','evidence_exhausted','restatement',
    'abstraction_drift','budget_exhausted'
  ]));
