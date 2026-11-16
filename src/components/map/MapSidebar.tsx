'use client';

import { LocateFixed, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/lib/cn';
import { formatDistance } from '@/lib/geo';
import {
  binSourceLabel,
  binSourceShortLabel,
  reportTypeShortLabel,
  verificationStatusHint,
  verificationStatusLabel,
  verificationStatusShortLabel,
} from '@/lib/i18n/uz';
import {
  Coordinates,
  SectionLabel,
  Spinner,
  SurveyMark,
  verificationMark,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/form';
import type { BinSource, PublicBin, VerificationStatus } from '@/lib/types';

/* --------------------------------- legend --------------------------------- */

const LEGEND_ORDER: VerificationStatus[] = ['verified', 'community', 'needs_recheck'];

/**
 * The confidence legend.
 *
 * This is the key to the whole map, so it is shown rather than hidden behind
 * a control: each texture, what it means, and how many locations carry it.
 * Counts come from what is on screen, so the legend can never contradict the
 * map.
 */
export function ConfidenceLegend({
  counts,
  sourceCounts,
  className,
}: {
  counts: Record<VerificationStatus, number>;
  sourceCounts: Record<BinSource, number>;
  className?: string;
}) {
  const total = sourceCounts.admin + sourceCounts.community;

  return (
    <div className={className}>
      <SectionLabel>Belgilar izohi</SectionLabel>
      <ul className="mt-3 space-y-2.5">
        {LEGEND_ORDER.map((status) => {
          const mark = verificationMark[status];
          return (
            <li key={status} className="flex items-start gap-2.5">
              <SurveyMark
                texture={mark.texture}
                size={13}
                className={cn('mt-0.5', mark.className)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.8125rem] font-medium text-ink-800">
                    {verificationStatusLabel[status]}
                  </span>
                  <span className="numeric text-xs text-ink-400">{counts[status]}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                  {verificationStatusHint[status]}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* Where the information came from, as a proportion of what is shown. */}
      {total > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <SectionLabel>Ma’lumot manbasi</SectionLabel>
          <div
            className="mt-2.5 flex h-1.5 overflow-hidden rounded-xs bg-paper-200"
            role="img"
            aria-label={`${sourceCounts.admin} ta administrator kiritgan, ${sourceCounts.community} ta foydalanuvchi yuborgan`}
          >
            <div
              className="bg-forest-700"
              style={{ width: `${(sourceCounts.admin / total) * 100}%` }}
            />
            <div
              className="bg-moss-500"
              style={{ width: `${(sourceCounts.community / total) * 100}%` }}
            />
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            <li className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-600">
                <span aria-hidden className="size-2 rounded-xs bg-forest-700" />
                {binSourceLabel.admin}
              </span>
              <span className="numeric text-ink-400">{sourceCounts.admin}</span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-600">
                <span aria-hidden className="size-2 rounded-xs bg-moss-500" />
                {binSourceLabel.community}
              </span>
              <span className="numeric text-ink-400">{sourceCounts.community}</span>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- search --------------------------------- */

export interface GeocodeHit {
  label: string;
  latitude: number;
  longitude: number;
}

/**
 * Place search.
 *
 * A form with an explicit submit, never a keystroke listener: the default
 * geocoder (Nominatim) prohibits autocomplete, and honouring that is simpler
 * than working around it. When search is unavailable the box says so and
 * points at choosing a point on the map instead.
 */
export function MapSearch({
  enabled,
  onPick,
  className,
}: {
  enabled: boolean;
  onPick: (hit: GeocodeHit) => void;
  className?: string;
}) {
  const [value, setValue] = useState('');
  const [hits, setHits] = useState<GeocodeHit[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'empty'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const inputId = useId();
  const resultsId = `${inputId}-results`;

  if (!enabled) {
    return (
      <p className={cn('text-xs leading-relaxed text-ink-500', className)}>
        Qidiruv xizmati sozlanmagan. Joyni xaritani siljitib tanlashingiz mumkin.
      </p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = value.trim();
    if (query.length < 2) {
      setState('error');
      setMessage('Kamida 2 belgi kiriting.');
      return;
    }

    setState('loading');
    setMessage(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json()) as {
        hits?: GeocodeHit[];
        error?: string;
        disabled?: boolean;
      };

      if (body.error) {
        setState('error');
        setMessage(body.error);
        setHits(null);
        return;
      }
      const found = body.hits ?? [];
      setHits(found);
      setState(found.length === 0 ? 'empty' : 'idle');
      if (found.length === 0) setMessage('Hech narsa topilmadi. Boshqa nom bilan urinib ko‘ring.');
    } catch {
      setState('error');
      setMessage('Qidiruvni bajarib bo‘lmadi. Internet aloqasini tekshiring.');
      setHits(null);
    }
  }

  return (
    <div className={className}>
      <form onSubmit={submit} role="search" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
          />
          <label htmlFor={inputId} className="sr-only">
            Joy nomi bo‘yicha qidirish
          </label>
          <Input
            id={inputId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ko‘cha yoki joy nomi"
            enterKeyHint="search"
            autoComplete="off"
            aria-describedby={message ? `${inputId}-msg` : undefined}
            aria-controls={resultsId}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={state === 'loading'} className="shrink-0">
          {state === 'loading' ? <Spinner label="Qidirilmoqda" /> : 'Qidirish'}
        </Button>
      </form>

      {message ? (
        <p
          id={`${inputId}-msg`}
          role="status"
          className={cn(
            'mt-2 text-xs leading-relaxed',
            state === 'error' ? 'text-survey-500' : 'text-ink-500',
          )}
        >
          {message}
        </p>
      ) : null}

      <ul id={resultsId} className="mt-2 space-y-px">
        {(hits ?? []).map((hit) => (
          <li key={`${hit.latitude},${hit.longitude}-${hit.label}`}>
            <button
              type="button"
              onClick={() => {
                onPick(hit);
                setHits(null);
              }}
              className="flex w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-ink-700 hover:bg-paper-200"
            >
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-moss-500" />
              <span className="min-w-0 flex-1 leading-snug">{hit.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------- filters -------------------------------- */

export interface MapFilters {
  verification: VerificationStatus | 'all';
  source: BinSource | 'all';
  onlyWithReports: boolean;
}

export const defaultFilters: MapFilters = {
  verification: 'all',
  source: 'all',
  onlyWithReports: false,
};

export function applyFilters(bins: PublicBin[], filters: MapFilters): PublicBin[] {
  return bins.filter((bin) => {
    if (filters.verification !== 'all' && bin.verificationStatus !== filters.verification) {
      return false;
    }
    if (filters.source !== 'all' && bin.source !== filters.source) return false;
    if (filters.onlyWithReports && bin.openReportCount === 0) return false;
    return true;
  });
}

const VERIFICATION_OPTIONS: { value: VerificationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Hammasi' },
  { value: 'verified', label: verificationStatusShortLabel.verified },
  { value: 'community', label: verificationStatusShortLabel.community },
  { value: 'needs_recheck', label: verificationStatusShortLabel.needs_recheck },
];

const SOURCE_OPTIONS: { value: BinSource | 'all'; label: string }[] = [
  { value: 'all', label: 'Hammasi' },
  { value: 'admin', label: binSourceShortLabel.admin },
  { value: 'community', label: binSourceShortLabel.community },
];

function Chips<T extends string>({
  options,
  value,
  onChange,
  legend,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  legend: string;
}) {
  return (
    <fieldset>
      <legend className="text-[0.8125rem] font-medium text-ink-700">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-8 rounded-sm border px-2.5 text-xs font-medium transition-colors',
              value === option.value
                ? 'border-forest-700 bg-forest-700 text-paper-50'
                : 'border-line bg-surface text-ink-600 hover:bg-paper-100',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function MapFilterControls({
  filters,
  onChange,
  className,
}: {
  filters: MapFilters;
  onChange: (next: MapFilters) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const active =
    filters.verification !== 'all' || filters.source !== 'all' || filters.onlyWithReports;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors',
          active
            ? 'border-forest-600/30 bg-moss-100 text-forest-700'
            : 'border-line bg-surface text-ink-600 hover:bg-paper-100',
        )}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filtrlar
        {active ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      </button>

      {open ? (
        <div className="mt-3 space-y-4 border-y border-line py-4">
          <Chips
            legend="Tekshiruv holati"
            options={VERIFICATION_OPTIONS}
            value={filters.verification}
            onChange={(verification) => onChange({ ...filters, verification })}
          />
          <Chips
            legend="Ma’lumot manbasi"
            options={SOURCE_OPTIONS}
            value={filters.source}
            onChange={(source) => onChange({ ...filters, source })}
          />

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={filters.onlyWithReports}
              onChange={(event) => onChange({ ...filters, onlyWithReports: event.target.checked })}
              className="mt-0.5 size-4 accent-forest-700"
            />
            <span className="text-ink-800">Faqat ochiq muammo xabari bor qutilar</span>
          </label>

          {active ? (
            <Button variant="ghost" size="sm" onClick={() => onChange(defaultFilters)}>
              Filtrlarni tozalash
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------- nearby list ------------------------------ */

export interface NearbyEntry extends PublicBin {
  distanceMeters: number;
}

export function NearbyList({
  entries,
  loading,
  error,
  radiusMeters,
  originLabel,
  selectedId,
  onSelect,
  onLocate,
  locateState,
  className,
}: {
  entries: NearbyEntry[] | null;
  loading: boolean;
  error: string | null;
  radiusMeters: number;
  originLabel: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLocate: () => void;
  locateState: 'idle' | 'locating' | 'ready' | 'error';
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-3 px-5 pt-4">
        <Button
          variant={locateState === 'ready' ? 'secondary' : 'primary'}
          fullWidth
          onClick={onLocate}
          disabled={locateState === 'locating'}
        >
          {locateState === 'locating' ? (
            <Spinner label="Joylashuv aniqlanmoqda" />
          ) : (
            <LocateFixed aria-hidden className="size-4" />
          )}
          {locateState === 'ready' ? 'Joylashuvni yangilash' : 'Joylashuvimni aniqlash'}
        </Button>

        {originLabel ? (
          <p className="text-xs leading-relaxed text-ink-500">
            {originLabel} atrofidagi{' '}
            <span className="numeric">{formatDistance(radiusMeters)}</span> ichida
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-ink-500">
            Joylashuvingizni aniqlang yoki xaritada joy qidiring. Joylashuvni ulashish shart emas.
          </p>
        )}

        {error ? (
          <p role="status" className="text-xs leading-relaxed text-survey-500">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-line">
        {loading && !entries ? (
          <div className="p-5">
            <Spinner label="Qutilar izlanmoqda" />
          </div>
        ) : null}

        {entries && entries.length === 0 ? (
          <p className="px-5 py-8 text-sm leading-relaxed text-ink-500">
            Bu radiusda quti topilmadi. Xaritani kattalashtiring yoki{' '}
            <a
              href="/quti-qoshish"
              className="font-medium text-forest-700 underline underline-offset-2"
            >
              yangi quti qo‘shing
            </a>
            .
          </p>
        ) : null}

        <ul className="divide-y divide-line">
          {(entries ?? []).map((entry) => {
            const mark = verificationMark[entry.verificationStatus];
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  aria-current={entry.id === selectedId ? 'true' : undefined}
                  className={cn(
                    'w-full px-5 py-3 text-left transition-colors hover:bg-paper-100',
                    entry.id === selectedId && 'bg-moss-100',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <SurveyMark
                        texture={mark.texture}
                        size={11}
                        className={cn('translate-y-px', mark.className)}
                      />
                      <span className="truncate text-sm font-medium text-ink-900">
                        {entry.description?.trim() || 'Chiqindi qutisi'}
                      </span>
                    </span>
                    <span className="numeric shrink-0 text-sm text-forest-700">
                      {formatDistance(entry.distanceMeters)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[1.1875rem]">
                    <Coordinates
                      latitude={entry.latitude}
                      longitude={entry.longitude}
                      className="text-[0.6875rem]"
                    />
                    {entry.lastReportType && entry.openReportCount > 0 ? (
                      <span className="text-xs text-survey-500">
                        {reportTypeShortLabel[entry.lastReportType]}
                      </span>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
