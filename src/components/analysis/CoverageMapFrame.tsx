'use client';

import dynamic from 'next/dynamic';

import type { PublicMapConfig } from '@/lib/config';
import type { CellObservation } from '@/lib/analysis';
import type { City } from '@/lib/types';
import { Spinner } from '@/components/ui/primitives';

/** Client boundary: Leaflet reads `window` while its module evaluates. */
const CoverageMap = dynamic(() => import('@/components/analysis/CoverageMap'), {
  ssr: false,
  loading: () => (
    <div className="plan-grid grid size-full place-items-center bg-paper-300">
      <Spinner label="Xarita yuklanmoqda" className="text-forest-700" />
    </div>
  ),
});

export function CoverageMapFrame(props: {
  city: City;
  observations: CellObservation[];
  mapConfig: PublicMapConfig;
}) {
  return <CoverageMap {...props} />;
}
