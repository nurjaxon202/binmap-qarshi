'use client';

import Link from 'next/link';
import { Flag, Navigation, Share2, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { directionsUrl, type PublicMapConfig } from '@/lib/config';
import { formatDistance, haversineMeters, walkingMinutes, type LatLng } from '@/lib/geo';
import {
  binSourceHint,
  binSourceLabel,
  formatDate,
  formatRelative,
  reportStatusLabel,
  reportTypeShortLabel,
  verificationStatusHint,
  verificationStatusLabel,
} from '@/lib/i18n/uz';
import {
  Coordinates,
  SectionLabel,
  SourceBadge,
  Spinner,
  StatusMark,
  verificationMark,
} from '@/components/ui/primitives';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { PublicBin } from '@/lib/types';
import type { PublicReportSummary } from '@/lib/db/reports';

export interface BinDetail {
  bin: PublicBin;
  reports: PublicReportSummary[];
}

/**
 * Everything known publicly about one bin.
 *
 * Deliberately absent: who proposed it, who reported it, and any internal
 * note. What is present is stated plainly — including, for a demonstration
 * record, that it is not a real location.
 *
 * The distance is the largest thing on the panel, because it is what somebody
 * standing on a pavement actually came for.
 */
export function BinDetailPanel({
  detail,
  loading,
  origin,
  mapConfig,
  onClose,
  signedIn,
  className,
}: {
  detail: BinDetail | null;
  loading: boolean;
  origin: LatLng | null;
  mapConfig: PublicMapConfig;
  onClose: () => void;
  signedIn: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (loading && !detail) {
    return (
      <div className={cn('p-5', className)}>
        <Spinner label="Quti ma’lumotlari yuklanmoqda" />
      </div>
    );
  }
  if (!detail) return null;

  const { bin, reports } = detail;
  const distance = origin ? haversineMeters(origin, bin) : null;
  const openReports = reports.filter((r) => r.status !== 'resolved');
  const mark = verificationMark[bin.verificationStatus];

  const share = async () => {
    const url = `${window.location.origin}/xarita?quti=${bin.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BinMap — chiqindi qutisi', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* the person dismissed the share sheet */
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="mt-0.5 min-w-0 text-[1.0625rem] leading-snug text-ink-900">
          {bin.description?.trim() || 'Chiqindi qutisi'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 -mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-paper-200 hover:text-ink-900"
        >
          <X aria-hidden className="size-[1.125rem]" />
          <span className="sr-only">Panelni yopish</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* The measurement block: what somebody standing nearby came for. */}
        <div className="border-b border-line px-5 py-4">
          {distance !== null ? (
            <div className="flex items-end gap-3">
              <p
                className="numeric text-[2.5rem] leading-none font-medium text-forest-700"
                aria-label={`Taxminiy masofa ${formatDistance(distance)}`}
              >
                {formatDistance(distance)}
              </p>
              <p className="pb-1 text-sm text-ink-500">
                taxminan {walkingMinutes(distance)} daqiqa piyoda
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-ink-500">
              Masofani ko‘rish uchun joylashuvingizni aniqlang yoki xaritadan boshlang‘ich nuqtani
              tanlang.
            </p>
          )}
          <Coordinates latitude={bin.latitude} longitude={bin.longitude} className="mt-3 block" />
        </div>

        {bin.photoUrl ? (
          <figure className="border-b border-line bg-paper-200">
            {/* A plain <img>: the source is either our own media route or a
                Supabase public URL, both sized at upload time. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={bin.photoUrl}
              alt="Quti surati"
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full object-cover"
            />
          </figure>
        ) : null}

        <div className="space-y-5 px-5 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusMark
                mark={mark}
                label={verificationStatusLabel[bin.verificationStatus]}
                className="font-medium"
              />
              <SourceBadge source={bin.source} />
            </div>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
              {verificationStatusHint[bin.verificationStatus]}
            </p>
            {/* Where the record came from is part of reading it, not a
                caveat appended to it. */}
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-500">
              {binSourceHint[bin.source]}
            </p>
          </div>

          {/* The record's own history, stated in full rather than implied by
              the badges above: when it arrived, when anybody last stood in
              front of it, who put it there and how far it has been checked.
              An unverified bin says so instead of leaving a blank row. */}
          <div>
            <SectionLabel>Joylashuv tarixi</SectionLabel>
            <dl className="mt-2 divide-y divide-line text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-500">Xaritaga qo‘shilgan</dt>
                <dd className="text-ink-900">{formatDate(bin.createdAt)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-500">So‘nggi tekshiruv</dt>
                <dd className={bin.verifiedAt ? 'text-ink-900' : 'text-ink-400'}>
                  {bin.verifiedAt ? formatDate(bin.verifiedAt) : 'Hali tekshirilmagan'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-500">Ma’lumot manbasi</dt>
                <dd className="text-right text-ink-900">{binSourceLabel[bin.source]}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-ink-500">Tekshiruv holati</dt>
                <dd className="text-right text-ink-900">
                  {verificationStatusLabel[bin.verificationStatus]}
                </dd>
              </div>
              {openReports.length > 0 ? (
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-ink-500">Ochiq xabarlar</dt>
                  <dd className="tabular font-medium text-survey-500">{openReports.length}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {reports.length > 0 ? (
            <section>
              <SectionLabel>Kelgan xabarlar</SectionLabel>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {reports.map((report, index) => (
                  <li
                    key={`${report.createdAt}-${index}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5 text-sm"
                  >
                    <span className="text-ink-800">{reportTypeShortLabel[report.reportType]}</span>
                    <span className="flex items-baseline gap-2.5">
                      <span className="text-xs text-ink-500">
                        {reportStatusLabel[report.status]}
                      </span>
                      <time
                        dateTime={report.createdAt}
                        className="text-xs text-ink-400"
                        title={formatDate(report.createdAt)}
                      >
                        {formatRelative(report.createdAt)}
                      </time>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-ink-400">
                Xabar yuborgan foydalanuvchilar ko‘rsatilmaydi.
              </p>
            </section>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 space-y-2.5 border-t border-line bg-paper-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <ButtonLink
            href={directionsUrl(bin, origin, mapConfig.directionsProvider)}
            fullWidth
            className="min-w-0"
          >
            <Navigation aria-hidden className="size-4" />
            <span className="truncate">Yo‘l ko‘rsatish</span>
          </ButtonLink>
          <Button variant="secondary" onClick={share} className="shrink-0 px-3">
            <Share2 aria-hidden className="size-4" />
            <span className="sr-only">{copied ? 'Havola nusxalandi' : 'Havolani nusxalash'}</span>
          </Button>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-ink-400">
          {mapConfig.directionsProviderLabel} xizmatida ochiladi. BinMap piyoda marshrutni o‘zi
          hisoblamaydi.
        </p>
        {signedIn ? (
          <ButtonLink href={`/xabar-berish/${bin.id}`} variant="secondary" size="sm" fullWidth>
            <Flag aria-hidden className="size-4" />
            Muammo haqida xabar berish
          </ButtonLink>
        ) : (
          <p className="text-xs leading-relaxed text-ink-500">
            Muammo haqida xabar berish uchun{' '}
            <Link
              href={`/kirish?keyin=${encodeURIComponent(`/xabar-berish/${bin.id}`)}`}
              className="font-medium text-forest-700 underline underline-offset-2"
            >
              tizimga kiring
            </Link>
            .
          </p>
        )}
        {copied ? (
          <p role="status" className="text-xs font-medium text-forest-700">
            Havola nusxalandi.
          </p>
        ) : null}
      </div>
    </div>
  );
}
