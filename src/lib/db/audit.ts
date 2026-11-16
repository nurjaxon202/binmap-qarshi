import 'server-only';

import { getDb, type Queryable } from '@/lib/db/client';
import { mapAudit, toNumber, type AuditRow } from '@/lib/db/mappers';
import type { AdminAuditEntry, AuditAction, Paginated } from '@/lib/types';

/**
 * The administrative audit log.
 *
 * Every entry is written by the same transaction as the action it records, so
 * the log cannot drift from what actually happened: either both land or
 * neither does. Nothing in the application updates or deletes an entry, and
 * the RLS policy grants no write access through the API.
 */

export interface AuditInput {
  administratorId: string | null;
  action: AuditAction;
  entityType: 'bin' | 'bin_submission' | 'bin_report' | 'profile';
  entityId: string | null;
  details?: Record<string, unknown> | null;
}

/** Takes the transaction explicitly — an audit entry outside one is a bug. */
export async function recordAudit(tx: Queryable, input: AuditInput): Promise<void> {
  await tx.query(
    `insert into public.admin_audit_log
       (administrator_id, action, entity_type, entity_id, details)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.administratorId,
      input.action,
      input.entityType,
      input.entityId,
      input.details ? JSON.stringify(input.details) : null,
    ],
  );
}

export interface AuditEntryWithAdmin extends AdminAuditEntry {
  administratorEmail: string | null;
  administratorName: string | null;
}

export interface AuditFilter {
  action?: string | null;
  entityType?: string | null;
  administratorId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listAuditLog(
  filter: AuditFilter = {},
): Promise<Paginated<AuditEntryWithAdmin>> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 30));
  const offset = (page - 1) * pageSize;
  const db = await getDb();

  const params = [
    filter.action && filter.action !== 'all' ? filter.action : null,
    filter.entityType && filter.entityType !== 'all' ? filter.entityType : null,
    filter.administratorId ?? null,
  ];
  const where = `
    where ($1::text is null or a.action = $1::text)
      and ($2::text is null or a.entity_type = $2::text)
      and ($3::uuid is null or a.administrator_id = $3::uuid)
  `;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: number }>(
      `select count(*)::int as total from public.admin_audit_log a ${where}`,
      params,
    ),
    db.query<AuditRow & { admin_email: string | null; admin_name: string | null }>(
      `select a.id, a.administrator_id, a.action, a.entity_type, a.entity_id,
              a.details, a.created_at,
              p.email as admin_email, p.full_name as admin_name
         from public.admin_audit_log a
         left join public.profiles p on p.id = a.administrator_id
         ${where}
        order by a.created_at desc
        limit ${pageSize} offset ${offset}`,
      params,
    ),
  ]);

  return {
    rows: rows.map((row) => ({
      ...mapAudit(row),
      administratorEmail: row.admin_email,
      administratorName: row.admin_name,
    })),
    total: toNumber(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

/** The most recent entries, for the dashboard overview. */
export async function listRecentAuditEntries(limit = 8): Promise<AuditEntryWithAdmin[]> {
  const result = await listAuditLog({ page: 1, pageSize: limit });
  return result.rows;
}

/** History for one entity, shown on the bin / submission / report detail pages. */
export async function listAuditForEntity(
  entityType: 'bin' | 'bin_submission' | 'bin_report' | 'profile',
  entityId: string,
): Promise<AuditEntryWithAdmin[]> {
  const db = await getDb();
  const { rows } = await db.query<AuditRow & { admin_email: string | null; admin_name: string | null }>(
    `select a.id, a.administrator_id, a.action, a.entity_type, a.entity_id,
            a.details, a.created_at,
            p.email as admin_email, p.full_name as admin_name
       from public.admin_audit_log a
       left join public.profiles p on p.id = a.administrator_id
      where a.entity_type = $1 and a.entity_id = $2
      order by a.created_at desc
      limit 50`,
    [entityType, entityId],
  );
  return rows.map((row) => ({
    ...mapAudit(row),
    administratorEmail: row.admin_email,
    administratorName: row.admin_name,
  }));
}

/** Distinct actions present in the log, for the filter dropdown. */
export async function listAuditActions(): Promise<string[]> {
  const db = await getDb();
  const { rows } = await db.query<{ action: string }>(
    'select distinct action from public.admin_audit_log order by action',
  );
  return rows.map((r) => r.action);
}
