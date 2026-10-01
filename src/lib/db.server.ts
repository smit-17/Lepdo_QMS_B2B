// Server-side Supabase client that uses ONLY the publishable (public) key.
// The app no longer requires a service-role key, so it can be deployed anywhere
// (Vercel, etc.) with just SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function createDbClient() {
  const url =
    process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"] ??
    "";

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY environment variable.",
    );
  }

  return createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(
          typeof Request !== "undefined" && input instanceof Request
            ? input.headers
            : undefined,
        );
        if (init?.headers) {
          new Headers(init.headers).forEach((v, k) => headers.set(k, v));
        }
        // New-format sb_ keys are opaque strings, not bearer JWTs.
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _db: ReturnType<typeof createDbClient> | undefined;

export const db = new Proxy({} as ReturnType<typeof createDbClient>, {
  get(_, prop, receiver) {
    if (!_db) _db = createDbClient();
    return Reflect.get(_db, prop, receiver);
  },
});
