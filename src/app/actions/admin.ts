'use server';

import { revalidatePath } from 'next/cache';

import { getAdminOrNull } from '@/lib/auth';
import { getCityBySlug } from '@/lib/db/cities';
import { createBinAsAdmin, recordVerification, updateBinAsAdmin } from '@/lib/db/bins';
import {
  approveSubmission,
  rejectSubmission,
  setSubmissionInternalNote,
  startSubmissionReview,
} from '@/lib/db/submissions';
import { reviewReport } from '@/lib/db/reports';
import { setRole } from '@/lib/db/profiles';
import {
  adminBinCreateSchema,
  adminBinUpdateSchema,
  fieldErrors,
  reportReviewSchema,
  submissionReviewSchema,
  verificationSchema,
} from '@/lib/validation';
import type { AdminFormState } from '@/app/actions/form-state';
import type { Role } from '@/lib/types';

/**
 * Administrative actions.
 *
 * Every one of these begins by reading the role out of public.profiles for the
 * current session. That check is the boundary — not the absence of a button,
 * and not a value passed in from the client. The RLS policies in
 * supabase/migrations/0002 enforce the same rules independently at the
 * database, so neither layer relies on the other.
 */

const FORBIDDEN: AdminFormState = {
  ok: false,
  errors: { _form: 'Bu amalni bajarish huquqingiz yo‘q.' },
};

function refreshAdminViews(...extra: string[]) {
  revalidatePath('/boshqaruv');
  revalidatePath('/boshqaruv/takliflar');
  revalidatePath('/boshqaruv/xabarlar');
  revalidatePath('/boshqaruv/qutilar');
  revalidatePath('/boshqaruv/jurnal');
  revalidatePath('/xarita');
  revalidatePath('/tahlil');
  revalidatePath('/');
  for (const path of extra) revalidatePath(path);
}

/* ---------------------------- submission review --------------------------- */

