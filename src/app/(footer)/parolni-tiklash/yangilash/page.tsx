import type { Metadata } from 'next';

import { authDriver } from '@/lib/config';
import { AuthFooterLink, AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from '@/components/auth/AuthForms';
import { Notice } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Yangi parol' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';

  // Supabase exchanges the e-mail link for a session before this page loads,
  // so on that path there is no token in the URL to check.
  const tokenRequired = authDriver === 'local';

  return (
    <AuthShell
      label="Parolni tiklash"
      title="Yangi parol o‘rnatish"
      footer={<AuthFooterLink href="/kirish">Kirish sahifasiga qaytish</AuthFooterLink>}
    >
      {tokenRequired && token.length < 10 ? (
        <Notice tone="danger" title="Havola yaroqsiz">
          <p>
            Havola to‘liq ko‘chirilmagan yoki muddati o‘tgan.{' '}
            <a href="/parolni-tiklash">Qaytadan so‘rov yuboring</a>.
          </p>
        </Notice>
      ) : (
        <ResetPasswordForm token={token || 'supabase-session'} />
      )}
    </AuthShell>
  );
}
