import 'server-only';

import { getDb, transaction } from '@/lib/db/client';
import {
  mapBin,
  mapPublicBin,
  toBool,
  toIsoRequired,
  toNumber,
  type BinRow,
  type PublicBinRow,
} from '@/lib/db/mappers';
import { recordAudit } from '@/lib/db/audit';
import { resolvePhotoUrls } from '@/lib/storage';
import { NEARBY_MAX_RESULTS } from '@/lib/config';
import type {
  Bin,
  BinSource,
  BinStatus,
  BinWithContext,
  Paginated,
  PublicBin,
  ReportType,
  VerificationEvent,
  VerificationOutcome,
  VerificationStatus,
} from '@/lib/types';
import type { BoundingBox, LatLng } from '@/lib/geo';

/**
 * Reads and writes for the canonical bins table.
 *
 * Public reads go through the `PublicBin` shape, which omits the submitter, the
 * lifecycle fields and every internal note. Only `status = 'active'` rows are
 * ever returned to a public caller — inactive, removed and unapproved
 * locations exist solely inside the administration area.
 */

const PUBLIC_SELECT = `
  b.id,
  b.latitude,
  b.longitude,
  b.description,
  b.photo_path,
  b.verification_status,
  b.source,
  b.verified_at,
  b.is_demo,
  b.created_at,
  coalesce(r.open_count, 0)::int as open_report_count,
  r.last_type as last_report_type
`;

/**
 * Open reports per bin, folded in so the map can mark a bin as having a live
 * problem without a request per marker.
 */
const OPEN_REPORTS_JOIN = `
  left join (
    select
      bin_id,
      count(*)::int as open_count,
      (array_agg(report_type order by created_at desc))[1] as last_type
    from public.bin_reports
    where status in ('submitted', 'reviewing', 'confirmed')
    group by bin_id
  ) r on r.bin_id = b.id
`;

async function attachPhotoUrls(rows: PublicBinRow[]): Promise<PublicBin[]> {
  const urls = await resolvePhotoUrls(rows.map((r) => r.photo_path));
  return rows.map((row) => mapPublicBin(row, row.photo_path ? (urls.get(row.photo_path) ?? null) : null));
}

/** Every active bin in a city. Used for the initial map render. */
export async function listPublicBins(cityId?: string | null): Promise<PublicBin[]> {
  const db = await getDb();
  const { rows } = await db.query<PublicBinRow>(
    `select ${PUBLIC_SELECT}
       from public.bins b
       ${OPEN_REPORTS_JOIN}
      where b.status = 'active'
        and ($1::uuid is null or b.city_id = $1::uuid)
      order by b.created_at desc`,
    [cityId ?? null],
  );
  return attachPhotoUrls(rows);
}

/** Active bins inside a viewport. Backed by the (latitude, longitude) index. */
export async function listPublicBinsInBox(
  box: BoundingBox,
  cityId?: string | null,
  limit = 2000,
): Promise<PublicBin[]> {
  const db = await getDb();
  const { rows } = await db.query<PublicBinRow>(
    `select ${PUBLIC_SELECT}
       from public.bins b
       ${OPEN_REPORTS_JOIN}
      where b.status = 'active'
        and ($5::uuid is null or b.city_id = $5::uuid)
        and b.latitude between $1 and $2
        and b.longitude between $3 and $4
      order by b.created_at desc
      limit $6`,
    [box.minLat, box.maxLat, box.minLng, box.maxLng, cityId ?? null, limit],
  );
  return attachPhotoUrls(rows);
}

export async function getPublicBin(id: string): Promise<PublicBin | null> {
  const db = await getDb();
  const { rows } = await db.query<PublicBinRow>(
    `select ${PUBLIC_SELECT}
       from public.bins b
       ${OPEN_REPORTS_JOIN}
      where b.id = $1 and b.status = 'active'`,
    [id],
  );
  if (!rows[0]) return null;
  const [bin] = await attachPhotoUrls(rows);
  return bin ?? null;
}

export interface NearbyBin extends PublicBin {
  distanceMeters: number;
}

/**
 * Nearby search, delegated to the `binmap_bins_nearby` SQL function so the
 * bounding-box narrowing and the distance maths happen next to the data (and
 * use PostGIS where it is available).
 */
