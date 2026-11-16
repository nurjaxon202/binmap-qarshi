import Link from 'next/link';

import { listSubmissionsForAdmin } from '@/lib/db/submissions';
import { AdminPage, FilterTabs, Pagination, Table, Td, Th } from '@/components/admin/ui';
import { Badge, Coordinates } from '@/components/ui/primitives';
import { formatRelative, submissionStatusLabel, submissionStatusTone } from '@/lib/i18n/uz';
import type { SubmissionStatus } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Takliflar' };

const TABS: { value: string; label: string }[] = [
  { value: 'open', label: 'Navbatda' },
  { value: 'pending', label: 'Yangi' },
  { value: 'under_review', label: 'Jarayonda' },
  { value: 'approved', label: 'Tasdiqlangan' },
  { value: 'rejected', label: 'Rad etilgan' },
  { value: 'all', label: 'Hammasi' },
];

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/boshqaruv/takliflar');

  const params = await searchParams;
  const status = typeof params.holat === 'string' ? params.holat : 'open';
  const query = typeof params.q === 'string' ? params.q : '';
  const page = Number(params.sahifa ?? 1) || 1;

  const result = await listSubmissionsForAdmin({
    status: status as SubmissionStatus | 'all' | 'open',
    query: query || null,
    page,
    pageSize: 20,
  });

  const hrefFor = (next: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    const merged = { holat: status, q: query, sahifa: page, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== '' && value !== undefined && !(key === 'sahifa' && Number(value) === 1)) {
        sp.set(key, String(value));
      }
    }
    const qs = sp.toString();
    return `/boshqaruv/takliflar${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminPage
      title="Takliflar"
      description="Foydalanuvchilar yuborgan joylashuvlar. Tasdiqlanmaguncha ommaviy xaritada ko‘rinmaydi."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs options={TABS} current={status} hrefFor={(v) => hrefFor({ holat: v, sahifa: 1 })} />
        <form action="/boshqaruv/takliflar" className="flex gap-2">
          <input type="hidden" name="holat" value={status} />
          <label htmlFor="q" className="sr-only">
            Izoh, koordinata yoki pochta bo‘yicha qidirish
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Izoh, koordinata, pochta"
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

      {result.rows.length === 0 ? (
        <p className="mt-5 border border-dashed border-line-strong bg-surface px-4 py-8 text-sm text-ink-500">
          Bu filtrga mos taklif yo‘q.
        </p>
      ) : (
        <>
          <Table className="mt-5">
            <thead>
              <tr>
                <Th>Taklif</Th>
                <Th>Koordinatalar</Th>
                <Th>Yuborgan</Th>
                <Th>Holat</Th>
                <Th>Yuborilgan</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {result.rows.map((submission) => (
                <tr key={submission.id} className="hover:bg-paper-50">
                  <Td className="max-w-[22rem]">
                    <span className="block truncate font-medium text-ink-900">
                      {submission.description?.trim() || 'Izohsiz'}
                    </span>
                    {submission.photoUrl ? (
                      <span className="text-xs text-ink-400">surat bor</span>
                    ) : null}
                  </Td>
                  <Td>
                    <Coordinates
                      latitude={submission.latitude}
                      longitude={submission.longitude}
                    />
                  </Td>
                  <Td className="max-w-[14rem]">
                    <span className="block truncate text-ink-600">
                      {submission.submitterEmail ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={submissionStatusTone[submission.status]}>
                      {submissionStatusLabel[submission.status]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-500">
                    {formatRelative(submission.createdAt)}
                  </Td>
                  <Td>
                    <Link
                      href={`/boshqaruv/takliflar/${submission.id}`}
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
