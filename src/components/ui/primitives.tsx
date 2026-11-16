import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatCoordinate } from '@/lib/geo';
import type { VerificationStatus } from '@/lib/types';

/* ===========================================================================
   Survey marks — the core device (see DESIGN.md)
   ---------------------------------------------------------------------------
   Confidence is carried by texture, the way a cadastral drawing carries land
   use: solid for verified, hatched for community-reported, open-and-dotted
   for doubtful, cross-hatched for demonstration data. Colour reinforces it
   but never carries it alone, so the distinction survives greyscale, colour
   blindness and a phone in sunlight.
   =========================================================================== */

export type MarkTexture = 'solid' | 'hatch' | 'open' | 'cross';

export interface MarkStyle {
  texture: MarkTexture;
  className: string;
}

/** The authoritative mapping from a bin's verification state to its mark. */
export const verificationMark: Record<VerificationStatus, MarkStyle> = {
  verified: { texture: 'solid', className: 'text-forest-700' },
  community: { texture: 'hatch', className: 'text-moss-500' },
  needs_recheck: { texture: 'open', className: 'text-amber-600' },
};

/**
 * A small square carrying one texture. Used in legends, status marks and the
 * coverage grid, so the same shape means the same thing everywhere.
 */
export function SurveyMark({
  texture,
  size = 12,
  className,
}: {
  texture: MarkTexture;
  size?: number;
  className?: string;
}) {
  const id = `m-${texture}-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      {texture === 'hatch' || texture === 'cross' ? (
        <defs>
          <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
            <path
              d={texture === 'cross' ? 'M0 4 4 0M-1 1 1 -1M3 5 5 3' : 'M0 4 4 0'}
              stroke="currentColor"
              strokeWidth="1.1"
              fill="none"
            />
          </pattern>
        </defs>
      ) : null}
      <rect
        x="0.6"
        y="0.6"
        width="10.8"
        height="10.8"
        rx="1"
        fill={
          texture === 'solid'
            ? 'currentColor'
            : texture === 'open'
              ? 'none'
              : `url(#${id})`
        }
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray={texture === 'open' ? '2 1.6' : texture === 'cross' ? '2.6 1.4' : undefined}
      />
    </svg>
  );
}

/**
 * A status, stated. The mark carries the category, the words carry the
 * meaning; neither is decorative and neither stands alone.
 */
export function StatusMark({
  mark,
  label,
  title,
  className,
}: {
  mark: MarkStyle;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1.5 text-[0.8125rem] leading-tight', className)}
    >
      <SurveyMark texture={mark.texture} className={mark.className} />
      <span className="text-ink-700">{label}</span>
    </span>
  );
}

/* ---------------------------------- badge --------------------------------- */

export type BadgeTone = 'neutral' | 'forest' | 'moss' | 'amber' | 'survey' | 'slate' | 'lime';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-paper-200 text-ink-600',
  forest: 'bg-moss-100 text-forest-700',
  moss: 'bg-moss-100 text-moss-700',
  amber: 'bg-amber-200 text-amber-600',
  survey: 'bg-survey-200 text-survey-600',
  slate: 'bg-slate-200 text-slate-600',
  lime: 'bg-lime-200 text-forest-800',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs px-1.5 py-[2px] text-[0.75rem] leading-tight font-medium',
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Where a location came from.
 *
 * Provenance is part of the product, not a caveat: a record entered by an
 * administrator after a field survey and one sent in by a resident are
 * different things, and the interface says which.
 */
export function SourceBadge({
  source,
  className,
}: {
  source: 'admin' | 'community';
  className?: string;
}) {
  return (
    <Badge tone={source === 'admin' ? 'forest' : 'neutral'} className={className}>
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-xs',
          source === 'admin' ? 'bg-forest-700' : 'bg-moss-500',
        )}
      />
      {source === 'admin' ? 'Administrator kiritgan' : 'Foydalanuvchi yuborgan'}
    </Badge>
  );
}

/* --------------------------------- regions -------------------------------- */

/**
 * A bounded region of a sheet. Hairlines rather than a floating card: the
 * border says "this is one area of the drawing", which is information, where
 * a shadow would only be decoration.
 */