export async function findNearbyBins(
  origin: LatLng,
  radiusMeters: number,
  cityId?: string | null,
  limit = NEARBY_MAX_RESULTS,
): Promise<NearbyBin[]> {
  const db = await getDb();
  const { rows } = await db.query<PublicBinRow & { distance_m: number }>(
    `with near as (
       select * from public.binmap_bins_nearby($1, $2, $3, $4::uuid, $5)
     )
     select
       near.id, near.latitude, near.longitude, near.description, near.photo_path,
       near.verification_status, near.source, near.verified_at, near.is_demo,
       near.created_at, near.distance_m,
       coalesce(r.open_count, 0)::int as open_report_count,
       r.last_type as last_report_type
     from near
     left join (
       select bin_id, count(*)::int as open_count,
              (array_agg(report_type order by created_at desc))[1] as last_type
         from public.bin_reports
        where status in ('submitted', 'reviewing', 'confirmed')
        group by bin_id
     ) r on r.bin_id = near.id
     order by near.distance_m`,
    [origin.latitude, origin.longitude, radiusMeters, cityId ?? null, limit],
  );

  const bins = await attachPhotoUrls(rows);
  return bins.map((bin, index) => ({
    ...bin,
    distanceMeters: toNumber(rows[index]?.distance_m ?? 0),
  }));
}

export interface NearestBin {
  id: string;
  latitude: number;
  longitude: number;
  description: string | null;
  isDemo: boolean;
  distanceMeters: number;
}

/**
 * The closest existing bin to a point. Used for the duplicate warning shown
 * while submitting, and for the context an administrator sees before approving.
 */
export async function findNearestBin(
  origin: LatLng,
  radiusMeters: number,
  cityId?: string | null,
  excludeBinId?: string | null,
): Promise<NearestBin | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    latitude: number;
    longitude: number;
    description: string | null;
    is_demo: boolean;
    distance_m: number;
  }>('select * from public.binmap_nearest_bin($1, $2, $3, $4::uuid, $5::uuid)', [
    origin.latitude,
    origin.longitude,
    radiusMeters,
    cityId ?? null,
    excludeBinId ?? null,
  ]);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: row.description,
    isDemo: toBool(row.is_demo),
    distanceMeters: toNumber(row.distance_m),
  };
}

/* ------------------------------ administration ---------------------------- */

const ADMIN_BIN_COLUMNS = `b.id, b.city_id, b.latitude, b.longitude, b.description, b.photo_path,
                           b.status, b.verification_status, b.source, b.verified_by,
                           b.verified_at, b.is_demo, b.created_at, b.updated_at`;

export interface AdminBinFilter {
  cityId?: string | null;
  status?: BinStatus | 'all';
  verificationStatus?: VerificationStatus | 'all';
  source?: BinSource | 'all';
  query?: string | null;
  demoOnly?: boolean | null;
  page?: number;
  pageSize?: number;
}

export async function listBinsForAdmin(
  filter: AdminBinFilter = {},
): Promise<Paginated<BinWithContext>> {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const db = await getDb();

  const params = [
    filter.cityId ?? null,
    filter.status && filter.status !== 'all' ? filter.status : null,
    filter.verificationStatus && filter.verificationStatus !== 'all'
      ? filter.verificationStatus
      : null,
    filter.query && filter.query.trim().length > 0 ? `%${filter.query.trim()}%` : null,
    filter.demoOnly ?? null,
    filter.source && filter.source !== 'all' ? filter.source : null,
  ];

  // A text query can be a description fragment or a coordinate the operator
  // pasted out of the field notes.
  const where = `
    where ($1::uuid is null or b.city_id = $1::uuid)
      and ($2::text is null or b.status = $2::text)
      and ($3::text is null or b.verification_status = $3::text)
      and ($5::boolean is null or b.is_demo = $5::boolean)
      and ($6::text is null or b.source = $6::text)
      and ($4::text is null
           or b.description ilike $4::text
           or b.id::text ilike $4::text
           or (b.latitude::text || ',' || b.longitude::text) ilike $4::text)
  `;

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query<{ total: number }>(
      `select count(*)::int as total from public.bins b ${where}`,
      params,
    ),
    db.query<
      BinRow & { city_name: string; open_report_count: number; total_report_count: number }
    >(
      `select ${ADMIN_BIN_COLUMNS},
              c.name as city_name,
              coalesce(r.open_count, 0)::int as open_report_count,
              coalesce(r.total_count, 0)::int as total_report_count
         from public.bins b
         join public.cities c on c.id = b.city_id
         left join (
           select bin_id,
                  count(*)::int as total_count,
                  count(*) filter (where status in ('submitted','reviewing','confirmed'))::int as open_count
             from public.bin_reports group by bin_id
         ) r on r.bin_id = b.id
         ${where}
        order by b.created_at desc
        limit ${pageSize} offset ${offset}`,
      params,
    ),
  ]);

  const urls = await resolvePhotoUrls(rows.map((r) => r.photo_path));

  return {
    rows: rows.map((row) => ({
      ...mapBin(row),
      cityName: row.city_name,
      photoUrl: row.photo_path ? (urls.get(row.photo_path) ?? null) : null,
      openReportCount: toNumber(row.open_report_count),
      totalReportCount: toNumber(row.total_report_count),
    })),
    total: toNumber(countRows[0]?.total ?? 0),
    page,
    pageSize,
  };
}

