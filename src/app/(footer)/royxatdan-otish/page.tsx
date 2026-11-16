import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth';
import { AuthFooterLink, AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Ro‘yxatdan o‘tish' };

function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return undefined;
  }
  return value;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const params = await searchParams;
  const returnTo = safeReturnTo(params.keyin);

  if (user) redirect(returnTo ?? '/hisobim');

  return (
    <AuthShell
      label="Yangi hisob"
      title="Xaritaga hissa qo‘shing"
      intro={
        <p>
          Faqat ismingiz va elektron pochtangiz so‘raladi — platformani ishlatish uchun
          bundan ortiq ma’lumot kerak emas.
        </p>
      }
      footer={
        <p>
          Hisobingiz bormi?{' '}
          <AuthFooterLink
            href={returnTo ? `/kirish?keyin=${encodeURIComponent(returnTo)}` : '/kirish'}
          >
            Tizimga kiring
          </AuthFooterLink>
        </p>
      }
    >
      <RegisterForm returnTo={returnTo} />
    </AuthShell>
  );
}
