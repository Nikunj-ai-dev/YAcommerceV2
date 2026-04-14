import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("SUPABASE_URL or VITE_SUPABASE_URL must be set");
}

if (!serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabaseAdmin: SupabaseClient = createClient(
  supabaseUrl || "",
  serviceRoleKey || "",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
