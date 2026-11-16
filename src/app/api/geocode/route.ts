import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { geocoder, geocoderEnabled, rateLimits } from '@/lib/config';
import { fieldErrors, geocodeQuerySchema } from '@/lib/validation';
import { getCityBySlug, getDefaultCity } from '@/lib/db/cities';
import { checkRateLimit } from '@/lib/db/rate-limit';
import { boundingBoxAround } from '@/lib/geo';

/**
 * GET /api/geocode?q=...
 *
 * Place search, proxied so that:
 *   - the provider sees one identifying User-Agent, not every visitor's;
 *   - requests are rate limited on our side;
 *   - results are cached, so repeated searches do not repeat the call;
 *   - the provider is swappable without touching the client.
 *
 * Nominatim's usage policy forbids autocomplete, so the client submits
 * explicitly — there is no per-keystroke endpoint anywhere in this codebase.
 */

interface GeocodeHit {
  label: string;
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
}

/** Small in-process cache. Resets on deploy, which is fine for a search box. */
const cache = new Map<string, { at: number; hits: GeocodeHit[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;

export async function GET(request: Request) {
  if (!geocoderEnabled) {
    return NextResponse.json(
      { disabled: true, message: 'Qidiruv xizmati sozlanmagan. Joyni xaritadan tanlang.' },
      { status: 200 },
    );
  }

  const url = new URL(request.url);
  const parsed = geocodeQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ errors: fieldErrors(parsed.error) }, { status: 400 });
  }

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
  const limit = await checkRateLimit('geocode', ip, rateLimits.geocode);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Juda ko‘p qidiruv. Bir lahza kutib, qayta urinib ko‘ring.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const city = parsed.data.city ? await getCityBySlug(parsed.data.city) : await getDefaultCity();
  const cacheKey = `${city?.slug ?? '-'}:${parsed.data.q.toLowerCase()}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ hits: cached.hits, cached: true });
  }

  try {
    const endpoint = new URL(geocoder.endpoint);
    endpoint.searchParams.set('q', parsed.data.q);
    endpoint.searchParams.set('format', 'jsonv2');
    endpoint.searchParams.set('limit', '6');
    endpoint.searchParams.set('addressdetails', '0');
    endpoint.searchParams.set('accept-language', 'uz,ru,en');
    if (geocoder.email) endpoint.searchParams.set('email', geocoder.email);

    // Bias (and bound) the search to the city, so "Navoiy" finds the street in
    // Qarshi rather than the province two hundred kilometres away.
    if (city) {
      const box = boundingBoxAround(
        { latitude: city.centerLatitude, longitude: city.centerLongitude },
        25_000,
      );
      endpoint.searchParams.set(
        'viewbox',
        `${box.minLng},${box.maxLat},${box.maxLng},${box.minLat}`,
      );
      endpoint.searchParams.set('bounded', '1');
      endpoint.searchParams.set('countrycodes', 'uz');
    }

    const response = await fetch(endpoint, {
      headers: { 'User-Agent': geocoder.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Qidiruv xizmati javob bermadi. Joyni xaritadan tanlashingiz mumkin.',
          degraded: true,
        },
        { status: 200 },
      );
    }

    const body = (await response.json()) as NominatimResult[];
    const hits: GeocodeHit[] = (Array.isArray(body) ? body : [])
      .map((item) => ({
        label: (item.display_name ?? item.name ?? '').trim(),
        latitude: Number(item.lat),
        longitude: Number(item.lon),
      }))
      .filter(
        (hit) =>
          hit.label.length > 0 && Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude),
      );

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(cacheKey, { at: Date.now(), hits });

    return NextResponse.json({ hits });
  } catch (error) {
    // An unavailable optional service must not break the map.
    console.error('[binmap] geocode failed', error);
    return NextResponse.json(
      {
        error: 'Qidiruv vaqtincha ishlamayapti. Joyni xaritadan tanlashingiz mumkin.',
        degraded: true,
      },
      { status: 200 },
    );
  }
}