export async function getBinForAdmin(id: string): Promise<BinWithContext | null> {
  const db = await getDb();
  const { rows } = await db.query<
    BinRow & { city_name: string; open_report_count: number; total_report_count: number }
  >(
    `select ${ADMIN_BIN_COLUMNS},
            c.name as city_name,
            coalesce(r.open_count, 0)::int as open_report_count,
            coalesce(r.total_count, 0)::int as total_report_count
       from public.bins b
       join public.cities c on c.id = b.city_id
       left join (
         select bin_id,
                count(*)::int as total_count,
                count(*) filter (where status in ('submitted','reviewing','confirmed'))::int as open_count
           from public.bin_reports group by bin_id
       ) r on r.bin_id = b.id
      where b.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const urls = await resolvePhotoUrls([row.photo_path]);
  return {
    ...mapBin(row),
    cityName: row.city_name,
    photoUrl: row.photo_path ? (urls.get(row.photo_path) ?? null) : null,
    openReportCount: toNumber(row.open_report_count),
    totalReportCount: toNumber(row.total_report_count),
  };
}

export interface CreateBinInput {
  cityId: string;
  latitude: number;
  longitude: number;
  description: string | null;
  verificationStatus: VerificationStatus;
  photoPath?: string | null;
  isDemo?: boolean;
  /** Recorded in the audit entry: 'admin_manual', 'csv_import', 'demo_seed'. */
  source?: string;
}

/**
 * Direct administrative entry — the path used when building the initial Qarshi
 * database from actual field verification. Writes the bin and the audit entry
 * in one transaction.
 */
export async function createBinAsAdmin(input: CreateBinInput, adminId: string): Promise<Bin> {
  const db = await getDb();
  const { rows } = await db.query<{ bin_id: string }>(
    'select public.binmap_create_bin($1, $2, $3, $4, $5, $6, $7, $8, $9) as bin_id',
    [
      input.cityId,
      adminId,
      input.latitude,
      input.longitude,
      input.description,
      input.photoPath ?? null,
      input.verificationStatus,
      input.isDemo ?? false,
      input.source ?? 'admin_manual',
    ],
  );
  const id = rows[0]?.bin_id;
  if (!id) throw new Error('bin insert returned no id');

  const created = await db.query<BinRow>('select * from public.bins where id = $1', [id]);
  const row = created.rows[0];
  if (!row) throw new Error('bin disappeared after insert');
  return mapBin(row);
}

export interface UpdateBinInput {
  latitude: number;
  longitude: number;
  description: string | null;
  status: BinStatus;
  verificationStatus: VerificationStatus;
  note?: string | null;
}

export async function updateBinAsAdmin(
  id: string,
  input: UpdateBinInput,
  adminId: string,
): Promise<Bin | null> {
  return transaction(async (tx) => {
    const before = await tx.query<BinRow>('select * from public.bins where id = $1 for update', [id]);
    const previous = before.rows[0];
    if (!previous) return null;

    const { rows } = await tx.query<BinRow>(
      `update public.bins
          set latitude = $2,
              longitude = $3,
              description = $4,
              status = $5,
              verification_status = $6,
              verified_by = case when $6 = 'verified' then $7::uuid else verified_by end,
              verified_at = case
                              when $6 = 'verified' and verification_status <> 'verified' then now()
                              when $6 <> 'verified' then null
                              else verified_at
                            end
        where id = $1
      returning *`,
      [
        id,
        input.latitude,
        input.longitude,
        input.description,
        input.status,
        input.verificationStatus,
        adminId,
      ],
    );
    const row = rows[0];
    if (!row) return null;

    // One audit entry per meaningful change, so the log reads as a history
    // rather than a stream of identical "updated" lines.
    const moved =
      toNumber(previous.latitude) !== input.latitude ||
      toNumber(previous.longitude) !== input.longitude;

    if (previous.status !== input.status) {
      await recordAudit(tx, {
        administratorId: adminId,
        action: input.status === 'active' ? 'bin.reactivated' : 'bin.deactivated',
        entityType: 'bin',
        entityId: id,
        details: { from: previous.status, to: input.status, note: input.note ?? null },
      });
    }
    if (previous.verification_status !== input.verificationStatus) {
      await recordAudit(tx, {
        administratorId: adminId,
        action: input.verificationStatus === 'verified' ? 'bin.verified' : 'bin.updated',
        entityType: 'bin',
        entityId: id,
        details: {
          verification_from: previous.verification_status,
          verification_to: input.verificationStatus,
        },
      });
    }
    if (moved || previous.description !== input.description) {
      await recordAudit(tx, {
        administratorId: adminId,
        action: 'bin.updated',
        entityType: 'bin',
        entityId: id,
        details: {
          coordinates_corrected: moved,
          from: moved
            ? { latitude: toNumber(previous.latitude), longitude: toNumber(previous.longitude) }
            : null,
          to: moved ? { latitude: input.latitude, longitude: input.longitude } : null,
          description_changed: previous.description !== input.description,
          note: input.note ?? null,
        },
      });
    }

    return mapBin(row);
  });
}

/** Reports attached to a bin, for the admin bin detail view. */
export async function countOpenReportsForBin(binId: string): Promise<number> {
  const db = await getDb();
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.bin_reports
      where bin_id = $1 and status in ('submitted','reviewing','confirmed')`,
    [binId],
  );
  return toNumber(rows[0]?.n ?? 0);
}

