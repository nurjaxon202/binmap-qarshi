import type { Metadata, Viewport } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';

import './globals.css';
import 'leaflet/dist/leaflet.css';

import { siteConfig } from '@/lib/config';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SkipLink } from '@/components/ui/primitives';

/**
 * One family at two widths, plus a mono reserved for measurements.
 *
 * Archivo was drawn for signage and highlighting — the vernacular of public
 * infrastructure — and its `wdth` axis gives headlines a wayfinding character
 * that a single-width grotesque cannot. Latin Extended covers the Uzbek Latin
 * alphabet (oʻ, gʻ, Sh, Ch, Q) and Cyrillic is present for a future Russian
 * locale, so no second family is needed later.
 *
 * IBM Plex Mono appears only in coordinate pairs and distances, where digits
 * have to align between rows. It is never used for labels.
 */
const archivo = Archivo({
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s · ${siteConfig.shortName}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: 'website',
    locale: 'uz_UZ',
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#15402a',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz-Latn" className={`${archivo.variable} ${plexMono.variable}`}>
      {/* App shell: the banner and header are fixed furniture; everything else
          scrolls inside <main>. This gives the map a definite height to fill
          without competing with page scroll. */}
      <body className="flex h-dvh flex-col overflow-hidden antialiased">
        <SkipLink href="#asosiy">Asosiy mazmunga o‘tish</SkipLink>
        <SiteHeader />
        <main id="asosiy" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
