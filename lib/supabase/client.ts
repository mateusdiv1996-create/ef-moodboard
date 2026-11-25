import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "./env";

export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_PUBLIC_KEY
  );
}
