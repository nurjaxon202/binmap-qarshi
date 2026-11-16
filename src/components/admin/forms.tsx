'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import {
  createBinAction,
  recordVerificationAction,
  reviewReportAction,
  reviewSubmissionAction,
  setSubmissionNoteAction,
  setUserRoleAction,
  updateBinAction,
} from '@/app/actions/admin';
import { emptyAdminState } from '@/app/actions/form-state';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, Textarea, fieldAria } from '@/components/ui/form';
import { Notice } from '@/components/ui/primitives';
import type { FieldErrors } from '@/lib/validation';
import {
  binStatusLabel,
  reportStatusLabel,
  verificationOutcomeLabel,
  verificationStatusLabel,
} from '@/lib/i18n/uz';
import type {
  BinStatus,
  ReportStatus,
  VerificationOutcome,
  VerificationStatus,
} from '@/lib/types';

const VERIFICATION: VerificationStatus[] = ['verified', 'community', 'needs_recheck'];
const BIN_STATUS: BinStatus[] = ['active', 'inactive', 'removed'];
const REPORT_STATUS: ReportStatus[] = [
  'submitted',
  'reviewing',
  'confirmed',
  'rejected',
  'resolved',
];

/**
 * Renders any error that has no field of its own.
 *
 * Without this, a schema error on a field the form does not display makes the
 * form appear to do nothing at all when submitted — which is exactly the bug
 * this component exists to prevent.
 */
function RemainingErrors({ errors, handled }: { errors: FieldErrors; handled: string[] }) {
  const rest = Object.entries(errors).filter(([key]) => !handled.includes(key) && key !== '_form');
  if (rest.length === 0) return null;
  return (
    <Notice tone="danger">
      <ul className="space-y-1">
        {rest.map(([key, message]) => (
          <li key={key}>{message}</li>
        ))}
      </ul>
    </Notice>
  );
}

function Submit({
  children,
  variant = 'primary',
  size = 'md',
}: {
  children: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
      {pending ? 'Bajarilmoqda…' : children}
    </Button>
  );
}

/* --------------------------- submission review ---------------------------- */

/**
 * The approve / reject decision.
 *
 * Coordinates and description stay editable here, because the commonest
 * correction is a pin a few metres off. Rejecting requires a reason, which the
 * submitter will read on their own account page — a decision without a reason
 * is not a decision they can learn from.
 */
