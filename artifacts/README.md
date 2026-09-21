# artifacts/

Source for the Claude artifact surfaces. These are published to claude.ai and
run on the VIEWER's subscription, not on the API key, which is the whole point
of them: the interactive, token-heavy half of the content loop (triage,
drafting, iterating) costs nothing against the metered Anthropic bill that
meter_daily tracks.

They are kept here rather than only on claude.ai so the page is reviewable,
diffable and restorable like everything else. Republishing is a deliberate act
from a session that holds the artifact's URL.

What they cannot do, and why the crons stay where they are: an artifact only
runs while somebody has it open. There is no schedule, no background, no
retry. Anything that must happen at 06:00 whether or not a human is awake
belongs in vercel.json or n8n.

## triage-desk.html

The subchannel triage desk. Reads the live seeded-idea queue and the three
mandates out of venture_formats through the viewer's Supabase connector, and
writes the decision back to content_ideas.lane_slot.

It exists because the queue said so: on 2026-09-21 there were 61 seeded ideas
with no subchannel and exactly one with one. The engine was seeding well and
converting nothing, so the bottleneck was a decision nobody had a good surface
for.

The mandates are fetched live rather than copied here. They are the actual
test, each one a question the piece has to ask, and a copy of them in this
file would be a second source of truth that goes stale the first time one is
edited.
