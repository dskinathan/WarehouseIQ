import { createClient } from "@supabase/supabase-js";

// Manager Dashboard's only path to the database — every table access goes
// through Supabase's PostgREST layer, so Row-Level Security (see
// docs/database/DATABASE.md) is what actually enforces tenant isolation,
// not this client. Never use the service-role key here; that belongs only
// in server-side Edge Functions (see docs/api/API.md).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see .env.example"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
