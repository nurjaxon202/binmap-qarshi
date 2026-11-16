import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Refreshes the Supabase Auth session cookie.
 *
 * Next 16 renamed the `middleware` convention to `proxy`; this is that file.
 *
 * Server Components cannot write cookies, so without this a session would
 * expire mid-visit and the person would appear signed out. It is a no-op on
 * the local authentication path, where sessions are plain rows in PostgreSQL
 * and never need refreshing.
 *
 * This is NOT an authorisation layer. Access is decided by requireUser /
 * requireAdmin in the pages and actions, and by the RLS policies in the
 * database — middleware runs before those and is deliberately not trusted for
 * it.
 */
export default async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touching getUser() is what performs the refresh.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images and the media route, which does
    // its own access control and must not pay for a session refresh.
    '/((?!_next/static|_next/image|favicon.ico|api/media|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
