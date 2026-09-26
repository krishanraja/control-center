# makeyourmindup brand marks

The publication's own logo files, copied unchanged from the makeyourmindup
brand kit (the logos on makeyourmindup.ai). They live here because the Video
Studio loads official marks from a public GitHub repository at a pinned
commit, by sha256, and this repository is public and already keeps brand
files. content-engine never tracks image files (`scripts/check-no-secrets.ts`
there).

| File | What it is | Pixels | sha256 |
|---|---|---|---|
| `makeyourmindup-mark.png` | The mark alone (from `logos/mark/makeyourmindup-mark-transparent.png`) | 831 x 740 | `4a45152311ff552a1fd08307a78e8e49c0c699663d73c35687c52887f782fb4a` |
| `makeyourmindup-horizontal.png` | Mark plus MAKE YOUR MIND/UP (from `logos/horizontal/makeyourmindup-horizontal-transparent-1200w.png`) | 1200 x 141 | `463303741ec114cabc2a531afad537a7f04eb3f008efb2b384ecee52158aa7ee` |

Krish, 2026-09-26: "Make your mind up, Mark, plus the channel name. You've
got the logos as per the website for all of that." Then, on the storyboard,
"placement approved": the mark at the start of the timeline on every beat,
the full logo with the channel name under it once at the end, and no title
card. The channel name is set as type (IBM Plex Mono, lowercase, joined by
dots), never as an image, because the brand book sets channel names that
way. Do not edit these files; a new version gets a new file name and a new
pin.

Where the kit lives: `krishanraja/makeyourmindup`, `docs/brandbooknew/`
(`makeyourmindup-brand-kit.zip`, and the book alone in
`makeyourmindup-brand-book.zip`), rebuilt by `npm run brand-kit` in that
repository's `apps/cover`. Checked 2026-09-26 against kit v1.4: both files
above hash-match the kit's copies exactly, so nothing here changes.
