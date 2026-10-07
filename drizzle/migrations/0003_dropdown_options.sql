CREATE TABLE public.dropdown_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key text NOT NULL,
  value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX dropdown_options_list_label_uq ON public.dropdown_options (list_key, lower(label));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dropdown_options TO anon, authenticated;
GRANT ALL ON public.dropdown_options TO service_role;
ALTER TABLE public.dropdown_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dropdown_options full access" ON public.dropdown_options FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
INSERT INTO public.dropdown_options (list_key, value, label, sort_order)
SELECT 'category', v, v, o FROM (VALUES ('Ring',1),('Earring',2),('Pendant',3),('Bracelet',4),('Necklace',5),('Bangle',6),('Chain',7),('Other',8)) AS t(v,o);
INSERT INTO public.dropdown_options (list_key, value, label, sort_order)
SELECT 'diamond_type', v, l, o FROM (VALUES ('Lab-Grown','Lab Grown Diamond',1),('Moissanite','Moissanite Diamond',2)) AS t(v,l,o);
INSERT INTO public.dropdown_options (list_key, value, label, sort_order)
SELECT 'shape', s, s, (row_number() OVER (ORDER BY s))::int FROM (SELECT DISTINCT trim(shape) s FROM public.diamond_prices WHERE trim(shape) <> '') d;