export function Region({
  children,
  className,
  as: As = 'section',
  padded = true,
  tone = 'surface',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'aside';
  padded?: boolean;
  tone?: 'surface' | 'sunken' | 'plain';
}) {
  return (
    <As
      className={cn(
        'rounded-md border border-line',
        tone === 'surface' && 'bg-surface',
        tone === 'sunken' && 'bg-paper-200',
        padded && 'p-5 md:p-6',
        className,
      )}
    >
      {children}
    </As>
  );
}

/**
 * A section label. Sentence case, paired with a rule rather than tracked-out
 * capitals, and only used where it says something the heading does not.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        'flex items-center gap-2.5 text-[0.8125rem] font-medium text-ink-500',
        className,
      )}
    >
      <span aria-hidden className="h-px w-5 bg-line-strong" />
      {children}
    </p>
  );
}

export function RegionHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-lg text-ink-900">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- notices -------------------------------- */

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const NOTICE: Record<NoticeTone, { wrap: string; icon: typeof Info }> = {
  info: { wrap: 'border-slate-500/25 bg-slate-200/50 text-slate-600', icon: Info },
  success: { wrap: 'border-forest-600/25 bg-moss-100 text-forest-700', icon: CircleCheck },
  warning: { wrap: 'border-amber-500/30 bg-amber-200/60 text-amber-600', icon: TriangleAlert },
  danger: { wrap: 'border-survey-500/30 bg-survey-200/70 text-survey-600', icon: CircleAlert },
};

export function Notice({
  tone = 'info',
  title,
  children,
  className,
  role,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
}) {
  const { wrap, icon: Icon } = NOTICE[tone];
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={cn('flex gap-2.5 rounded-md border p-3.5 text-sm', wrap, className)}
    >
      <Icon aria-hidden className="mt-px size-[1.0625rem] shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className="leading-relaxed text-ink-700 [&_a]:underline [&_a]:underline-offset-2">
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------- empty state ------------------------------ */

/** An empty screen is an invitation to act, so it always offers the next step. */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'plan-grid flex flex-col items-start justify-center rounded-md border border-dashed border-line-strong px-6 py-10',
        className,
      )}
    >
      <h3 className="max-w-md text-base text-ink-900">{title}</h3>
      {children ? (
        <div className="mt-2 max-w-prose text-sm leading-relaxed text-ink-500">{children}</div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ------------------------------- measurements ----------------------------- */

/**
 * Coordinates, always to five decimals (about a metre) and always in the mono
 * face, so a number on one screen can be compared with the same number on
 * another.
 */
export function Coordinates({
  latitude,
  longitude,
  className,
}: {
  latitude: number;
  longitude: number;
  className?: string;
}) {
  return (
    <span className={cn('numeric text-[0.8125rem] text-ink-500', className)}>
      {formatCoordinate(latitude)}, {formatCoordinate(longitude)}
    </span>
  );
}

/**
 * A figure from the database, with what it counts. A bare number on a
 * dashboard invites being read as something it is not, so the caption is
 * part of the component rather than optional.
 */
export function Figure({
  value,
  label,
  caption,
  accent = false,
  className,
}: {
  value: number | string;
  label: string;
  caption?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p
        className={cn(
          'tabular text-[2.125rem] leading-none font-semibold',
          accent ? 'text-survey-500' : 'text-ink-900',
        )}
        style={{ fontStretch: '112%' }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink-700">{label}</p>
      {caption ? <p className="mt-0.5 text-xs leading-snug text-ink-400">{caption}</p> : null}
    </div>
  );
}

/* ---------------------------------- misc ---------------------------------- */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden
        className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-55"
      />
      <span className="sr-only">{label ?? 'Yuklanmoqda'}</span>
    </span>
  );
}

export function DescriptionList({
  items,
  className,
}: {
  items: { term: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn('divide-y divide-line text-sm', className)}>
      {items.map((item) => (
        <div key={item.term} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5">
          <dt className="min-w-[8.5rem] text-ink-500">{item.term}</dt>
          <dd className="min-w-0 flex-1 text-ink-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SkipLink(props: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      {...props}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[1000] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-forest-700 focus:shadow-panel"
    />
  );
}
