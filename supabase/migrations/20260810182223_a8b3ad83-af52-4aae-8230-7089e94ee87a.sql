ALTER TABLE public.diamonds ADD COLUMN IF NOT EXISTS weight_pcs numeric NOT NULL DEFAULT 0;

DELETE FROM public.metal_prices WHERE purity = '9KT';

INSERT INTO public.metal_prices (purity, price, making_charge, sort_order)
VALUES ('24KT', 0, 950, 0)
ON CONFLICT (purity) DO NOTHING;

UPDATE public.metal_prices SET sort_order = 0 WHERE purity = '24KT';
UPDATE public.metal_prices SET sort_order = 1 WHERE purity = '22KT';
UPDATE public.metal_prices SET sort_order = 2 WHERE purity = '18KT';
UPDATE public.metal_prices SET sort_order = 3 WHERE purity = '14KT';
UPDATE public.metal_prices SET sort_order = 4 WHERE purity = '10KT';
UPDATE public.metal_prices SET sort_order = 5 WHERE purity = 'Silver';
UPDATE public.metal_prices SET sort_order = 6 WHERE purity = 'Platinum';

UPDATE public.metal_prices SET making_charge = 950 WHERE purity IN ('24KT','22KT','18KT','14KT','10KT');

UPDATE public.metal_prices m
SET price = ROUND((SELECT price FROM public.metal_prices WHERE purity = '24KT') * f.factor, 2),
    updated_at = now()
FROM (VALUES ('22KT', 0.91), ('18KT', 0.76), ('14KT', 0.62), ('10KT', 0.41)) AS f(purity, factor)
WHERE m.purity = f.purity;