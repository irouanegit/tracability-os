import { createClient } from "@supabase/supabase-js";
import { authDiagnosticFetch, initAuthDiagnosticsWatchers } from "./authDiagnostics";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: authDiagnosticFetch,
      },
    })
  : null;

if (isSupabaseConfigured) {
  initAuthDiagnosticsWatchers(supabaseUrl);
}

export function getAuthUserLabel(email: string | null | undefined) {
  if (!email) return "Utilisateur";
  return email.split("@")[0] || email;
}

export function getAuthUserInitials(email: string | null | undefined) {
  const label = getAuthUserLabel(email);
  return label
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

