import type { Metadata } from 'next';

import { publicMapConfig } from '@/lib/config';
import { requireUser } from '@/lib/auth';
import { getDefaultCity } from '@/lib/db/cities';
import { SubmitBinForm } from '@/components/submit/SubmitBinForm';
import { EmptyState, SectionLabel } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Quti qo‘shish',
  description:
    'Xaritada yo‘q jamoat chiqindi qutisini belgilab yuboring. Har bir taklif moderator ko‘rigidan o‘tadi.',
};

export default async function SubmitBinPage() {
  // Server-side gate. There is no client-side check to bypass.
  await requireUser('/quti-qoshish');
  const city = await getDefaultCity();

  if (!city) {
    return (
      <div className="shell py-20">
        <EmptyState
          title="Hech qanday shahar sozlanmagan"
          action={<ButtonLink href="/">Bosh sahifaga qaytish</ButtonLink>}
        >
          <p>Ma’lumotlar bazasida faol shahar topilmadi.</p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="shell max-w-3xl py-10 md:py-14">
      <SectionLabel>{city.name}</SectionLabel>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)]">Yangi quti qo‘shish</h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-600">
        Ko‘chada xaritada belgilanmagan jamoat chiqindi qutisini ko‘rsangiz, uni shu yerdan
        qo‘shing. Uch qadam — joy, surat va qisqa izoh.
      </p>

      <div className="mt-10">
        <SubmitBinForm city={city} mapConfig={publicMapConfig()} />
      </div>
    </div>
  );
}