export async function reviewSubmissionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const submissionId = String(formData.get('submissionId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
    return { ok: false, errors: { _form: 'Taklif topilmadi.' } };
  }

  const parsed = submissionReviewSchema.safeParse({
    decision: formData.get('decision'),
    note: formData.get('note'),
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    description: formData.get('description'),
    markVerified: formData.get('markVerified'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  try {
    if (parsed.data.decision === 'start_review') {
      const started = await startSubmissionReview(submissionId, admin.id);
      if (!started) {
        return { ok: false, errors: { _form: 'Taklif allaqachon ko‘rib chiqilgan.' } };
      }
      refreshAdminViews(`/boshqaruv/takliflar/${submissionId}`);
      return { ok: true, errors: {}, notice: 'Taklif ko‘rib chiqishga olindi.' };
    }

    if (parsed.data.decision === 'reject') {
      const rejected = await rejectSubmission(submissionId, admin.id, parsed.data.note ?? '');
      if (!rejected) {
        return { ok: false, errors: { _form: 'Taklifni rad etib bo‘lmadi.' } };
      }
      refreshAdminViews(`/boshqaruv/takliflar/${submissionId}`, '/hisobim');
      return { ok: true, errors: {}, notice: 'Taklif rad etildi.' };
    }

    // Approve: creates the canonical bin, links the submission to it and
    // writes the audit entry in one database transaction.
    const { binId } = await approveSubmission(submissionId, admin.id, {
      latitude: typeof parsed.data.latitude === 'number' ? parsed.data.latitude : null,
      longitude: typeof parsed.data.longitude === 'number' ? parsed.data.longitude : null,
      description: parsed.data.description,
      note: parsed.data.note,
      markVerified: parsed.data.markVerified,
    });

    refreshAdminViews(`/boshqaruv/takliflar/${submissionId}`, '/hisobim');
    return {
      ok: true,
      errors: {},
      notice: `Taklif tasdiqlandi va xaritaga qo‘shildi (${binId.slice(0, 8)}).`,
    };
  } catch (error) {
    console.error('[binmap] submission review failed', error);
    const message =
      error instanceof Error && /already approved|allaqachon/i.test(error.message)
        ? 'Bu taklif allaqachon tasdiqlangan.'
        : 'Amalni bajarib bo‘lmadi. Keyinroq urinib ko‘ring.';
    return { ok: false, errors: { _form: message } };
  }
}

export async function setSubmissionNoteAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const submissionId = String(formData.get('submissionId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
    return { ok: false, errors: { _form: 'Taklif topilmadi.' } };
  }

  const raw = String(formData.get('internalNote') ?? '').trim();
  if (raw.length > 1000) {
    return { ok: false, errors: { internalNote: 'Izoh 1000 belgidan oshmasligi kerak.' } };
  }

  await setSubmissionInternalNote(submissionId, admin.id, raw.length > 0 ? raw : null);
  revalidatePath(`/boshqaruv/takliflar/${submissionId}`);
  revalidatePath('/boshqaruv/jurnal');

  return { ok: true, errors: {}, notice: 'Ichki izoh saqlandi.' };
}

/* ------------------------------ report review ----------------------------- */

export async function reviewReportAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const reportId = String(formData.get('reportId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) {
    return { ok: false, errors: { _form: 'Xabar topilmadi.' } };
  }

  const parsed = reportReviewSchema.safeParse({
    status: formData.get('status'),
    adminNote: formData.get('adminNote'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const updated = await reviewReport(reportId, admin.id, {
    status: parsed.data.status,
    adminNote: parsed.data.adminNote,
  });
  if (!updated) {
    return { ok: false, errors: { _form: 'Xabar holatini o‘zgartirib bo‘lmadi.' } };
  }

  refreshAdminViews(`/boshqaruv/xabarlar/${reportId}`, '/hisobim');
  return { ok: true, errors: {}, notice: 'Xabar holati yangilandi.' };
}

/* ----------------------------- bin administration ------------------------- */

export async function createBinAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const parsed = adminBinCreateSchema.safeParse({
    citySlug: formData.get('citySlug'),
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    description: formData.get('description'),
    verificationStatus: formData.get('verificationStatus'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const city = await getCityBySlug(parsed.data.citySlug);
  if (!city) return { ok: false, errors: { _form: 'Shahar topilmadi.' } };

  try {
    const bin = await createBinAsAdmin(
      {
        cityId: city.id,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        description: parsed.data.description,
        verificationStatus: parsed.data.verificationStatus,
        // An administrator adding a bin by hand is adding real infrastructure.
        // Demonstration records only ever come from the seeder.
        isDemo: false,
      },
      admin.id,
    );

    refreshAdminViews(`/boshqaruv/qutilar/${bin.id}`);
    return { ok: true, errors: {}, notice: 'Quti xaritaga qo‘shildi.' };
  } catch (error) {
    console.error('[binmap] bin create failed', error);
    const duplicate =
      error instanceof Error && /duplicate key|bins_coord_unique/i.test(error.message);
    return {
      ok: false,
      errors: {
        _form: duplicate
          ? 'Bu koordinatalarda allaqachon quti mavjud.'
          : 'Qutini qo‘shib bo‘lmadi.',
      },
    };
  }
}

export async function updateBinAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const binId = String(formData.get('binId') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(binId)) {
    return { ok: false, errors: { _form: 'Quti topilmadi.' } };
  }

  const parsed = adminBinUpdateSchema.safeParse({
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    description: formData.get('description'),
    status: formData.get('status'),
    verificationStatus: formData.get('verificationStatus'),
    note: formData.get('note'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  try {
    const updated = await updateBinAsAdmin(binId, parsed.data, admin.id);
    if (!updated) return { ok: false, errors: { _form: 'Quti topilmadi.' } };

    refreshAdminViews(`/boshqaruv/qutilar/${binId}`);
    return { ok: true, errors: {}, notice: 'Quti ma’lumotlari saqlandi.' };
  } catch (error) {
    console.error('[binmap] bin update failed', error);
    const duplicate =
      error instanceof Error && /duplicate key|bins_coord_unique/i.test(error.message);
    return {
      ok: false,
      errors: {
        _form: duplicate
          ? 'Bu koordinatalarda boshqa quti mavjud.'
          : 'O‘zgarishlarni saqlab bo‘lmadi.',
      },
    };
  }
}

/* -------------------------------- user roles ------------------------------ */

export async function setUserRoleAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(userId) || (role !== 'user' && role !== 'admin')) {
    return { ok: false, errors: { _form: 'Noto‘g‘ri so‘rov.' } };
  }

  const result = await setRole(userId, role as Role, admin.id);
  if (!result.ok) {
    return { ok: false, errors: { _form: result.error } };
  }

  revalidatePath('/boshqaruv/foydalanuvchilar');
  revalidatePath('/boshqaruv/jurnal');
  return { ok: true, errors: {}, notice: 'Rol yangilandi.' };
}

/* ---------------------------- field verification -------------------------- */

/**
 * Records that somebody went and looked at a bin.
 *
 * This is the only path that sets a bin's last-checked date. An ordinary
 * account cannot reach it: the role is read from the session here, the RLS
 * policies refuse the write independently, and the database function stamps
 * the date itself rather than accepting one — so no caller can claim a bin
 * was checked on a day nobody visited it.
 */
export async function recordVerificationAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const admin = await getAdminOrNull();
  if (!admin) return FORBIDDEN;

  const parsed = verificationSchema.safeParse({
    binId: formData.get('binId'),
    outcome: formData.get('outcome'),
    note: formData.get('note'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const eventId = await recordVerification({
    binId: parsed.data.binId,
    adminId: admin.id,
    outcome: parsed.data.outcome,
    note: parsed.data.note,
  });
  if (!eventId) {
    return { ok: false, errors: { _form: 'Quti topilmadi.' } };
  }

  revalidatePath(`/boshqaruv/qutilar/${parsed.data.binId}`);
  revalidatePath('/boshqaruv/qutilar');
  revalidatePath('/boshqaruv/jurnal');
  revalidatePath('/boshqaruv');
  revalidatePath('/xarita');

  return {
    ok: true,
    errors: {},
    notice:
      parsed.data.outcome === 'verified'
        ? 'Tekshiruv qayd etildi. Quti joyida tasdiqlangan deb belgilandi.'
        : 'Tekshiruv qayd etildi. Quti qayta tekshirish uchun belgilandi.',
  };
}
