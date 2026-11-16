import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSessionUser } from '@/lib/auth';
import { AuthFooterLink, AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Kirish' };

/** Only same-origin paths are accepted, so `keyin` cannot become an open redirect. */
function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return undefined;
  }
  return value;
}

export default async function LoginPage({
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
      label="Hisobga kirish"
      title="Xush kelibsiz"
      intro={
        <p>
          Xaritani ko‘rish uchun hisob kerak emas. Kirish faqat yangi joylashuv qo‘shish
          va muammo haqida xabar berish uchun zarur.
        </p>
      }
      footer={
        <>
          <p>
            Hisobingiz yo‘qmi?{' '}
            <AuthFooterLink
              href={
                returnTo
                  ? `/royxatdan-otish?keyin=${encodeURIComponent(returnTo)}`
                  : '/royxatdan-otish'
              }
            >
              Ro‘yxatdan o‘ting
            </AuthFooterLink>
          </p>
          <p className="mt-1.5">
            <AuthFooterLink href="/parolni-tiklash">Parolni unutdingizmi?</AuthFooterLink>
          </p>
        </>
      }
    >
      <LoginForm returnTo={returnTo} />
    </AuthShell>
  );
}
