import 'server-only';

import { getDb, transaction } from '@/lib/db/client';
import { mapProfile, toBool, toNumber, type ProfileRow } from '@/lib/db/mappers';
import { recordAudit } from '@/lib/db/audit';
import type { Paginated, Profile, Role } from '@/lib/types';

/**
 * Accounts.
 *
 * `role` is the only privileged field and it has exactly one write path:
 * `setRole`, reachable from the administration area and from the
 * `npm run admin:create` script. Nothing derives a role from a request body,
 * a cookie or a JWT claim.
 */

export async function getProfile(id: string): Promise<Profile | null> {
  const db = await getDb();
  const { rows } = await db.query<ProfileRow>(
    'select id, email, full_name, role, created_at from public.profiles where id = $1',
    [id],
  );
  return rows[0] ? mapProfile(rows[0]) : null;
}

export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const db = await getDb();
  const { rows } = await db.query<ProfileRow>(
    `select id, email, full_name, role, created_at
       from public.profiles where lower(email) = lower($1)`,
    [email],
  );
  return rows[0] ? mapProfile(rows[0]) : null;
}

export interface ProfileWithActivity extends Profile {
  isDemo: boolean;
  submissionCount: number;
  reportCount: number;
}

export async function listProfiles(
  options: { query?: string | null; page?: number; pageSize?: number } = {},
): Promise<Paginated<ProfileWithActivity>> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const db = await getDb();

  const params = [
    options.query && options.query.trim().length > 0 ? `%${options.query.trim()}%` : null,
  ];
  const where = `where ($1::text is null or p.email ilike $1::text or p.full_name ilike $1::text)`;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: number }>(
      `select count(*)::int as total from public.profiles p ${where}`,
      params,
    ),
    db.query<ProfileRow & { is_demo: boolean; submission_count: number; report_count: number }>(
      `select p.id, p.email, p.full_name, p.role, p.is_demo, p.created_at,
              (select count(*) from public.bin_submissions s where s.submitted_by = p.id)::int as submission_count,
              (select count(*) from public.bin_reports r where r.submitted_by = p.id)::int as report_count
         from public.profiles p
         ${where}
        order by p.role desc, p.created_at desc
        limit ${pageSize} offset ${offset}`,
      params,
    ),
  ]);

  return {
    rows: rows.map((row) => ({
      ...mapProfile(row),
      isDemo: toBool(row.is_demo),
      submissionCount: toNumber(row.submission_count),
      reportCount: toNumber(row.report_count),
    })),
    total: toNumber(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

/**
 * Changes an account's role.
 *
 * Refuses to act on the acting administrator's own row, so a sole
 * administrator cannot lock themselves out and nobody can quietly self-demote
 * to hide an action. Audited either way.
 */
export async function setRole(
  targetUserId: string,
  role: Role,
  actingAdminId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (targetUserId === actingAdminId) {
    return { ok: false, error: 'O‘z rolingizni o‘zgartira olmaysiz.' };
  }

  return transaction(async (tx) => {
    const before = await tx.query<{ role: Role; email: string }>(
      'select role, email from public.profiles where id = $1 for update',
      [targetUserId],
    );
    const previous = before.rows[0];
    if (!previous) return { ok: false as const, error: 'Foydalanuvchi topilmadi.' };
    if (previous.role === role) return { ok: true as const };

    await tx.query('update public.profiles set role = $2 where id = $1', [targetUserId, role]);
    await recordAudit(tx, {
      administratorId: actingAdminId,
      action: 'profile.role_changed',
      entityType: 'profile',
      entityId: targetUserId,
      details: { field: 'role', from: previous.role, to: role, email: previous.email },
    });
    return { ok: true as const };
  });
}

export async function countAdmins(): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    "select count(*)::int as n from public.profiles where role = 'admin'",
  );
  return toNumber(rows[0]?.n ?? 0);
}
