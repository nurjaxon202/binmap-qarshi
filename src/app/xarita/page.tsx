import type { Metadata } from 'next';

import { publicMapConfig } from '@/lib/config';
import { getSessionUser } from '@/lib/auth';
import { getDefaultCity } from '@/lib/db/cities';
import { getPublicBin, listPublicBins } from '@/lib/db/bins';
import { listPublicReportsForBin } from '@/lib/db/reports';
import { MapExperience } from '@/components/map/MapExperience';
import { EmptyState } from '@/components/ui/primitives';
import { ButtonLink } from '@/components/ui/Button';
import type { PublicBin } from '@/lib/types';
import type { BinDetail } from '@/components/map/BinDetailPanel';

export const metadata: Metadata = {
  title: 'Xarita',
  description:
    'Qarshi shahridagi jamoat chiqindi qutilari xaritasi. Yaqin atrofdagi qutilarni toping va masofani ko‘ring.',
};

/**
 * The map page.
 *
 * Every active bin for the city is fetched on the server in one query and
 * handed to the client, which clusters them. At city scale that is a single
 * request and instant interaction; the /api/bins endpoint exists for viewport
 * loading once there are several cities.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selected = typeof params.quti === 'string' ? params.quti : null;

  const [user, city] = await Promise.all([getSessionUser(), getDefaultCity()]);

  if (!city) {
    return (
      <div className="shell py-20">
        <EmptyState
          title="Hech qanday shahar sozlanmagan"
          action={
            <ButtonLink href="/" variant="secondary">
              Bosh sahifaga qaytish
            </ButtonLink>
          }
        >
          <p>
            Ma’lumotlar bazasida faol shahar topilmadi. Migratsiyalar ishga tushirilganini
            tekshiring.
          </p>
        </EmptyState>
      </div>
    );
  }

  let bins: PublicBin[] = [];
  let loadError: string | null = null;
  try {
    bins = await listPublicBins(city.id);
  } catch (error) {
    console.error('[binmap] could not load bins for the map', error);
    loadError =
      'Ma’lumotlar bazasiga ulanib bo‘lmadi. Bir lahzadan keyin sahifani qayta yuklang.';
  }

  // A shared link (?quti=<id>) is resolved here so the panel is in the first
  // paint instead of appearing after a client round-trip.
  let initialDetail: BinDetail | null = null;
  if (selected && !loadError && /^[0-9a-f-]{36}$/i.test(selected)) {
    try {
      const bin = await getPublicBin(selected);
      if (bin) {
        initialDetail = { bin, reports: await listPublicReportsForBin(bin.id) };
      }
    } catch (error) {
      console.error('[binmap] could not load the linked bin', error);
    }
  }

  return (
    <div className="h-full">
      {/* The map itself is the content, so the page heading is for assistive
          technology rather than for the screen. Without it this is the only
          page in the site with no h1. */}
      <h1 className="sr-only">
        {city.name} shahridagi jamoat chiqindi qutilari xaritasi
      </h1>
      <MapExperience
        city={city}
        initialBins={bins}
        mapConfig={publicMapConfig()}
        signedIn={Boolean(user)}
        initialDetail={initialDetail}
        loadError={loadError}
      />
    </div>
  );
}
