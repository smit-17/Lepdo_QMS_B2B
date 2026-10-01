GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamonds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metal_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

DROP POLICY IF EXISTS "anon full access diamonds" ON public.diamonds;
CREATE POLICY "anon full access diamonds" ON public.diamonds FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon full access metal_prices" ON public.metal_prices;
CREATE POLICY "anon full access metal_prices" ON public.metal_prices FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon full access quotations" ON public.quotations;
CREATE POLICY "anon full access quotations" ON public.quotations FOR ALL TO anon USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.next_quotation_id() TO anon;

REVOKE ALL ON public.app_config FROM anon;

DROP POLICY IF EXISTS "quotation images read" ON storage.objects;
CREATE POLICY "quotation images read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'quotation-images');

DROP POLICY IF EXISTS "quotation images write" ON storage.objects;
CREATE POLICY "quotation images write" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'quotation-images');

DROP POLICY IF EXISTS "quotation images delete" ON storage.objects;
CREATE POLICY "quotation images delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'quotation-images');