export interface BinReportSummary {
  reportType: ReportType;
  count: number;
}

export async function summariseReportsForBin(binId: string): Promise<BinReportSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{ report_type: ReportType; n: number }>(
    `select report_type, count(*)::int as n
       from public.bin_reports where bin_id = $1
      group by report_type order by n desc`,
    [binId],
  );
  return rows.map((r) => ({ reportType: r.report_type, count: toNumber(r.n) }));
}

/* --------------------------- verification history -------------------------- */

/**
 * Records a visit: somebody went and looked.
 *
 * This is the only way `verified_at` is ever set. The database function moves
 * the bin, writes the visit and writes the audit entry in one transaction, so
 * a bin cannot show a verification date with no visit behind it — which was
 * the whole problem with a single mutable timestamp.
 */
export async function recordVerification(input: {
  binId: string;
  adminId: string;
  outcome: VerificationOutcome;
  note: string | null;
}): Promise<string | null> {
  const db = await getDb();
  const { rows } = await db.query<{ event_id: string | null }>(
    'select public.binmap_record_verification($1, $2, $3, $4) as event_id',
    [input.binId, input.adminId, input.outcome, input.note],
  );
  return rows[0]?.event_id ?? null;
}

/** Every recorded visit to one bin, newest first. Administrators only. */
export async function listVerifications(binId: string): Promise<VerificationEvent[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    bin_id: string;
    outcome: VerificationOutcome;
    note: string | null;
    verified_by_name: string | null;
    created_at: unknown;
  }>(
    `select v.id, v.bin_id, v.outcome, v.note,
            coalesce(p.full_name, p.email) as verified_by_name, v.created_at
       from public.bin_verifications v
       left join public.profiles p on p.id = v.verified_by
      where v.bin_id = $1
      order by v.created_at desc`,
    [binId],
  );

  return rows.map((row) => ({
    id: row.id,
    binId: row.bin_id,
    outcome: row.outcome,
    note: row.note,
    verifiedByName: row.verified_by_name,
    createdAt: toIsoRequired(row.created_at),
  }));
}
