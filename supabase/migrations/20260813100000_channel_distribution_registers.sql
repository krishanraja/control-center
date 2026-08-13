-- Distribution registers: give every channel its own voice.
--
-- THE PROBLEM. The corpus had playbooks for two formats (Paid, Built) and two
-- surfaces (Signal & Noise, Maven), and nothing else. So of the seven channels
-- in `media_channels`, five had no register at all, and LinkedIn's entry in
-- CHANNEL_HEADING pointed at the *Built* regex, meaning "adapt this for
-- LinkedIn" handed the model Built's playbook with a word count bolted on.
-- Substack, YouTube, Instagram and Podcast could not be adapted to at all,
-- because there was nothing to adapt them to.
--
-- THE DISTINCTION THIS PRESERVES. A format is what a piece IS and what
-- commissions it. A channel is where it GOES and what shape it takes when it
-- gets there. The codebase has insisted on that separation since 2026-08-11
-- (see MEDIA_CHANNELS vs VENTURE_FORMATS in src/lib/contentEngine.ts), and the
-- corpus is where it was still fused. These new sections are DISTRIBUTION
-- registers: none of them commissions anything. A Paid investigation or a Built
-- conversation is written first, and these say what happens to it on the way
-- out.
--
-- Numbered 5 to 9 so the CHANNEL_HEADING patterns in api/_content.ts stay
-- anchored to the start of the heading text past an optional numeral, which is
-- the anchor that stops "Built" matching "How a piece gets built".

