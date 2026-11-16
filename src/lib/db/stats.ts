import 'server-only';

import { getDb } from '@/lib/db/client';
import { toNumber } from '@/lib/db/mappers';
import { COVERAGE_GRID_DEG } from '@/lib/config';
import type { DashboardStats, ReportType } from '@/lib/types';

/**
 * Every number the dashboards show is counted here, from the live tables.
 * Nothing is cached in a counter column and nothing is hard-coded, so an empty
 * database reports zero rather than a plausible-looking figure.
 */

export async function getDashboardStats(cityId?: string | null): Promise<DashboardStats> {
  const db = await getDb();
  const city = cityId ?? null;

  const { rows } = await db.query<{
    bins_active: number;
    bins_inactive: number;
    bins_verified: number;
    bins_community: number;
    bins_needs_recheck: number;
    bins_source_admin: number;
    bins_source_community: number;
    submissions_pending: number;
    submissions_under_review: number;
    submissions_approved: number;
    submissions_rejected: number;
    reports_open: number;
    reports_resolved: number;
    reports_overflowing: number;
    reports_damaged: number;
    reports_missing: number;
    reports_other: number;
    demo_records: number;
  }>(
    `select
       (select count(*) from public.bins
         where status = 'active' and ($1::uuid is null or city_id = $1::uuid))::int as bins_active,
       (select count(*) from public.bins
         where status <> 'active' and ($1::uuid is null or city_id = $1::uuid))::int as bins_inactive,
       (select count(*) from public.bins
         where status = 'active' and verification_status = 'verified'
           and ($1::uuid is null or city_id = $1::uuid))::int as bins_verified,
       (select count(*) from public.bins
         where status = 'active' and verification_status = 'community'
           and ($1::uuid is null or city_id = $1::uuid))::int as bins_community,
       (select count(*) from public.bins
         where status = 'active' and verification_status = 'needs_recheck'
           and ($1::uuid is null or city_id = $1::uuid))::int as bins_needs_recheck,
       (select count(*) from public.bins
         where status = 'active' and source = 'admin'
           and ($1::uuid is null or city_id = $1::uuid))::int as bins_source_admin,
       (select count(*) from public.bins
         where status = 'active' and source = 'community'
           and ($1::uuid is null or city_id = $1::uuid))::int as bins_source_community,

       (select count(*) from public.bin_submissions
         where status = 'pending' and ($1::uuid is null or city_id = $1::uuid))::int as submissions_pending,
       (select count(*) from public.bin_submissions
         where status = 'under_review' and ($1::uuid is null or city_id = $1::uuid))::int as submissions_under_review,
       (select count(*) from public.bin_submissions
         where status = 'approved' and ($1::uuid is null or city_id = $1::uuid))::int as submissions_approved,
       (select count(*) from public.bin_submissions
         where status = 'rejected' and ($1::uuid is null or city_id = $1::uuid))::int as submissions_rejected,

       (select count(*) from public.bin_reports r
          join public.bins b on b.id = r.bin_id
         where r.status in ('submitted','reviewing','confirmed')
           and ($1::uuid is null or b.city_id = $1::uuid))::int as reports_open,
       (select count(*) from public.bin_reports r
          join public.bins b on b.id = r.bin_id
         where r.status = 'resolved'
           and ($1::uuid is null or b.city_id = $1::uuid))::int as reports_resolved,

       (select count(*) from public.bin_reports r join public.bins b on b.id = r.bin_id
         where r.report_type = 'overflowing' and ($1::uuid is null or b.city_id = $1::uuid))::int as reports_overflowing,
       (select count(*) from public.bin_reports r join public.bins b on b.id = r.bin_id
         where r.report_type = 'damaged' and ($1::uuid is null or b.city_id = $1::uuid))::int as reports_damaged,
       (select count(*) from public.bin_reports r join public.bins b on b.id = r.bin_id
         where r.report_type = 'missing' and ($1::uuid is null or b.city_id = $1::uuid))::int as reports_missing,
       (select count(*) from public.bin_reports r join public.bins b on b.id = r.bin_id
         where r.report_type = 'other' and ($1::uuid is null or b.city_id = $1::uuid))::int as reports_other,

       (
         (select count(*) from public.bins where is_demo)
         + (select count(*) from public.bin_submissions where is_demo)
         + (select count(*) from public.bin_reports where is_demo)
         + (select count(*) from public.profiles where is_demo)
       )::int as demo_records`,
    [city],
  );

  const row = rows[0];
  const n = (value: unknown) => toNumber(value ?? 0);

  return {
    binsActive: n(row?.bins_active),
    binsInactive: n(row?.bins_inactive),
    binsVerified: n(row?.bins_verified),
    binsCommunity: n(row?.bins_community),
    binsNeedsRecheck: n(row?.bins_needs_recheck),
    binsBySource: {
      admin: n(row?.bins_source_admin),
      community: n(row?.bins_source_community),
    },
    submissionsPending: n(row?.submissions_pending),
    submissionsUnderReview: n(row?.submissions_under_review),
    submissionsApproved: n(row?.submissions_approved),
    submissionsRejected: n(row?.submissions_rejected),
    reportsOpen: n(row?.reports_open),
    reportsResolved: n(row?.reports_resolved),
    reportsByType: {
      overflowing: n(row?.reports_overflowing),
      damaged: n(row?.reports_damaged),
      missing: n(row?.reports_missing),
      other: n(row?.reports_other),
    },
    demoRecords: n(row?.demo_records),
  };
}

