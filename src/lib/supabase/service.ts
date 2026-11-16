import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseConfig } from '@/lib/config';

/**
 * Service-role Supabase client. Server-only, used for Storage operations and
 * for the admin-side auth calls (creating accounts, promoting a role).
 *
 * The key never leaves the server: this module imports `server-only`, so any
 * attempt to pull it into a client component fails the build.
 */

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!supabaseConfig.url || !supabaseConfig.serviceRoleKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
