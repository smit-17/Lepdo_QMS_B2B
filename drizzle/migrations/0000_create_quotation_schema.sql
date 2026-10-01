-- App-level access: this app gates every page behind its own shared password
-- (server-side signed cookie) and talks to the Data API with the publishable
-- key, so the anon role needs full access to these operational tables.

CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_config TO anon, authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_config full access" ON public.app_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.metal_prices (
  purity text PRIMARY KEY,
  price numeric NOT NULL DEFAULT 0,
  making_charge numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metal_prices TO anon, authenticated;
GRANT ALL ON public.metal_prices TO service_role;
ALTER TABLE public.metal_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metal_prices full access" ON public.metal_prices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.diamond_prices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shape text NOT NULL,
  size_label text NOT NULL,
  size_order integer NOT NULL DEFAULT 0,
  lgd_price_ct numeric NOT NULL DEFAULT 0,
  moiss_price_ct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shape, size_label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamond_prices TO anon, authenticated;
GRANT ALL ON public.diamond_prices TO service_role;
ALTER TABLE public.diamond_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diamond_prices full access" ON public.diamond_prices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- One quotation = customer/seller header + one or more jewellery items.
CREATE TABLE public.quotations (
  id text PRIMARY KEY,
  customer_name text NOT NULL DEFAULT '',
  customer_address text NOT NULL DEFAULT '',
  customer_mobile text NOT NULL DEFAULT '',
  seller text NOT NULL DEFAULT '',
  quotation_date timestamptz NOT NULL DEFAULT now(),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  show_summary boolean NOT NULL DEFAULT true,
  margin_pct numeric NOT NULL DEFAULT 0,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- denormalised from the first item so list/search stays a single query
  id_sku text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO anon, authenticated;
GRANT ALL ON public.quotations TO service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotations full access" ON public.quotations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX quotations_date_idx ON public.quotations (quotation_date DESC);
CREATE INDEX quotations_sku_idx ON public.quotations (id_sku);

CREATE SEQUENCE public.quotation_number_seq START 1;
GRANT USAGE ON SEQUENCE public.quotation_number_seq TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_quotation_id()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'LQ-' || lpad(nextval('public.quotation_number_seq')::text, 5, '0');
$$;
GRANT EXECUTE ON FUNCTION public.next_quotation_id() TO anon, authenticated, service_role;

-- Product images live in the private "quotation-images" bucket; the server
-- reads them back through short-lived signed URLs.
CREATE POLICY "quotation images read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'quotation-images');
CREATE POLICY "quotation images insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'quotation-images');
CREATE POLICY "quotation images update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'quotation-images') WITH CHECK (bucket_id = 'quotation-images');
CREATE POLICY "quotation images delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'quotation-images');

-- Starting metal rates (editable in the app under Metal Rates)
INSERT INTO public.metal_prices (purity, price, making_charge, sort_order) VALUES
  ('24KT', 9500, 600, 0),
  ('22KT', 8645, 600, 1),
  ('18KT', 7220, 600, 2),
  ('14KT', 5890, 600, 3),
  ('10KT', 3895, 600, 4),
  ('Silver', 95, 120, 5),
  ('Platinum', 3200, 900, 6);

-- Starting diamond price chart (editable in the app under Diamonds)
INSERT INTO public.diamond_prices (shape, size_label, size_order, lgd_price_ct, moiss_price_ct)
SELECT s.shape, b.label, b.ord,
       round(b.base * s.factor)::numeric,
       round(b.base * s.factor * 0.35)::numeric
FROM (VALUES
  ('ROUND', 1.00), ('OVAL', 0.95), ('PEAR', 0.92), ('MARQUISE', 0.90),
  ('PRINCESS', 0.88), ('EMERALD', 0.90), ('CUSHION', 0.90), ('RADIANT', 0.89),
  ('HEART', 0.92), ('ASSCHER', 0.90), ('MIX', 0.85)
) AS s(shape, factor)
CROSS JOIN (VALUES
  ('1CT DOWN', 0, 18000), ('1 CT', 1, 26000), ('2 CT', 2, 34000),
  ('3 CT', 3, 42000), ('4 CT', 4, 52000), ('5 CT', 5, 64000)
) AS b(label, ord, base);
