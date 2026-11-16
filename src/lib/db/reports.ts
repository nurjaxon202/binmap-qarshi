import 'server-only';

import { getDb } from '@/lib/db/client';
import { mapReport, toNumber, type ReportRow } from '@/lib/db/mappers';
import { resolvePhotoUrls } from '@/lib/storage';
import type {
  BinReport,
  BinStatus,
  Paginated,
  ReportStatus,
  ReportType,
  ReportWithContext,
  VerificationStatus,
} from '@/lib/types';

/**
 * Problem reports against existing bins.
 *
 * A "missing" report is a signal, not an instruction: it never deletes or
 * deactivates a bin. What it does is flag the bin for re-verification, which an
 * administrator then investigates. The two decisions — "this report is
 * accurate" and "this bin should go" — stay separate and both belong to an
 * administrator.
 */

const REPORT_COLUMNS = `r.id, r.bin_id, r.submitted_by, r.report_type, r.description,
                        r.photo_path, r.status, r.reviewed_by, r.is_demo,
                        r.created_at, r.resolved_at`;

export interface CreateReportInput {
  binId: string;
  submittedBy: string;
  reportType: ReportType;
  description: string | null;
  photoPath: string | null;
  isDemo?: boolean;
}

/**
 * Files a report and, for a "missing" report, marks the bin as needing a
 * re-check — in the same transaction, so the flag and the report agree.
 */
export async function createReport(input: CreateReportInput): Promise<BinReport> {
  const db = await getDb();
  const { rows } = await db.query<{ report_id: string }>(
    'select public.binmap_create_report($1, $2, $3, $4, $5, $6) as report_id',
    [
      input.binId,
      input.submittedBy,
      input.reportType,
      input.description,
      input.photoPath,
      input.isDemo ?? false,
    ],
  );
  const id = rows[0]?.report_id;
  if (!id) throw new Error('report insert returned no id');

  const created = await db.query<ReportRow>('select * from public.bin_reports where id = $1', [id]);
  const row = created.rows[0];
  if (!row) throw new Error('report disappeared after insert');
  return mapReport(row, false);
}

/* --------------------------------- reading -------------------------------- */

interface ReportJoinRow extends ReportRow {
  submitter_email?: string | null;
  reviewer_email?: string | null;
  bin_latitude: number | null;
  bin_longitude: number | null;
  bin_description: string | null;
  bin_status: BinStatus | null;
  bin_verification: VerificationStatus | null;
}

async function decorate(
  rows: ReportJoinRow[],
  includeAdminNote: boolean,
): Promise<ReportWithContext[]> {
  const urls = await resolvePhotoUrls(rows.map((r) => r.photo_path));
  return rows.map((row) => ({
    ...mapReport(row, includeAdminNote),
    submitterEmail: row.submitter_email ?? null,
    reviewerEmail: row.reviewer_email ?? null,
    photoUrl: row.photo_path ? (urls.get(row.photo_path) ?? null) : null,
    bin:
      row.bin_latitude == null || row.bin_longitude == null
        ? null
        : {
            id: row.bin_id,
            latitude: toNumber(row.bin_latitude),
            longitude: toNumber(row.bin_longitude),
            description: row.bin_description,
            status: row.bin_status ?? 'active',
            verificationStatus: row.bin_verification ?? 'community',
          },
  }));
}

const BIN_JOIN = `
  left join public.bins b on b.id = r.bin_id
`;

const BIN_FIELDS = `
  b.latitude as bin_latitude, b.longitude as bin_longitude,
  b.description as bin_description, b.status as bin_status,
  b.verification_status as bin_verification
`;

/**
 * A person's own reports. `admin_note` is not selected: the internal note is
 * never returned to the reporter.
 */
export async function listReportsByUser(userId: string): Promise<ReportWithContext[]> {
  const db = await getDb();
  const { rows } = await db.query<ReportJoinRow>(
    `select ${REPORT_COLUMNS}, ${BIN_FIELDS}
       from public.bin_reports r
       ${BIN_JOIN}
      where r.submitted_by = $1
      order by r.created_at desc
      limit 200`,
    [userId],
  );
  return decorate(rows, false);
}

/** Public reports for one bin — type and date only, no reporter, no notes. */
export interface PublicReportSummary {
  reportType: ReportType;
  status: ReportStatus;
  createdAt: string;
}

export async function listPublicReportsForBin(binId: string): Promise<PublicReportSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    report_type: ReportType;
    status: ReportStatus;
    created_at: unknown;
  }>(
    `select report_type, status, created_at
       from public.bin_reports
      where bin_id = $1 and status in ('submitted', 'reviewing', 'confirmed', 'resolved')
      order by created_at desc
      limit 10`,
    [binId],
  );
  return rows.map((row) => ({
    reportType: row.report_type,
    status: row.status,
    createdAt: new Date(String(row.created_at)).toISOString(),
  }));
}

