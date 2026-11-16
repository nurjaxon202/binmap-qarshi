import Link from 'next/link';
import { notFound } from 'next/navigation';

import { directionsUrl } from '@/lib/config';
import { getReportForAdmin } from '@/lib/db/reports';
import { listAuditForEntity } from '@/lib/db/audit';
import { AdminPage, DetailRow } from '@/components/admin/ui';
import { ReportReviewForm } from '@/components/admin/forms';
import { Badge, Coordinates, Notice } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/Button';
import {
  auditActionLabel,
  formatDateTime,
  formatRelative,
  reportStatusLabel,
  reportStatusTone,
  reportTypeLabel,
  verificationStatusLabel,
} from '@/lib/i18n/uz';
import type { AuditAction } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Xabar' };

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin('/boshqaruv/xabarlar');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const report = await getReportForAdmin(id);
  if (!report) notFound();

  const history = await listAuditForEntity('bin_report', id);

  return (
    <AdminPage
      title={reportTypeLabel[report.reportType]}
      description={formatDateTime(report.createdAt)}
      actions={
        <>
          <ButtonLink href="/boshqaruv/xabarlar" variant="ghost" size="sm">
            Ro‘yxatga qaytish
          </ButtonLink>
          {report.bin ? (
            <ButtonLink
              href={directionsUrl({
                latitude: report.bin.latitude,
                longitude: report.bin.longitude,
              })}
              variant="secondary"
              size="sm"
            >
              Navigatsiyada ochish
            </ButtonLink>
          ) : null}
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={reportStatusTone[report.status]}>
              {reportStatusLabel[report.status]}
            </Badge>
          </div>

          {report.description ? (
            <blockquote className="border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-ink-800">
              {report.description}
            </blockquote>
          ) : null}

          {report.photoUrl ? (
            <figure className="border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={report.photoUrl}
                alt="Xabar bilan yuborilgan dalil surati"
                className="w-full object-contain"
              />
              <figcaption className="border-t border-line px-3 py-2 text-xs text-ink-500">
                Dalil surati maxfiy saqlanadi va ommaviy xaritada ko‘rsatilmaydi.
              </figcaption>
            </figure>
          ) : (
            <p className="border border-dashed border-line-strong bg-surface px-4 py-6 text-sm text-ink-500">
              Suratsiz xabar.
            </p>
          )}

          <dl className="border border-line bg-surface px-4">
            <DetailRow term="Yuborgan">{report.submitterEmail ?? '—'}</DetailRow>
            <DetailRow term="Yuborilgan">{formatDateTime(report.createdAt)}</DetailRow>
            {report.resolvedAt ? (
              <DetailRow term="Hal qilingan">{formatDateTime(report.resolvedAt)}</DetailRow>
            ) : null}
            {report.reviewerEmail ? (
              <DetailRow term="Ko‘rgan moderator">{report.reviewerEmail}</DetailRow>
            ) : null}
          </dl>

          {report.bin ? (
            <section>
              <h2 className="text-base text-ink-900">Tegishli quti</h2>
              <dl className="mt-2 border border-line bg-surface px-4">
                <DetailRow term="Joylashuv">
                  <Link
                    href={`/boshqaruv/qutilar/${report.bin.id}`}
                    className="font-medium text-forest-700 underline underline-offset-2"
                  >
                    {report.bin.description?.trim() || 'Chiqindi qutisi'}
                  </Link>
                </DetailRow>
                <DetailRow term="Koordinatalar">
                  <Coordinates
                    latitude={report.bin.latitude}
                    longitude={report.bin.longitude}
                  />
                </DetailRow>
                <DetailRow term="Tekshiruv holati">
                  {verificationStatusLabel[report.bin.verificationStatus]}
                </DetailRow>
              </dl>
            </section>
          ) : null}

          {history.length > 0 ? (
            <section>
              <h2 className="text-base text-ink-900">Tarix</h2>
              <ul className="mt-2 divide-y divide-line border border-line bg-surface">
                {history.map((entry) => (
                  <li key={entry.id} className="px-4 py-2.5 text-sm">
                    <p className="text-ink-900">
                      {auditActionLabel[entry.action as AuditAction] ?? entry.action}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {entry.administratorEmail ?? 'Tizim'}, {formatRelative(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="border border-line bg-surface p-5">
            <h2 className="text-lg text-ink-900">Ko‘rib chiqish</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Holatni yangilash amallar jurnaliga yoziladi. Oxirgi ochiq xabar hal qilinganda
              qutining «qayta tekshirish kerak» belgisi olib tashlanadi.
            </p>
            <div className="mt-5">
              <ReportReviewForm
                reportId={id}
                status={report.status}
                adminNote={report.adminNote}
              />
            </div>
          </div>

          {report.reportType === 'missing' ? (
            <Notice tone="warning" title="«Mavjud emas» xabari">
              <p>
                Bu xabarni tasdiqlash qutini o‘chirmaydi. Agar quti haqiqatan ham yo‘q
                bo‘lsa, qutining o‘zini alohida «faol emas» yoki «olib
                tashlangan» holatiga o‘tkazing.
              </p>
            </Notice>
          ) : null}
        </div>
      </div>
    </AdminPage>
  );
}
