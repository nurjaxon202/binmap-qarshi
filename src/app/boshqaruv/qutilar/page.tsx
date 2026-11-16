import Link from 'next/link';

import { listBinsForAdmin } from '@/lib/db/bins';
import { AdminPage, FilterTabs, Pagination, Table, Td, Th } from '@/components/admin/ui';
import { ButtonLink } from '@/components/ui/Button';
import {
  Badge,
  Coordinates,
  StatusMark,
  verificationMark,
} from '@/components/ui/primitives';
import {
  binSourceShortLabel,
  binStatusLabel,
  formatDate,
  verificationStatusLabel,
  verificationStatusShortLabel,
} from '@/lib/i18n/uz';
import type { BinSource, BinStatus, VerificationStatus } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Qutilar' };

const STATUS_TABS = [
  { value: 'active', label: 'Faol' },
  { value: 'inactive', label: 'Faol emas' },
  { value: 'removed', label: 'Olib tashlangan' },
  { value: 'all', label: 'Hammasi' },
];

const VERIFICATION_TABS = [
  { value: 'all', label: 'Barcha holatlar' },
  { value: 'verified', label: verificationStatusShortLabel.verified },
  { value: 'community', label: verificationStatusShortLabel.community },
  { value: 'needs_recheck', label: verificationStatusShortLabel.needs_recheck },
];

const SOURCE_TABS = [
  { value: 'all', label: 'Barcha manbalar' },
  { value: 'admin', label: binSourceShortLabel.admin },
  { value: 'community', label: binSourceShortLabel.community },
];

export default async function AdminBinsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/boshqaruv/qutilar');

  const params = await searchParams;
  const status = typeof params.holat === 'string' ? params.holat : 'active';
  const verification = typeof params.tekshiruv === 'string' ? params.tekshiruv : 'all';
  const source = typeof params.manba === 'string' ? params.manba : 'all';
  const query = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.sahifa ?? 1) || 1;

  const result = await listBinsForAdmin({
    status: status as BinStatus | 'all',
    verificationStatus: verification as VerificationStatus | 'all',
    source: source as BinSource | 'all',
    query: query || null,
    page,
    pageSize: 25,
  });

  const hrefFor = (next: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    const merged = {
      holat: status,
      tekshiruv: verification,
      manba: source,
      q: query,
      sahifa: page,
      ...next,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '' && value !== undefined && !(key === 'sahifa' && Number(value) === 1)) {
        sp.set(key, String(value));
      }
    }
    const qs = sp.toString();
    return `/boshqaruv/qutilar${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminPage
      title="Qutilar"
      description="Tasdiqlangan joylashuvlar. Faqat «faol» holatdagilari ommaviy xaritada ko‘rinadi."
      actions={
        <ButtonLink href="/boshqaruv/qutilar/yangi" size="sm">
          Qo‘lda quti qo‘shish
        </ButtonLink>
      }
    >
      <div className="space-y-2">
        <FilterTabs
          options={STATUS_TABS}
          current={status}
          hrefFor={(v) => hrefFor({ holat: v, sahifa: 1 })}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <FilterTabs
              options={VERIFICATION_TABS}
              current={verification}
              hrefFor={(v) => hrefFor({ tekshiruv: v, sahifa: 1 })}
            />
            <FilterTabs
              options={SOURCE_TABS}
              current={source}
              hrefFor={(v) => hrefFor({ manba: v, sahifa: 1 })}
            />
          </div>
          <form action="/boshqaruv/qutilar" className="flex gap-2">
            <input type="hidden" name="holat" value={status} />
            <input type="hidden" name="tekshiruv" value={verification} />
            <input type="hidden" name="manba" value={source} />
            <label htmlFor="q" className="sr-only">
              Izoh yoki koordinata bo‘yicha qidirish
            </label>
            <input
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Izoh yoki koordinata"
              className="h-9 w-56 rounded-sm border border-line bg-surface px-3 text-sm"
            />
            <button
              type="submit"
              className="h-9 rounded-sm border border-line bg-surface px-3 text-sm font-medium hover:bg-paper-100"
            >
              Qidirish
            </button>
          </form>
        </div>
      </div>

      {result.rows.length === 0 ? (
        <p className="mt-5 border border-dashed border-line-strong bg-surface px-4 py-8 text-sm text-ink-500">
          Bu filtrga mos quti yo‘q.
        </p>
      ) : (
        <>
          <Table className="mt-5">
            <thead>
              <tr>
                <Th>Joylashuv</Th>
                <Th>Koordinatalar</Th>
                <Th>Tekshiruv</Th>
                <Th>Manba</Th>
                <Th>Holat</Th>
                <Th numeric>Xabarlar</Th>
                <Th>Qo‘shilgan</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((bin) => (
                <tr key={bin.id} className="hover:bg-paper-50">
                  <Td className="max-w-[20rem]">
                    <span className="block truncate font-medium text-ink-900">
                      {bin.description?.trim() || 'Chiqindi qutisi'}
                    </span>
                  </Td>
                  <Td>
                    <Coordinates latitude={bin.latitude} longitude={bin.longitude} />
                  </Td>
                  <Td>
                    <StatusMark
                      mark={verificationMark[bin.verificationStatus]}
                      label={verificationStatusShortLabel[bin.verificationStatus]}
                      title={verificationStatusLabel[bin.verificationStatus]}
                    />
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-ink-700">
                      <span
                        aria-hidden
                        className={`size-2 rounded-xs ${
                          bin.source === 'admin' ? 'bg-forest-700' : 'bg-moss-500'
                        }`}
                      />
                      {binSourceShortLabel[bin.source]}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={bin.status === 'active' ? 'forest' : 'neutral'}>
                      {binStatusLabel[bin.status]}
                    </Badge>
                  </Td>
                  <Td numeric>
                    {bin.openReportCount > 0 ? (
                      <span className="font-medium text-survey-500">{bin.openReportCount}</span>
                    ) : (
                      <span className="text-ink-400">{bin.totalReportCount}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-ink-500">{formatDate(bin.createdAt)}</Td>
                  <Td>
                    <Link
                      href={`/boshqaruv/qutilar/${bin.id}`}
                      className="font-medium text-forest-700 underline underline-offset-2"
                    >
                      Ochish
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            hrefFor={(p) => hrefFor({ sahifa: p })}
          />
        </>
      )}
    </AdminPage>
  );
}
