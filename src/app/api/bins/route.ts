import { NextResponse } from 'next/server';

import { bboxQuerySchema, fieldErrors } from '@/lib/validation';
import { getCityBySlug, getDefaultCity } from '@/lib/db/cities';
import { listPublicBins, listPublicBinsInBox } from '@/lib/db/bins';

/**
 * GET /api/bins
 *
 * Active, approved bins — either every one in a city, or those inside a
 * viewport when minLat/maxLat/minLng/maxLng are supplied. Public: no session
 * required, and the payload carries no submitter or internal field.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());

  try {
    const city = raw.city ? await getCityBySlug(raw.city) : await getDefaultCity();
    if (raw.city && !city) {
      return NextResponse.json({ error: 'Shahar topilmadi.' }, { status: 404 });
    }

    const hasBox =
      'minLat' in raw && 'maxLat' in raw && 'minLng' in raw && 'maxLng' in raw;

    if (hasBox) {
      const parsed = bboxQuerySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ errors: fieldErrors(parsed.error) }, { status: 400 });
      }
      const { minLat, maxLat, minLng, maxLng } = parsed.data;
      const bins = await listPublicBinsInBox(
        {
          minLat: Math.min(minLat, maxLat),
          maxLat: Math.max(minLat, maxLat),
          minLng: Math.min(minLng, maxLng),
          maxLng: Math.max(minLng, maxLng),
        },
        city?.id ?? null,
      );
      return NextResponse.json(
        { bins, city: city ? { slug: city.slug, name: city.name } : null },
        { headers: { 'Cache-Control': 'private, max-age=15' } },
      );
    }

    const bins = await listPublicBins(city?.id ?? null);
    return NextResponse.json(
      { bins, city: city ? { slug: city.slug, name: city.name } : null },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (error) {
    console.error('[binmap] /api/bins failed', error);
    return NextResponse.json(
      { error: 'Qutilar ro‘yxatini olib bo‘lmadi. Keyinroq urinib ko‘ring.' },
      { status: 500 },
    );
  }
}
