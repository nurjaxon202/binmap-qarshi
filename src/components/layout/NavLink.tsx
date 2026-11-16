'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Navigation link that marks the current section with aria-current, not only
 * with colour.
 */
export function NavLink({
  href,
  children,
  className,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[0.9375rem] font-medium transition-colors',
        active
          ? 'bg-paper-200/80 text-forest-800'
          : 'text-ink-600 hover:bg-paper-200/60 hover:text-ink-900',
        className,
      )}
    >
      {children}
    </Link>
  );
}
