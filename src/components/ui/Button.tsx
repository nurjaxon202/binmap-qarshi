import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Every interactive control in BinMap is at least 44px tall on its primary
 * size: the product is used one-handed, outdoors, standing on a pavement.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-sm',
  md: 'h-11 px-4 text-[0.9375rem] gap-2 rounded-md',
  lg: 'h-12 px-6 text-base gap-2 rounded-md',
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-forest-700 text-paper-50 hover:bg-forest-600 active:bg-forest-800 shadow-[0_1px_2px_rgb(6_19_13/0.18)]',
  secondary:
    'bg-surface text-ink-900 ring-1 ring-line hover:bg-paper-100 hover:ring-line-strong active:bg-paper-200',
  ghost: 'text-ink-700 hover:bg-paper-200/70 hover:text-ink-900',
  danger: 'bg-survey-500 text-paper-50 hover:brightness-110 active:brightness-95',
  accent: 'bg-lime-500 text-forest-900 hover:bg-lime-400 active:bg-lime-600 font-semibold',
};

const BASE =
  'inline-flex items-center justify-center font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,box-shadow,color] duration-150 ease-[var(--ease-out-soft)] ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
}: Omit<CommonProps, 'children'> = {}): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], fullWidth && 'w-full', className);
}

type ButtonProps = CommonProps & Omit<ComponentPropsWithoutRef<'button'>, keyof CommonProps>;

export function Button({ variant, size, fullWidth, className, children, ...rest }: ButtonProps) {
  return (
    <button className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </button>
  );
}

type ButtonLinkProps = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps | 'href'> & {
    href: string;
  };

export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  children,
  href,
  ...rest
}: ButtonLinkProps) {
  const external = /^https?:\/\//.test(href);
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={buttonClasses({ variant, size, fullWidth, className })}
        {...(rest as ComponentPropsWithoutRef<'a'>)}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </Link>
  );
}
