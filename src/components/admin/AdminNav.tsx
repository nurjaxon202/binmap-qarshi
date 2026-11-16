'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { roleLabel } from '@/lib/i18n/uz';
import type { SessionUser } from '@/lib/types';

interface AdminLink {
  href: string;
  label: string;
  badge?: number;
}

/**
 * The administration rail.
 *
 * Counts beside a section are the live number of items waiting there, so the
 * rail doubles as the queue. Zero is shown as nothing rather than as "0",
 * because an empty queue needs no decoration.
 */
export function AdminNav({
  admin,
  counts,
}: {
  admin: SessionUser;
  counts: { submissions: number; reports: number };
}) {
  const pathname = usePathname();

  const links: AdminLink[] = [
    { href: '/boshqaruv', label: 'Umumiy ko‘rinish' },
    { href: '/boshqaruv/takliflar', label: 'Takliflar', badge: counts.submissions },
    { href: '/boshqaruv/xabarlar', label: 'Xabarlar', badge: counts.reports },
    { href: '/boshqaruv/qutilar', label: 'Qutilar' },
    { href: '/boshqaruv/foydalanuvchilar', label: 'Foydalanuvchilar' },
    { href: '/boshqaruv/jurnal', label: 'Amallar jurnali' },
  ];

  return (
    <nav
      aria-label="Boshqaruv menyusi"
      className="shrink-0 border-b border-line-strong bg-forest-800 lg:w-56 lg:border-r lg:border-b-0"
    >
      <div className="hidden px-5 py-5 lg:block">
        <p className="text-sm font-semibold text-paper-50">Boshqaruv</p>
        <p className="mt-0.5 truncate text-xs text-moss-300" title={admin.email}>
          {roleLabel[admin.role]}, {admin.email}
        </p>
      </div>

      {/* A horizontal scroller on small screens; a rail from lg up. */}
      <ul className="hide-scrollbar flex gap-px overflow-x-auto lg:block lg:px-2 lg:pb-4">
        {links.map((link) => {
          const active =
            link.href === '/boshqaruv'
              ? pathname === '/boshqaruv'
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li key={link.href} className="shrink-0 lg:shrink">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap transition-colors lg:rounded-sm lg:px-3 lg:py-2',
                  active
                    ? 'bg-forest-600 font-medium text-paper-50'
                    : 'text-moss-200 hover:bg-forest-700 hover:text-paper-50',
                )}
              >
                <span className="min-w-0 flex-1">{link.label}</span>
                {link.badge && link.badge > 0 ? (
                  <span className="numeric rounded-xs bg-lime-500 px-1.5 py-px text-[0.6875rem] font-medium text-forest-900">
                    {link.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="hidden border-t border-forest-700 px-5 py-4 lg:block">
        <Link
          href="/xarita"
          className="text-xs text-moss-300 underline underline-offset-4 hover:text-paper-50"
        >
          Ommaviy xaritaga qaytish
        </Link>
      </div>
    </nav>
  );
}
