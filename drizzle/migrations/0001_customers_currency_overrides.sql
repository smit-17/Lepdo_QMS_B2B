CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  mobile text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  match_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers full access" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.quotations ADD COLUMN currency text NOT NULL DEFAULT 'INR';
ALTER TABLE public.quotations ADD COLUMN pdf_visibility jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.quotations ADD COLUMN customer_id uuid;
ALTER TABLE public.metal_prices ADD COLUMN manual boolean NOT NULL DEFAULT false;