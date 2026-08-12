-- Shifts become a section inside each format rather than one register filtered
-- twice.
--
-- Built asks "how AI decisions actually get made". Paid asks "how AI actually
-- gets monetized". They are different questions, and a detector scoped to one
-- has a thesis to measure a signal against; an unscoped detector just clusters
-- whatever recurs.
--
-- Nullable on purpose. A shift with no lane means the detector has not
-- classified it, which the UI shows in BOTH lanes rather than hiding it or
-- defaulting it into one. Forcing a lane would invent a judgement nobody made.
alter table shifts add column if not exists lane text;

comment on column shifts.lane is
  'built | paid | null. Null means the detector has not classified it; surface it as unclassified rather than defaulting it into a lane.';

create index if not exists shifts_lane_idx on shifts (lane) where lane is not null;

-- Backfill existing shifts. Mirrors laneForShift() in api/_trendGate.ts.
-- Applied 2026-08-12: 19 paid, 6 built, 20 left unlaned (governance / security
-- / org cut across both formats and are shown in each rather than forced).
update shifts set lane = case category
  when 'tools' then 'built'
  when 'orchestration' then 'built'
  when 'model' then 'built'
  when 'economics' then 'paid'
  when 'product' then 'paid'
  when 'proof' then 'paid'
end
where lane is null;
