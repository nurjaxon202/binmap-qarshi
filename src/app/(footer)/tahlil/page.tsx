import type { Metadata } from 'next';

import { COVERAGE_GRID_DEG, publicMapConfig } from '@/lib/config';
import { getDefaultCity } from '@/lib/db/cities';
import { getCoverageCells, getReportTrend } from '@/lib/db/stats';
import {
  analysisLimitations,
  observationCriteria,
  observationHint,
  observationLabel,
  summarise,
  toObservations,
  type ObservationKind,
} from '@/lib/analysis';
import { CoverageMapFrame } from '@/components/analysis/CoverageMapFrame';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Figure, SectionLabel } from '@/components/ui/primitives';
import { formatDate, reportTypeShortLabel } from '@/lib/i18n/uz';
import type { ReportType } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Geografik tahlil',
  description:
    'BinMap ma’lumotlar bazasidagi qamrov: qaysi hududlarda qutilar ro‘yxatga olingan, qayerda muammo xabarlari takrorlanmoqda va qayerda ma’lumot yo‘q.',
};

const KIND_SWATCH: Record<ObservationKind, string> = {
  documented: 'bg-forest-700',
  sparse: 'bg-moss-500',
  reported_problems: 'bg-survey-500',
  disputed: 'bg-amber-500',
  undocumented_with_signals: 'bg-slate-500',
};

const ORDER: ObservationKind[] = [
  'documented',
  'sparse',
  'reported_problems',
  'disputed',
  'undocumented_with_signals',
];

/**
 * Geographic analysis.
 *
 * Everything on this page is a statement about *the data*, never about the
 * city. There is deliberately no composite coverage score: a single number
 * would imply a precision this data does not have and would invite being read
 * as a planning decision. What is published instead is a classification with
 * its rule stated beside it, the counts it was derived from, and the list of
 * inferences the data cannot support.
 */