export interface AdminReportFilter {
  status?: ReportStatus | 'all' | 'open';
  reportType?: ReportType | 'all';
  query?: string | null;
  demoOnly?: boolean | null;
  binId?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listReportsForAdmin(
  filter: AdminReportFilter = {},
): Promise<Paginated<ReportWithContext>> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const db = await getDb();

  const status = filter.status ?? 'all';
  const params = [
    status === 'all' || status === 'open' ? null : status,
    status === 'open' ? true : null,
    filter.reportType && filter.reportType !== 'all' ? filter.reportType : null,
    filter.query && filter.query.trim().length > 0 ? `%${filter.query.trim()}%` : null,
    filter.demoOnly ?? null,
    filter.binId ?? null,
  ];

  const where = `
    where ($1::text is null or r.status = $1::text)
      and ($2::boolean is null or r.status in ('submitted', 'reviewing', 'confirmed'))
      and ($3::text is null or r.report_type = $3::text)
      and ($5::boolean is null or r.is_demo = $5::boolean)
      and ($6::uuid is null or r.bin_id = $6::uuid)
      and ($4::text is null
           or r.description ilike $4::text
           or r.id::text ilike $4::text
           or p.email ilike $4::text
           or b.description ilike $4::text)
  `;
  const from = `
    from public.bin_reports r
    ${BIN_JOIN}
    left join public.profiles p on p.id = r.submitted_by
    left join public.profiles rv on rv.id = r.reviewed_by
  `;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: number }>(`select count(*)::int as total ${from} ${where}`, params),
    db.query<ReportJoinRow>(
      `select ${REPORT_COLUMNS}, r.admin_note, ${BIN_FIELDS},
              p.email as submitter_email, rv.email as reviewer_email
       ${from} ${where}
       order by
         case r.status
           when 'submitted' then 0 when 'reviewing' then 1 when 'confirmed' then 2 else 3
         end,
         r.created_at desc
       limit ${pageSize} offset ${offset}`,
      params,
    ),
  ]);

  return {
    rows: await decorate(rows, true),
    total: toNumber(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export async function getReportForAdmin(id: string): Promise<ReportWithContext | null> {
  const db = await getDb();
  const { rows } = await db.query<ReportJoinRow>(
    `select ${REPORT_COLUMNS}, r.admin_note, ${BIN_FIELDS},
            p.email as submitter_email, rv.email as reviewer_email
       from public.bin_reports r
       ${BIN_JOIN}
       left join public.profiles p on p.id = r.submitted_by
       left join public.profiles rv on rv.id = r.reviewed_by
      where r.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const [report] = await decorate(rows, true);
  return report ?? null;
}

/* --------------------------------- review --------------------------------- */

export interface ReviewReportInput {
  status: ReportStatus;
  adminNote?: string | null;
}

/**
 * Updates a report's status.
 *
 * Resolving the last open report on a bin lifts the `needs_recheck` flag, since
 * nothing is outstanding any more. Deactivating or deleting a bin is never a
 * side effect of this — that stays a separate, explicit administrative act.
 */
export async function reviewReport(
  reportId: string,
  adminId: string,
  input: ReviewReportInput,
): Promise<BinReport | null> {
  const db = await getDb();
  const { rows } = await db.query<{ ok: boolean }>(
    'select public.binmap_review_report($1, $2, $3, $4) as ok',
    [reportId, adminId, input.status, input.adminNote ?? null],
  );
  if (rows[0]?.ok !== true) return null;

  const refreshed = await db.query<ReportRow>('select * from public.bin_reports where id = $1', [
    reportId,
  ]);
  return refreshed.rows[0] ? mapReport(refreshed.rows[0], true) : null;
}

/* ------------------------------- spam guards ------------------------------ */

export async function countRecentReportsByUser(userId: string, windowMs: number): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.bin_reports
      where submitted_by = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
    [userId, String(windowMs)],
  );
  return toNumber(rows[0]?.n ?? 0);
}

/**
 * How many times this person has reported this bin recently. Keeps a single
 * user from filing the same complaint repeatedly while leaving a genuine
 * second report (a different problem, or a later day) possible.
 */
export async function countRecentReportsForBinByUser(
  userId: string,
  binId: string,
  windowMs: number,
): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.bin_reports
      where submitted_by = $1 and bin_id = $2
        and created_at > now() - ($3 || ' milliseconds')::interval`,
    [userId, binId, String(windowMs)],
  );
  return toNumber(rows[0]?.n ?? 0);
}

export async function getReportOwner(id: string): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query<{ submitted_by: string | null }>(
    'select submitted_by from public.bin_reports where id = $1',
    [id],
  );
  return rows[0]?.submitted_by ?? null;
}
