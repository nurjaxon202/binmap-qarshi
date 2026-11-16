'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useActionState, useCallback, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Camera, Check, LocateFixed, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { PublicMapConfig } from '@/lib/config';
import { formatCoordinate, formatDistance, type LatLng } from '@/lib/geo';
import { submitBinAction } from '@/app/actions/submissions';
import { emptySubmissionState } from '@/app/actions/form-state';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Textarea, fieldAria } from '@/components/ui/form';
import { Notice, Spinner } from '@/components/ui/primitives';
import { useGeolocation } from '@/components/map/useGeolocation';
import type { City } from '@/lib/types';

const MapCanvas = dynamic(() => import('@/components/map/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="plan-grid grid size-full place-items-center bg-paper-300">
      <Spinner label="Xarita yuklanmoqda" className="text-forest-700" />
    </div>
  ),
});

/**
 * Proposing a new bin.
 *
 * The map moves under a fixed crosshair rather than a pin being dragged
 * around: one-handed, outdoors, that is the interaction that actually works —
 * the thumb pans, and the target stays put in the middle of the screen.
 *
 * GPS is offered but never required, and the coordinates stay editable by
 * panning afterwards, so an approximate fix can be corrected by hand.
 */
export function SubmitBinForm({
  city,
  mapConfig,
}: {
  city: City;
  mapConfig: PublicMapConfig;
}) {
  const [state, action] = useActionState(submitBinAction, emptySubmissionState);

  const [center, setCenter] = useState<LatLng>({
    latitude: city.centerLatitude,
    longitude: city.centerLongitude,
  });
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const flyKey = useRef(0);
  const [flyTo, setFlyTo] = useState<
    { latitude: number; longitude: number; zoom?: number; key: number } | null
  >(null);

  const geo = useGeolocation({
    onLocated: (position) => {
      flyKey.current += 1;
      setFlyTo({
        latitude: position.latitude,
        longitude: position.longitude,
        zoom: 18,
        key: flyKey.current,
      });
    },
  });

  const geoMessage =
    geo.state.status === 'denied' ||
    geo.state.status === 'unavailable' ||
    geo.state.status === 'timeout'
      ? geo.state.message
      : null;

  const onCenterChange = useCallback((next: LatLng) => setCenter(next), []);

  const onPhotoChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoName(null);
      setPhotoPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      return;
    }
    setPhotoName(file.name);
    setPhotoPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }, []);

  const clearPhoto = useCallback(() => {
    if (photoInput.current) photoInput.current.value = '';
    setPhotoName(null);
    setPhotoPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  /* ------------------------------- success ------------------------------- */

  if (state.ok && state.submissionId) {
    return (
      <div className="border border-forest-600/25 bg-moss-100 p-6 md:p-8">
        <div className="flex size-9 items-center justify-center rounded-full bg-forest-700 text-paper-50">
          <Check aria-hidden className="size-5" />
        </div>
        <h2 className="mt-4 text-xl text-ink-900">Taklif yuborildi</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">{state.notice}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/hisobim">Mening takliflarim</ButtonLink>
          <ButtonLink href="/quti-qoshish" variant="secondary">
            Yana quti qo‘shish
          </ButtonLink>
          <ButtonLink href="/xarita" variant="ghost">
            Xaritaga qaytish
          </ButtonLink>
        </div>
      </div>
    );
  }

  const warning = state.duplicateWarning;

  return (
    <form action={action} className="space-y-8" encType="multipart/form-data">
      <input type="hidden" name="citySlug" value={city.slug} />
      <input type="hidden" name="latitude" value={center.latitude} />
      <input type="hidden" name="longitude" value={center.longitude} />
      {/* Set once the person has seen the duplicate warning and chosen to go on. */}
      <input type="hidden" name="acknowledgedDuplicate" value={warning ? 'true' : 'false'} />

      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      {/* ----------------------------- 1. place ---------------------------- */}
      <section>
        <Step n={1} title="Joylashuvni tanlang" />
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
          Xaritani siljitib, nishonni qutining ustiga qo‘ying. Joylashuvingizni aniqlasangiz,
          xarita o‘sha yerga o‘tadi — keyin uni qo‘lda aniqlashtirishingiz mumkin.
        </p>

        <div className="relative mt-4 h-[clamp(20rem,52vh,30rem)] overflow-hidden rounded-md border border-line">
          <MapCanvas
            mapConfig={mapConfig}
            center={[city.centerLatitude, city.centerLongitude]}
            zoom={16}
            extent={city.extent}
            bins={[]}
            selectedId={null}
            onSelect={() => {}}
            userPosition={
              geo.state.status === 'ready'
                ? {
                    latitude: geo.state.latitude,
                    longitude: geo.state.longitude,
                    approximate: geo.state.approximate,
                  }
                : null
            }
            pickMode
            onCenterChange={onCenterChange}
            flyTo={flyTo}
            className="size-full"
            ariaLabel="Yangi quti joylashuvini tanlash uchun xarita"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="numeric text-sm text-ink-600">
            {formatCoordinate(center.latitude)}, {formatCoordinate(center.longitude)}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={geo.locate}
            disabled={geo.state.status === 'locating'}
          >
            {geo.state.status === 'locating' ? (
              <Spinner label="Aniqlanmoqda" />
            ) : (
              <LocateFixed aria-hidden className="size-4" />
            )}
            Joylashuvimni aniqlash
          </Button>
        </div>

        {geoMessage ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-500" role="status">
            {geoMessage}
          </p>
        ) : null}
        {geo.state.status === 'ready' && geo.state.approximate ? (
          <p className="mt-2 text-xs leading-relaxed text-amber-600" role="status">
            Joylashuv taxminiy (±
            {formatDistance(geo.state.accuracyMeters ?? 0)}). Nishonni qo‘lda aniqlashtiring.
          </p>
        ) : null}
        {state.errors.latitude || state.errors.longitude ? (
          <p className="mt-2 text-xs font-medium text-survey-500">
            {state.errors.latitude ?? state.errors.longitude}
          </p>
        ) : null}
      </section>

      {/* ---------------------------- 2. photo ----------------------------- */}
      <section>
        <Step n={2} title="Surat qo‘shing" optional />
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">
          Surat moderatorga joylashuvni tasdiqlashda yordam beradi. Yuklashdan oldin suratdagi
          GPS va qurilma ma’lumotlari o‘chiriladi.
        </p>

        <div className="mt-4">
          <input
            ref={photoInput}
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={onPhotoChange}
            className="sr-only"
          />
          {photoPreview ? (
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Tanlangan surat"
                className="size-24 shrink-0 rounded-md border border-line object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink-800">{photoName}</p>
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-survey-500 underline underline-offset-4"
                >
                  <X aria-hidden className="size-3.5" />
                  Suratni olib tashlash
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="photo"
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-4 text-[0.9375rem] font-medium text-ink-800 hover:bg-paper-100"
            >
              <Camera aria-hidden className="size-4" />
              Surat tanlash
            </label>
          )}
        </div>

        {state.errors.photo ? (
          <p className="mt-2 text-xs font-medium text-survey-500">{state.errors.photo}</p>
        ) : null}
      </section>

      {/* -------------------------- 3. description ------------------------- */}
      <section>
        <Step n={3} title="Izoh yozing" optional />
        <Field
          label="Joy haqida qisqacha"
          htmlFor="description"
          hint="Masalan: «Avtobus bekati yonida», «Bozor kirish qismida». Shaxsiy ma’lumot yozmang."
          error={state.errors.description}
          className="mt-4"
          optional
        >
          <Textarea
            {...fieldAria('description', {
              hint: true,
              error: Boolean(state.errors.description),
            })}
            name="description"
            maxLength={500}
            rows={3}
          />
        </Field>
      </section>

      {/* --------------------------- duplicate ----------------------------- */}
      {warning ? (
        <Notice tone="warning" title="Yaqin atrofda allaqachon quti bor">
          <p>
            Tanlangan nuqtadan{' '}
            <strong className="numeric font-semibold">
              {formatDistance(warning.distanceMeters)}
            </strong>{' '}
            narida xaritada quti mavjud
            {warning.description ? ` («${warning.description}»)` : ''}.
          </p>
          <p className="mt-2">
            Agar bu boshqa, alohida quti bo‘lsa — davom eting. Agar xuddi shu quti bo‘lsa,
            taklifni yubormang.
          </p>
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <SubmitButton duplicateAcknowledged={Boolean(warning)} />
        <ButtonLink href="/xarita" variant="ghost">
          Bekor qilish
        </ButtonLink>
      </div>

      <p className="text-xs leading-relaxed text-ink-500">
        Taklifingiz darhol xaritada paydo bo‘lmaydi. U moderator ko‘rigidan o‘tgach qo‘shiladi va
        holatini{' '}
        <Link href="/hisobim" className="font-medium text-forest-700 underline underline-offset-2">
          hisobingizda
        </Link>{' '}
        kuzatib borasiz.
      </p>
    </form>
  );
}

function SubmitButton({ duplicateAcknowledged }: { duplicateAcknowledged: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending
        ? 'Yuborilmoqda…'
        : duplicateAcknowledged
          ? 'Baribir yuborish'
          : 'Taklifni yuborish'}
    </Button>
  );
}

function Step({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        aria-hidden
        className={cn(
          'numeric grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem]',
          'bg-forest-700 text-paper-50',
        )}
      >
        {n}
      </span>
      <h2 className="text-xl text-ink-900">{title}</h2>
      {optional ? <span className="text-sm text-ink-400">ixtiyoriy</span> : null}
    </div>
  );
}
