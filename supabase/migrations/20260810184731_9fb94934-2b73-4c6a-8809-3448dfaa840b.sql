UPDATE public.app_config SET value = '1212', updated_at = now() WHERE key = 'app_password';
INSERT INTO public.app_config (key, value) VALUES ('app_password', '1212')
  ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_config (key, value) VALUES ('founder_password', 'Biju@@1106')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();