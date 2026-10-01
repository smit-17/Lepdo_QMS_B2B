DROP POLICY "temp_seed_insert" ON public.diamonds;
REVOKE INSERT ON public.diamonds FROM anon;
SELECT setval(pg_get_serial_sequence('public.diamonds','id'), (SELECT COALESCE(MAX(id),1) FROM public.diamonds));