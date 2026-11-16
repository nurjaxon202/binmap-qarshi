import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseConfig } from '@/lib/config';

/**
 * Request-scoped Supabase client for Supabase Auth.
 *
 * Uses @supabase/ssr — the currently recommended server-side integration — so
 * the session lives in httpOnly cookies and is refreshed on the server. The
 * deprecated auth-helpers packages are deliberately not used.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  if (!supabaseConfig.url || !supabaseConfig.anonKey) {
    throw new Error('Supabase is not configured.');
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseConfig.url, supabaseConfig.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The middleware refreshes
          // the session, so this is the expected no-op during rendering.
        }
      },
    },
  });
}
