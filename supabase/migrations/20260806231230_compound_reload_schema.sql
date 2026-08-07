-- Reflect the newly exposed COMPOUND tables in PostgREST's schema cache.
notify pgrst, 'reload schema';
