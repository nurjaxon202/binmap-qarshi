import type {
  AuditAction,
  BinSource,
  BinStatus,
  ReportStatus,
  ReportType,
  Role,
  SubmissionStatus,
  VerificationOutcome,
  VerificationStatus,
} from '@/lib/types';

/**
 * Single source of truth for user-facing Uzbek (Latin) labels.
 * Adding `ru` / `en` later means adding sibling files with the same shape and
 * selecting between them in `src/lib/i18n/index.ts`.
 */

export const LOCALE = 'uz-Latn-UZ';

export const submissionStatusLabel: Record<SubmissionStatus, string> = {
  pending: 'Tekshiruvda',
  under_review: 'Ko‘rib chiqilmoqda',
  approved: 'Tasdiqlangan',
  rejected: 'Rad etilgan',
};

/**
 * Status colour vocabulary, matching BadgeTone in the UI primitives. Colour
 * reinforces a status here; the survey texture in SurveyMark is what actually
 * carries it.
 */
export type StatusTone = 'neutral' | 'forest' | 'moss' | 'amber' | 'survey' | 'slate' | 'lime';

export const submissionStatusTone: Record<SubmissionStatus, StatusTone> = {
  pending: 'amber',
  under_review: 'slate',
  approved: 'forest',
  rejected: 'survey',
};

export const verificationOutcomeLabel: Record<VerificationOutcome, string> = {
  verified: 'Joyida tasdiqlandi',
  needs_recheck: 'Qayta tekshirish kerak deb belgilandi',
};

export const reportTypeLabel: Record<ReportType, string> = {
  overflowing: 'Quti to‘lib qolgan',
  damaged: 'Quti shikastlangan',
  missing: 'Quti bu joyda mavjud emas',
  other: 'Boshqa muammo',
};

export const reportTypeShortLabel: Record<ReportType, string> = {
  overflowing: 'To‘lib qolgan',
  damaged: 'Shikastlangan',
  missing: 'Mavjud emas',
  other: 'Boshqa',
};

export const reportTypeHint: Record<ReportType, string> = {
  overflowing: 'Quti to‘lgan, chiqindi atrofga to‘kilgan.',
  damaged: 'Quti singan, qopqog‘i yo‘q yoki foydalanib bo‘lmaydi.',
  missing: 'Xaritada ko‘rsatilgan joyda quti topilmadi.',
  other: 'Yuqoridagilarga mos kelmaydigan boshqa holat.',
};

export const reportStatusLabel: Record<ReportStatus, string> = {
  submitted: 'Yuborilgan',
  reviewing: 'Ko‘rib chiqilmoqda',
  confirmed: 'Tasdiqlangan',
  rejected: 'Rad etilgan',
  resolved: 'Hal qilingan',
};

export const reportStatusTone: Record<ReportStatus, StatusTone> = {
  submitted: 'amber',
  reviewing: 'slate',
  confirmed: 'survey',
  rejected: 'neutral',
  resolved: 'moss',
};

/**
 * How confident we are about a location. Since `BinSource` now carries who
 * entered it, the middle state is named for what it means — not yet checked on
 * site — rather than for who sent it.
 */
export const verificationStatusLabel: Record<VerificationStatus, string> = {
  verified: 'Joyida tekshirilgan',
  community: 'Tekshirilmagan',
  needs_recheck: 'Qayta tekshirish kerak',
};

/** Who put the location on the map. */
export const binSourceLabel: Record<BinSource, string> = {
  admin: 'Administrator kiritgan',
  community: 'Foydalanuvchi yuborgan',
};

export const binSourceShortLabel: Record<BinSource, string> = {
  admin: 'Administrator',
  community: 'Foydalanuvchi',
};

export const binSourceHint: Record<BinSource, string> = {
  admin: 'Bu joylashuvni BinMap administratori kiritgan.',
  community: 'Bu joylashuvni shahar aholisidan biri yuborgan va moderator tasdiqlagan.',
};

export const binSourceTone: Record<BinSource, StatusTone> = {
  admin: 'forest',
  community: 'neutral',
};

export const verificationStatusShortLabel: Record<VerificationStatus, string> = {
  verified: 'Tekshirilgan',
  community: 'Tekshirilmagan',
  needs_recheck: 'Shubhali',
};

export const verificationStatusHint: Record<VerificationStatus, string> = {
  verified: 'Bu joylashuv joyida ko‘rib chiqilgan va tasdiqlangan.',
  community: 'Joylashuv xaritaga qo‘shilgan, lekin hali joyida tekshirilmagan.',
  needs_recheck: 'Kelgan xabarlar bu joylashuvga shubha tug‘dirmoqda — tekshirish kutilmoqda.',
};

export const verificationStatusTone: Record<VerificationStatus, StatusTone> = {
  verified: 'forest',
  community: 'moss',
  needs_recheck: 'amber',
};

export const reportTypeTone: Record<ReportType, StatusTone> = {
  overflowing: 'amber',
  damaged: 'survey',
  missing: 'slate',
  other: 'neutral',
};

export const binStatusLabel: Record<BinStatus, string> = {
  active: 'Faol',
  inactive: 'Faol emas',
  removed: 'Olib tashlangan',
};

export const roleLabel: Record<Role, string> = {
  user: 'Foydalanuvchi',
  admin: 'Moderator',
};

export const auditActionLabel: Record<AuditAction, string> = {
  'submission.approved': 'Taklif tasdiqlandi',
  'submission.rejected': 'Taklif rad etildi',
  'submission.review_started': 'Taklif ko‘rib chiqishga olindi',
  'submission.note_added': 'Taklifga izoh qo‘shildi',
  'bin.created': 'Yangi quti qo‘shildi',
  'bin.updated': 'Quti ma’lumotlari o‘zgartirildi',
  'bin.deactivated': 'Quti faolsizlantirildi',
  'bin.reactivated': 'Quti qayta faollashtirildi',
  'bin.verified': 'Quti joyida tekshirildi',
  'bin.flagged_for_recheck': 'Quti qayta tekshirishga belgilandi',
  'report.status_changed': 'Xabar holati o‘zgartirildi',
  'report.resolved': 'Xabar hal qilindi',
  'report.note_added': 'Xabarga izoh qo‘shildi',
  'profile.role_changed': 'Foydalanuvchi roli o‘zgartirildi',
  'bins.imported': 'Qutilar import qilindi',
};

/* ------------------------------- date & time ------------------------------ */

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${UZ_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(iso)}, ${hh}:${mm}`;
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const min = Math.round((now - d.getTime()) / 60000);
  // The seeded demonstration timeline runs to a fixed end date, which can sit
  // ahead of the clock. Say so rather than calling a future date "hozir".
  if (min < -60) return formatDate(iso);
  if (min < 1) return 'hozir';
  if (min < 60) return `${min} daqiqa oldin`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return formatDate(iso);
}
