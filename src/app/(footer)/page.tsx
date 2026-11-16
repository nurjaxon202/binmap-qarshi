import Link from 'next/link';

import { FALLBACK_CITY, publicMapConfig, siteConfig } from '@/lib/config';
import { getDefaultCity } from '@/lib/db/cities';
import { listPublicBins } from '@/lib/db/bins';
import { getDashboardStats } from '@/lib/db/stats';
import { ButtonLink } from '@/components/ui/Button';
import {
  SectionLabel,
  SurveyMark,
  verificationMark,
  type MarkTexture,
} from '@/components/ui/primitives';
import { analysisLimitations } from '@/lib/analysis';
import { verificationStatusHint, verificationStatusLabel } from '@/lib/i18n/uz';
import { HeroMapFrame } from '@/components/map/HeroMapFrame';
import type { PublicBin } from '@/lib/types';

export default async function HomePage() {
  const city = (await getDefaultCity()) ?? null;

  let bins: PublicBin[] = [];
  let stats = null;
  try {
    [bins, stats] = await Promise.all([
      city ? listPublicBins(city.id) : Promise.resolve([]),
      getDashboardStats(city?.id ?? null),
    ]);
  } catch (error) {
    console.error('[binmap] homepage data unavailable', error);
  }

  const mapConfig = publicMapConfig();
  const cityName = city?.name ?? FALLBACK_CITY.name;
  const region = city?.region ?? FALLBACK_CITY.region;

  return (
    <>
      {/* ===================== cover: forest ground ====================== */}
      <section className="on-forest @container relative bg-forest-700">
        <div className="plan-grid absolute inset-0" aria-hidden />

        <div className="relative grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="shell-aligned-left flex flex-col justify-center py-14 pr-5 md:pr-10 lg:py-24 lg:pr-14">
            <p className="flex items-center gap-2.5 text-[0.8125rem] text-moss-300">
              <span aria-hidden className="h-px w-5 bg-moss-400/60" />
              {cityName}, {region}
            </p>

            <h1 className="mt-5 text-[clamp(2.75rem,8vw,5.25rem)] text-paper-50">
              Quti qayerda?
            </h1>

            <p className="mt-6 max-w-[38ch] text-lg leading-relaxed text-moss-200">
              {siteConfig.description}
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/xarita" variant="accent" size="lg">
                Xaritani ochish
              </ButtonLink>
              <ButtonLink
                href="/quti-qoshish"
                size="lg"
                className="border border-moss-400/40 bg-transparent text-paper-50 hover:bg-forest-600"
              >
                Quti qo‘shish
              </ButtonLink>
            </div>

            {/* Real figures from the database. An empty database reports zero. */}
            {stats ? (
              <dl className="mt-12 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-sm border border-moss-400/25 bg-moss-400/25">
                <Count
                  value={stats.binsActive}
                  label="xaritadagi quti"
                  texture={null}
                />
                <Count
                  value={stats.binsVerified}
                  label="joyida tekshirilgan"
                  texture="solid"
                />
                <Count
                  value={stats.submissionsPending + stats.submissionsUnderReview}
                  label="ko‘rib chiqilmoqda"
                  texture="open"
                />
              </dl>
            ) : null}
          </div>

          {/* The map bleeds off the right edge: it is the product, not a
              framed illustration sitting inside the layout. */}
          <div className="relative min-h-[22rem] border-t border-forest-900/40 lg:min-h-[38rem] lg:border-t-0 lg:border-l">
            {city && bins.length > 0 ? (
              <HeroMapFrame city={city} bins={bins} mapConfig={mapConfig} />
            ) : (
              <div className="plan-grid grid size-full place-items-center bg-forest-800 px-8 text-center">
                <p className="max-w-xs text-sm leading-relaxed text-moss-200">
                  Xarita hozircha bo‘sh. Birinchi joylashuvni qo‘shib, uni to‘ldirishga yordam
                  bering.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ======================= what you can do ========================= */}
      <section className="shell py-16 lg:py-20">
        <div className="grid gap-x-10 gap-y-8 border-y border-line py-10 md:grid-cols-3 md:divide-x md:divide-line">
          <Column
            title="Qutini toping"
            body="Xaritani oching, joylashuvingizni aniqlang va eng yaqin qutigacha bo‘lgan masofani ko‘ring. Yo‘l ko‘rsatish navigatsiya xizmatida ochiladi."
            href="/xarita"
            action="Xaritani ochish"
          />
          <Column
            title="Yangi joylashuv qo‘shing"
            body="Xaritada yo‘q qutini ko‘rsangiz, uni belgilab, surat bilan yuboring. Har bir taklif moderator ko‘rigidan o‘tadi."
            href="/quti-qoshish"
            action="Quti qo‘shish"
            className="md:pl-10"
          />
          <Column
            title="Muammo haqida xabar bering"
            body="Quti to‘lib qolgan, shikastlangan yoki joyida topilmasa — xabar yuboring. Xabar qutini o‘chirmaydi, balki qayta tekshirishga qo‘yadi."
            href="/xarita"
            action="Qutini tanlang"
            className="md:pl-10"
          />
        </div>
      </section>

      {/* ===================== how verification works ==================== */}
      <section id="tekshiruv" className="border-y border-line bg-surface">
        <div className="shell py-16 lg:py-20">
          <div className="max-w-2xl">
            <SectionLabel>Ma’lumot qanday tekshiriladi</SectionLabel>
            <h2 className="mt-4 text-[clamp(1.875rem,4vw,2.75rem)]">
              Har bir joylashuv qanchalik ishonchli ekani ko‘rinib turadi
            </h2>
            <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
              BinMap bilgan va bilmagan narsasini ajratib ko‘rsatadi. Xaritadagi har bir belgi o‘z
              holatini olib yuradi — rangi bilan emas, shakli bilan ham, shuning uchun u oq-qora
              bosmada ham, quyosh ostidagi telefonda ham o‘qiladi.
            </p>
          </div>

          {/* A genuine sequence, so the steps are numbered. The texture
              changes along it, which is the same device the map uses. */}
          <ol className="mt-12 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            <Step
              n={1}
              texture="open"
              markClass="text-amber-600"
              title="Taklif yuboriladi"
              body="Foydalanuvchi joylashuvni belgilaydi va surat biriktiradi. Taklif ommaviy xaritada ko‘rinmaydi."
            />
            <Step
              n={2}
              texture="open"
              markClass="text-slate-600"
              title="Moderator ko‘rib chiqadi"
              body="Koordinatalar, surat va yaqin atrofdagi mavjud qutilar tekshiriladi. Qaror sababi bilan yoziladi."
            />
            <Step
              n={3}
              texture="hatch"
              markClass="text-moss-500"
              title="Xaritaga qo‘shiladi"
              body="Tasdiqlangan taklif ommaviy qutiga aylanadi va «foydalanuvchi ma’lumoti» deb belgilanadi."
            />
            <Step
              n={4}
              texture="solid"
              markClass="text-forest-700"
              title="Joyida tekshiriladi"
              body="Jamoa joyida ko‘rib chiqqach, belgi to‘liq to‘ldiriladi va tekshiruv sanasi yoziladi."
            />
          </ol>

          <div className="mt-10 grid gap-6 border-t border-line pt-8 md:grid-cols-3">
            {(['verified', 'community', 'needs_recheck'] as const).map((status) => {
              const mark = verificationMark[status];
              return (
                <div key={status} className="flex gap-3">
                  <SurveyMark
                    texture={mark.texture}
                    size={15}
                    className={`mt-1 ${mark.className}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">
                      {verificationStatusLabel[status]}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-500">
                      {verificationStatusHint[status]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================== what the data can't say ==================== */}
      <section className="shell py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <SectionLabel>Geografik ma’lumot nima bera oladi</SectionLabel>
            <h2 className="mt-4 text-[clamp(1.75rem,3.5vw,2.375rem)]">
              Ma’lumot savol tug‘diradi, qaror chiqarmaydi
            </h2>
            <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
              Yetarli ma’lumot yig‘ilgach, qaysi hududlarda qutilar ro‘yxatga olingani, qayerda
              muammo xabarlari takrorlanayotgani va qayerda umuman ma’lumot yo‘qligi ko‘rinadi. Bu
              — tekshirish uchun yo‘nalish, shahar rejalashtirish qarori emas.
            </p>
            <ButtonLink href="/tahlil" variant="secondary" className="mt-7">
              Tahlilni ko‘rish
            </ButtonLink>
          </div>

          {/* The limitations are published, not buried. They are the reason
              the analysis can be trusted at all. */}
          <ul className="space-y-4 border-l border-line pl-6 lg:pl-10">
            {analysisLimitations.map((limitation) => (
              <li key={limitation} className="text-sm leading-relaxed text-ink-600">
                {limitation}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ========================= Qarshi focus ========================== */}
      <section className="border-t border-line bg-paper-200">
        <div className="shell grid gap-8 py-14 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:py-16">
          <div>
            <SectionLabel>Nega {cityName}</SectionLabel>
            <h2 className="mt-4 text-[clamp(1.625rem,3vw,2.125rem)]">
              Bitta shahardan boshlab, to‘g‘ri qilish
            </h2>
            <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
              {cityName} — loyihaning birinchi shahri. Bitta shaharni puxta qilish o‘nta shaharni
              yarim-yorti qilishdan foydaliroq: joylashuvlarni joyida tekshirish, xabarlarni ko‘rib
              chiqish va xatolarni tuzatish mumkin bo‘ladi. Boshqa shaharlar ma’lumotlar bazasida
              oddiy yozuv sifatida qo‘shiladi — dasturni qaytadan yozish shart emas.
            </p>
          </div>
          <dl className="grid content-start gap-px self-start overflow-hidden rounded-sm border border-line bg-line text-sm">
            <Row term="Shahar" value={`${cityName}, ${region}`} />
            <Row
              term="Markaz"
              value={
                <span className="numeric">
                  {(city?.centerLatitude ?? FALLBACK_CITY.centerLatitude).toFixed(5)},{' '}
                  {(city?.centerLongitude ?? FALLBACK_CITY.centerLongitude).toFixed(5)}
                </span>
              }
            />
            <Row term="Xarita ma’lumoti" value={mapConfig.tile.label} />
            <Row term="Yo‘l ko‘rsatish" value={mapConfig.directionsProviderLabel} />
          </dl>
        </div>
      </section>

      {/* ============================== close ============================ */}
      <section className="on-forest relative bg-forest-800">
        <div className="plan-grid absolute inset-0" aria-hidden />
        <div className="shell relative flex flex-col items-start gap-6 py-14 md:flex-row md:items-center md:justify-between">
          <h2 className="max-w-[20ch] text-[clamp(1.5rem,3vw,2.125rem)] text-paper-50">
            Shahringizdagi birinchi qutini xaritaga qo‘shing
          </h2>
          <div className="flex shrink-0 flex-wrap gap-3">
            <ButtonLink href="/quti-qoshish" variant="accent" size="lg">
              Quti qo‘shish
            </ButtonLink>
            <ButtonLink
              href="/loyiha"
              size="lg"
              className="border border-moss-400/40 bg-transparent text-paper-50 hover:bg-forest-700"
            >
              Loyiha haqida
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

/* --------------------------------- pieces --------------------------------- */

function Count({
  value,
  label,
  texture,
}: {
  value: number;
  label: string;
  texture: MarkTexture | null;
}) {
  return (
    <div className="bg-forest-700 px-4 py-4">
      <p className="numeric text-2xl leading-none font-medium text-paper-50">{value}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs leading-snug text-moss-300">
        {texture ? <SurveyMark texture={texture} size={10} className="text-lime-500" /> : null}
        {label}
      </p>
    </div>
  );
}

function Column({
  title,
  body,
  href,
  action,
  className,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-xl text-ink-900">{title}</h2>
      <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-ink-600">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-block text-sm font-medium text-forest-700 underline underline-offset-4 hover:text-forest-600"
      >
        {action}
      </Link>
    </div>
  );
}

function Step({
  n,
  texture,
  markClass,
  title,
  body,
}: {
  n: number;
  texture: MarkTexture;
  markClass: string;
  title: string;
  body: string;
}) {
  return (
    <li className="bg-surface p-5">
      <div className="flex items-center gap-2.5">
        <span className="numeric text-xs text-ink-400">{String(n).padStart(2, '0')}</span>
        <SurveyMark texture={texture} size={13} className={markClass} />
      </div>
      <h3 className="mt-3 text-base text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
    </li>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 bg-paper-100 px-4 py-3">
      <dt className="text-ink-500">{term}</dt>
      <dd className="text-right text-ink-900">{value}</dd>
    </div>
  );
}
