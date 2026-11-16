'use client';

import dynamic from 'next/dynamic';

import type { PublicMapConfig } from '@/lib/config';
import type { City, PublicBin } from '@/lib/types';

/**
 * Client boundary for the homepage map.
 *
 * Leaflet reads `window` while its module evaluates, so it must not be
 * server-rendered. `ssr: false` is only allowed inside a Client Component,
 * which is the whole reason this thin wrapper exists — the homepage itself is
 * a Server Component and needs to stay one so it can query the database.
 */
const HeroMap = dynamic(() => import('@/components/map/HeroMap'), {
  ssr: false,
  loading: () => <div className="plan-grid size-full bg-forest-800" />,
});

export function HeroMapFrame(props: {
  city: City;
  bins: PublicBin[];
  mapConfig: PublicMapConfig;
}) {
  return <HeroMap {...props} />;
}
