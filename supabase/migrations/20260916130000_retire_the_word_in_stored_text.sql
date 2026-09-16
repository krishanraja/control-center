-- The rename missed the text the model had already written.
--
-- ADR-023 corrected DOOR and both prompts, so nothing NEW says "the room".
-- It did not touch rows already generated, and Krish reopened the lane on his
-- phone and read the same sentence back:
--
--   "Ask David if he knows an agency leader who should hear about the room."
--
-- That is the exact string that started the rename, still on the card, because
-- ask_line is written once at classify time and never recomposed.
--
-- Deliberately surgical, NOT a find and replace. Six rows in the corpus match
-- '%room%' and five of them are ordinary English that a blanket rewrite would
-- have corrupted:
--
--   "identity, first party data and clean rooms at Credera"   (a real thing)
--   "the room Mindmaker wants to be in"
--   "already in the room when clients decide what to rebuild"
--   "sits in the room where executive capability gets decided"
--   "the room where Australian media ... actually gather"
--
-- Only one row uses it as the name of what is being sold. Only that row is
-- touched, and it is rewritten rather than nulled: ask_line is regenerated
-- only by a fresh seed, so nulling it would drop the ask from the card for
-- good.

UPDATE public.pilot_deals
   SET ask_line = 'Ask David if he knows an agency leader who might want a pilot.'
 WHERE ask_line = 'Ask David if he knows an agency leader who should hear about the room.';