update public.system_config
set value = replace(
  value,
  '# OUTBOUND: Leads & Visibility (functional correspondence)',
$REG$# DISTRIBUTION REGISTERS (one piece, several shapes)

**Read this before any of the five.** These are channels, not formats. Nothing
is commissioned "for LinkedIn" or "for YouTube". The piece is made as Paid or
Built, against that format's evidence bar, and these say what it becomes on the
way out. The argument never changes between them. The length, the register and
the amount of scaffolding do.

**The rule that governs all five.** A channel adaptation may cut, compress,
reorder and re-voice. It may not add a claim the original piece did not earn.
If an adaptation needs a fact the source does not have, that is a gap in the
source, not licence to invent one here.

---

## 5. Substack (long form, where the piece lives)

**One-line mandate.** The complete argument, at full length, for a reader who
has already decided to give it fifteen minutes.

**Stance.** This is the home. Everything else is a cutdown of this. Nothing gets
trimmed for attention here, because attention is not the constraint: the reader
subscribed. What that buys is room for the evidence, the counterpoint and the
part where you say plainly what is still unknown.

**Format.** 1200 to 2500 words. Sub-headings that are claims, not labels: "The
margin was never in the model" beats "Analysis". One genuine counterpoint,
held properly rather than knocked down. A verdict at the end, not a summary.

**Depth is the differentiator.** The specific move: take the load-bearing claim
apart and check each part separately, with dates and named parties. A reader
should finish able to argue the case themselves, including the weak parts.

**Opening move.** A structural open that earns the depth. Start inside the
problem with a concrete artifact, a number or a scene. Never "In this piece I
will", never a definition, never a throat-clear about why the topic matters.

**Kind and helpful check.** Kind means the people in the story are treated as
people making calls under uncertainty. Helpful means someone facing the same
decision leaves with a way to think about it, not just a view on it.

---

## 6. LinkedIn (short, native, in the feed)

**One-line mandate.** One idea, argued in full, for someone who did not come
looking for it.

**Stance.** Builder in the room, Gear B. The reader is scrolling past this on
the way to something else, so it earns the stop with a specific claim rather
than a promise of one. Short does not mean shallow: it means one idea instead
of four.

**Format.** 150 to 250 words. Short paragraphs, most one or two sentences.
White space is doing structural work here, so use it. No hashtags. No "thoughts?"
closer. No "Here's what I learned" preamble. No hook-line-gap-explanation
pattern, which is the single most obvious tell that a post was manufactured.

**The compression rule.** Cut context first, keep specifics. A named company,
a number and a date survive; the paragraph explaining why the topic matters does
not. If it will not fit, the answer is a narrower claim, never a vaguer one.

**Opening move.** The first sentence should make the reader feel mid-argument,
as if they walked into a conversation already happening. No scene-setting.

**Kind and helpful check.** Kind means the spike points at the claim, the hype
or the incentive, never at a named person's competence, and never at the reader
for not already knowing. Helpful means the post stands alone: a reader who never
clicks through still got something whole.

---

## 7. YouTube (spoken script, first person)

**One-line mandate.** Krish talking to camera, walking one concept all the way
through until it clicks, with an analogy doing the carrying.

**Stance.** First person and genuinely spoken, not an essay read aloud. This is
the most relaxed register on the list. Contractions, asides, the occasional
false start that a real person makes. The reader is a smart person who does not
work in this field, so the words stay plain even when the idea does not.

**Format.** A script, 700 to 1300 words, roughly five to nine minutes. Written
in sentences a person can actually say out loud in one breath. Mark the beats
plainly. No on-screen-text directions unless the point genuinely needs one.

**The analogy rule, which is the whole format.** Pick ONE analogy and carry it
the entire way, including through the part where it breaks. Three analogies is
three explanations, and the viewer keeps none of them. Say out loud where the
analogy stops working; that admission is usually the most useful sentence in the
script.

**Humour.** Dry and used to hold attention, not to perform. A joke earns its
place by making the next idea easier to hold, never by interrupting it. Aim it
at the industry, the hype or Krish himself. Never at the viewer for not knowing:
the whole premise is that they came to find out.

**Simplicity, concretely.** Prefer the short word. Expand every acronym the
first time. If a sentence needs to be read twice on the page it cannot be spoken
once on camera. Read it aloud before it ships: the read-aloud test is the only
gate that matters here.

**Opening move.** Ten seconds, no logo, no "hey guys", no "in today's video".
Open on the surprising claim or the concrete situation, then say what the viewer
will be able to do by the end.

**Kind and helpful check.** Kind means never making the viewer feel behind.
Helpful means they can explain the concept to somebody else afterwards, which is
a much higher bar than agreeing with it.

---

## 8. Instagram (the surprising shift)

**One-line mandate.** One genuinely surprising or genuinely encouraging shift
happening in AI, shown through what it does to a real business.

**Stance.** The one place on the list that is allowed to be uplifting, and the
one place where that is the hardest thing to do honestly. It is not a highlight
reel and it is not doom. It is the moment where something that was not possible
eighteen months ago is now ordinary, told plainly enough that a person outside
the industry feels the shift rather than being told about it.

**Format.** A hook line, four to eight short beats, and a close. Each beat is a
single thought that can be read in about a second. Always propose a visual: the
number, the before and after, or the object in the story. A beat that needs a
subordinate clause is two beats.

**The honesty constraint, which is load-bearing.** Inspiring without a fact is a
poster. Every piece here rests on something specific and checkable: a named
company, a real number, a dated change. If the only thing available is a feeling
about where things are going, there is no post. The surprise has to be true.

**What this format is not.** Not a tip list. Not a carousel of definitions. Not
"5 ways AI helps founders". Not a prediction. The shift has already happened;
that is what makes it worth showing.

**Opening move.** The surprising fact itself, in one line, with no framing in
front of it.

**Kind and helpful check.** Kind means the optimism is not sold at the expense
of people whose work is changing: name that honestly where it is part of the
story. Helpful means someone running a business sees where they might be
standing in the same shift.

---

## 9. Podcast (audio, the Mindmaker Live feed)

**One-line mandate.** The piece as spoken audio, either read solo or framed
around a recorded conversation.

**Stance.** Spoken register, close to YouTube but with no picture doing any of
the work. Everything the eye would have carried has to be said. Where YouTube
can point at a chart, this has to describe the number and then say what it
means.

**Format.** Solo reads run 800 to 1500 words. Around a conversation, this is the
cold open, the framing and the close, with the middle left to the guest. Mark
the beats. Names and numbers get repeated once, because a listener cannot scroll
back.

**The audio rule.** No sentence that depends on punctuation the ear cannot hear.
Parentheses, semicolons and nested clauses all die here. Say it in two sentences
instead.

**Opening move.** Drop mid-thought, on the sharpest thing in the piece. No
signature tune of throat-clearing, no "welcome back".

**Kind and helpful check.** Kind means a guest quoted in the framing is
represented as they would recognise themselves. Helpful means a listener doing
something else while this plays still comes away with the one idea.

---

# OUTBOUND: Leads & Visibility (functional correspondence)$REG$
)
where key = 'content_corpus'
  and value like '%# OUTBOUND: Leads & Visibility (functional correspondence)%'
  and value not like '%# DISTRIBUTION REGISTERS (one piece, several shapes)%';
