import type { Metadata } from 'next';

import { FALLBACK_CITY, publicMapConfig, siteConfig, uploadLimits } from '@/lib/config';
import { getDefaultCity } from '@/lib/db/cities';
import { ButtonLink } from '@/components/ui/Button';
import {
  SectionLabel,
  SurveyMark,
  verificationMark,
} from '@/components/ui/primitives';
import { verificationStatusHint, verificationStatusLabel } from '@/lib/i18n/uz';
import { analysisLimitations } from '@/lib/analysis';

export const metadata: Metadata = {
  title: 'Loyiha haqida',
  description:
    'BinMap Qarshi nima, ma’lumot qanday tekshiriladi va yuborilgan suratlar bilan nima bo‘ladi.',
};

export default async function AboutPage() {
  const city = await getDefaultCity();
  const cityName = city?.name ?? FALLBACK_CITY.name;
  const mapConfig = publicMapConfig();
  const maxMb = Math.round(uploadLimits.maxBytes / (1024 * 1024));

  return (
    <div>
      {/* The about page uses a narrow measure and a left rule rather than the
          homepage's two-ground composition: it is a document, and should read
          like one. */}
      <div className="shell max-w-3xl py-12 md:py-16">
        <SectionLabel>Loyiha haqida</SectionLabel>
        <h1 className="mt-4 text-[clamp(2rem,5.5vw,3.25rem)]">
          Jamoat qutilarining ochiq ro‘yxati
        </h1>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink-700">
          BinMap — {cityName} shahridagi jamoat chiqindi qutilarini topishga yordam beradigan va
          ularning joylashuvi haqidagi ma’lumotni tartibga soladigan platforma. U chiqindi
          tashish xizmati ham, davlat ilovasi ham emas.
        </p>

        <section className="mt-12">
          <h2 className="text-2xl">Nima qiladi</h2>
          <ul className="mt-4 space-y-3 border-l border-line-strong pl-6 text-base leading-relaxed text-ink-700">
            <li>Yaqin atrofdagi tasdiqlangan qutilarni xaritada ko‘rsatadi va masofani hisoblaydi.</li>
            <li>Foydalanuvchilarga xaritada yo‘q qutini qo‘shish imkonini beradi.</li>
            <li>Quti bilan bog‘liq muammolar haqida xabar yig‘adi.</li>
            <li>
              Har bir joylashuv qanchalik ishonchli ekanini ochiq ko‘rsatadi — tasdiqlangan,
              foydalanuvchi ma’lumoti yoki shubhali.
            </li>
          </ul>
        </section>

        {/* ------------------------- verification ------------------------ */}
        <section id="tekshiruv" className="mt-14 scroll-mt-8">
          <h2 className="text-2xl">Ma’lumot qanday tekshiriladi</h2>
          <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-700">
            Yuborilgan taklif darhol xaritaga tushmaydi. U alohida jadvalda saqlanadi va faqat
            moderator tasdiqlagandan keyin ommaviy qutiga aylanadi. Rad etilgan taklif hech
            qachon ommaviy joylashuv sifatida ko‘rinmaydi, lekin qaror va uning sababi saqlanib
            qoladi.
          </p>

          <dl className="mt-6 divide-y divide-line border-y border-line">
            {(['verified', 'community', 'needs_recheck'] as const).map((status) => {
              const mark = verificationMark[status];
              return (
                <div key={status} className="flex flex-wrap gap-x-4 gap-y-1 py-4">
                  <dt className="flex min-w-[12rem] items-start gap-2.5">
                    <SurveyMark
                      texture={mark.texture}
                      size={14}
                      className={`mt-1 ${mark.className}`}
                    />
                    <span className="text-sm font-semibold text-ink-900">
                      {verificationStatusLabel[status]}
                    </span>
                  </dt>
                  <dd className="min-w-0 flex-1 text-sm leading-relaxed text-ink-600">
                    {verificationStatusHint[status]}
                  </dd>
                </div>
              );
            })}
          </dl>

          <p className="mt-6 max-w-prose text-base leading-relaxed text-ink-700">
            «Quti bu joyda mavjud emas» degan xabar qutini o‘chirmaydi. U joylashuvni qayta
            tekshirish uchun belgilaydi, so‘ng moderator uni tekshiradi. Xabarning to‘g‘riligi va
            qutining mavjudligi — ikki alohida qaror.
          </p>
        </section>

        {/* ---------------------------- privacy -------------------------- */}
        <section id="maxfiylik" className="mt-14 scroll-mt-8">
          <h2 className="text-2xl">Ma’lumotlar va maxfiylik</h2>
          <ul className="mt-4 space-y-3 border-l border-line-strong pl-6 text-base leading-relaxed text-ink-700">
            <li>
              Hisob yaratishda faqat ism va elektron pochta so‘raladi. Boshqa shaxsiy ma’lumot
              yig‘ilmaydi.
            </li>
            <li>
              Yuklangan suratdagi EXIF ma’lumotlari — jumladan suratga olingan joyning GPS
              koordinatalari va qurilma raqami — saqlashdan oldin o‘chiriladi.
            </li>
            <li>
              Ko‘rib chiqilmagan takliflar va xabarlarga biriktirilgan suratlar maxfiy
              saqlanadi. Ular faqat moderatorga, vaqtinchalik imzolangan havola orqali
              ko‘rinadi.
            </li>
            <li>
              Taklif tasdiqlangach, surat ommaviy xaritada ko‘rsatilishi mumkin. Shuning uchun
              suratga shaxsiy ma’lumot tushmasligiga e’tibor bering.
            </li>
            <li>Xabar yuborgan foydalanuvchilar ommaviy xaritada ko‘rsatilmaydi.</li>
            <li>
              Joylashuvni aniqlash faqat siz tugmani bosganingizda so‘raladi. Koordinatalaringiz
              saqlanmaydi.
            </li>
            <li>Surat hajmi {maxMb} MB bilan cheklangan; faqat JPEG, PNG va WebP qabul qilinadi.</li>
          </ul>
        </section>

        {/* ------------------------- data limits ------------------------- */}
        <section className="mt-14">
          <h2 className="text-2xl">Ma’lumot nimani isbotlay olmaydi</h2>
          <ul className="mt-4 space-y-3 border-l border-line-strong pl-6 text-base leading-relaxed text-ink-700">
            {analysisLimitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </section>

        {/* ---------------------------- sources -------------------------- */}
        <section className="mt-14">
          <h2 className="text-2xl">Xarita va tashqi xizmatlar</h2>
          <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
            <Row term="Xarita ma’lumoti" value={mapConfig.tile.label} />
            <Row term="Yo‘l ko‘rsatish" value={mapConfig.directionsProviderLabel} />
            <Row
              term="Joy qidiruvi"
              value={mapConfig.geocoderEnabled ? 'Yoqilgan' : 'Sozlanmagan'}
            />
            <Row term="Birinchi shahar" value={`${cityName}, ${city?.region ?? FALLBACK_CITY.region}`} />
          </dl>
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-600">
            Xarita plitkalari tashqi provayderdan olinadi va hech qachon ommaviy xizmatlardan
            ommaviy ravishda yuklab olinmaydi. Provayderni almashtirish uchun dasturni qaytadan
            yozish shart emas. BinMap piyoda marshrutni o‘zi hisoblamaydi — yo‘l ko‘rsatish
            tashqi navigatsiya xizmatida ochiladi.
          </p>
        </section>

        <section className="mt-14 border-t border-line pt-8">
          <h2 className="text-2xl">Aloqa</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-700">
            Xato topdingizmi yoki taklifingiz bormi?{' '}
            <a
              href={`mailto:${siteConfig.contactEmail}`}
              className="font-medium text-forest-700 underline underline-offset-4"
            >
              {siteConfig.contactEmail}
            </a>
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/xarita">Xaritani ochish</ButtonLink>
            <ButtonLink href="/quti-qoshish" variant="secondary">
              Quti qo‘shish
            </ButtonLink>
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-500">{term}</dt>
      <dd className="text-ink-900">{value}</dd>
    </div>
  );
}
