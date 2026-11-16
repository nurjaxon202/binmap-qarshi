import Link from 'next/link';
import { LogOut, Map, Plus, ShieldCheck } from 'lucide-react';

import { getSessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { BinMapLogo } from '@/components/brand';
import { ButtonLink } from '@/components/ui/Button';
import { MobileNav } from '@/components/layout/MobileNav';
import { NavLink } from '@/components/layout/NavLink';

export interface NavItem {
  href: string;
  label: string;
  adminOnly?: boolean;
}

/**
 * "Quti qo‘shish" is deliberately absent: it already has a dedicated button on
 * the right, and listing it twice makes the bar read as filler.
 */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/xarita', label: 'Xarita' },
  { href: '/tahlil', label: 'Tahlil' },
  { href: '/loyiha', label: 'Loyiha haqida' },
];

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="z-[500] shrink-0 border-b border-line bg-paper-50">
      <div className="shell flex h-16 items-center gap-3">
        <Link
          href="/"
          className="shrink-0 rounded-sm text-ink-900 transition-opacity hover:opacity-80"
          aria-label="BinMap Qarshi — bosh sahifa"
        >
          <BinMapLogo />
        </Link>

        <nav aria-label="Asosiy menyu" className="ml-4 hidden items-center gap-1 lg:flex">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user?.role === 'admin' ? (
            <NavLink href="/boshqaruv" className="hidden md:inline-flex">
              <ShieldCheck aria-hidden className="size-4" />
              Boshqaruv
            </NavLink>
          ) : null}

          {user ? (
            <>
              <NavLink href="/hisobim" className="hidden max-w-[14rem] md:inline-flex">
                <span className="truncate">{user.fullName ?? user.email}</span>
              </NavLink>
              <form action={logoutAction} className="hidden md:block">
                <button
                  type="submit"
                  className="inline-flex size-10 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-paper-200/70 hover:text-ink-900"
                  title="Chiqish"
                >
                  <LogOut aria-hidden className="size-[1.125rem]" />
                  <span className="sr-only">Chiqish</span>
                </button>
              </form>
            </>
          ) : (
            <ButtonLink href="/kirish" variant="secondary" size="sm" className="hidden md:inline-flex">
              Kirish
            </ButtonLink>
          )}

          <ButtonLink href="/xarita" size="sm" className="hidden sm:inline-flex lg:hidden">
            <Map aria-hidden className="size-4" />
            Xarita
          </ButtonLink>
          <ButtonLink href="/quti-qoshish" size="sm" className="hidden lg:inline-flex">
            <Plus aria-hidden className="size-4" />
            Quti qo‘shish
          </ButtonLink>

          <MobileNav
            items={PRIMARY_NAV}
            user={user}
            logoutAction={logoutAction}
          />
        </div>
      </div>
    </header>
  );
}
