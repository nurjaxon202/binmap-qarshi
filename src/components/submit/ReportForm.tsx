'use client';

import { useActionState, useCallback, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Camera, Check, X } from 'lucide-react';

import { submitReportAction } from '@/app/actions/reports';
import { emptyReportState } from '@/app/actions/form-state';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, RadioCards, Textarea, fieldAria } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import { reportTypeHint, reportTypeLabel } from '@/lib/i18n/uz';
import type { ReportType } from '@/lib/types';

const TYPES: ReportType[] = ['overflowing', 'damaged', 'missing', 'other'];

/**
 * Reporting a problem with an existing bin.
 *
 * Each option carries its own explanatory line, because "quti mavjud emas" and
 * "quti shikastlangan" lead to different reviews and the difference matters.
 * The form states plainly that a report does not remove a bin from the map.
 */
export function ReportForm({ binId, binLabel }: { binId: string; binLabel: string }) {
  const [state, action] = useActionState(submitReportAction, emptyReportState);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const onPhotoChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoName(event.target.files?.[0]?.name ?? null);
  }, []);

  const clearPhoto = useCallback(() => {
    if (photoInput.current) photoInput.current.value = '';
    setPhotoName(null);
  }, []);

  if (state.ok && state.reportId) {
    return (
      <div className="border border-forest-600/25 bg-moss-100 p-6 md:p-8">
        <div className="flex size-9 items-center justify-center rounded-full bg-forest-700 text-paper-50">
          <Check aria-hidden className="size-5" />
        </div>
        <h2 className="mt-4 text-xl text-ink-900">Xabar yuborildi</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-600">{state.notice}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/hisobim">Mening xabarlarim</ButtonLink>
          <ButtonLink href={`/xarita?quti=${binId}`} variant="secondary">
            Xaritada ko‘rish
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-7" encType="multipart/form-data">
      <input type="hidden" name="binId" value={binId} />

      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}
      {state.errors.binId ? <Notice tone="danger">{state.errors.binId}</Notice> : null}

      <fieldset>
        <legend className="text-base font-medium text-ink-900">Nima bo‘ldi?</legend>
        <p className="mt-1 text-sm text-ink-500">Quti: {binLabel}</p>
        <RadioCards
          name="reportType"
          className="mt-4"
          defaultValue="overflowing"
          options={TYPES.map((type) => ({
            value: type,
            label: reportTypeLabel[type],
            hint: reportTypeHint[type],
          }))}
        />
        {state.errors.reportType ? (
          <p className="mt-2 text-xs font-medium text-survey-500">{state.errors.reportType}</p>
        ) : null}
      </fieldset>

      <Field
        label="Izoh"
        htmlFor="description"
        hint="«Boshqa muammo» tanlasangiz, izoh yozish shart."
        error={state.errors.description}
        optional
      >
        <Textarea
          {...fieldAria('description', { hint: true, error: Boolean(state.errors.description) })}
          name="description"
          maxLength={500}
          rows={3}
        />
      </Field>

      <div>
        <p className="text-sm font-medium text-ink-800">
          Surat <span className="font-normal text-ink-400">ixtiyoriy</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          Yuklashdan oldin suratdagi GPS va qurilma ma’lumotlari o‘chiriladi. Surat faqat
          moderatorga ko‘rinadi.
        </p>
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
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label
            htmlFor="photo"
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-4 text-[0.9375rem] font-medium text-ink-800 hover:bg-paper-100"
          >
            <Camera aria-hidden className="size-4" />
            {photoName ? 'Boshqa surat' : 'Surat tanlash'}
          </label>
          {photoName ? (
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink-600">
              <span className="truncate">{photoName}</span>
              <button
                type="button"
                onClick={clearPhoto}
                className="shrink-0 text-survey-500"
                aria-label="Suratni olib tashlash"
              >
                <X aria-hidden className="size-4" />
              </button>
            </span>
          ) : null}
        </div>
        {state.errors.photo ? (
          <p className="mt-2 text-xs font-medium text-survey-500">{state.errors.photo}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <ReportSubmit />
        <ButtonLink href={`/xarita?quti=${binId}`} variant="ghost">
          Bekor qilish
        </ButtonLink>
      </div>
    </form>
  );
}

function ReportSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Yuborilmoqda…' : 'Xabar yuborish'}
    </Button>
  );
}
