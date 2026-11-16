import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DUPLICATE_WARNING_RADIUS_M, directionsUrl } from '@/lib/config';
import { getSubmissionForAdmin } from '@/lib/db/submissions';
import { findNearestBin } from '@/lib/db/bins';
import { listAuditForEntity } from '@/lib/db/audit';
import { AdminPage, DetailRow } from '@/components/admin/ui';
import {
  InternalNoteForm,
  StartReviewForm,
  SubmissionReviewForm,
} from '@/components/admin/forms';
import { Badge, Coordinates, Notice } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/Button';
import {
  auditActionLabel,
  formatDateTime,
  formatRelative,
  submissionStatusLabel,
  submissionStatusTone,
} from '@/lib/i18n/uz';
import { formatDistance } from '@/lib/geo';
import type { AuditAction } from '@/lib/types';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Taklif' };

export default async function AdminSubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin('/boshqaruv/takliflar');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const submission = await getSubmissionForAdmin(id);
  if (!submission) notFound();

  const [nearest, history] = await Promise.all([
    findNearestBin(
      { latitude: submission.latitude, longitude: submission.longitude },
      150,
      submission.cityId,
    ),
    listAuditForEntity('bin_submission', id),
  ]);

  const decided = submission.status === 'approved' || submission.status === 'rejected';

  return (
    <AdminPage
      title={submission.description?.trim() || 'Izohsiz taklif'}
      description={`${submission.cityName} — ${formatDateTime(submission.createdAt)}`}
      actions={
        <>
          <ButtonLink href="/boshqaruv/takliflar" variant="ghost" size="sm">
            Ro‘yxatga qaytish
          </ButtonLink>
          <ButtonLink
            href={directionsUrl({
              latitude: submission.latitude,
              longitude: submission.longitude,
            })}
            variant="secondary"
            size="sm"
          >
            Navigatsiyada ochish
          </ButtonLink>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ------------------------- the evidence ------------------------ */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={submissionStatusTone[submission.status]}>
              {submissionStatusLabel[submission.status]}
            </Badge>
            {submission.status === 'pending' ? <StartReviewForm submissionId={id} /> : null}
          </div>

          {submission.photoUrl ? (
            <figure className="border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={submission.photoUrl}
                alt="Taklif bilan yuborilgan surat"
                className="w-full object-contain"
              />
              <figcaption className="border-t border-line px-3 py-2 text-xs text-ink-500">
                Maxfiy saqlanadi. Tasdiqlangandan keyingina ommaviy bo‘ladi.
              </figcaption>
            </figure>
          ) : (
            <p className="border border-dashed border-line-strong bg-surface px-4 py-6 text-sm text-ink-500">
              Suratsiz taklif.
            </p>
          )}

          <dl className="border border-line bg-surface px-4">
            <DetailRow term="Koordinatalar">
              <Coordinates latitude={submission.latitude} longitude={submission.longitude} />
            </DetailRow>
            <DetailRow term="Yuborgan">{submission.submitterEmail ?? '—'}</DetailRow>
            <DetailRow term="Yuborilgan">{formatDateTime(submission.createdAt)}</DetailRow>
            {submission.reviewedAt ? (
              <DetailRow term="Ko‘rilgan">
                {formatDateTime(submission.reviewedAt)}
                {submission.reviewerEmail ? ` — ${submission.reviewerEmail}` : ''}
              </DetailRow>
            ) : null}
            {submission.resultingBinId ? (
              <DetailRow term="Yaratilgan quti">
                <Link
                  href={`/boshqaruv/qutilar/${submission.resultingBinId}`}
                  className="font-medium text-forest-700 underline underline-offset-2"
                >
                  Qutini ochish
                </Link>
              </DetailRow>
            ) : null}
          </dl>

          {/* The context that matters most before approving. */}
          {nearest ? (
            <Notice
              tone={nearest.distanceMeters <= DUPLICATE_WARNING_RADIUS_M ? 'warning' : 'info'}
              title="Yaqin atrofdagi mavjud quti"
            >
              <p>
                Eng yaqin quti{' '}
                <strong className="numeric font-semibold">
                  {formatDistance(nearest.distanceMeters)}
                </strong>{' '}
                narida
                {nearest.description ? ` («${nearest.description}»)` : ''}.{' '}
                <Link
                  href={`/boshqaruv/qutilar/${nearest.id}`}
                  className="font-medium underline underline-offset-2"
                >
                  Ko‘rish
                </Link>
              </p>
            </Notice>
          ) : (
            <Notice tone="info" title="Yaqin atrofda quti yo‘q">
              <p>150 metr radiusda ro‘yxatga olingan quti topilmadi.</p>
            </Notice>
          )}

          <div className="border border-line bg-surface p-4">
            <InternalNoteForm submissionId={id} note={submission.internalNote} />
          </div>

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

        {/* -------------------------- the decision ----------------------- */}
        <div>
          <div className="border border-line bg-surface p-5">
            <h2 className="text-lg text-ink-900">Qaror</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              Tasdiqlash yangi ommaviy quti yaratadi, taklifni unga bog‘laydi va amallar
              jurnaliga yozadi — bularning hammasi bitta tranzaksiyada.
            </p>
            <div className="mt-5">
              <SubmissionReviewForm
                submissionId={id}
                latitude={submission.latitude}
                longitude={submission.longitude}
                description={submission.description}
                decided={decided}
              />
            </div>
          </div>

          {submission.reviewNote ? (
            <div className="mt-5 border border-line bg-paper-100 p-4">
              <p className="text-xs font-semibold text-ink-600">
                Taklif muallifiga ko‘rinadigan izoh
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-800">
                {submission.reviewNote}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </AdminPage>
  );
}
