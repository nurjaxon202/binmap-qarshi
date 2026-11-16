import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Building blocks for the administration surface.
 *
 * Tables rather than cards, hairlines rather than shadows, tabular figures
 * everywhere, and tight vertical rhythm — the density an operator working
 * through a queue actually wants.
 */

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line-strong pb-5">
        <div className="min-w-0">
          <h1 className="text-2xl text-ink-900">{title}</h1>
          {description ? (
            <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-600">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}

/** Tabs rendered as links, so filter state lives in the URL and is shareable. */
export function FilterTabs({
  options,
  current,
  hrefFor,
  className,
}: {
  options: { value: string; label: string; count?: number }[];
  current: string;
  hrefFor: (value: string) => string;
  className?: string;
}) {
  return (
    <div className={cn('hide-scrollbar flex gap-1 overflow-x-auto', className)}>
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-3 py-1.5 text-sm transition-colors',
              active
                ? 'border-forest-700 bg-forest-700 font-medium text-paper-50'
                : 'border-line bg-surface text-ink-600 hover:bg-paper-100',
            )}
          >
            {option.label}
            {typeof option.count === 'number' && option.count > 0 ? (
              <span className={cn('numeric text-xs', active ? 'text-lime-400' : 'text-ink-400')}>
                {option.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  numeric,
}: {
  children?: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line bg-paper-100 px-3 py-2.5 text-left text-xs font-semibold text-ink-600',
        numeric && 'text-right',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  numeric,
}: {
  children?: ReactNode;
  className?: string;
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        'border-b border-line px-3 py-2.5 align-top text-ink-800',
        numeric && 'numeric text-right',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Sahifalar"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-ink-500">
        <span className="numeric">
          {from}–{to}
        </span>{' '}
        / <span className="numeric">{total}</span>
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={hrefFor(page - 1)}
            className="rounded-sm border border-line bg-surface px-3 py-1.5 hover:bg-paper-100"
          >
            Oldingi
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            href={hrefFor(page + 1)}
            className="rounded-sm border border-line bg-surface px-3 py-1.5 hover:bg-paper-100"
          >
            Keyingi
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

/** A short definition row used on the detail pages. */
export function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line py-2.5 text-sm last:border-b-0">
      <dt className="min-w-[9rem] text-ink-500">{term}</dt>
      <dd className="min-w-0 flex-1 text-ink-900">{children}</dd>
    </div>
  );
}
