'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LogOut, Menu, Plus, ShieldCheck, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { BinMapLogo } from '@/components/brand';
import type { SessionUser } from '@/lib/types';
import type { NavItem } from '@/components/layout/SiteHeader';

/**
 * Mobile navigation as a full-height sheet.
 *
 * Deliberately not a shrunken desktop menu: rows are 48px tall, the primary
 * action sits at the bottom within thumb reach, and the sheet traps focus and
 * closes on Escape.
 */
export function MobileNav({
  items,
  user,
  logoutAction,
}: {
  items: NavItem[];
  user: SessionUser | null;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex size-10 items-center justify-center rounded-md text-ink-700 transition-colors hover:bg-paper-200/70 lg:hidden"
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Menyuni ochish</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[900] lg:hidden">
          <button
            type="button"
            aria-label="Menyuni yopish"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-forest-950/35 backdrop-blur-[2px]"
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Menyu"
            className="absolute inset-y-0 right-0 flex w-[min(21rem,88vw)] flex-col bg-paper-50 shadow-raised"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
              <BinMapLogo compact />
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-md text-ink-600 hover:bg-paper-200/70"
              >
                <X aria-hidden className="size-5" />
                <span className="sr-only">Yopish</span>
              </button>
            </div>

            <nav aria-label="Asosiy menyu" className="flex-1 overflow-y-auto px-3 py-4">
              <ul className="space-y-1">
                {[...items, { href: '/quti-qoshish', label: 'Quti qo‘shish' }].map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        onClick={close}
                        className={cn(
                          'flex min-h-12 items-center rounded-md px-3 text-base font-medium',
                          active ? 'bg-paper-200 text-forest-800' : 'text-ink-700',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <hr className="my-4 border-line" />

              <ul className="space-y-1">
                {user ? (
                  <>
                    <li>
                      <Link
                        href="/hisobim"
                        onClick={close}
                        className="flex min-h-12 flex-col justify-center rounded-md px-3"
                      >
                        <span className="text-base font-medium text-ink-900">Mening hisobim</span>
                        <span className="truncate text-xs text-ink-500">{user.email}</span>
                      </Link>
                    </li>
                    {user.role === 'admin' ? (
                      <li>
                        <Link
                          href="/boshqaruv"
                          onClick={close}
                          className="flex min-h-12 items-center gap-2 rounded-md px-3 text-base font-medium text-ink-700"
                        >
                          <ShieldCheck aria-hidden className="size-[1.125rem]" />
                          Boshqaruv paneli
                        </Link>
                      </li>
                    ) : null}
                  </>
                ) : (
                  <li>
                    <Link
                      href="/kirish"
                      onClick={close}
                      className="flex min-h-12 items-center rounded-md px-3 text-base font-medium text-ink-700"
                    >
                      Kirish
                    </Link>
                  </li>
                )}
              </ul>
            </nav>

            <div className="shrink-0 space-y-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Link
                href="/quti-qoshish"
                onClick={close}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-forest-700 text-base font-medium text-paper-50"
              >
                <Plus aria-hidden className="size-[1.125rem]" />
                Quti qo‘shish
              </Link>
              {user ? (
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-ink-600 ring-1 ring-line"
                  >
                    <LogOut aria-hidden className="size-4" />
                    Chiqish
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
