-- The speaker briefing lives in Control Center, not in Krish's Drive.
--
-- Ruling (Krish, 2026-10-05): agents report to Control Center, and nothing
-- writes a Google Doc into his Drive. The guest briefing was the last
-- interactive Drive writer: pressing "Briefing" on a GuestCard fired the Nell
-- n8n workflow, which created a Doc and wrote its URL back to
-- guests.briefing_doc_url.
--
-- The capability is kept and the storage moves here. briefing_md holds the
-- rendered markdown the model produced, so Control Center can show it without
-- leaving the tab, it survives a Drive permission change, and a briefing is
-- readable by anything that reads Supabase.
--
-- briefing_doc_url is deliberately NOT dropped: guests briefed before today
-- still have a working Doc link and that history is not rewritten. New
-- briefings fill briefing_md and leave briefing_doc_url null.

alter table public.guests
  add column if not exists briefing_md text;

comment on column public.guests.briefing_md is
  'The speaker briefing, as markdown, rendered in Control Center. Replaces the Google Doc path retired 2026-10-05. briefing_doc_url stays for briefings made before that date.';
