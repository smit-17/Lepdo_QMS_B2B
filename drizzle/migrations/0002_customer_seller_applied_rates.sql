ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS seller text NOT NULL DEFAULT '';
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS applied_rates jsonb NOT NULL DEFAULT '{}'::jsonb;