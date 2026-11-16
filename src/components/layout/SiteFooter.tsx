import Link from 'next/link';

import { siteConfig, tileProvider, FALLBACK_CITY } from '@/lib/config';
import { BinMapLogo } from '@/components/brand';
import { SectionLabel } from '@/components/ui/primitives';

const FOOTER_LINKS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: 'Platforma',
    links: [
      { href: '/xarita', label: 'Xarita' },
      { href: '/quti-qoshish', label: 'Quti qo‘shish' },
      { href: '/tahlil', label: 'Geografik tahlil' },
      { href: '/hisobim', label: 'Mening hisobim' },
    ],
  },
  {
    heading: 'Loyiha',
    links: [
      { href: '/loyiha', label: 'Loyiha haqida' },
      { href: '/loyiha#tekshiruv', label: 'Ma’lumot qanday tekshiriladi' },
      { href: '/loyiha#maxfiylik', label: 'Ma’lumotlar va maxfiylik' },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-line bg-paper-100">
      <div className="shell py-12">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <BinMapLogo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">
              Jamoat chiqindi qutilarining ochiq geografik platformasi. Hozircha{' '}
              {FALLBACK_CITY.name} shahri uchun.
            </p>
            <p className="numeric mt-4 text-xs text-ink-400">
              {FALLBACK_CITY.centerLatitude.toFixed(4)}° N{' '}
              {FALLBACK_CITY.centerLongitude.toFixed(4)}° E
            </p>
          </div>

          {FOOTER_LINKS.map((group) => (
            <div key={group.heading}>
              <SectionLabel>{group.heading}</SectionLabel>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-600 underline-offset-4 hover:text-forest-700 hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {siteConfig.name}
          </p>
          {/* Attribution is a condition of using the tiles, not decoration. */}
          <p
            className="[&_a]:text-ink-500 [&_a]:underline [&_a]:underline-offset-2"
            dangerouslySetInnerHTML={{ __html: `Xarita ma’lumotlari: ${tileProvider.attributionHtml}` }}
          />
        </div>
      </div>
    </footer>
  );
}
