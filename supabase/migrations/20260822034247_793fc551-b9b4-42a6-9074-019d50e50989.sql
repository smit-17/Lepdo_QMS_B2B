DROP TABLE IF EXISTS public.diamonds CASCADE;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamond_prices TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamond_prices TO authenticated;
GRANT ALL ON public.diamond_prices TO service_role;

ALTER TABLE public.diamond_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access diamond_prices" ON public.diamond_prices
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_diamond_prices_updated_at
  BEFORE UPDATE ON public.diamond_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.diamond_prices (shape, size_label, size_order, lgd_price_ct, moiss_price_ct)
SELECT s.shape, b.label, b.ord, 8000, 800
FROM (VALUES
  ('ASSCHER'),('BAGUETTE'),('EMERALD'),('HEART'),('LONG-CUSHION'),('MARQUISE'),
  ('OVAL'),('PEAR'),('PRINCESS'),('RADIANT'),('ROUND'),('SQUARE CUSHION'),
  ('TAP BAGUETTE'),('OTHER/MANUAL DIAMOND'),('MIX')
) AS s(shape)
CROSS JOIN (VALUES
  ('1CT DOWN',0),('1 CT',1),('2 CT',2),('3 CT',3),('4 CT',4),('5 CT',5),
  ('6 CT',6),('7 CT',7),('8 CT',8),('9 CT',9),('10 CT',10)
) AS b(label, ord);