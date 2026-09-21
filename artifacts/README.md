# artifacts/

Source for the Claude artifact surfaces. These publish to claude.ai and run on
the VIEWER's subscription rather than on the API key, which is the whole point
of them: the interactive, token-heavy half of the content loop costs nothing
against the metered Anthropic bill that meter_daily tracks and that the spend
cap throttled on 2026-09-20.

Kept here rather than only on claude.ai so a page is reviewable, diffable and
restorable like everything else. Republishing is deliberate, from a session
holding the artifact's URL.

What an artifact cannot do, and why the crons stay put: it only runs while
somebody has it open. No schedule, no background, no retry. Anything that must
happen at 06:00 whether or not a human is awake belongs in vercel.json or n8n.

## triage-desk.html

One workflow, three stages, against live data.

  1 Triage    seeds with no subchannel  ->  assign one, or set it aside
  2 Dry run   assigned with no draft    ->  write it, save it
  3 Read back saved drafts              ->  edit, and judge against the mandate

It exists because the queue said so. On 2026-09-21 there were 61 seeded ideas
with no subchannel and exactly one with one: the engine was seeding well and
converting nothing, and the drafting surface it would have converted through
had been returning 401 since 2026-09-17.

THE MANDATES AND THE CORPUS ARE FETCHED, NEVER COPIED. The mandates live in
venture_formats and the playbooks in system_config.content_corpus. Both are the
real test, and a copy in this file would be a second source of truth that goes
stale the first time one is edited.

THE HERO FORMAT'S GAP IS DECLARED, NOT PAPERED OVER. The corpus was last
written on 2026-08-28, when the canon still said the publication ran exactly
two channels. split.the.bill inherits The Money of AI's playbook and
lift.the.lid inherits Built with AI's, because those are the lineages they were
renamed from. mind.the.gap was added on 2026-09-17 and has no section at all,
so the desk says so on the card and writes that draft to the house register and
the mandate alone rather than lending it a sibling's voice. Writing that
section is editorial work against venture_formats.mandate and it is the one
thing standing between the hero format and a clean dry run.

SAFETY. The only values reaching SQL are a uuid checked against a uuid pattern,
a slug checked against the three pickable ones, and a draft body escaped by
doubling quotes. Content never reaches a query otherwise. The row's foreign key
to venture_formats(slug) is the backstop: a slug that is not a real subchannel
fails the write by name instead of landing as the null that left 215 of 240
rows unlaned.
