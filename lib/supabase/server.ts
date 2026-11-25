import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY, supabaseSecretKey } from "./env";

/** Cliente com a sessão do usuário logado (respeita as regras de acesso do banco). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLIC_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado de um Server Component: o middleware cuida de renovar a sessão.
          }
        },
      },
    }
  );
}

/** Cliente com permissão total. Só usar no servidor (links públicos de compartilhamento). */
export function createAdminClient() {
  return createAdmin(
    SUPABASE_URL,
    supabaseSecretKey(),
    { auth: { persistSession: false } }
  );
}
