import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { authDriver } from '@/lib/config';
import { createLocalAuthProvider } from '@/lib/auth/local';
import { createSupabaseAuthProvider } from '@/lib/auth/supabase';
import type { AuthProvider } from '@/lib/auth/types';
import type { SessionUser } from '@/lib/types';

export type { AuthOutcome, SignInInput, SignUpInput } from '@/lib/auth/types';

let provider: AuthProvider | null = null;

export function auth(): AuthProvider {
  if (!provider) {
    provider = authDriver === 'supabase' ? createSupabaseAuthProvider() : createLocalAuthProvider();
  }
  return provider;
}

/**
 * The signed-in user, or null. Memoised for the duration of one request, so a
 * layout, a page and three components asking for it cost one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    return await auth().currentUser();
  } catch (error) {
    // Next.js signals redirects, not-found and dynamic-rendering bailouts by
    // throwing. Those carry a `digest` and must propagate untouched; only a
    // genuine failure should degrade to "signed out".
    if (isFrameworkSignal(error)) throw error;
    console.error('[binmap] session lookup failed', error);
    return null;
  }
});

function isFrameworkSignal(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string'
  );
}

/** Server-side gate for pages that need an account. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `?keyin=${encodeURIComponent(returnTo)}` : '';
    redirect(`/kirish${target}`);
  }
  return user;
}

/**
 * Server-side gate for the administration area.
 *
 * The role comes from public.profiles on every request — never from a cookie,
 * a client-supplied value or a cached claim — and this runs before any admin
 * page or action does work. Hiding the navigation link is cosmetic; this is
 * the actual boundary, alongside the RLS policies in the database.
 */
export async function requireAdmin(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = returnTo ? `?keyin=${encodeURIComponent(returnTo)}` : '';
    redirect(`/kirish${target}`);
  }
  if (user.role !== 'admin') {
    redirect('/ruxsat-yoq');
  }
  return user;
}

/** Non-redirecting variant for route handlers. */
export async function getAdminOrNull(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && user.role === 'admin' ? user : null;
}
