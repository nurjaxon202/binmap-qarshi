'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { auth, getSessionUser } from '@/lib/auth';
import { checkRateLimit, formatRetryAfter } from '@/lib/db/rate-limit';
import { rateLimits } from '@/lib/config';
import type { AuthFormState } from '@/app/actions/form-state';
import {
  fieldErrors,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  profileUpdateSchema,
  registerSchema,
} from '@/lib/validation';

/**
 * Authentication actions.
 *
 * Each one validates with Zod, applies a durable rate limit, and returns a
 * plain serialisable state object the form renders. Errors are the Uzbek
 * strings from the schemas — no raw provider messages reach the user.
 */

/** Rate-limit key: the client IP where a proxy provides one, else the path. */
async function clientKey(suffix = ''): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  return `${ip}${suffix}`;
}

function onlyPath(value: unknown): string | null {
  // Open-redirect guard: accept same-origin absolute paths and nothing else.
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const limit = await checkRateLimit('auth:register', await clientKey(), rateLimits.auth);
  if (!limit.allowed) {
    return {
      ok: false,
      errors: {
        _form: `Juda ko‘p urinish. ${formatRetryAfter(limit.retryAfterSeconds)} dan keyin qayta urinib ko‘ring.`,
      },
    };
  }

  const outcome = await auth().signUp(parsed.data);
  if (!outcome.ok) {
    return { ok: false, errors: { [outcome.field ?? '_form']: outcome.error } };
  }

  if (outcome.notice) {
    // E-mail confirmation pending — there is no session yet, so stay put and
    // tell the person what to do next.
    return { ok: true, errors: {}, notice: outcome.notice };
  }

  const next = onlyPath(formData.get('keyin')) ?? '/hisobim';
  redirect(next);
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  // Limit by address as well as by network, so one address cannot be attacked
  // from many clients and one client cannot sweep many addresses.
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit('auth:login:ip', await clientKey(), rateLimits.auth),
    checkRateLimit('auth:login:email', parsed.data.email, rateLimits.auth),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    const wait = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds);
    return {
      ok: false,
      errors: {
        _form: `Juda ko‘p urinish. ${formatRetryAfter(wait)} dan keyin qayta urinib ko‘ring.`,
      },
    };
  }

  const outcome = await auth().signIn(parsed.data);
  if (!outcome.ok) {
    return { ok: false, errors: { [outcome.field ?? '_form']: outcome.error } };
  }

  const next = onlyPath(formData.get('keyin')) ?? '/hisobim';
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await auth().signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const limit = await checkRateLimit('auth:reset', await clientKey(), rateLimits.auth);
  if (!limit.allowed) {
    return {
      ok: false,
      errors: {
        _form: `Juda ko‘p urinish. ${formatRetryAfter(limit.retryAfterSeconds)} dan keyin qayta urinib ko‘ring.`,
      },
    };
  }

  const outcome = await auth().requestPasswordReset(parsed.data.email);

  return {
    ok: true,
    errors: {},
    notice:
      'Agar bu manzil ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash havolasi yuborildi. Pochtangizni tekshiring.',
    devLink: outcome.devLink ?? null,
  };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = passwordResetSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
    passwordConfirm: formData.get('passwordConfirm'),
  });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  const outcome = await auth().resetPassword(parsed.data.token, parsed.data.password);
  if (!outcome.ok) {
    return { ok: false, errors: { [outcome.field ?? '_form']: outcome.error } };
  }

  redirect('/hisobim');
}

export async function updateProfileAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, errors: { _form: 'Avval tizimga kiring.' } };
  }

  const parsed = profileUpdateSchema.safeParse({ fullName: formData.get('fullName') });
  if (!parsed.success) {
    return { ok: false, errors: fieldErrors(parsed.error) };
  }

  // Only the display name is writable here. Role and e-mail are not read from
  // this payload at all.
  await auth().updateFullName(user.id, parsed.data.fullName);
  revalidatePath('/hisobim');

  return { ok: true, errors: {}, notice: 'Ma’lumotlar saqlandi.' };
}
