import { cn } from '@/lib/cn';

/**
 * The BinMap mark: a map plate — the rounded square a symbol sits in on a
 * printed map — with a pointer beneath it and a bin glyph inside. It reads as
 * "a location" first and "a bin" second, which is the right order for this
 * product.
 */
export function BinMapMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('size-8', className)}
    >
      {title ? <title>{title}</title> : null}
      {/* Plate with a pointer at the bottom edge. */}
      <path
        d="M6 3.5h20a2.5 2.5 0 0 1 2.5 2.5v14.4a2.5 2.5 0 0 1-2.5 2.5h-6.3L16 29l-4.2-6.1H6a2.5 2.5 0 0 1-2.5-2.5V6A2.5 2.5 0 0 1 6 3.5Z"
        fill="currentColor"
      />
      {/* Bin: lid, body, two ridges. Drawn in the knockout colour. */}
      <path
        d="M10.6 9.4h10.8"
        stroke="var(--color-lime-500)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M14.1 9.4V7.9h3.8v1.5"
        stroke="var(--color-lime-500)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.9 11.6h8.2l-.8 7.3a1.6 1.6 0 0 1-1.6 1.4h-3.4a1.6 1.6 0 0 1-1.6-1.4l-.8-7.3Z"
        fill="var(--color-paper-50)"
      />
      <path
        d="M14.6 14v3.8M17.4 14v3.8"
        stroke="var(--color-forest-700)"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BinMapWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-[0.3ch]', className)}>
      <span className="font-display font-semibold tracking-[-0.025em]">BinMap</span>
      <span className="numeric text-[0.6em] tracking-[0.16em] text-moss-500 uppercase">
        Qarshi
      </span>
    </span>
  );
}

/** Lockup used in the header and the footer. */
export function BinMapLogo({
  className,
  markClassName,
  compact = false,
}: {
  className?: string;
  markClassName?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BinMapMark className={cn('size-7 text-forest-700', markClassName)} title="BinMap" />
      {compact ? (
        <span className="font-display text-[1.0625rem] font-semibold tracking-[-0.025em]">
          BinMap
        </span>
      ) : (
        <BinMapWordmark className="text-[1.0625rem]" />
      )}
    </span>
  );
}
