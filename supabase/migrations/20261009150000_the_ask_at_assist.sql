-- The ask at assist (ADR-030, phase 5).
--
-- strategist_ask's bounds said "Propose only". The surface can now be moved
-- to assist by the weekly review's proposal and Krish's verdict (phase 4),
-- and at assist the read makes the Gmail draft, addressed to the person, in
-- his own drafts folder, with the link beside the ask (api/_askAssist.ts).
-- The bounds line says what assist means on THIS surface and what it still
-- never covers. Data only: no column changes, no rung moves.

update public.autonomy_ladder
set bounds = 'Propose: it suggests the words and does nothing else. Assist: it also makes the Gmail draft, addressed to the person, in his own drafts folder when the read is written, and puts the link beside the ask. At either rung it never sends, never fills his prediction, and makes nothing today''s ask: that is his press, and his press in Gmail is the only thing that sends.',
    updated_at = now()
where surface = 'strategist_ask';
