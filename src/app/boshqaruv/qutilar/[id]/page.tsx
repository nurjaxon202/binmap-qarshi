import Link from 'next/link';
import { notFound } from 'next/navigation';

import { directionsUrl } from '@/lib/config';
import { getBinForAdmin, listVerifications, summariseReportsForBin } from '@/lib/db/bins';
import { listReportsForAdmin } from '@/lib/db/reports';
import { listAuditForEntity } from '@/lib/db/audit';
import { AdminPage, DetailRow, Table, Td, Th } from '@/components/admin/ui';
import { RecordVerificationForm, UpdateBinForm } from '@/components/admin/forms';
import { ButtonLink } from '@/components/ui/Button';
import {
  Badge,
  Coordinates,
  SourceBadge,
  StatusMark,
  verificationMark,
} from '@/components/ui/primitives';
import {
  auditActionLabel,
  binStatusLabel,
  formatDateTime,
  formatRelative,
  reportStatusLabel,
  reportStatusTone,
  reportTypeShortLabel,
  verificationOutcomeLabel,
  verificationStatusLabel,
} from '@/lib/i18n/uz';
import type { AuditAction } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Quti' };

export default async function AdminBinDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin('/boshqaruv/qutilar');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const bin = await getBinForAdmin(id);
  if (!bin) notFound();

  const [reports, summary, history, verifications] = await Promise.all([
    listReportsForAdmin({ binId: id, status: 'all', pageSize: 25 }),
    summariseReportsForBin(id),
    listAuditForEntity('bin', id),
    listVerifications(id),
  ]);

  return (
    <AdminPage
      title={bin.description?.trim() || 'Chiqindi qutisi'}
      description={`${bin.cityName} — ${formatDateTime(bin.createdAt)}`}
      actions={
        <>
          <ButtonLink href="/boshqaruv/qutilar" variant="ghost" size="sm">
            Ro‘yxatga qaytish
          </ButtonLink>
          {bin.status === 'active' ? (
            <ButtonLink href={`/xarita?quti=${bin.id}`} variant="ghost" size="sm">
              Ommaviy xaritada
            </ButtonLink>
          ) : null}
          <ButtonLink
            href={directionsUrl({ latitude: bin.latitude, longitude: bin.longitude })}
            variant="secondary"
            size="sm"
          >
            Navigatsiyada ochish
          </ButtonLink>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusMark
              mark={verificationMark[bin.verificationStatus]}
              label={verificationStatusLabel[bin.verificationStatus]}
            />
            <Badge tone={bin.status === 'active' ? 'forest' : 'neutral'}>
              {binStatusLabel[bin.status]}
            </Badge>
            <SourceBadge source={bin.source} />
          </div>

          {bin.photoUrl ? (
            <figure className="border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bin.photoUrl} alt="Quti surati" className="w-full object-contain" />
            </figure>
          ) : null}

          <dl className="border border-line bg-surface px-4">
            <DetailRow term="Koordinatalar">
              <Coordinates latitude={bin.latitude} longitude={bin.longitude} />
            </DetailRow>
            <DetailRow term="Qo‘shilgan">{formatDateTime(bin.createdAt)}</DetailRow>
            <DetailRow term="Oxirgi o‘zgarish">{formatDateTime(bin.updatedAt)}</DetailRow>
            {bin.verifiedAt ? (
              <DetailRow term="Joyida tekshirilgan">{formatDateTime(bin.verifiedAt)}</DetailRow>
            ) : null}
            <DetailRow term="Ochiq xabarlar">
              <span className="numeric">{bin.openReportCount}</span>
              <span className="text-ink-400">
                {' '}
                / jami <span className="numeric">{bin.totalReportCount}</span>
              </span>
            </DetailRow>
            {summary.length > 0 ? (
              <DetailRow term="Xabar turlari">
                {summary
                  .map((item) => `${reportTypeShortLabel[item.reportType]}: ${item.count}`)
                  .join(', ')}
              </DetailRow>
            ) : null}
          </dl>

          {reports.rows.length > 0 ? (
            <section>
              <h2 className="text-base text-ink-900">Bu quti bo‘yicha xabarlar</h2>
              <Table className="mt-2">
                <thead>
                  <tr>
                    <Th>Tur</Th>
                    <Th>Holat</Th>
                    <Th>Yuborilgan</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {reports.rows.map((report) => (
                    <tr key={report.id}>
                      <Td className="whitespace-nowrap">
                        {reportTypeShortLabel[report.reportType]}
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
            </section>
          ) : null}

          {/* Every recorded visit, not just the latest date. A bin whose
              last-checked field says March is a different thing from one
              checked three times since. */}
          <section>
            <h2 className="text-base text-ink-900">Tekshiruv tarixi</h2>
            {verifications.length === 0 ? (
              <p className="mt-2 border border-dashed border-line-strong bg-surface px-4 py-5 text-sm text-ink-500">
                Bu joylashuv hali joyida tekshirilmagan.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line border border-line bg-surface">
                {verifications.map((event) => (
                  <li key={event.id} className="px-4 py-2.5 text-sm">
                    <p className="text-ink-900">{verificationOutcomeLabel[event.outcome]}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {event.verifiedByName ?? 'Tizim'}, {formatDateTime(event.createdAt)}
                    </p>
                    {event.note ? (
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{event.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {history.length > 0 ? (
            <section>
              <h2 className="text-base text-ink-900">Amallar jurnali</h2>
              <ul className="mt-2 divide-y divide-line border border-line bg-surface">
                {history.map((entry) => (
                  <li key={entry.id} className="px-4 py-2.5 text-sm">
                    <p className="text-ink-900">
                      {auditActionLabel[entry.action as AuditAction] ?? entry.action}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {entry.administratorEmail ?? 'Tizim'}, {formatRelative(entry.createdAt)}
                    </p>
                    {entry.details && typeof entry.details.note === 'string' ? (
                      <p className="mt-1 text-xs text-ink-600">{entry.details.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div>
          {/* Recording a visit is its own action, above editing: it is the
              only thing that sets the last-checked date, and it stamps that
              date itself rather than taking one. */}
          <div className="border border-line bg-surface p-5">
            <h2 className="text-lg text-ink-900">Joyida tekshirish</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Qutini joyida ko‘rganingizdan keyin shu yerda qayd eting. Sana avtomatik
              qo‘yiladi va tekshiruv tarixiga yoziladi.
            </p>
            <div className="mt-5">
              <RecordVerificationForm binId={bin.id} />
            </div>
          </div>

          <div className="mt-6 border border-line bg-surface p-5">
            <h2 className="text-lg text-ink-900">Ma’lumotlarni tahrirlash</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Koordinatani tuzatish, holatni o‘zgartirish yoki tekshiruv darajasini
              yangilash. Har bir o‘zgarish jurnalga yoziladi.
            </p>
            <div className="mt-5">
              <UpdateBinForm
                binId={bin.id}
                latitude={bin.latitude}
                longitude={bin.longitude}
                description={bin.description}
                status={bin.status}
                verificationStatus={bin.verificationStatus}
              />
            </div>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
