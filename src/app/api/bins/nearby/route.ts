import { NextResponse } from 'next/server';

import { NEARBY_DEFAULT_RADIUS_M, NEARBY_MAX_RESULTS } from '@/lib/config';
import { fieldErrors, nearbyQuerySchema } from '@/lib/validation';
import { getCityBySlug, getDefaultCity } from '@/lib/db/cities';
import { findNearbyBins } from '@/lib/db/bins';

/**
 * GET /api/bins/nearby?lat&lng&radius&limit
 *
 * Distances are computed in PostgreSQL by `binmap_bins_nearby`, which narrows
 * with the (latitude, longitude) index before measuring — so the work scales
 * with the bins near the point, not with the table.
 *
 * The coordinates are used for this query and nothing else: they are not
 * logged, not stored and not forwarded anywhere.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = nearbyQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrors(parsed.error) }, { status: 400 });
  }

  try {
    const citySlug = url.searchParams.get('city');
    const city = citySlug ? await getCityBySlug(citySlug) : await getDefaultCity();

    const bins = await findNearbyBins(
      { latitude: parsed.data.lat, longitude: parsed.data.lng },
      parsed.data.radius ?? NEARBY_DEFAULT_RADIUS_M,
      city?.id ?? null,
      parsed.data.limit ?? NEARBY_MAX_RESULTS,
    );

    return NextResponse.json(
      { bins, radius: parsed.data.radius ?? NEARBY_DEFAULT_RADIUS_M },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[binmap] /api/bins/nearby failed', error);
    return NextResponse.json(
      { error: 'Yaqin atrofdagi qutilarni aniqlab bo‘lmadi.' },
      { status: 500 },
    );
  }
}
