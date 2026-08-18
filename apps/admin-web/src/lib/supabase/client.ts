import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@gueguense/types";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "AUTH_CONFIGURATION_ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be defined.",
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
