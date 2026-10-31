import { createClient } from "@supabase/supabase-js";

// ВАЖНО: этот клиент использует SERVICE ROLE KEY и обходит все политики RLS.
// Импортировать его можно только в файлах app/api/** (серверный код),
// никогда не передавать этот ключ на клиент/в браузер.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