export function SubmissionReviewForm({
  submissionId,
  latitude,
  longitude,
  description,
  decided,
}: {
  submissionId: string;
  latitude: number;
  longitude: number;
  description: string | null;
  decided: boolean;
}) {
  const [state, action] = useActionState(reviewSubmissionAction, emptyAdminState);

  if (state.ok && state.notice) {
    return <Notice tone="success">{state.notice}</Notice>;
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="submissionId" value={submissionId} />
      {/* React's useActionState constructs the FormData itself and does not
          carry the submit button's name/value, so the decision travels in this
          field, which each button sets on click (click fires before submit,
          including for keyboard activation). */}
      <input type="hidden" name="decision" defaultValue="approve" />

      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}
      <RemainingErrors
        errors={state.errors}
        handled={['latitude', 'longitude', 'description', 'note']}
      />

      {decided ? (
        <Notice tone="warning">
          Bu taklif bo‘yicha qaror allaqachon qabul qilingan.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kenglik (latitude)" htmlFor="latitude" error={state.errors.latitude}>
          <Input
            {...fieldAria('latitude', { error: Boolean(state.errors.latitude) })}
            name="latitude"
            defaultValue={latitude}
            inputMode="decimal"
            className="numeric"
          />
        </Field>
        <Field label="Uzunlik (longitude)" htmlFor="longitude" error={state.errors.longitude}>
          <Input
            {...fieldAria('longitude', { error: Boolean(state.errors.longitude) })}
            name="longitude"
            defaultValue={longitude}
            inputMode="decimal"
            className="numeric"
          />
        </Field>
      </div>

      <Field
        label="Joy tavsifi"
        htmlFor="description"
        hint="Tasdiqlangach xaritada shu matn ko‘rinadi."
        error={state.errors.description}
        optional
      >
        <Textarea
          {...fieldAria('description', { hint: true, error: Boolean(state.errors.description) })}
          name="description"
          defaultValue={description ?? ''}
          rows={2}
          maxLength={500}
        />
      </Field>

      <Checkbox
        name="markVerified"
        value="true"
        label="Joyida tekshirilgan deb belgilash"
        hint="Faqat joylashuvni o‘zingiz ko‘rgan bo‘lsangiz. Aks holda «foydalanuvchi ma’lumoti» bo‘lib qoladi."
      />

      <Field
        label="Qaror izohi"
        htmlFor="note"
        hint="Taklif muallifi bu izohni ko‘radi. Rad etishda izoh majburiy."
        error={state.errors.note}
      >
        <Textarea
          {...fieldAria('note', { hint: true, error: Boolean(state.errors.note) })}
          name="note"
          rows={2}
          maxLength={500}
        />
      </Field>

      {/* Two submit buttons, each carrying its own decision. The clicked
          button's name/value lands in the FormData, so this needs no client
          state and keeps both actions reachable by keyboard. */}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <DecisionButton value="approve" label="Tasdiqlash va xaritaga qo‘shish" />
        <DecisionButton value="reject" label="Rad etish" tone="danger" />
      </div>
    </form>
  );
}

/**
 * One of the two decisions.
 *
 * The value is written into the form's hidden `decision` field on click, found
 * through the button's own form rather than a ref threaded down as a prop.
 * Click fires before submit, including for keyboard activation, so the field
 * is always set by the time the action reads the FormData.
 */
function DecisionButton({
  value,
  label,
  tone = 'primary',
}: {
  value: 'approve' | 'reject';
  label: string;
  tone?: 'primary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={tone}
      disabled={pending}
      onClick={(event) => {
        const field = event.currentTarget.form?.elements.namedItem('decision');
        if (field instanceof HTMLInputElement) field.value = value;
      }}
    >
      {pending ? 'Bajarilmoqda…' : label}
    </Button>
  );
}

export function StartReviewForm({ submissionId }: { submissionId: string }) {
  const [state, action] = useActionState(reviewSubmissionAction, emptyAdminState);

  if (state.ok) return null;

  return (
    <form action={action}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="decision" value="start_review" />
      <Submit variant="secondary" size="sm">
        Ko‘rib chiqishga olish
      </Submit>
      {state.errors._form ? (
        <p className="mt-2 text-xs text-survey-500">{state.errors._form}</p>
      ) : null}
    </form>
  );
}

/** Administrators only. The submitter never sees this field. */
export function InternalNoteForm({
  submissionId,
  note,
}: {
  submissionId: string;
  note: string | null;
}) {
  const [state, action] = useActionState(setSubmissionNoteAction, emptyAdminState);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      {state.ok && state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      <Field
        label="Ichki izoh"
        htmlFor="internalNote"
        hint="Faqat moderatorlarga ko‘rinadi."
        error={state.errors.internalNote}
      >
        <Textarea
          {...fieldAria('internalNote', {
            hint: true,
            error: Boolean(state.errors.internalNote),
          })}
          name="internalNote"
          defaultValue={note ?? ''}
          rows={3}
          maxLength={1000}
        />
      </Field>
      <Submit variant="secondary" size="sm">
        Izohni saqlash
      </Submit>
    </form>
  );
}

/* ------------------------------ report review ----------------------------- */

export function ReportReviewForm({
  reportId,
  status,
  adminNote,
}: {
  reportId: string;
  status: ReportStatus;
  adminNote: string | null;
}) {
  const [state, action] = useActionState(reviewReportAction, emptyAdminState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="reportId" value={reportId} />

      {state.ok && state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}
      <RemainingErrors errors={state.errors} handled={['status', 'adminNote']} />

      <Field label="Holat" htmlFor="status" error={state.errors.status}>
        <Select
          {...fieldAria('status', { error: Boolean(state.errors.status) })}
          name="status"
          defaultValue={status}
        >
          {REPORT_STATUS.map((value) => (
            <option key={value} value={value}>
              {reportStatusLabel[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Ichki izoh"
        htmlFor="adminNote"
        hint="Faqat moderatorlarga ko‘rinadi. Xabar muallifi buni ko‘rmaydi."
        error={state.errors.adminNote}
        optional
      >
        <Textarea
          {...fieldAria('adminNote', { hint: true, error: Boolean(state.errors.adminNote) })}
          name="adminNote"
          defaultValue={adminNote ?? ''}
          rows={3}
          maxLength={1000}
        />
      </Field>

      <Submit>Holatni yangilash</Submit>
    </form>
  );
}

/* ------------------------------ bin management ---------------------------- */

export function CreateBinForm({
  citySlug,
  cityName,
  defaultLatitude,
  defaultLongitude,
}: {
  citySlug: string;
  cityName: string;
  defaultLatitude: number;
  defaultLongitude: number;
}) {
  const [state, action] = useActionState(createBinAction, emptyAdminState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="citySlug" value={citySlug} />

      {state.ok && state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kenglik (latitude)" htmlFor="latitude" error={state.errors.latitude}>
          <Input
            {...fieldAria('latitude', { error: Boolean(state.errors.latitude) })}
            name="latitude"
            defaultValue={defaultLatitude}
            inputMode="decimal"
            required
            className="numeric"
          />
        </Field>
        <Field label="Uzunlik (longitude)" htmlFor="longitude" error={state.errors.longitude}>
          <Input
            {...fieldAria('longitude', { error: Boolean(state.errors.longitude) })}
            name="longitude"
            defaultValue={defaultLongitude}
            inputMode="decimal"
            required
            className="numeric"
          />
        </Field>
      </div>

      <Field
        label="Joy tavsifi"
        htmlFor="description"
        hint="Masalan: «Avtobus bekati yonida». Haqiqiy manzil yozmang."
        error={state.errors.description}
        optional
      >
        <Textarea
          {...fieldAria('description', { hint: true, error: Boolean(state.errors.description) })}
          name="description"
          rows={2}
          maxLength={500}
        />
      </Field>

      <Field
        label="Tekshiruv holati"
        htmlFor="verificationStatus"
        hint="Joyida ko‘rgan bo‘lsangiz «joyida tekshirilgan»ni tanlang."
      >
        <Select name="verificationStatus" id="verificationStatus" defaultValue="verified">
          {VERIFICATION.map((value) => (
            <option key={value} value={value}>
              {verificationStatusLabel[value]}
            </option>
          ))}
        </Select>
      </Field>

      <p className="text-xs leading-relaxed text-ink-500">
        Quti {cityName} shahriga qo‘shiladi va darhol ommaviy xaritada ko‘rinadi.
      </p>

      <Submit>Qutini qo‘shish</Submit>
    </form>
  );
}

export function UpdateBinForm({
  binId,
  latitude,
  longitude,
  description,
  status,
  verificationStatus,
}: {
  binId: string;
  latitude: number;
  longitude: number;
  description: string | null;
  status: BinStatus;
  verificationStatus: VerificationStatus;
}) {
  const [state, action] = useActionState(updateBinAction, emptyAdminState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="binId" value={binId} />

      {state.ok && state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kenglik (latitude)" htmlFor="latitude" error={state.errors.latitude}>
          <Input
            {...fieldAria('latitude', { error: Boolean(state.errors.latitude) })}
            name="latitude"
            defaultValue={latitude}
            inputMode="decimal"
            required
            className="numeric"
          />
        </Field>
        <Field label="Uzunlik (longitude)" htmlFor="longitude" error={state.errors.longitude}>
          <Input
            {...fieldAria('longitude', { error: Boolean(state.errors.longitude) })}
            name="longitude"
            defaultValue={longitude}
            inputMode="decimal"
            required
            className="numeric"
          />
        </Field>
      </div>

      <Field label="Joy tavsifi" htmlFor="description" error={state.errors.description} optional>
        <Textarea
          {...fieldAria('description', { error: Boolean(state.errors.description) })}
          name="description"
          defaultValue={description ?? ''}
          rows={2}
          maxLength={500}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Holat"
          htmlFor="status"
          hint="Faqat «Faol» qutilar ommaviy xaritada ko‘rinadi."
        >
          <Select name="status" id="status" defaultValue={status}>
            {BIN_STATUS.map((value) => (
              <option key={value} value={value}>
                {binStatusLabel[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tekshiruv holati" htmlFor="verificationStatus">
          <Select
            name="verificationStatus"
            id="verificationStatus"
            defaultValue={verificationStatus}
          >
            {VERIFICATION.map((value) => (
              <option key={value} value={value}>
                {verificationStatusLabel[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="O‘zgarish sababi"
        htmlFor="note"
        hint="Amallar jurnaliga yoziladi."
        error={state.errors.note}
        optional
      >
        <Input
          {...fieldAria('note', { hint: true, error: Boolean(state.errors.note) })}
          name="note"
          maxLength={500}
        />
      </Field>

      <Submit>O‘zgarishlarni saqlash</Submit>
    </form>
  );
}

/* -------------------------------- user role ------------------------------- */

export function RoleForm({
  userId,
  currentRole,
  disabled,
}: {
  userId: string;
  currentRole: 'user' | 'admin';
  disabled?: boolean;
}) {
  const [state, action] = useActionState(setUserRoleAction, emptyAdminState);
  const next = currentRole === 'admin' ? 'user' : 'admin';

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={next} />
      <Button
        type="submit"
        variant={next === 'admin' ? 'secondary' : 'ghost'}
        size="sm"
        disabled={disabled}
        title={disabled ? 'O‘z rolingizni o‘zgartira olmaysiz' : undefined}
      >
        {next === 'admin' ? 'Moderator qilish' : 'Moderatorlikdan olish'}
      </Button>
      {state.errors._form ? (
        <p className="text-xs text-survey-500">{state.errors._form}</p>
      ) : null}
    </form>
  );
}

/* ---------------------------- field verification -------------------------- */

const OUTCOMES: VerificationOutcome[] = ['verified', 'needs_recheck'];

/**
 * Recording a visit.
 *
 * There is no date field. The date is stamped by the database at the moment
 * the visit is recorded, which is the only way "last checked" can be trusted:
 * a typed-in date is a claim, not a record.
 */
export function RecordVerificationForm({ binId }: { binId: string }) {
  const [state, action] = useActionState(recordVerificationAction, emptyAdminState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="binId" value={binId} />

      {state.ok && state.notice ? <Notice tone="success">{state.notice}</Notice> : null}
      {state.errors._form ? <Notice tone="danger">{state.errors._form}</Notice> : null}
      <RemainingErrors errors={state.errors} handled={['outcome', 'note', 'binId']} />

      <Field label="Natija" htmlFor="outcome" error={state.errors.outcome}>
        <Select
          {...fieldAria('outcome', { error: Boolean(state.errors.outcome) })}
          name="outcome"
          defaultValue="verified"
        >
          {OUTCOMES.map((value) => (
            <option key={value} value={value}>
              {verificationOutcomeLabel[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Izoh"
        htmlFor="note"
        hint="Joyida nima ko‘rdingiz. Tekshiruv tarixida saqlanadi."
        error={state.errors.note}
        optional
      >
        <Textarea
          {...fieldAria('note', { hint: true, error: Boolean(state.errors.note) })}
          name="note"
          rows={2}
          maxLength={500}
        />
      </Field>

      <Submit size="sm">Tekshiruvni qayd etish</Submit>
    </form>
  );
}
