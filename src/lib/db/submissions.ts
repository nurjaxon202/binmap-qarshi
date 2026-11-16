import 'server-only';

import { getDb, transaction } from '@/lib/db/client';
import { mapSubmission, toNumber, type SubmissionRow } from '@/lib/db/mappers';
import { recordAudit } from '@/lib/db/audit';
import { getStorage, resolvePhotoUrls } from '@/lib/storage';
import type { BinSubmission, Paginated, SubmissionStatus, SubmissionWithContext } from '@/lib/types';

/**
 * Proposed bin locations.
 *
 * A submission is never a public bin. It sits here with `status = 'pending'`
 * until an administrator decides, and only `binmap_approve_submission` — a
 * single database transaction — can turn one into a canonical bin.
 */

const SUBMISSION_COLUMNS = `s.id, s.city_id, s.submitted_by, s.latitude, s.longitude,
                            s.description, s.photo_path, s.status, s.reviewed_by,
                            s.review_note, s.resulting_bin_id, s.is_demo,
                            s.created_at, s.reviewed_at`;

export interface CreateSubmissionInput {
  cityId: string;
  submittedBy: string;
  latitude: number;
  longitude: number;
  description: string | null;
  photoPath: string | null;
  isDemo?: boolean;
}

export async function createSubmission(input: CreateSubmissionInput): Promise<BinSubmission> {
  const db = await getDb();
  const { rows } = await db.query<SubmissionRow>(
    `insert into public.bin_submissions
       (city_id, submitted_by, latitude, longitude, description, photo_path, status, is_demo)
     values ($1, $2, $3, $4, $5, $6, 'pending', coalesce($7, false))
     returning *`,
    [
      input.cityId,
      input.submittedBy,
      input.latitude,
      input.longitude,
      input.description,
      input.photoPath,
      input.isDemo ?? false,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('submission insert returned no row');
  return mapSubmission(row);
}

/* --------------------------------- reading -------------------------------- */

async function decorate(
  rows: (SubmissionRow & {
    city_name: string;
    submitter_email?: string | null;
    reviewer_email?: string | null;
  })[],
): Promise<SubmissionWithContext[]> {
  const urls = await resolvePhotoUrls(rows.map((r) => r.photo_path));
  return rows.map((row) => ({
    ...mapSubmission(row),
    cityName: row.city_name,
    submitterEmail: row.submitter_email ?? null,
    reviewerEmail: row.reviewer_email ?? null,
    photoUrl: row.photo_path ? (urls.get(row.photo_path) ?? null) : null,
  }));
}

/**
 * A person's own submissions. The submitter's own e-mail is not re-exposed and
 * the internal note is not selected at all.
 */
export async function listSubmissionsByUser(userId: string): Promise<SubmissionWithContext[]> {
  const db = await getDb();
  const { rows } = await db.query<SubmissionRow & { city_name: string }>(
    `select ${SUBMISSION_COLUMNS}, c.name as city_name
       from public.bin_submissions s
       join public.cities c on c.id = s.city_id
      where s.submitted_by = $1
      order by s.created_at desc
      limit 200`,
    [userId],
  );
  return decorate(rows);
}

export interface AdminSubmissionFilter {
  status?: SubmissionStatus | 'all' | 'open';
  cityId?: string | null;
  query?: string | null;
  demoOnly?: boolean | null;
  page?: number;
  pageSize?: number;
}

export async function listSubmissionsForAdmin(
  filter: AdminSubmissionFilter = {},
): Promise<Paginated<SubmissionWithContext>> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const db = await getDb();

  const status = filter.status ?? 'all';
  const params = [
    status === 'all' || status === 'open' ? null : status,
    status === 'open' ? true : null,
    filter.cityId ?? null,
    filter.query && filter.query.trim().length > 0 ? `%${filter.query.trim()}%` : null,
    filter.demoOnly ?? null,
  ];

  const where = `
    where ($1::text is null or s.status = $1::text)
      and ($2::boolean is null or s.status in ('pending', 'under_review'))
      and ($3::uuid is null or s.city_id = $3::uuid)
      and ($5::boolean is null or s.is_demo = $5::boolean)
      and ($4::text is null
           or s.description ilike $4::text
           or s.id::text ilike $4::text
           or p.email ilike $4::text
           or (s.latitude::text || ',' || s.longitude::text) ilike $4::text)
  `;
  const from = `
    from public.bin_submissions s
    join public.cities c on c.id = s.city_id
    left join public.profiles p on p.id = s.submitted_by
    left join public.profiles rv on rv.id = s.reviewed_by
  `;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: number }>(`select count(*)::int as total ${from} ${where}`, params),
    db.query<
      SubmissionRow & { city_name: string; submitter_email: string | null; reviewer_email: string | null }
    >(
      `select ${SUBMISSION_COLUMNS}, c.name as city_name,
              p.email as submitter_email, rv.email as reviewer_email
       ${from} ${where}
       order by
         case s.status when 'pending' then 0 when 'under_review' then 1 else 2 end,
         s.created_at desc
       limit ${pageSize} offset ${offset}`,
      params,
    ),
  ]);

  return {
    rows: await decorate(rows),
    total: toNumber(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export interface AdminSubmissionDetail extends SubmissionWithContext {
  internalNote: string | null;
}

/** Full detail including the internal note — administrators only. */
export async function getSubmissionForAdmin(id: string): Promise<AdminSubmissionDetail | null> {
  const db = await getDb();
  const { rows } = await db.query<
    SubmissionRow & {
      city_name: string;
      submitter_email: string | null;
      reviewer_email: string | null;
      internal_note: string | null;
    }
  >(
    `select ${SUBMISSION_COLUMNS}, s.internal_note, c.name as city_name,
            p.email as submitter_email, rv.email as reviewer_email
       from public.bin_submissions s
       join public.cities c on c.id = s.city_id
       left join public.profiles p on p.id = s.submitted_by
       left join public.profiles rv on rv.id = s.reviewed_by
      where s.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const [decorated] = await decorate([row]);
  if (!decorated) return null;
  return { ...decorated, internalNote: row.internal_note };
}

export async function getSubmissionOwner(id: string): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query<{ submitted_by: string | null }>(
    'select submitted_by from public.bin_submissions where id = $1',
    [id],
  );
  return rows[0]?.submitted_by ?? null;
}

/* --------------------------------- review --------------------------------- */

export interface ApproveInput {
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  note?: string | null;
  markVerified?: boolean;
}

export interface ApproveResult {
  binId: string;
}

/**
 * Approves a submission.
 *
 * The photograph is copied into public storage *first*: if that fails nothing
 * has changed yet. The database then creates the bin, marks the submission and
 * writes the audit entry inside one transaction, so a half-applied approval
 * cannot exist.
 */
export async function approveSubmission(
  submissionId: string,
  adminId: string,
  input: ApproveInput = {},
): Promise<ApproveResult> {
  const db = await getDb();
  const { rows } = await db.query<{ photo_path: string | null; status: SubmissionStatus }>(
    'select photo_path, status from public.bin_submissions where id = $1',
    [submissionId],
  );
  const current = rows[0];
  if (!current) throw new Error('Taklif topilmadi.');
  if (current.status === 'approved') throw new Error('Bu taklif allaqachon tasdiqlangan.');

  let publicPhotoPath: string | null = null;
  if (current.photo_path) {
    try {
      publicPhotoPath = await getStorage().promoteToPublic(current.photo_path);
    } catch (error) {
      console.error('[binmap] could not publish submission photo', error);
      // Approve without the photograph rather than block the decision; the
      // bin simply has no picture and an administrator can add one later.
      publicPhotoPath = null;
    }
  }

  const result = await db.query<{ bin_id: string }>(
    `select public.binmap_approve_submission($1, $2, $3, $4, $5, $6, $7, $8) as bin_id`,
    [
      submissionId,
      adminId,
      input.latitude ?? null,
      input.longitude ?? null,
      input.description ?? null,
      input.note ?? null,
      input.markVerified ?? false,
      publicPhotoPath,
    ],
  );
  const binId = result.rows[0]?.bin_id;
  if (!binId) throw new Error('Tasdiqlash amalga oshmadi.');
  return { binId };
}

/**
 * Delegates to binmap_reject_submission: one transaction that records the
 * decision and its audit entry together. Returns null when the submission does
 * not exist.
 */
export async function rejectSubmission(
  submissionId: string,
  adminId: string,
  note: string,
): Promise<BinSubmission | null> {
  const db = await getDb();
  const { rows } = await db.query<{ ok: boolean }>(
    'select public.binmap_reject_submission($1, $2, $3) as ok',
    [submissionId, adminId, note],
  );
  if (rows[0]?.ok !== true) return null;
  return reloadSubmission(submissionId);
}

export async function startSubmissionReview(
  submissionId: string,
  adminId: string,
): Promise<BinSubmission | null> {
  const db = await getDb();
  const { rows } = await db.query<{ ok: boolean }>(
    'select public.binmap_start_submission_review($1, $2) as ok',
    [submissionId, adminId],
  );
  if (rows[0]?.ok !== true) return null;
  return reloadSubmission(submissionId);
}

async function reloadSubmission(id: string): Promise<BinSubmission | null> {
  const db = await getDb();
  const { rows } = await db.query<SubmissionRow>(
    'select * from public.bin_submissions where id = $1',
    [id],
  );
  return rows[0] ? mapSubmission(rows[0]) : null;
}

export async function setSubmissionInternalNote(
  submissionId: string,
  adminId: string,
  note: string | null,
): Promise<void> {
  await transaction(async (tx) => {
    await tx.query('update public.bin_submissions set internal_note = $2 where id = $1', [
      submissionId,
      note,
    ]);
    await recordAudit(tx, {
      administratorId: adminId,
      action: 'submission.note_added',
      entityType: 'bin_submission',
      entityId: submissionId,
      details: { cleared: note === null },
    });
  });
}

/* ------------------------------- spam guards ------------------------------ */

export async function countRecentSubmissionsByUser(
  userId: string,
  windowMs: number,
): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.bin_submissions
      where submitted_by = $1 and created_at > now() - ($2 || ' milliseconds')::interval`,
    [userId, String(windowMs)],
  );
  return toNumber(rows[0]?.n ?? 0);
}

/**
 * Has this person already proposed essentially this spot? Catches an
 * accidental double-submit without blocking a genuinely different nearby bin.
 */
export async function hasPendingSubmissionNearby(
  userId: string,
  latitude: number,
  longitude: number,
  radiusMeters: number,
): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n
       from public.bin_submissions
      where submitted_by = $1
        and status in ('pending', 'under_review')
        and 2 * 6371008.8 * asin(least(1, sqrt(
              power(sin(radians(latitude - $2) / 2), 2) +
              cos(radians($2)) * cos(radians(latitude)) *
              power(sin(radians(longitude - $3) / 2), 2)
            ))) <= $4`,
    [userId, latitude, longitude, radiusMeters],
  );
  return toNumber(rows[0]?.n ?? 0) > 0;
}
