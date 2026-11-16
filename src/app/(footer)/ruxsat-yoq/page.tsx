import type { Metadata } from 'next';

import { getSessionUser } from '@/lib/auth';
import { ButtonLink } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Ruxsat yo‘q' };

/**
 * Shown when a signed-in account without the admin role reaches an
 * administration URL. The page only explains; the refusal itself already
 * happened server-side in requireAdmin().
 */
export default async function ForbiddenPage() {
  const user = await getSessionUser();

  return (
    <div className="shell flex min-h-full max-w-2xl flex-col justify-center py-20">
      <SectionLabel>Ruxsat yo‘q</SectionLabel>
      <h1 className="mt-4 text-[clamp(1.875rem,5vw,2.75rem)]">
        Bu bo‘limga kirish huquqingiz yo‘q
      </h1>
      <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
        Boshqaruv paneli faqat moderatorlar uchun ochiq. Agar bu xato deb hisoblasangiz, loyiha
        jamoasiga murojaat qiling.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/xarita">Xaritaga qaytish</ButtonLink>
        {user ? (
          <ButtonLink href="/hisobim" variant="secondary">
            Mening hisobim
          </ButtonLink>
        ) : (
          <ButtonLink href="/kirish" variant="secondary">
            Kirish
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
