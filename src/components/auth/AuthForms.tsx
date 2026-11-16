'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  loginAction,
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  updateProfileAction,
} from '@/app/actions/auth';
import { emptyAuthState } from '@/app/actions/form-state';
import { Button } from '@/components/ui/Button';
import { Field, Input, fieldAria } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';

/**
 * Account forms.
 *
 * Each one is a plain <form> wired to a server action through useActionState,
 * so it submits and shows its errors with or without JavaScript. Validation
 * messages come from the Zod schemas, which are the same ones the action
 * applies on the server — the client never decides what is valid.
 */

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending}>
      {pending ? 'Yuborilmoqda…' : children}
    </Button>
  );
}

/* --------------------------------- sign in -------------------------------- */

export function LoginForm({ returnTo }: { returnTo?: string }) {
  const [state, action] = useActionState(loginAction, emptyAuthState);

  return (
    <form action={action} className="space-y-5" noValidate>
      {returnTo ? <input type="hidden" name="keyin" value={returnTo} /> : null}

      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      <Field label="Elektron pochta" htmlFor="email" error={state.errors.email}>
        <Input
          {...fieldAria('email', { error: Boolean(state.errors.email) })}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="ism@pochta.uz"
        />
      </Field>

      <Field label="Parol" htmlFor="password" error={state.errors.password}>
        <Input
          {...fieldAria('password', { error: Boolean(state.errors.password) })}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton>Kirish</SubmitButton>
    </form>
  );
}

/* --------------------------------- sign up -------------------------------- */

export function RegisterForm({ returnTo }: { returnTo?: string }) {
  const [state, action] = useActionState(registerAction, emptyAuthState);

  if (state.ok && state.notice) {
    return <Notice tone="success">{state.notice}</Notice>;
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {returnTo ? <input type="hidden" name="keyin" value={returnTo} /> : null}

      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      <Field label="Ismingiz" htmlFor="fullName" error={state.errors.fullName}>
        <Input
          {...fieldAria('fullName', { error: Boolean(state.errors.fullName) })}
          name="fullName"
          autoComplete="name"
          required
        />
      </Field>

      <Field
        label="Elektron pochta"
        htmlFor="email"
        error={state.errors.email}
        hint="Faqat hisobingizga kirish uchun ishlatiladi."
      >
        <Input
          {...fieldAria('email', { hint: true, error: Boolean(state.errors.email) })}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
      </Field>

      <Field
        label="Parol"
        htmlFor="password"
        error={state.errors.password}
        hint="Kamida 8 belgi."
      >
        <Input
          {...fieldAria('password', { hint: true, error: Boolean(state.errors.password) })}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <SubmitButton>Hisob yaratish</SubmitButton>
    </form>
  );
}

/* ----------------------------- password recovery -------------------------- */

export function RequestResetForm() {
  const [state, action] = useActionState(requestPasswordResetAction, emptyAuthState);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      {state.ok && state.notice ? (
        <Notice tone="success">
          <p>{state.notice}</p>
          {state.devLink ? (
            <p className="mt-2">
              Pochta xizmati sozlanmagani uchun havola shu yerda ko‘rsatilmoqda:{' '}
              <a href={state.devLink} className="break-all">
                {state.devLink}
              </a>
            </p>
          ) : null}
        </Notice>
      ) : null}

      <Field label="Elektron pochta" htmlFor="email" error={state.errors.email}>
        <Input
          {...fieldAria('email', { error: Boolean(state.errors.email) })}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
      </Field>

      <SubmitButton>Tiklash havolasini yuborish</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, emptyAuthState);

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />

      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}
      {state.errors.token ? <Notice tone="danger">{state.errors.token}</Notice> : null}

      <Field label="Yangi parol" htmlFor="password" error={state.errors.password} hint="Kamida 8 belgi.">
        <Input
          {...fieldAria('password', { hint: true, error: Boolean(state.errors.password) })}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>

      <Field
        label="Parolni takrorlang"
        htmlFor="passwordConfirm"
        error={state.errors.passwordConfirm}
      >
        <Input
          {...fieldAria('passwordConfirm', { error: Boolean(state.errors.passwordConfirm) })}
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <SubmitButton>Parolni yangilash</SubmitButton>
    </form>
  );
}

/* --------------------------------- profile -------------------------------- */

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, action] = useActionState(updateProfileAction, emptyAuthState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}
      {state.ok && state.notice ? <Notice tone="success">{state.notice}</Notice> : null}

      <Field label="Ismingiz" htmlFor="profile-fullName" error={state.errors.fullName}>
        <Input
          {...fieldAria('profile-fullName', { error: Boolean(state.errors.fullName) })}
          name="fullName"
          defaultValue={fullName}
          autoComplete="name"
          required
        />
      </Field>

      <ProfileSubmit />
    </form>
  );
}

function ProfileSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Saqlanmoqda…' : 'Saqlash'}
    </Button>
  );
}