/** True when the database holds any synthetic record at all. */
export async function hasDemoData(): Promise<boolean> {
  const db = await getDb();
  const { rows } = await db.query<{ present: boolean }>(
    `select exists (
       select 1 from public.bins where is_demo
       union all
       select 1 from public.bin_submissions where is_demo
       union all
       select 1 from public.bin_reports where is_demo
     ) as present`,
  );
  return rows[0]?.present === true;
}

/* ----------------------------- coverage grid ------------------------------ */

export interface CoverageCell {
  cell: string;
  centerLatitude: number;
  centerLongitude: number;
  binCount: number;
  verifiedCount: number;
  openReportCount: number;
  missingReportCount: number;
  pendingSubmissionCount: number;
}

/**
 * Aggregates confirmed bins, open reports and pending proposals onto a fixed
 * grid (COVERAGE_GRID_DEG of latitude, ~500 m here).
 *
 * The grid is deliberately coarse and deliberately dumb: it reports what the
 * database contains per cell and nothing more. It does not score, rank or
 * recommend — `src/lib/analysis.ts` turns these counts into clearly-labelled
 * observations, and the page states what the data cannot show.
 */
export async function getCoverageCells(cityId: string): Promise<CoverageCell[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    cell: string;
    center_lat: number;
    center_lng: number;
    bin_count: number;
    verified_count: number;
    open_report_count: number;
    missing_report_count: number;
    pending_submission_count: number;
  }>(
    `with grid as (
       select
         floor(b.latitude / $2)::int  as row_idx,
         floor(b.longitude / $2)::int as col_idx,
         b.id,
         (b.verification_status = 'verified') as is_verified
       from public.bins b
       where b.status = 'active' and b.city_id = $1::uuid
     ),
     bin_cells as (
       select row_idx, col_idx,
              count(*)::int as bin_count,
              count(*) filter (where is_verified)::int as verified_count
         from grid group by row_idx, col_idx
     ),
     report_cells as (
       select floor(b.latitude / $2)::int as row_idx,
              floor(b.longitude / $2)::int as col_idx,
              count(*) filter (where r.status in ('submitted','reviewing','confirmed'))::int as open_report_count,
              count(*) filter (where r.report_type = 'missing')::int as missing_report_count
         from public.bin_reports r
         join public.bins b on b.id = r.bin_id
        where b.city_id = $1::uuid
        group by 1, 2
     ),
     submission_cells as (
       select floor(latitude / $2)::int as row_idx,
              floor(longitude / $2)::int as col_idx,
              count(*)::int as pending_submission_count
         from public.bin_submissions
        where status in ('pending','under_review') and city_id = $1::uuid
        group by 1, 2
     ),
     all_cells as (
       select row_idx, col_idx from bin_cells
       union select row_idx, col_idx from report_cells
       union select row_idx, col_idx from submission_cells
     )
     select
       a.row_idx || ':' || a.col_idx as cell,
       (a.row_idx + 0.5) * $2 as center_lat,
       (a.col_idx + 0.5) * $2 as center_lng,
       coalesce(bc.bin_count, 0) as bin_count,
       coalesce(bc.verified_count, 0) as verified_count,
       coalesce(rc.open_report_count, 0) as open_report_count,
       coalesce(rc.missing_report_count, 0) as missing_report_count,
       coalesce(sc.pending_submission_count, 0) as pending_submission_count
     from all_cells a
     left join bin_cells bc using (row_idx, col_idx)
     left join report_cells rc using (row_idx, col_idx)
     left join submission_cells sc using (row_idx, col_idx)
     order by bin_count desc, open_report_count desc`,
    [cityId, COVERAGE_GRID_DEG],
  );

  return rows.map((row) => ({
    cell: row.cell,
    centerLatitude: toNumber(row.center_lat),
    centerLongitude: toNumber(row.center_lng),
    binCount: toNumber(row.bin_count),
    verifiedCount: toNumber(row.verified_count),
    openReportCount: toNumber(row.open_report_count),
    missingReportCount: toNumber(row.missing_report_count),
    pendingSubmissionCount: toNumber(row.pending_submission_count),
  }));
}

