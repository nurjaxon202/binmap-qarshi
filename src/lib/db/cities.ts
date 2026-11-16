import 'server-only';

import { cache } from 'react';

import { DEFAULT_CITY_SLUG } from '@/lib/config';
import { getDb } from '@/lib/db/client';
import { mapCity, type CityRow } from '@/lib/db/mappers';
import type { City } from '@/lib/types';

const CITY_COLUMNS = `id, slug, name, region, country, center_latitude, center_longitude,
                      default_zoom, min_latitude, max_latitude, min_longitude, max_longitude,
                      is_active, created_at`;

export const listCities = cache(async (): Promise<City[]> => {
  const db = await getDb();
  const { rows } = await db.query<CityRow>(
    `select ${CITY_COLUMNS} from public.cities where is_active order by name`,
  );
  return rows.map(mapCity);
});

export const getCityBySlug = cache(async (slug: string): Promise<City | null> => {
  const db = await getDb();
  const { rows } = await db.query<CityRow>(
    `select ${CITY_COLUMNS} from public.cities where slug = $1`,
    [slug],
  );
  return rows[0] ? mapCity(rows[0]) : null;
});

export const getCityById = cache(async (id: string): Promise<City | null> => {
  const db = await getDb();
  const { rows } = await db.query<CityRow>(
    `select ${CITY_COLUMNS} from public.cities where id = $1`,
    [id],
  );
  return rows[0] ? mapCity(rows[0]) : null;
});

/**
 * The city the map opens on. Qarshi today, configurable through
 * BINMAP_DEFAULT_CITY, and falling back to whichever active city exists so a
 * fresh database never leaves the map without a centre.
 */
export const getDefaultCity = cache(async (): Promise<City | null> => {
  const preferred = await getCityBySlug(DEFAULT_CITY_SLUG);
  if (preferred?.isActive) return preferred;
  const all = await listCities();
  return all[0] ?? null;
});
