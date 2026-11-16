import 'server-only';

import { cookies } from 'next/headers';

import { getDb, PG_UNIQUE_VIOLATION, DbError } from '@/lib/db/client';
import { createToken, hashPassword, hashToken, verifyPassword } from '@/lib/auth/password';
import { siteConfig } from '@/lib/config';
import type { Role, SessionUser } from '@/lib/types';
import type { AuthOutcome, AuthProvider, ResetRequestOutcome } from '@/lib/auth/types';

/**
 * Authentication against the project's own PostgreSQL tables.
 *
 * Used when Supabase Auth is not configured — development against the local
 * PGlite database, and self-hosted deployments on a plain PostgreSQL server.
 * The session is an opaque random token in an httpOnly cookie; only its
 * SHA-256 digest is stored, so the database never holds a replayable token.
 */

const SESSION_COOKIE = 'binmap_session';
const SESSION_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 60;

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: siteConfig.url.startsWith('https://'),
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
}

export function createLocalAuthProvider(): AuthProvider {
  return {
    kind: 'local',
    // Without a mail provider we cannot deliver a confirmation link, so
    // accounts are usable immediately. This is documented in the README and is
    // the one behavioural difference from the Supabase path.
    emailVerificationRequired: false,

    async signUp({ email, password, fullName }): Promise<AuthOutcome> {
      const db = await getDb();
      const passwordHash = await hashPassword(password);

      try {
        const user = await db.transaction(async (tx) => {
          const inserted = await tx.query<ProfileRow>(
            `insert into public.profiles (email, full_name, role)
             values ($1, $2, 'user')
             returning id, email, full_name, role`,
            [email, fullName],
          );
          const row = inserted.rows[0];
          if (!row) throw new Error('profile insert returned no row');

          await tx.query(
            `insert into public.local_credentials (user_id, password_hash, email_verified_at)
             values ($1, $2, now())`,
            [row.id, passwordHash],
          );
          return row;
        });

        await startSession(user.id);
        return { ok: true, user: toSessionUser(user) };
      } catch (error) {
        if (error instanceof DbError && error.code === PG_UNIQUE_VIOLATION) {
          return {
            ok: false,
            error: 'Bu elektron pochta allaqachon ro‘yxatdan o‘tgan.',
            field: 'email',
          };
        }
        throw error;
      }
    },

    async signIn({ email, password }): Promise<AuthOutcome> {
      const db = await getDb();
      const { rows } = await db.query<ProfileRow & { password_hash: string }>(
        `select p.id, p.email, p.full_name, p.role, c.password_hash
           from public.profiles p
           join public.local_credentials c on c.user_id = p.id
          where lower(p.email) = lower($1)`,
        [email],
      );

      const row = rows[0];
      // Verify even when the account does not exist, against a throwaway hash,
      // so a missing account and a wrong password take the same time.
      const stored = row?.password_hash ?? DUMMY_HASH;
      const valid = await verifyPassword(password, stored);

      if (!row || !valid) {
        return {
          ok: false,
          error: 'Elektron pochta yoki parol noto‘g‘ri.',
          field: '_form',
        };
      }

      await startSession(row.id);
      return { ok: true, user: toSessionUser(row) };
    },

    async signOut(): Promise<void> {
      const store = await cookies();
      const token = store.get(SESSION_COOKIE)?.value;
      if (token) {
        const db = await getDb();
        await db.query('delete from public.sessions where token_hash = $1', [hashToken(token)]);
      }
      store.set(SESSION_COOKIE, '', cookieOptions(0));
    },

    async currentUser(): Promise<SessionUser | null> {
      const store = await cookies();
      const token = store.get(SESSION_COOKIE)?.value;
      if (!token) return null;

      const db = await getDb();
      const { rows } = await db.query<ProfileRow>(
        `select p.id, p.email, p.full_name, p.role
           from public.sessions s
           join public.profiles p on p.id = s.user_id
          where s.token_hash = $1 and s.expires_at > now()`,
        [hashToken(token)],
      );
      const row = rows[0];
      return row ? toSessionUser(row) : null;
    },

    async requestPasswordReset(email): Promise<ResetRequestOutcome> {
      const db = await getDb();
      const { rows } = await db.query<{ id: string }>(
        'select id from public.profiles where lower(email) = lower($1)',
        [email],
      );
      const row = rows[0];
      // Always report success: whether an address is registered is not
      // something an unauthenticated caller should be able to probe.
      if (!row) return { ok: true };

      const token = createToken();
      await db.query(
        `insert into public.password_reset_tokens (token_hash, user_id, expires_at)
         values ($1, $2, now() + ($3 || ' minutes')::interval)`,
        [hashToken(token), row.id, String(RESET_TTL_MINUTES)],
      );

      return {
        ok: true,
        devLink: `${siteConfig.url}/parolni-tiklash/yangilash?token=${token}`,
      };
    },

    async resetPassword(token, password): Promise<AuthOutcome> {
      const db = await getDb();
      const passwordHash = await hashPassword(password);

      const result = await db.transaction(async (tx) => {
        const { rows } = await tx.query<ProfileRow>(
          `select p.id, p.email, p.full_name, p.role
             from public.password_reset_tokens t
             join public.profiles p on p.id = t.user_id
            where t.token_hash = $1
              and t.used_at is null
              and t.expires_at > now()`,
          [hashToken(token)],
        );
        const row = rows[0];
        if (!row) return null;

        await tx.query(
          `update public.local_credentials set password_hash = $2 where user_id = $1`,
          [row.id, passwordHash],
        );
        await tx.query('update public.password_reset_tokens set used_at = now() where token_hash = $1', [
          hashToken(token),
        ]);
        // Changing a password invalidates every existing session.
        await tx.query('delete from public.sessions where user_id = $1', [row.id]);
        return row;
      });

      if (!result) {
        return {
          ok: false,
          error: 'Havola yaroqsiz yoki muddati o‘tgan. Qaytadan so‘rov yuboring.',
          field: '_form',
        };
      }

      await startSession(result.id);
      return { ok: true, user: toSessionUser(result) };
    },

    async updateFullName(userId, fullName): Promise<void> {
      const db = await getDb();
      await db.query('update public.profiles set full_name = $2 where id = $1', [userId, fullName]);
    },
  };
}

/* --------------------------------- helpers -------------------------------- */

/**
 * A valid scrypt hash of a value no password will match. Keeps the failed-login
 * path doing the same work as the successful one.
 */
const DUMMY_HASH =
  'scrypt$65536$8$1$YmlubWFwZHVtbXlzYWx0$3hRmzd0DkZzaHN0SXNOb3RBVmFsaWRQYXNzd29yZEhhc2g';

function toSessionUser(row: ProfileRow): SessionUser {
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

async function startSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = createToken();
  await db.query(
    `insert into public.sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(SESSION_TTL_DAYS)],
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60));

  // Opportunistic cleanup; cheap because of sessions_expiry_idx.
  await db.query('delete from public.sessions where expires_at < now()').catch(() => {});
}
