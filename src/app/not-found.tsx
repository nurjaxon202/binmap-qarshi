import { ButtonLink } from '@/components/ui/Button';
import { SectionLabel } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="shell flex min-h-full max-w-2xl flex-col justify-center py-20">
      <SectionLabel>404</SectionLabel>
      <h1 className="mt-4 text-[clamp(1.875rem,5vw,2.75rem)]">Sahifa topilmadi</h1>
      <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
        Siz so‘ragan sahifa mavjud emas yoki ko‘chirilgan. Quti havolasini ochmoqchi
        bo‘lsangiz, u o‘chirilgan yoki hali tasdiqlanmagan bo‘lishi mumkin.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/xarita">Xaritani ochish</ButtonLink>
        <ButtonLink href="/" variant="secondary">
          Bosh sahifa
        </ButtonLink>
      </div>
    </div>
  );
}
