import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Form controls.
 *
 * Every field is labelled, every error is tied to its input with
 * aria-describedby, and invalid state is announced rather than only coloured.
 */

const CONTROL =
  'block w-full rounded-md bg-surface px-3.5 py-2.5 text-[0.9375rem] text-ink-900 ' +
  'ring-1 ring-line placeholder:text-ink-300 ' +
  'transition-[box-shadow] duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 ' +
  'disabled:bg-sunken disabled:text-ink-400 ' +
  'aria-[invalid=true]:ring-survey-500 aria-[invalid=true]:ring-2';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-2 text-sm font-medium text-ink-800">
        {label}
        {optional ? <span className="text-xs font-normal text-ink-400">ixtiyoriy</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs leading-snug text-ink-500">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-survey-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Builds the aria wiring a control needs from its field. */
export function fieldAria(id: string, { hint, error }: { hint?: boolean; error?: boolean }) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described.length > 0 ? described : undefined,
  } as const;
}

export function Input({ className, ...rest }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-[5.5rem] resize-y', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentPropsWithoutRef<'select'>) {
  return (
    <select className={cn(CONTROL, 'appearance-none pr-9', className)} {...rest}>
      {children}
    </select>
  );
}

/**
 * A radio group rendered as full-width rows — large targets, each with its own
 * explanatory line, which is what the report form needs on a phone.
 */
export function RadioCards({
  name,
  options,
  defaultValue,
  className,
}: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-start gap-3 rounded-md bg-surface p-3.5 ring-1 ring-line transition-colors has-checked:bg-moss-100 has-checked:ring-2 has-checked:ring-forest-600 hover:bg-paper-100"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={defaultValue === option.value}
            className="mt-0.5 size-4 shrink-0 accent-forest-700"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-900">{option.label}</span>
            {option.hint ? (
              <span className="mt-0.5 block text-xs leading-snug text-ink-500">{option.hint}</span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}

export function Checkbox({
  label,
  hint,
  className,
  ...rest
}: ComponentPropsWithoutRef<'input'> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-forest-700" {...rest} />
      <span className="min-w-0">
        <span className="block text-ink-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-ink-500">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FormFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 pt-1', className)}>{children}</div>
  );
}
