import 'server-only';

import { getDb } from '@/lib/db/client';
import { siteConfig } from '@/lib/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Role, SessionUser } from '@/lib/types';
import type { AuthOutcome, AuthProvider, ResetRequestOutcome } from '@/lib/auth/types';

/**
 * Supabase Auth — the production authentication provider.
 *
 * Sessions are managed by @supabase/ssr in httpOnly cookies and refreshed in
 * middleware. The role is never read from the Supabase session: it is read from
 * public.profiles, which only an administrator (or the service role) can
 * change. A forged or stale JWT claim therefore cannot grant admin access.
 */

const GENERIC_SIGNIN_ERROR = 'Elektron pochta yoki parol noto‘g‘ri.';

export function createSupabaseAuthProvider(): AuthProvider {
  return {
    kind: 'supabase',
    emailVerificationRequired: true,

    async signUp({ email, password, fullName }): Promise<AuthOutcome> {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Read by the binmap_handle_new_user trigger. `role` is deliberately
          // absent — it is not settable from a sign-up payload.
          data: { full_name: fullName },
          emailRedirectTo: `${siteConfig.url}/kirish`,
        },
      });

      if (error) {
        const message = /already registered|already exists/i.test(error.message)
          ? 'Bu elektron pochta allaqachon ro‘yxatdan o‘tgan.'
          : 'Ro‘yxatdan o‘tishda xatolik yuz berdi. Keyinroq urinib ko‘ring.';
        return { ok: false, error: message, field: 'email' };
      }

      if (!data.user) {
        return { ok: false, error: 'Ro‘yxatdan o‘tishda xatolik yuz berdi.', field: '_form' };
      }

      const user = await loadProfile(data.user.id, email, fullName);

      // Supabase returns no session when e-mail confirmation is required.
      if (!data.session) {
        return {
          ok: true,
          user,
          notice:
            'Hisobni tasdiqlash uchun elektron pochtangizga havola yubordik. Havolani bosganingizdan so‘ng tizimga kirishingiz mumkin.',
        };
      }

      return { ok: true, user };
    },

    async signIn({ email, password }): Promise<AuthOutcome> {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        const message = /email not confirmed/i.test(error?.message ?? '')
          ? 'Elektron pochtangiz hali tasdiqlanmagan. Pochtangizdagi havolani bosing.'
          : GENERIC_SIGNIN_ERROR;
        return { ok: false, error: message, field: '_form' };
      }

      return { ok: true, user: await loadProfile(data.user.id, data.user.email ?? email, null) };
    },

    async signOut(): Promise<void> {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    },

    async currentUser(): Promise<SessionUser | null> {
      const supabase = await createSupabaseServerClient();
      // getUser() validates the token with the auth server rather than
      // trusting whatever is in the cookie.
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) return null;

      const db = await getDb();
      const { rows } = await db.query<{
        id: string;
        email: string;
        full_name: string | null;
        role: Role;
      }>('select id, email, full_name, role from public.profiles where id = $1', [data.user.id]);

      const row = rows[0];
      if (!row) {
        // The trigger normally creates this row; heal it if a sign-up raced.
        return loadProfile(data.user.id, data.user.email ?? '', null);
      }
      return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
    },

    async requestPasswordReset(email): Promise<ResetRequestOutcome> {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteConfig.url}/parolni-tiklash/yangilash`,
      });
      // Supabase does not disclose whether the address exists, and neither do we.
      return { ok: true };
    },

    async resetPassword(_token, password): Promise<AuthOutcome> {
      // Supabase exchanges the e-mail link for a session before this page is
      // reachable, so the update applies to the already-authenticated user.
      const supabase = await createSupabaseServerClient();
      const { data: sessionData } = await supabase.auth.getUser();
      if (!sessionData.user) {
        return {
          ok: false,
          error: 'Havola yaroqsiz yoki muddati o‘tgan. Qaytadan so‘rov yuboring.',
          field: '_form',
        };
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        return { ok: false, error: 'Parolni yangilab bo‘lmadi.', field: 'password' };
      }

      return {
        ok: true,
        user: await loadProfile(sessionData.user.id, sessionData.user.email ?? '', null),
      };
    },

    async updateFullName(userId, fullName): Promise<void> {
      const db = await getDb();
      await db.query('update public.profiles set full_name = $2 where id = $1', [userId, fullName]);
    },
  };
}

/**
 * Reads the profile, creating it if the sign-up trigger has not yet run.
 * Always with role 'user' — a new account cannot arrive privileged.
 */
async function loadProfile(
  id: string,
  email: string,
  fullName: string | null,
): Promise<SessionUser> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    email: string;
    full_name: string | null;
    role: Role;
  }>(
    `insert into public.profiles (id, email, full_name, role)
     values ($1, $2, $3, 'user')
     on conflict (id) do update
       set email = excluded.email,
           full_name = coalesce(public.profiles.full_name, excluded.full_name)
     returning id, email, full_name, role`,
    [id, email, fullName],
  );
  const row = rows[0];
  if (!row) throw new Error('could not load profile');
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}
