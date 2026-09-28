# makeyourmindup brand marks

The publication's own logo files, copied unchanged from the makeyourmindup
brand kit (the logos on makeyourmindup.ai). They live here because the Video
Studio loads official marks from a public GitHub repository at a pinned
commit, by sha256, and this repository is public and already keeps brand
files. content-engine never tracks image files (`scripts/check-no-secrets.ts`
there).

| File | What it is | Pixels | Crop (x, y, width, height) | sha256 |
|---|---|---|---|---|
| `makeyourmindup-mark.png` | The mark alone (from `logos/mark/makeyourmindup-mark-transparent.png`) | 831 x 740 | 1, 13, 830, 720 | `4a45152311ff552a1fd08307a78e8e49c0c699663d73c35687c52887f782fb4a` |
| `makeyourmindup-horizontal.png` | Mark plus MAKE YOUR MIND/UP (from `logos/horizontal/makeyourmindup-horizontal-transparent-1200w.png`) | 1200 x 141 | 0, 0, 1200, 141 | `463303741ec114cabc2a531afad537a7f04eb3f008efb2b384ecee52158aa7ee` |
| `makeyourmindup-stacked.png` | The primary lockup: the mark beside MAKE YOUR over MIND/UP (from `logos/stacked/makeyourmindup-stacked-transparent.png`) | 2415 x 740 | 1, 0, 2414, 740 | `5a0e8a08d3ff027feac0e505162318e4095add2466f1096305031d8a1f29a4fc` |

The crop is the box of pixels whose alpha is above 8 of 255, which is what
the Studio draws. For the stacked lockup the Studio's legibility check reads
the first line of lettering, MAKE YOUR, at x 876, y 1, width 1539, height 348.

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
repository's `apps/cover`. Checked 2026-09-26 against kit v1.4: the mark and
the horizontal logo hash-match the kit's copies exactly, so nothing changed.

The stacked lockup was added on 2026-09-28 for the Studio's ending band, the
makeyourmindup redesign of the Short and carousel frames that Krish approved
as a mock that day ("yes, approved"). It is the same file the approved mock
used, copied unchanged from kit v1.4, and the content-engine theme
`makeyourmindup-video-v1` version 2 pins it by the hash above. The Studio
still keeps that theme switched off until his approval of a render made by
the Studio itself is captured on his machine.
