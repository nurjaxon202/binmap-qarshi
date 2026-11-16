'use client';

import { useEffect } from 'react';

import { Button, ButtonLink } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/primitives';

/**
 * The error boundary.
 *
 * It says what to do next and does not apologise. The digest is shown because
 * it is the only thing that makes a report actionable; the message itself is
 * not, since it may carry internals.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[binmap] unhandled error', error);
  }, [error]);

  return (
    <div className="shell flex min-h-full max-w-2xl flex-col justify-center py-20">
      <SectionLabel>Xatolik</SectionLabel>
      <h1 className="mt-4 text-[clamp(1.875rem,5vw,2.75rem)]">Sahifani ochib bo‘lmadi</h1>
      <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
        Kutilmagan xatolik yuz berdi. Qayta urinib ko‘ring; muammo takrorlansa, quyidagi
        kodni xabaringizga qo‘shing.
      </p>
      {error.digest ? (
        <p className="numeric mt-3 text-sm text-ink-500">Kod: {error.digest}</p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={reset}>Qayta urinish</Button>
        <ButtonLink href="/xarita" variant="secondary">
          Xaritaga qaytish
        </ButtonLink>
      </div>
    </div>
  );
}
