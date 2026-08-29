# Refocus 2026-08-11: the outward-facing items, staged for Krish

Everything internal is done and verified. This file is the list of things that
touch the public world, which is why none of them has been executed. Each one is
either irreversible, needs a credential I do not hold, or involves someone else.

Approve line by line. Nothing here is urgent.

---

## 1. Builder Economy feed takedown — NEEDS YOU, IRREVERSIBLE

You chose "fully retire", including the feed and back catalogue.

Done already: `thebuildereconomy.com` links removed from mindmake.co (PR #137),
the `/builder-economy` route and the `vercel.json` 301 now point at
`live.themindmaker.ai`, the venture is `active=false`, and no cron or workflow
produces for it.

Not done, because it needs the podcast host login and cannot be undone:

- [ ] Remove or unlist the feed from Apple Podcasts and Spotify
- [ ] Decide the back catalogue: **delete**, or **leave the episodes reachable**
      at their existing URLs so old links and citations do not rot

**My recommendation: unlist rather than delete.** Unlisting stops new discovery
and satisfies "retired", while a deleted feed breaks every existing link and
every citation of an episode, and you cannot get the subscribers back if you
change your mind. The domain already 404s, so nothing is actively promoting it.

`thebuildereconomy.com` itself: decide whether to let the registration lapse or
301 it to `live.themindmaker.ai`. A 301 is cheap and keeps the SEO equity.

---

## 2. Signal & Noise — DELIBERATELY NOTHING, per your instruction

You chose "internal only for now". So this pass changed the OS taxonomy and made
**no public change at all**: no feed metadata, no description, no artwork, no
announcement. The feed, its GUID and its subscribers are untouched.

Rio Longacre and Brett House have not been told anything, because you said you
would raise it yourself. Nothing is queued that would surprise them.

When you do speak to them, the only thing that actually changes is where the
material originates: episodes now carry Mindmake's publication's Paid and Built work
rather than being commissioned as their own show.

---

## 3. Substack — mostly already correct, one decision

`live.themindmaker.ai` already 301s to `mindmakerlive.substack.com`, and the
publication is already Mindmake LIVE, so the naming needs nothing.

- [ ] `tech0nomic.substack.com` still exists with real subscribers. It is labelled
      *(retired)* everywhere it surfaces in the OS and is still importable as a
      provenance tag. The migration of those subscribers into Mindmake's publication is
      yours and has been outstanding since 2026-08-06.
- [ ] The publication description and About page should name the two formats
      (Paid and Built). I have not touched them.

Reminder from the repo guide, worth keeping true in public copy: Mindmake's publication
carries paid tiers, so it is never described as free, and links should always use
the branded domain rather than the raw Substack URL.

---

## 4. Social accounts — the OS now expects these, the accounts are not renamed

`growth_social_accounts` moved five rows from `mymu` to `publication`:

| Platform | Status in the OS |
|---|---|
| LinkedIn | live |
| Substack | live |
| Instagram | planned |
| TikTok | planned |
| YouTube | planned |

- [ ] The two live accounts carry bios written for the old structure. Rewriting a
      public bio is an outward change, so I left them.
- [ ] The three planned accounts do not exist yet. If you create them, create them
      as Mindmake's publication, not MYMU.

Note the YouTube channel slug is still `makeyourmindup` (renamed from Mindmake
LIVE on 2026-08-06). That slug is now the CTRL product name, so the channel and
the app share a name for a thing they no longer share. Worth renaming back, but a
channel rename affects existing links, so it is your call.

---

## 5. Plinth is retired (Krish, 2026-08-11) — deployments may still be up

Plinth had been renamed **Legibility**, so the inactive `legibility` row in `venture_registry` IS Plinth. That row was already inactive, and it is now out of the goal picker, the memory index and the orientation card.

Not done, because taking a deployment down is outward and irreversible:

- [ ] `plinth-tan.vercel.app` and the `plinth-worker` may still be deployed. Decide: leave dormant, or delete the Vercel projects.
- [ ] The `plinth` repo and its `_STATE.md` are kept as history, per the usual rule. Nothing needs deleting there.
- [ ] There is an unmerged `claude/rename-plinth-to-legibility` branch on control-center. It is moot now; close or delete it at your convenience.

## 6. Two credentials to rotate — UNRELATED TO THIS WORK, but found on the way

- [ ] A plaintext `service_role` JWT is hardcoded in the VPS scripts
      `sync-briefs-to-skills.sh` and `regenerate-standards-digest.py`. This was
      already flagged on 2026-08-06 and is still unrotated.
- [ ] A working `ghp_` PAT in `C:\Users\krish\cc-work2\.git\config`, same vintage.

---

## What is already fully done and needs nothing from you

The OS taxonomy, the content corpus and per-format voice contracts, all agent
briefs and their Google Doc source, the n8n factory routing and 9 workflows in
both cloud and git, the architecture doc across all six surfaces, the
control-center app, and both product repos. Prod was browser-verified.
