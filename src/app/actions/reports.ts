'use server';

import { revalidatePath } from 'next/cache';

import { rateLimits } from '@/lib/config';
import { getSessionUser } from '@/lib/auth';
import { getPublicBin } from '@/lib/db/bins';
import { countRecentReportsForBinByUser, createReport } from '@/lib/db/reports';
import { checkRateLimit, formatRetryAfter } from '@/lib/db/rate-limit';
import { getStorage, storeUploadedImage } from '@/lib/storage';
import { binReportSchema, fieldErrors } from '@/lib/validation';
import type { ReportFormState } from '@/app/actions/form-state';

/**
 * Filing a problem report against an existing bin.
 *
 * Two different limits apply, for two different reasons: a global hourly cap
 * stops bulk submission, and a per-bin cap stops one person filing the same
 * complaint repeatedly. Neither blocks a genuine second report — a different
 * problem at the same bin, or the same problem a day later still gets through.
 *
 * Filing a report never changes a bin's existence. A "missing" report flags it
 * for re-verification, which an administrator then investigates.
 */
export async function submitReportAction(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, errors: { _form: 'Xabar yuborish uchun tizimga kiring.' } };
  }

  const parsed = binReportSchema.safeParse({
    binId: formData.get('binId'),
    reportType: formData.get('reportType'),
    description: formData.get('description'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const bin = await getPublicBin(parsed.data.binId);
  if (!bin) {
    return { ok: false, errors: { _form: 'Quti topilmadi yoki u xaritadan olib tashlangan.' } };
  }

  const [hourly, perBin] = await Promise.all([
    checkRateLimit('report', user.id, rateLimits.report),
    countRecentReportsForBinByUser(user.id, bin.id, rateLimits.reportPerBin.windowMs),
  ]);

  if (!hourly.allowed) {
    return {
      ok: false,
      errors: {
        _form: `Juda ko‘p xabar yubordingiz. ${formatRetryAfter(hourly.retryAfterSeconds)} dan keyin davom eting.`,
      },
    };
  }
  if (perBin >= rateLimits.reportPerBin.max) {
    return {
      ok: false,
      errors: {
        _form:
          'Bu quti haqida yaqinda bir necha bor xabar yuborgansiz. Moderator ularni ko‘rib chiqmoqda.',
      },
    };
  }

  const upload = await storeUploadedImage(formData.get('photo'), 'reports');
  if (upload.error) {
    return { ok: false, errors: { photo: upload.error } };
  }

  try {
    const report = await createReport({
      binId: bin.id,
      submittedBy: user.id,
      reportType: parsed.data.reportType,
      description: parsed.data.description,
      photoPath: upload.path,
    });

    revalidatePath('/hisobim');
    revalidatePath('/boshqaruv');
    revalidatePath('/xarita');

    return {
      ok: true,
      errors: {},
      reportId: report.id,
      notice:
        parsed.data.reportType === 'missing'
          ? 'Xabaringiz yuborildi. Quti o‘chirilmaydi — u qayta tekshirish uchun belgilandi.'
          : 'Xabaringiz yuborildi. Moderator uni ko‘rib chiqadi.',
    };
  } catch (error) {
    console.error('[binmap] report failed', error);
    if (upload.path) {
      await getStorage()
        .remove(upload.path)
        .catch(() => {});
    }
    return { ok: false, errors: { _form: 'Xabarni saqlab bo‘lmadi. Keyinroq urinib ko‘ring.' } };
  }
}
