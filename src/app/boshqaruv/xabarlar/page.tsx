import Link from 'next/link';

import { listReportsForAdmin } from '@/lib/db/reports';
import { AdminPage, FilterTabs, Pagination, Table, Td, Th } from '@/components/admin/ui';
import { Badge, Coordinates } from '@/components/ui/primitives';
import {
  formatRelative,
  reportStatusLabel,
  reportStatusTone,
  reportTypeShortLabel,
} from '@/lib/i18n/uz';
import type { ReportStatus, ReportType } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Xabarlar' };

const STATUS_TABS = [
  { value: 'open', label: 'Navbatda' },
  { value: 'submitted', label: 'Yuborilgan' },
  { value: 'reviewing', label: 'Jarayonda' },
  { value: 'confirmed', label: 'Tasdiqlangan' },
  { value: 'resolved', label: 'Hal qilingan' },
  { value: 'rejected', label: 'Rad etilgan' },
  { value: 'all', label: 'Hammasi' },
];

const TYPE_TABS = [
  { value: 'all', label: 'Barcha turlar' },
  { value: 'overflowing', label: reportTypeShortLabel.overflowing },
  { value: 'damaged', label: reportTypeShortLabel.damaged },
  { value: 'missing', label: reportTypeShortLabel.missing },
  { value: 'other', label: reportTypeShortLabel.other },
];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/boshqaruv/xabarlar');

  const params = await searchParams;
  const status = typeof params.holat === 'string' ? params.holat : 'open';
  const type = typeof params.tur === 'string' ? params.tur : 'all';
  const page = Number(params.sahifa ?? 1) || 1;

  const result = await listReportsForAdmin({
    status: status as ReportStatus | 'all' | 'open',
    reportType: type as ReportType | 'all',
    page,
    pageSize: 20,
  });

  const hrefFor = (next: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    const merged = { holat: status, tur: type, sahifa: page, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '' && value !== undefined && !(key === 'sahifa' && Number(value) === 1)) {
        sp.set(key, String(value));
      }
    }
    const qs = sp.toString();
    return `/boshqaruv/xabarlar${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminPage
      title="Muammo xabarlari"
      description="Xabar qutini o‘chirmaydi. «Mavjud emas» xabari qutini qayta tekshirishga qo‘yadi."
    >
      <div className="space-y-2">
        <FilterTabs
          options={STATUS_TABS}
          current={status}
          hrefFor={(v) => hrefFor({ holat: v, sahifa: 1 })}
        />
        <FilterTabs
          options={TYPE_TABS}
          current={type}
          hrefFor={(v) => hrefFor({ tur: v, sahifa: 1 })}
        />
      </div>

      {result.rows.length === 0 ? (
        <p className="mt-5 border border-dashed border-line-strong bg-surface px-4 py-8 text-sm text-ink-500">
          Bu filtrga mos xabar yo‘q.
        </p>
      ) : (
        <>
          <Table className="mt-5">
            <thead>
              <tr>
                <Th>Tur</Th>
                <Th>Quti</Th>
                <Th>Izoh</Th>
                <Th>Holat</Th>
                <Th>Yuborilgan</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((report) => (
                <tr key={report.id} className="hover:bg-paper-50">
                  <Td className="whitespace-nowrap font-medium text-ink-900">
                    {reportTypeShortLabel[report.reportType]}
                  </Td>
                  <Td className="max-w-[16rem]">
                    {report.bin ? (
                      <>
                        <span className="block truncate text-ink-800">
                          {report.bin.description?.trim() || 'Chiqindi qutisi'}
                        </span>
                        <Coordinates
                          latitude={report.bin.latitude}
                          longitude={report.bin.longitude}
                          className="text-[0.6875rem]"
                        />
                      </>
                    ) : (
                      <span className="text-ink-400">o‘chirilgan</span>
                    )}
                  </Td>
                  <Td className="max-w-[20rem]">
                    <span className="block truncate text-ink-600">
                      {report.description ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={reportStatusTone[report.status]}>
                      {reportStatusLabel[report.status]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-500">
                    {formatRelative(report.createdAt)}
                  </Td>
                  <Td>
                    <Link
                      href={`/boshqaruv/xabarlar/${report.id}`}
                      className="font-medium text-forest-700 underline underline-offset-2"
                    >
                      Ko‘rish
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