export default async function AnalysisPage() {
  const city = await getDefaultCity();

  if (!city) {
    return (
      <div className="shell py-20">
        <EmptyState title="Hech qanday shahar sozlanmagan">
          <p>Ma’lumotlar bazasida faol shahar topilmadi.</p>
        </EmptyState>
      </div>
    );
  }

  const [cells, trend] = await Promise.all([
    getCoverageCells(city.id),
    getReportTrend(city.id, 30),
  ]);

  const observations = toObservations(cells);
  const summary = summarise(observations);
  const gridKm = (COVERAGE_GRID_DEG * 111.32).toFixed(1).replace('.', ',');

  const trendTotal = trend.reduce((sum, point) => sum + point.total, 0);
  const trendMax = Math.max(1, ...trend.map((point) => point.total));
  const trendByType = trend.reduce<Record<ReportType, number>>(
    (acc, point) => {
      for (const [type, count] of Object.entries(point.byType) as [ReportType, number][]) {
        acc[type] += count;
      }
      return acc;
    },
    { overflowing: 0, damaged: 0, missing: 0, other: 0 },
  );

  return (
    <div className="pb-4">
      <div className="shell max-w-4xl pt-10 md:pt-14">
        <SectionLabel>{city.name}</SectionLabel>
        <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)]">Geografik tahlil</h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-600">
          Bu sahifa BinMap ma’lumotlar bazasida nima borligini ko‘rsatadi — shahar haqida emas,
          to‘plangan ma’lumot haqida. Shahar{' '}
          <span className="numeric">{gridKm}</span> km li kataklarga bo‘lingan va har bir katak
          faqat o‘zidagi yozuvlar soni bo‘yicha turkumlanadi.
        </p>
      </div>

      {observations.length === 0 ? (
        <div className="shell max-w-4xl py-10">
          <EmptyState
            title="Ma’lumot yig‘ilgach, tahlillar shu yerda ko‘rsatiladi"
            action={<ButtonLink href="/quti-qoshish">Birinchi qutini qo‘shish</ButtonLink>}
          >
            <p>
              Tahlil uchun kamida bir nechta tasdiqlangan joylashuv yoki xabar kerak. Hozircha
              ma’lumotlar bazasi bo‘sh.
            </p>
          </EmptyState>
        </div>
      ) : (
        <>
          {/* --------------------------- figures -------------------------- */}
          <div className="shell max-w-4xl mt-10">
            <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-surface p-4">
                <Figure
                  value={summary.totalBins}
                  label="Ro‘yxatga olingan quti"
                  caption="Faol, tasdiqlangan joylashuvlar"
                />
              </div>
              <div className="bg-surface p-4">
                <Figure
                  value={summary.verifiedBins}
                  label="Joyida tekshirilgan"
                  caption={
                    summary.verifiedShare !== null
                      ? `Ro‘yxatning ${Math.round(summary.verifiedShare * 100)}%`
                      : undefined
                  }
                />
              </div>
              <div className="bg-surface p-4">
                <Figure
                  value={summary.cellsWithData}
                  label="Ma’lumot bor katak"
                  caption={`Har biri ${gridKm} × ${gridKm} km`}
                />
              </div>
              <div className="bg-surface p-4">
                <Figure
                  value={trendTotal}
                  label="30 kundagi xabarlar"
                  caption="Barcha turlar bo‘yicha"
                  accent={trendTotal > 0}
                />
              </div>
            </div>
          </div>

          {/* ----------------------------- map ---------------------------- */}
          <div className="mt-10 border-y border-line">
            <div className="h-[clamp(22rem,58vh,34rem)]">
              <CoverageMapFrame
                city={city}
                observations={observations}
                mapConfig={publicMapConfig()}
              />
            </div>
          </div>

          {/* --------------------------- legend --------------------------- */}
          <div className="shell max-w-4xl mt-10">
            <h2 className="text-xl text-ink-900">Turkumlar va ularning mezonlari</h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
              Har bir turkum aniq qoidaga asoslanadi. Qoida shu yerda yozilgan, shuning uchun uni
              tekshirish va u bilan rozi bo‘lmaslik mumkin.
            </p>

            <ul className="mt-5 divide-y divide-line border-y border-line">
              {ORDER.map((kind) => (
                <li key={kind} className="flex flex-wrap gap-x-4 gap-y-2 py-4">
                  <div className="flex min-w-[13rem] items-start gap-2.5">
                    <span
                      aria-hidden
                      className={`mt-1 size-3 shrink-0 rounded-xs ${KIND_SWATCH[kind]}`}
                    />
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {observationLabel[kind]}
                      </p>
                      <p className="numeric mt-0.5 text-xs text-ink-400">
                        {summary.byKind[kind]} katak
                      </p>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm leading-relaxed text-ink-700">
                      {observationHint[kind]}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-500">
                      <span className="font-medium">Mezon: </span>
                      {observationCriteria[kind]}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ---------------------------- trend --------------------------- */}
          {trendTotal > 0 ? (
            <div className="shell max-w-4xl mt-12">
              <h2 className="text-xl text-ink-900">So‘nggi 30 kundagi xabarlar</h2>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
                Kunlar bo‘yicha kelgan xabarlar soni. Bu foydalanuvchilar faolligini ham
                aks ettiradi — muammolar sonini emas.
              </p>

              <div className="mt-5 border border-line bg-surface p-4">
                <div
                  className="flex h-28 items-end gap-px"
                  role="img"
                  aria-label={`30 kun ichida ${trendTotal} ta xabar`}
                >
                  {trend.map((point) => (
                    <div
                      key={point.day}
                      className="min-w-[3px] flex-1 bg-moss-400 transition-colors hover:bg-forest-700"
                      style={{ height: `${Math.max(4, (point.total / trendMax) * 100)}%` }}
                      title={`${formatDate(point.day)}: ${point.total}`}
                    />
                  ))}
                </div>
                <ul className="mt-4 grid gap-x-6 gap-y-1.5 border-t border-line pt-3 text-sm sm:grid-cols-2">
                  {(Object.entries(trendByType) as [ReportType, number][]).map(
                    ([type, count]) => (
                      <li key={type} className="flex items-baseline justify-between gap-3">
                        <span className="text-ink-600">{reportTypeShortLabel[type]}</span>
                        <span className="numeric text-ink-900">{count}</span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* ------------------------- the limitations ---------------------- */}
      <div className="mt-14 border-t border-line bg-paper-200">
        <div className="shell max-w-4xl py-12">
          <h2 className="text-xl text-ink-900">Bu ma’lumot nimani ko‘rsatmaydi</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
            Quyidagilar rasmiy ogohlantirish emas, balki ushbu ma’lumotdan qilib bo‘lmaydigan
            xulosalar ro‘yxati.
          </p>
          <ul className="mt-5 space-y-3 border-l border-line-strong pl-6">
            {analysisLimitations.map((limitation) => (
              <li key={limitation} className="text-sm leading-relaxed text-ink-700">
                {limitation}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