/* ------------------------------ report trends ----------------------------- */

export interface TrendPoint {
  day: string;
  total: number;
  byType: Record<ReportType, number>;
}

export async function getReportTrend(cityId: string | null, days = 30): Promise<TrendPoint[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    day: unknown;
    total: number;
    overflowing: number;
    damaged: number;
    missing: number;
    other: number;
  }>(
    `select
       date_trunc('day', r.created_at) as day,
       count(*)::int as total,
       count(*) filter (where r.report_type = 'overflowing')::int as overflowing,
       count(*) filter (where r.report_type = 'damaged')::int as damaged,
       count(*) filter (where r.report_type = 'missing')::int as missing,
       count(*) filter (where r.report_type = 'other')::int as other
     from public.bin_reports r
     join public.bins b on b.id = r.bin_id
     where r.created_at > now() - ($2 || ' days')::interval
       and ($1::uuid is null or b.city_id = $1::uuid)
     group by 1
     order by 1`,
    [cityId, String(days)],
  );

  return rows.map((row) => ({
    day: new Date(String(row.day)).toISOString().slice(0, 10),
    total: toNumber(row.total),
    byType: {
      overflowing: toNumber(row.overflowing),
      damaged: toNumber(row.damaged),
      missing: toNumber(row.missing),
      other: toNumber(row.other),
    },
  }));
}

/** Bins with the most open reports — the admin "needs attention" list. */
export interface AttentionBin {
  id: string;
  latitude: number;
  longitude: number;
  description: string | null;
  openReportCount: number;
  isDemo: boolean;
}

export async function listBinsNeedingAttention(
  cityId: string | null,
  limit = 6,
): Promise<AttentionBin[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    latitude: number;
    longitude: number;
    description: string | null;
    open_count: number;
    is_demo: boolean;
  }>(
    `select b.id, b.latitude, b.longitude, b.description, b.is_demo,
            count(r.id)::int as open_count
       from public.bins b
       join public.bin_reports r on r.bin_id = b.id
      where r.status in ('submitted','reviewing','confirmed')
        and ($1::uuid is null or b.city_id = $1::uuid)
      group by b.id
      order by open_count desc, max(r.created_at) desc
      limit $2`,
    [cityId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: row.description,
    openReportCount: toNumber(row.open_count),
    isDemo: row.is_demo === true,
  }));
}
