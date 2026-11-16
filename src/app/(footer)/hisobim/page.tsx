import type { Metadata } from 'next';
import Link from 'next/link';

import { requireUser } from '@/lib/auth';
import { listSubmissionsByUser } from '@/lib/db/submissions';
import { listReportsByUser } from '@/lib/db/reports';
import { ProfileForm } from '@/components/auth/AuthForms';
import { ButtonLink } from '@/components/ui/Button';
import {
  Badge,
  Coordinates,
  EmptyState,
  Notice,
  Region,
  SectionLabel,
} from '@/components/ui/primitives';
import {
  formatDate,
  reportStatusLabel,
  reportStatusTone,
  reportTypeLabel,
  roleLabel,
  submissionStatusLabel,
  submissionStatusTone,
} from '@/lib/i18n/uz';
import type { ReportWithContext, SubmissionWithContext } from '@/lib/types';

export const metadata: Metadata = { title: 'Mening hisobim' };

/**
 * A contributor's own record.
 *
 * Shows what they sent and where it got to, including the reason a submission
 * was rejected — that is the submitter's business. What it never shows is the
 * administrators' internal notes, which are not selected by these queries at
 * all.
 */
export default async function AccountPage() {
  const user = await requireUser('/hisobim');

  const [submissions, reports] = await Promise.all([
    listSubmissionsByUser(user.id),
    listReportsByUser(user.id),
  ]);

  const pending = submissions.filter(
    (s) => s.status === 'pending' || s.status === 'under_review',
  ).length;
  const approved = submissions.filter((s) => s.status === 'approved').length;
  const openReports = reports.filter(
    (r) => r.status === 'submitted' || r.status === 'reviewing' || r.status === 'confirmed',
  ).length;

  return (
    <div className="shell py-10 md:py-14">
      <SectionLabel>{roleLabel[user.role]}</SectionLabel>
      <h1 className="mt-4 text-[clamp(2rem,5vw,3rem)]">{user.fullName ?? user.email}</h1>

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-ink-600">
        <span>
          <span className="numeric text-ink-900">{submissions.length}</span> taklif yuborilgan
        </span>
        <span>
          <span className="numeric text-ink-900">{approved}</span> tasdiqlangan
        </span>
        <span>
          <span className="numeric text-ink-900">{pending}</span> ko‘rib chiqilmoqda
        </span>
        <span>
          <span className="numeric text-ink-900">{reports.length}</span> xabar
        </span>
      </div>

      {user.role === 'admin' ? (
        <Notice tone="info" className="mt-6 max-w-xl">
          <p>
            Siz moderatorsiz.{' '}
            <Link href="/boshqaruv" className="font-medium">
              Boshqaruv paneli
            </Link>{' '}
            orqali takliflar va xabarlarni ko‘rib chiqishingiz mumkin.
          </p>
        </Notice>
      ) : null}

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-14">
        <div className="space-y-12">
          {/* ------------------------- submissions ------------------------ */}
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
              <h2 className="text-xl text-ink-900">Mening takliflarim</h2>
              <ButtonLink href="/quti-qoshish" variant="secondary" size="sm">
                Quti qo‘shish
              </ButtonLink>
            </div>

            {submissions.length === 0 ? (
              <EmptyState
                title="Hali taklif yubormagansiz"
                className="mt-5"
                action={<ButtonLink href="/quti-qoshish">Birinchi qutini qo‘shish</ButtonLink>}
              >
                <p>
                  Ko‘chada xaritada belgilanmagan quti ko‘rsangiz, uni qo‘shib, xaritani
                  to‘ldirishga yordam bering.
                </p>
              </EmptyState>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {submissions.map((submission) => (
                  <SubmissionRow key={submission.id} submission={submission} />
                ))}
              </ul>
            )}
          </section>

          {/* --------------------------- reports -------------------------- */}
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
              <h2 className="text-xl text-ink-900">Mening xabarlarim</h2>
              {openReports > 0 ? (
                <span className="text-sm text-ink-500">
                  <span className="numeric">{openReports}</span> tasi ko‘rib chiqilmoqda
                </span>
              ) : null}
            </div>

            {reports.length === 0 ? (
              <EmptyState
                title="Hali xabar yubormagansiz"
                className="mt-5"
                action={<ButtonLink href="/xarita">Xaritani ochish</ButtonLink>}
              >
                <p>
                  Quti to‘lib qolgan, shikastlangan yoki joyida topilmasa, xaritadan qutini tanlab
                  xabar yuboring.
                </p>
              </EmptyState>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {reports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* --------------------------- profile ---------------------------- */}
        <aside className="space-y-6">
          <Region>
            <h2 className="text-lg text-ink-900">Profil</h2>
            <p className="mt-1 text-sm text-ink-500">
              Platformani ishlatish uchun faqat shu ma’lumotlar saqlanadi.
            </p>
            <div className="mt-5">
              <ProfileForm fullName={user.fullName ?? ''} />
            </div>
            <dl className="mt-6 divide-y divide-line border-t border-line text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-500">Elektron pochta</dt>
                <dd className="min-w-0 truncate text-ink-900">{user.email}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-500">Rol</dt>
                <dd className="text-ink-900">{roleLabel[user.role]}</dd>
              </div>
            </dl>
          </Region>

          <Region tone="sunken">
            <h2 className="text-base text-ink-900">Ma’lumotlaringiz</h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-600">
              <li>Yuborgan suratlaringiz faqat moderatorlarga ko‘rinadi.</li>
              <li>Taklif tasdiqlangach, surat ommaviy xaritada ko‘rsatilishi mumkin.</li>
              <li>Suratlardagi GPS ma’lumotlari yuklashda o‘chiriladi.</li>
              <li>Xabar yuborgan foydalanuvchilar xaritada ko‘rsatilmaydi.</li>
            </ul>
          </Region>
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------- rows --------------------------------- */

function SubmissionRow({ submission }: { submission: SubmissionWithContext }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-[0.9375rem] font-medium text-ink-900">
          {submission.description?.trim() || 'Izohsiz taklif'}
        </p>
        <Badge tone={submissionStatusTone[submission.status]}>
          {submissionStatusLabel[submission.status]}
        </Badge>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <Coordinates
          latitude={submission.latitude}
          longitude={submission.longitude}
          className="text-[0.6875rem]"
        />
        <span>Yuborilgan: {formatDate(submission.createdAt)}</span>
        {submission.reviewedAt ? <span>Ko‘rilgan: {formatDate(submission.reviewedAt)}</span> : null}
      </div>

      {/* The decision reason belongs to the submitter. */}
      {submission.reviewNote ? (
        <p className="mt-2.5 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-ink-600">
          <span className="font-medium text-ink-800">Moderator izohi: </span>
          {submission.reviewNote}
        </p>
      ) : null}

      {submission.status === 'approved' && submission.resultingBinId ? (
        <Link
          href={`/xarita?quti=${submission.resultingBinId}`}
          className="mt-2.5 inline-block text-sm font-medium text-forest-700 underline underline-offset-4"
        >
          Xaritada ko‘rish
        </Link>
      ) : null}
    </li>
  );
}

function ReportRow({ report }: { report: ReportWithContext }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-[0.9375rem] font-medium text-ink-900">
          {reportTypeLabel[report.reportType]}
        </p>
        <Badge tone={reportStatusTone[report.status]}>{reportStatusLabel[report.status]}</Badge>
      </div>

      {report.description ? (
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-600">
          {report.description}
        </p>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
        <span>Yuborilgan: {formatDate(report.createdAt)}</span>
        {report.resolvedAt ? <span>Hal qilingan: {formatDate(report.resolvedAt)}</span> : null}
        {report.bin ? (
          <Link
            href={`/xarita?quti=${report.bin.id}`}
            className="font-medium text-forest-700 underline underline-offset-4"
          >
            Qutini xaritada ko‘rish
          </Link>
        ) : null}
      </div>
    </li>
  );
}
