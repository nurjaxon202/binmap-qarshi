import type {
  AdminAuditEntry,
  AuditAction,
  Bin,
  BinSource,
  BinReport,
  BinStatus,
  BinSubmission,
  City,
  Profile,
  PublicBin,
  ReportStatus,
  ReportType,
  Role,
  SubmissionStatus,
  VerificationStatus,
} from '@/lib/types';

/**
 * Row shapes to domain objects.
 *
 * Both PostgreSQL clients hand back `Date` objects for timestamptz; the rest of
 * the app works in ISO strings so values can cross the server/client boundary
 * without serialisation surprises.
 */

export function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export function toIsoRequired(value: unknown): string {
  return toIso(value) ?? new Date(0).toISOString();
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

export function toBool(value: unknown): boolean {
  return value === true || value === 't' || value === 1 || value === '1';
}

/* ---------------------------------- rows ---------------------------------- */

export interface CityRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  country: string;
  center_latitude: number;
  center_longitude: number;
  default_zoom: number;
  min_latitude: number | null;
  max_latitude: number | null;
  min_longitude: number | null;
  max_longitude: number | null;
  is_active: boolean;
  created_at: unknown;
}

export function mapCity(row: CityRow): City {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: row.region,
    country: row.country,
    centerLatitude: toNumber(row.center_latitude),
    centerLongitude: toNumber(row.center_longitude),
    defaultZoom: toNumber(row.default_zoom),
    extent:
      row.min_latitude != null &&
      row.max_latitude != null &&
      row.min_longitude != null &&
      row.max_longitude != null
        ? {
            minLatitude: toNumber(row.min_latitude),
            maxLatitude: toNumber(row.max_latitude),
            minLongitude: toNumber(row.min_longitude),
            maxLongitude: toNumber(row.max_longitude),
          }
        : null,
    isActive: toBool(row.is_active),
    createdAt: toIsoRequired(row.created_at),
  };
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_demo?: boolean;
  created_at: unknown;
}

export function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: toIsoRequired(row.created_at),
  };
}

export interface BinRow {
  id: string;
  city_id: string;
  latitude: number;
  longitude: number;
  description: string | null;
  photo_path: string | null;
  status: BinStatus;
  verification_status: VerificationStatus;
  source: BinSource;
  verified_by: string | null;
  verified_at: unknown;
  is_demo: boolean;
  created_at: unknown;
  updated_at: unknown;
}

export function mapBin(row: BinRow): Bin {
  return {
    id: row.id,
    cityId: row.city_id,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: row.description,
    photoPath: row.photo_path,
    status: row.status,
    verificationStatus: row.verification_status,
    source: row.source,
    verifiedBy: row.verified_by,
    verifiedAt: toIso(row.verified_at),
    isDemo: toBool(row.is_demo),
    createdAt: toIsoRequired(row.created_at),
    updatedAt: toIsoRequired(row.updated_at),
  };
}

export interface PublicBinRow {
  id: string;
  latitude: number;
  longitude: number;
  description: string | null;
  photo_path: string | null;
  verification_status: VerificationStatus;
  source: BinSource;
  verified_at: unknown;
  is_demo: boolean;
  created_at: unknown;
  open_report_count?: number;
  last_report_type?: ReportType | null;
  distance_m?: number;
}

/**
 * Deliberately narrow: no submitter, no internal notes, no city id, no
 * lifecycle fields. This is the only bin shape that reaches the browser for
 * anonymous visitors.
 */
export function mapPublicBin(row: PublicBinRow, photoUrl: string | null = null): PublicBin {
  return {
    id: row.id,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: row.description,
    photoUrl,
    verificationStatus: row.verification_status,
    source: row.source,
    verifiedAt: toIso(row.verified_at),
    isDemo: toBool(row.is_demo),
    openReportCount: toNumber(row.open_report_count ?? 0),
    lastReportType: row.last_report_type ?? null,
    createdAt: toIsoRequired(row.created_at),
  };
}

export interface SubmissionRow {
  id: string;
  city_id: string;
  submitted_by: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  photo_path: string | null;
  status: SubmissionStatus;
  reviewed_by: string | null;
  review_note: string | null;
  internal_note?: string | null;
  resulting_bin_id: string | null;
  is_demo: boolean;
  created_at: unknown;
  reviewed_at: unknown;
}

export function mapSubmission(row: SubmissionRow): BinSubmission {
  return {
    id: row.id,
    cityId: row.city_id,
    submittedBy: row.submitted_by,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    description: row.description,
    photoPath: row.photo_path,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewNote: row.review_note,
    resultingBinId: row.resulting_bin_id,
    isDemo: toBool(row.is_demo),
    createdAt: toIsoRequired(row.created_at),
    reviewedAt: toIso(row.reviewed_at),
  };
}

export interface ReportRow {
  id: string;
  bin_id: string;
  submitted_by: string | null;
  report_type: ReportType;
  description: string | null;
  photo_path: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  admin_note?: string | null;
  is_demo: boolean;
  created_at: unknown;
  resolved_at: unknown;
}

/**
 * `adminNote` is only populated when the caller is an administrator — see
 * `includeAdminNote`. The database also revokes the column from the API roles.
 */
export function mapReport(row: ReportRow, includeAdminNote = false): BinReport {
  return {
    id: row.id,
    binId: row.bin_id,
    submittedBy: row.submitted_by,
    reportType: row.report_type,
    description: row.description,
    photoPath: row.photo_path,
    status: row.status,
    reviewedBy: row.reviewed_by,
    adminNote: includeAdminNote ? (row.admin_note ?? null) : null,
    isDemo: toBool(row.is_demo),
    createdAt: toIsoRequired(row.created_at),
    resolvedAt: toIso(row.resolved_at),
  };
}

export interface AuditRow {
  id: string;
  administrator_id: string | null;
  action: string;
  entity_type: 'bin' | 'bin_submission' | 'bin_report' | 'profile';
  entity_id: string | null;
  details: unknown;
  created_at: unknown;
}

export function mapAudit(row: AuditRow): AdminAuditEntry {
  let details: Record<string, unknown> | null = null;
  if (row.details && typeof row.details === 'object') {
    details = row.details as Record<string, unknown>;
  } else if (typeof row.details === 'string') {
    try {
      details = JSON.parse(row.details) as Record<string, unknown>;
    } catch {
      details = null;
    }
  }
  return {
    id: row.id,
    administratorId: row.administrator_id,
    action: row.action as AuditAction,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details,
    createdAt: toIsoRequired(row.created_at),
  };
}
