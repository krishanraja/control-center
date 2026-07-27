-- Belt-and-braces for the Lane Sourcing provenance fix (2026-07-27).
-- The workflow patch retypes its inserts to 'lane_sourcing', but n8n's
-- draft/publish versioning means the live version can lag the API PUT.
-- This trigger enforces the invariant at the source of truth: a row that
-- self-identifies as lane-sourcing output can never wear the newsletter
-- sweep's provenance label (which would pollute the shift-detection corpus).
CREATE OR REPLACE FUNCTION public.fix_lane_sourcing_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_type = 'inspiration_sweep' AND NEW.meta->>'generated_by' = 'lane_sourcing' THEN
    NEW.source_type := 'lane_sourcing';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fix_lane_sourcing ON public.content_ideas;
CREATE TRIGGER trg_fix_lane_sourcing
  BEFORE INSERT ON public.content_ideas
  FOR EACH ROW EXECUTE FUNCTION public.fix_lane_sourcing_type();
