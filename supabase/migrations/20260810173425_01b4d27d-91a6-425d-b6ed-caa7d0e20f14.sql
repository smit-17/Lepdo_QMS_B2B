CREATE OR REPLACE FUNCTION public.next_quotation_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'Q' || LPAD(nextval('public.quotation_seq')::TEXT, 5, '0');
$$;
REVOKE ALL ON FUNCTION public.next_quotation_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_quotation_id() TO service_role;