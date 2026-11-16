import type { FieldErrors } from '@/lib/validation';

/**
 * Shared shapes for `useActionState` forms.
 *
 * Kept out of the action modules because a 'use server' file may only export
 * async functions — a constant or a class there is a build error.
 */

export interface AuthFormState {
  ok: boolean;
  errors: FieldErrors;
  notice?: string | null;
  /** Local-driver password reset link, shown when no mail provider exists. */
  devLink?: string | null;
}

export const emptyAuthState: AuthFormState = { ok: false, errors: {} };

export interface SubmissionFormState {
  ok: boolean;
  errors: FieldErrors;
  notice?: string | null;
  /** Set when the coordinates are close to an existing bin. */
  duplicateWarning?: {
    distanceMeters: number;
    description: string | null;
    isDemo: boolean;
  } | null;
  submissionId?: string | null;
}

export const emptySubmissionState: SubmissionFormState = { ok: false, errors: {} };

export interface ReportFormState {
  ok: boolean;
  errors: FieldErrors;
  notice?: string | null;
  reportId?: string | null;
}

export const emptyReportState: ReportFormState = { ok: false, errors: {} };

export interface AdminFormState {
  ok: boolean;
  errors: FieldErrors;
  notice?: string | null;
}

export const emptyAdminState: AdminFormState = { ok: false, errors: {} };
