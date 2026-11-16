import { z } from 'zod';
import { NEARBY_MAX_RADIUS_M } from '@/lib/config';

/**
 * All untrusted input crosses one of these schemas before it reaches the data
 * layer. Messages are the ones the user reads, so they are in Uzbek.
 */

/** Deliberately permissive but structural — we never guess at deliverability. */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const emailSchema = z
  .string()
  .trim()
  .min(3, { message: 'Elektron pochta manzilini kiriting.' })
  .max(254, { message: 'Elektron pochta manzili juda uzun.' })
  .toLowerCase()
  .refine((v) => EMAIL_RE.test(v), { message: 'Elektron pochta manzili noto‘g‘ri.' });

export const passwordSchema = z
  .string()
  .min(8, { message: 'Parol kamida 8 belgidan iborat bo‘lishi kerak.' })
  .max(200, { message: 'Parol juda uzun.' });

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, { message: 'Ismingizni kiriting.' })
  .max(80, { message: 'Ism juda uzun.' });

export const latitudeSchema = z.coerce
  .number({ message: 'Kenglik (latitude) raqam bo‘lishi kerak.' })
  .refine((v) => Number.isFinite(v) && v >= -90 && v <= 90, {
    message: 'Kenglik -90 va 90 oralig‘ida bo‘lishi kerak.',
  });

export const longitudeSchema = z.coerce
  .number({ message: 'Uzunlik (longitude) raqam bo‘lishi kerak.' })
  .refine((v) => Number.isFinite(v) && v >= -180 && v <= 180, {
    message: 'Uzunlik -180 va 180 oralig‘ida bo‘lishi kerak.',
  });

const descriptionSchema = z
  .string()
  .trim()
  .max(500, { message: 'Izoh 500 belgidan oshmasligi kerak.' });

/**
 * An optional free-text field.
 *
 * `formData.get()` yields null for a field that was not submitted and '' for an
 * empty one, so both have to be accepted; `.optional()` alone covers neither.
 */
const optionalDescription = z
  .union([descriptionSchema, z.literal('')])
  .nullish()
  .transform((v) => (v && v.length > 0 ? v : null));

/**
 * An HTML checkbox: present with its value when ticked, absent entirely when
 * not. Accepts null, undefined, the browser default 'on', and real booleans.
 */
const checkboxSchema = z
  .union([z.boolean(), z.string()])
  .nullish()
  .transform((v) => v === true || v === 'true' || v === 'on');

/* --------------------------------- auth ---------------------------------- */

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: fullNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Parolni kiriting.' }),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetSchema = z
  .object({
    token: z.string().min(10, { message: 'Havola yaroqsiz.' }),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: 'Parollar bir-biriga mos kelmadi.',
    path: ['passwordConfirm'],
  });

export const profileUpdateSchema = z.object({
  fullName: fullNameSchema,
});

/* ------------------------------ submissions ------------------------------ */

export const binSubmissionSchema = z.object({
  citySlug: z.string().trim().min(1).max(60),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  description: optionalDescription,
  /** The user saw a duplicate warning and chose to continue anyway. */
  acknowledgedDuplicate: checkboxSchema,
});

export type BinSubmissionInput = z.infer<typeof binSubmissionSchema>;

export const submissionReviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'start_review']),
    note: optionalDescription,
    /** Admins may correct the coordinates while approving. */
    latitude: z.union([latitudeSchema, z.literal('')]).nullish(),
    longitude: z.union([longitudeSchema, z.literal('')]).nullish(),
    description: optionalDescription,
    markVerified: checkboxSchema,
  })
  .refine((v) => v.decision !== 'reject' || (v.note !== null && v.note.length >= 3), {
    message: 'Rad etish sababini yozing.',
    path: ['note'],
  });

/* -------------------------------- reports -------------------------------- */

export const reportTypeSchema = z.enum(['overflowing', 'damaged', 'missing', 'other']);

export const binReportSchema = z
  .object({
    binId: z.string().trim().min(1, { message: 'Quti tanlanmagan.' }),
    reportType: reportTypeSchema,
    description: optionalDescription,
  })
  .refine((v) => v.reportType !== 'other' || (v.description !== null && v.description.length >= 5), {
    message: 'Boshqa muammo uchun izoh yozish shart.',
    path: ['description'],
  });

export const verificationSchema = z.object({
  binId: z.string().trim().min(1, { message: 'Quti tanlanmagan.' }),
  outcome: z.enum(['verified', 'needs_recheck']),
  note: optionalDescription,
});

export const reportReviewSchema = z.object({
  status: z.enum(['submitted', 'reviewing', 'confirmed', 'rejected', 'resolved']),
  adminNote: optionalDescription,
});

/* ---------------------------- bin administration -------------------------- */

export const adminBinCreateSchema = z.object({
  citySlug: z.string().trim().min(1).max(60),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  description: optionalDescription,
  verificationStatus: z.enum(['verified', 'community', 'needs_recheck']),
});

export const adminBinUpdateSchema = z.object({
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  description: optionalDescription,
  status: z.enum(['active', 'inactive', 'removed']),
  verificationStatus: z.enum(['verified', 'community', 'needs_recheck']),
  note: optionalDescription,
});

/* --------------------------------- queries -------------------------------- */

export const nearbyQuerySchema = z.object({
  lat: latitudeSchema,
  lng: longitudeSchema,
  radius: z.coerce
    .number()
    .refine((v) => Number.isFinite(v) && v > 0 && v <= NEARBY_MAX_RADIUS_M, {
      message: 'Radius juda katta.',
    })
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const bboxQuerySchema = z.object({
  minLat: latitudeSchema,
  maxLat: latitudeSchema,
  minLng: longitudeSchema,
  maxLng: longitudeSchema,
  city: z.string().trim().max(60).optional(),
});

export const geocodeQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, { message: 'Kamida 2 belgi kiriting.' })
    .max(120, { message: 'Qidiruv matni juda uzun.' }),
  city: z.string().trim().max(60).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/* --------------------------------- helpers -------------------------------- */

export interface FieldErrors {
  [field: string]: string;
}

/** Flattens a Zod failure into `{ field: firstMessage }` for form rendering. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Reads a plain object out of FormData (string values only). */
export function formDataToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
