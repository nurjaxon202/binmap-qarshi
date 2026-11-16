import Link from 'next/link';

import { getDashboardStats, listBinsNeedingAttention } from '@/lib/db/stats';
import { listRecentAuditEntries } from '@/lib/db/audit';
import { getDefaultCity } from '@/lib/db/cities';
import { AdminPage, DetailRow, Table, Td, Th } from '@/components/admin/ui';
import {
  Coordinates,
  Figure,
  SurveyMark,
  verificationMark,
} from '@/components/ui/primitives';
import {
  auditActionLabel,
  binSourceLabel,
  formatRelative,
  reportTypeShortLabel,
  verificationStatusLabel,
} from '@/lib/i18n/uz';
import type { AuditAction, BinSource, ReportType } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

/**
 * The overview.
 *
 * Every number on this page is counted from the live tables at request time —
 * there is no cached counter anywhere in the schema. An empty database shows
 * zero, which is the correct answer, not a placeholder.
 */
export default async function AdminOverviewPage() {
  // Not optional, and not redundant with the layout — see the note in
  // boshqaruv/layout.tsx. Without this the page would render admin data
  // into the HTML of an unauthenticated response.
  await requireAdmin('/boshqaruv');

  const city = await getDefaultCity();

  const [stats, attention, recent] = await Promise.all([
    getDashboardStats(city?.id ?? null),
    listBinsNeedingAttention(city?.id ?? null, 6),
    listRecentAuditEntries(8),
  ]);

  const queue = stats.submissionsPending + stats.submissionsUnderReview;
  const sourceTotal = stats.binsBySource.admin + stats.binsBySource.community;
  const reportTypes = Object.entries(stats.reportsByType) as [ReportType, number][];
  const totalReports = reportTypes.reduce((sum, [, n]) => sum + n, 0);

  return (
    <AdminPage
      title="Umumiy ko‘rinish"
      description={
        city
          ? `${city.name} bo‘yicha joriy holat. Barcha raqamlar ma’lumotlar bazasidan o‘qiladi.`
          : 'Barcha raqamlar ma’lumotlar bazasidan o‘qiladi.'
      }
    >
      {/* --------------------------- the queue --------------------------- */}
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            value: queue,
            label: 'Ko‘rib chiqilmagan taklif',
            caption: `${stats.submissionsPending} yangi, ${stats.submissionsUnderReview} jarayonda`,
            accent: queue > 0,
            href: '/boshqaruv/takliflar?holat=open',
          },
          {
            value: stats.reportsOpen,
            label: 'Ochiq muammo xabari',
            caption: `${stats.reportsResolved} tasi hal qilingan`,
            accent: stats.reportsOpen > 0,
            href: '/boshqaruv/xabarlar?holat=open',
          },
          {
            value: stats.binsActive,
            label: 'Xaritadagi quti',
            caption: `${stats.binsInactive} tasi faol emas`,
            accent: false,
            href: '/boshqaruv/qutilar',
          },
          {
            value: stats.binsNeedsRecheck,
            label: 'Qayta tekshirish kerak',
            caption: 'Xabar shubha tug‘dirgan joylashuvlar',
            accent: stats.binsNeedsRecheck > 0,
            href: '/boshqaruv/qutilar?tekshiruv=needs_recheck',
          },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="bg-surface p-4 hover:bg-paper-50">
            <Figure
              value={item.value}
              label={item.label}
              caption={item.caption}
              accent={item.accent}
            />
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ----------------------- needs attention ----------------------- */}
        <section>
          <h2 className="text-lg text-ink-900">Diqqat talab qiladigan qutilar</h2>
          <p className="mt-1 text-sm text-ink-500">
            Ochiq xabarlari eng ko‘p bo‘lgan joylashuvlar.
          </p>

          {attention.length === 0 ? (
            <p className="mt-4 border border-dashed border-line-strong bg-surface px-4 py-6 text-sm text-ink-500">
              Ochiq xabari bor quti yo‘q.
            </p>
          ) : (
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Joylashuv</Th>
                  <Th>Koordinatalar</Th>
                  <Th numeric>Ochiq xabar</Th>
                </tr>
              </thead>
              <tbody>
                {attention.map((bin) => (
                  <tr key={bin.id}>
                    <Td>
                      <Link
                        href={`/boshqaruv/qutilar/${bin.id}`}
                        className="font-medium text-forest-700 underline underline-offset-2"
                      >
                        {bin.description?.trim() || 'Chiqindi qutisi'}
                      </Link>
                    </Td>
                    <Td>
                      <Coordinates latitude={bin.latitude} longitude={bin.longitude} />
                    </Td>
                    <Td numeric>
                      <span className="font-medium text-survey-500">{bin.openReportCount}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {/* --------------------- where it came from -------------------- */}
          <h2 className="mt-8 text-lg text-ink-900">Ma’lumot manbasi</h2>
          <p className="mt-1 text-sm text-ink-500">
            Xaritadagi joylashuvlar kim tomonidan kiritilgani. Raqamlar
            <code className="mx-1 rounded-xs bg-paper-200 px-1 py-px text-xs">public.bins</code>
            jadvalidan o‘qiladi.
          </p>

          {sourceTotal === 0 ? (
            <p className="mt-3 border border-dashed border-line-strong bg-surface px-4 py-6 text-sm text-ink-500">
              Hozircha joylashuvlar yo‘q.
            </p>
          ) : (
            <div className="mt-3 border border-line bg-surface p-4">
              <div
                className="flex h-3 overflow-hidden rounded-xs bg-paper-200"
                role="img"
                aria-label={`${stats.binsBySource.admin} ta administrator kiritgan, ${stats.binsBySource.community} ta foydalanuvchi yuborgan`}
              >
                <div
                  className="bg-forest-700"
                  style={{ width: `${(stats.binsBySource.admin / sourceTotal) * 100}%` }}
                  title={`${binSourceLabel.admin}: ${stats.binsBySource.admin}`}
                />
                <div
                  className="bg-moss-500"
                  style={{ width: `${(stats.binsBySource.community / sourceTotal) * 100}%` }}
                  title={`${binSourceLabel.community}: ${stats.binsBySource.community}`}
                />
              </div>

              <ul className="mt-4 space-y-3">
                {(
                  [
                    ['admin', stats.binsBySource.admin, 'bg-forest-700'],
                    ['community', stats.binsBySource.community, 'bg-moss-500'],
                  ] as [BinSource, number, string][]
                ).map(([source, count, swatch]) => (
                  <li key={source} className="flex items-baseline justify-between gap-4">
                    <span className="flex items-center gap-2 text-sm text-ink-700">
                      <span aria-hidden className={`size-2.5 rounded-xs ${swatch}`} />
                      {binSourceLabel[source]}
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span className="numeric text-sm text-ink-900">{count}</span>
                      <span className="numeric w-12 text-right text-xs text-ink-400">
                        {Math.round((count / sourceTotal) * 100)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-500">
                Hozircha joylashuvlarning aksariyati jamoa tomonidan joyida kiritilgan.
                Foydalanuvchi ulushi o‘sishi platformaning asosiy maqsadi.
              </p>
            </div>
          )}

          {/* ------------------------ composition ------------------------ */}
          <h2 className="mt-8 text-lg text-ink-900">Tekshiruv holati</h2>
          <dl className="mt-3 border border-line bg-surface px-4">
            <DetailRow term={verificationStatusLabel.verified}>
              <span className="flex items-center gap-2">
                <SurveyMark
                  texture={verificationMark.verified.texture}
                  className={verificationMark.verified.className}
                />
                <span className="numeric">{stats.binsVerified}</span>
              </span>
            </DetailRow>
            <DetailRow term={verificationStatusLabel.community}>
              <span className="flex items-center gap-2">
                <SurveyMark
                  texture={verificationMark.community.texture}
                  className={verificationMark.community.className}
                />
                <span className="numeric">{stats.binsCommunity}</span>
              </span>
            </DetailRow>
            <DetailRow term={verificationStatusLabel.needs_recheck}>
              <span className="flex items-center gap-2">
                <SurveyMark
                  texture={verificationMark.needs_recheck.texture}
                  className={verificationMark.needs_recheck.className}
                />
                <span className="numeric">{stats.binsNeedsRecheck}</span>
              </span>
            </DetailRow>
            <DetailRow term="Tasdiqlangan takliflar">
              <span className="numeric">{stats.submissionsApproved}</span>
            </DetailRow>
            <DetailRow term="Rad etilgan takliflar">
              <span className="numeric">{stats.submissionsRejected}</span>
            </DetailRow>
          </dl>

          {/* Report mix as a proportional bar — real counts, no decoration. */}
          <h2 className="mt-8 text-lg text-ink-900">Xabar turlari</h2>
          {totalReports === 0 ? (
            <p className="mt-3 border border-dashed border-line-strong bg-surface px-4 py-6 text-sm text-ink-500">
              Hozircha xabarlar yo‘q.
            </p>
          ) : (
            <div className="mt-3 border border-line bg-surface p-4">
              <div className="flex h-2.5 overflow-hidden rounded-xs bg-paper-200">
                {reportTypes.map(([type, count]) =>
                  count === 0 ? null : (
                    <div
                      key={type}
                      style={{ width: `${(count / totalReports) * 100}%` }}
                      className={
                        type === 'overflowing'
                          ? 'bg-amber-500'
                          : type === 'damaged'
                            ? 'bg-survey-500'
                            : type === 'missing'
                              ? 'bg-slate-500'
                              : 'bg-ink-400'
                      }
                      title={`${reportTypeShortLabel[type]}: ${count}`}
                    />
                  ),
                )}
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {reportTypes.map(([type, count]) => (
                  <li key={type} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-600">{reportTypeShortLabel[type]}</span>
                    <span className="numeric text-ink-900">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* -------------------------- activity --------------------------- */}
        <section>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg text-ink-900">So‘nggi amallar</h2>
            <Link
              href="/boshqaruv/jurnal"
              className="text-sm font-medium text-forest-700 underline underline-offset-4"
            >
              Jurnal
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="mt-3 border border-dashed border-line-strong bg-surface px-4 py-6 text-sm text-ink-500">
              Hali amallar bajarilmagan.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line border border-line bg-surface">
              {recent.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5">
                  <p className="text-sm text-ink-900">
                    {auditActionLabel[entry.action as AuditAction] ?? entry.action}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {entry.administratorEmail ?? 'Tizim'}, {formatRelative(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminPage>
  );
}
