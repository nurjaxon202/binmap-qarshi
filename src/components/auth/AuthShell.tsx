import Link from 'next/link';
import type { ReactNode } from 'react';

import { SectionLabel } from '@/components/ui/primitives';

/**
 * The frame shared by sign-in, sign-up and password recovery.
 *
 * A narrow column on paper against a forest field: the same two grounds as the
 * homepage, so these pages belong to the product rather than looking like a
 * bolted-on account system.
 */
export function AuthShell({
  label,
  title,
  intro,
  children,
  footer,
}: {
  label: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="on-forest relative bg-forest-700">
      <div className="plan-grid absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex min-h-full max-w-[32rem] flex-col justify-center px-5 py-12 md:py-16">
        <div className="border border-line bg-surface p-6 md:p-8">
          <SectionLabel>{label}</SectionLabel>
          <h1 className="mt-4 text-[clamp(1.75rem,5vw,2.25rem)] text-ink-900">{title}</h1>
          {intro ? (
            <div className="mt-3 text-sm leading-relaxed text-ink-600">{intro}</div>
          ) : null}
          <div className="mt-7">{children}</div>
        </div>
        {footer ? (
          <div className="mt-5 text-center text-sm text-moss-200">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function AuthFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-lime-400 underline underline-offset-4">
      {children}
    </Link>
  );
}
