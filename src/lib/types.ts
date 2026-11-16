/**
 * BinMap Qarshi — core domain types.
 *
 * Internal identifiers stay in English; everything the user sees is translated
 * through `src/lib/i18n`.
 */

export type Role = 'user' | 'admin';

/** Lifecycle of a canonical bin record. */
export type BinStatus = 'active' | 'inactive' | 'removed';

/**
 * How much we actually know about a canonical bin.
 * `verified`        — somebody we trust confirmed it on site.
 * `community`       — approved from a user submission, not re-checked on site.
 * `needs_recheck`   — a report casts doubt on it; waiting for verification.
 */
export type VerificationStatus = 'verified' | 'community' | 'needs_recheck';

/**
 * Where a location came from — who put it on the map.
 *
 * Deliberately separate from `VerificationStatus`, which says how confident we
 * are. An administrator's field survey and a resident's submission are
 * different facts about provenance, and both are shown.
 */
export type BinSource = 'admin' | 'community';

export type SubmissionStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export type ReportType = 'overflowing' | 'damaged' | 'missing' | 'other';

export type ReportStatus = 'submitted' | 'reviewing' | 'confirmed' | 'rejected' | 'resolved';

/** What a moderator found when they went and looked at a bin. */
export type VerificationOutcome = 'verified' | 'needs_recheck';

export type AuditAction =
  | 'submission.approved'
  | 'submission.rejected'
  | 'submission.review_started'
  | 'submission.note_added'
  | 'bin.created'
  | 'bin.updated'
  | 'bin.deactivated'
  | 'bin.reactivated'
  | 'bin.verified'
  | 'bin.flagged_for_recheck'
  | 'report.status_changed'
  | 'report.resolved'
  | 'report.note_added'
  | 'profile.role_changed'
  | 'bins.imported';

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  createdAt: string;
}

/**
 * The rectangle the map is allowed to show. An urban extent covering the
 * built-up area — not an official municipal boundary, and never presented as
 * one.
 */
export interface MapExtent {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export interface City {
  id: string;
  slug: string;
  name: string;
  region: string;
  country: string;
  centerLatitude: number;
  centerLongitude: number;
  defaultZoom: number;
  extent: MapExtent | null;
  isActive: boolean;
  createdAt: string;
}

export interface Bin {
  id: string;
  cityId: string;
  latitude: number;
  longitude: number;
  description: string | null;
  photoPath: string | null;
  status: BinStatus;
  verificationStatus: VerificationStatus;
  source: BinSource;
  verifiedBy: string | null;
  verifiedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A bin as exposed to the public map — no private fields. */
export interface PublicBin {
  id: string;
  latitude: number;
  longitude: number;
  description: string | null;
  photoUrl: string | null;
  verificationStatus: VerificationStatus;
  source: BinSource;
  verifiedAt: string | null;
  isDemo: boolean;
  openReportCount: number;
  lastReportType: ReportType | null;
  createdAt: string;
}

export interface BinSubmission {
  id: string;
  cityId: string;
  submittedBy: string | null;
  latitude: number;
  longitude: number;
  description: string | null;
  photoPath: string | null;
  status: SubmissionStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  resultingBinId: string | null;
  isDemo: boolean;
  createdAt: string;
  reviewedAt: string | null;
}

export interface BinReport {
  id: string;
  binId: string;
  submittedBy: string | null;
  reportType: ReportType;
  description: string | null;
  photoPath: string | null;
  status: ReportStatus;
  reviewedBy: string | null;
  adminNote: string | null;
  isDemo: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminAuditEntry {
  id: string;
  administratorId: string | null;
  action: AuditAction;
  entityType: 'bin' | 'bin_submission' | 'bin_report' | 'profile';
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

/* ---------- joined / derived shapes used by the dashboards ---------- */

export interface SubmissionWithContext extends BinSubmission {
  submitterEmail: string | null;
  reviewerEmail: string | null;
  cityName: string;
  photoUrl: string | null;
}

export interface ReportWithContext extends BinReport {
  submitterEmail: string | null;
  reviewerEmail: string | null;
  photoUrl: string | null;
  bin: {
    id: string;
    latitude: number;
    longitude: number;
    description: string | null;
    status: BinStatus;
    verificationStatus: VerificationStatus;
  } | null;
}

export interface BinWithContext extends Bin {
  cityName: string;
  photoUrl: string | null;
  openReportCount: number;
  totalReportCount: number;
}

export interface SourceBreakdown {
  admin: number;
  community: number;
}

export interface DashboardStats {
  binsActive: number;
  /** Counted from public.bins, never hard-coded. */
  binsBySource: SourceBreakdown;
  binsInactive: number;
  binsVerified: number;
  binsCommunity: number;
  binsNeedsRecheck: number;
  submissionsPending: number;
  submissionsUnderReview: number;
  submissionsApproved: number;
  submissionsRejected: number;
  reportsOpen: number;
  reportsResolved: number;
  reportsByType: Record<ReportType, number>;
  demoRecords: number;
}

/** One recorded visit to a bin. */
export interface VerificationEvent {
  id: string;
  binId: string;
  outcome: VerificationOutcome;
  note: string | null;
  verifiedByName: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
}
