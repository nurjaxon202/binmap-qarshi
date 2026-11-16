import Link from 'next/link';

import { listAuditActions, listAuditLog } from '@/lib/db/audit';
import { AdminPage, FilterTabs, Pagination, Table, Td, Th } from '@/components/admin/ui';
import { auditActionLabel, formatDateTime } from '@/lib/i18n/uz';
import type { AuditAction } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Amallar jurnali' };

const ENTITY_PATH: Record<string, string> = {
  bin: '/boshqaruv/qutilar',
  bin_submission: '/boshqaruv/takliflar',
  bin_report: '/boshqaruv/xabarlar',
};

/**
 * The audit log.
 *
 * Entries are written by the same transaction as the action they record, so
 * this is a faithful history rather than a best-effort one. Nothing in the
 * application updates or deletes an entry.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin('/boshqaruv/jurnal');

  const params = await searchParams;
  const action = typeof params.amal === 'string' ? params.amal : 'all';
  const page = Number(params.sahifa ?? 1) || 1;

  const [result, actions] = await Promise.all([
    listAuditLog({ action, page, pageSize: 40 }),
    listAuditActions(),
  ]);

  const tabs = [
    { value: 'all', label: 'Hammasi' },
    ...actions.map((value) => ({
      value,
      label: auditActionLabel[value as AuditAction] ?? value,
    })),
  ];

  const hrefFor = (next: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    const merged = { amal: action, sahifa: page, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== 'all' && value !== '' && !(key === 'sahifa' && Number(value) === 1)) {
        sp.set(key, String(value));
      }
    }
    const qs = sp.toString();
    return `/boshqaruv/jurnal${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminPage
      title="Amallar jurnali"
      description="Har bir moderator amali o‘zi o‘zgartirgan yozuv bilan bir tranzaksiyada qayd etiladi."
    >
      {actions.length > 0 ? (
        <FilterTabs
          options={tabs}
          current={action}
          hrefFor={(v) => hrefFor({ amal: v, sahifa: 1 })}
        />
      ) : null}

      {result.rows.length === 0 ? (
        <p className="mt-5 border border-dashed border-line-strong bg-surface px-4 py-8 text-sm text-ink-500">
          Jurnal bo‘sh. Moderator amallari shu yerda ko‘rinadi.
        </p>
      ) : (
        <>
          <Table className="mt-5">
            <thead>
              <tr>
                <Th>Amal</Th>
                <Th>Moderator</Th>
                <Th>Obyekt</Th>
                <Th>Tafsilot</Th>
                <Th>Vaqt</Th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((entry) => {
                const base = ENTITY_PATH[entry.entityType];
                return (
                  <tr key={entry.id} className="hover:bg-paper-50">
                    <Td className="whitespace-nowrap font-medium text-ink-900">
                      {auditActionLabel[entry.action as AuditAction] ?? entry.action}
                    </Td>
                    <Td className="max-w-[16rem]">
                      <span className="block truncate text-ink-600">
                        {entry.administratorEmail ?? 'Tizim'}
                      </span>
                    </Td>
                    <Td>
                      {base && entry.entityId ? (
                        <Link
                          href={`${base}/${entry.entityId}`}
                          className="numeric text-xs font-medium text-forest-700 underline underline-offset-2"
                        >
                          {entry.entityId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="numeric text-xs text-ink-400">
                          {entry.entityId?.slice(0, 8) ?? '—'}
                        </span>
                      )}
                    </Td>
                    <Td className="max-w-[24rem]">
                      {entry.details ? (
                        <code className="block truncate text-xs text-ink-500">
                          {Object.entries(entry.details)
                            .filter(([, value]) => value !== null && value !== false)
                            .map(([key, value]) => `${key}=${String(value)}`)
                            .join('  ')}
                        </code>
                      ) : null}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-500">
                      {formatDateTime(entry.createdAt)}
                    </Td>
                  </tr>
                );
              })}
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
