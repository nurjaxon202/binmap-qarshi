import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireUser } from '@/lib/auth';
import { getPublicBin } from '@/lib/db/bins';
import { ReportForm } from '@/components/submit/ReportForm';
import {
  Coordinates,
  Notice,
  SectionLabel,
  StatusMark,
  verificationMark,
} from '@/components/ui/primitives';
import { verificationStatusLabel } from '@/lib/i18n/uz';

export const metadata: Metadata = {
  title: 'Muammo haqida xabar berish',
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ binId: string }>;
}) {
  const { binId } = await params;
  await requireUser(`/xabar-berish/${binId}`);

  if (!/^[0-9a-f-]{36}$/i.test(binId)) notFound();

  const bin = await getPublicBin(binId);
  if (!bin) notFound();

  const mark = verificationMark[bin.verificationStatus];
  const label = bin.description?.trim() || 'Chiqindi qutisi';

  return (
    <div className="shell max-w-2xl py-10 md:py-14">
      <SectionLabel>Muammo haqida xabar berish</SectionLabel>
      <h1 className="mt-4 text-[clamp(1.875rem,5vw,2.75rem)]">{label}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusMark mark={mark} label={verificationStatusLabel[bin.verificationStatus]} />
        <Coordinates latitude={bin.latitude} longitude={bin.longitude} />
      </div>

      <Notice tone="info" className="mt-6">
        <p>
          Xabar qutini xaritadan o‘chirmaydi. «Quti bu joyda mavjud emas» xabari qutini qayta
          tekshirish uchun belgilaydi, so‘ng moderator uni joyida tekshiradi.
        </p>
      </Notice>

      <div className="mt-8">
        <ReportForm binId={bin.id} binLabel={label} />
      </div>
    </div>
  );
}
