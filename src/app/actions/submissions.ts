'use server';

import { revalidatePath } from 'next/cache';

import { DUPLICATE_WARNING_RADIUS_M, rateLimits } from '@/lib/config';
import { getSessionUser } from '@/lib/auth';
import { getCityBySlug } from '@/lib/db/cities';
import { findNearestBin } from '@/lib/db/bins';
import {
  createSubmission,
  hasPendingSubmissionNearby,
} from '@/lib/db/submissions';
import { checkRateLimit, formatRetryAfter } from '@/lib/db/rate-limit';
import { getStorage, storeUploadedImage } from '@/lib/storage';
import { binSubmissionSchema, fieldErrors } from '@/lib/validation';
import type { SubmissionFormState } from '@/app/actions/form-state';

/**
 * Submitting a proposed bin location.
 *
 * The duplicate check is a *warning*, not a rejection: two bins genuinely can
 * stand metres apart on opposite sides of a street. The first submission near
 * an existing bin comes back with the distance and the person decides; sending
 * it again with `acknowledgedDuplicate` saves it. What is refused outright is
 * the same person proposing the same spot twice while the first is still
 * pending, which is an accidental double-submit rather than a judgement call.
 */
export async function submitBinAction(
  _prev: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      errors: { _form: 'Taklif yuborish uchun tizimga kiring.' },
    };
  }

  const parsed = binSubmissionSchema.safeParse({
    citySlug: formData.get('citySlug'),
    latitude: formData.get('latitude'),
    longitude: formData.get('longitude'),
    description: formData.get('description'),
    acknowledgedDuplicate: formData.get('acknowledgedDuplicate'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const city = await getCityBySlug(parsed.data.citySlug);
  if (!city) {
    return { ok: false, errors: { _form: 'Shahar topilmadi.' } };
  }

  const limit = await checkRateLimit('submission', user.id, rateLimits.submission);
  if (!limit.allowed) {
    return {
      ok: false,
      errors: {
        _form: `Juda ko‘p taklif yubordingiz. ${formatRetryAfter(limit.retryAfterSeconds)} dan keyin davom eting.`,
      },
    };
  }

  const point = { latitude: parsed.data.latitude, longitude: parsed.data.longitude };

  // An accidental re-send of a still-pending proposal for the same spot.
  if (await hasPendingSubmissionNearby(user.id, point.latitude, point.longitude, 20)) {
    return {
      ok: false,
      errors: {
        _form:
          'Siz bu joylashuv uchun allaqachon taklif yuborgansiz va u hali ko‘rib chiqilmoqda.',
      },
    };
  }

  if (!parsed.data.acknowledgedDuplicate) {
    const nearest = await findNearestBin(point, DUPLICATE_WARNING_RADIUS_M, city.id);
    if (nearest) {
      return {
        ok: false,
        errors: {},
        duplicateWarning: {
          distanceMeters: Math.round(nearest.distanceMeters),
          description: nearest.description,
          isDemo: nearest.isDemo,
        },
      };
    }
  }

  // Store the photo before writing the row: a failed upload should not leave a
  // submission pointing at nothing.
  const upload = await storeUploadedImage(formData.get('photo'), 'submissions');
  if (upload.error) {
    return { ok: false, errors: { photo: upload.error } };
  }

  try {
    const submission = await createSubmission({
      cityId: city.id,
      submittedBy: user.id,
      latitude: point.latitude,
      longitude: point.longitude,
      description: parsed.data.description,
      photoPath: upload.path,
    });

    revalidatePath('/hisobim');
    revalidatePath('/boshqaruv');

    return {
      ok: true,
      errors: {},
      submissionId: submission.id,
      notice:
        'Taklifingiz yuborildi. Moderator uni ko‘rib chiqqach, holati «Mening hisobim» bo‘limida yangilanadi.',
    };
  } catch (error) {
    console.error('[binmap] submission failed', error);
    // Do not leave the uploaded file behind if the row was not written.
    if (upload.path) {
      await getStorage()
        .remove(upload.path)
        .catch(() => {});
    }
    return {
      ok: false,
      errors: { _form: 'Taklifni saqlab bo‘lmadi. Keyinroq urinib ko‘ring.' },
    };
  }
}
