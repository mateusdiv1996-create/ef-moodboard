// O Supabase mudou o nome da chave pública: "anon" (antigo) = "publishable" (novo).
// Aceitamos os dois nomes. As referências precisam ser literais para o Next embutir no navegador.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_PUBLIC_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;

// Chave secreta (só servidor): "service_role" (antigo) = "secret" (novo).
export const supabaseSecretKey = () =>
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!;
