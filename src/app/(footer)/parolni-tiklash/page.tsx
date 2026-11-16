import type { Metadata } from 'next';

import { AuthFooterLink, AuthShell } from '@/components/auth/AuthShell';
import { RequestResetForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: 'Parolni tiklash' };

export default function RequestResetPage() {
  return (
    <AuthShell
      label="Parolni tiklash"
      title="Tiklash havolasini olish"
      intro={
        <p>
          Hisobingiz bog‘langan pochta manzilini kiriting. Manzil ro‘yxatdan o‘tgan
          bo‘lsa, tiklash havolasi yuboriladi.
        </p>
      }
      footer={<AuthFooterLink href="/kirish">Kirish sahifasiga qaytish</AuthFooterLink>}
    >
      <RequestResetForm />
    </AuthShell>
  );
}
