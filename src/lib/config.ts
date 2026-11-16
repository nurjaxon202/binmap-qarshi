/**
 * Runtime configuration. Everything that could plausibly change per deployment
 * lives here so no feature file reads `process.env` directly.
 */

export type DbDriver = 'postgres' | 'pglite';
export type AuthDriver = 'supabase' | 'local';
export type StorageDriver = 'supabase' | 'local';

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/* ----------------------------- the database ------------------------------ */

const databaseUrl = readEnv('DATABASE_URL') ?? readEnv('POSTGRES_URL');

/**
 * PostgreSQL is the authoritative database in every mode — the schema,
 * migrations and every query are plain PostgreSQL.
 *
 * `postgres` — a real server over the wire (Supabase, or any Postgres).
 *              This is the production path.
 * `pglite`   — the same PostgreSQL engine (official sources compiled to WASM)
 *              running in-process against a local data directory. Used only
 *              when no DATABASE_URL is configured, so a developer can run the
 *              project without Docker. Identical SQL, identical migrations.
 */
export const dbDriver: DbDriver = databaseUrl ? 'postgres' : 'pglite';

export const dbConfig = {
  url: databaseUrl,
  /** Local PGlite data directory, relative to the project root. */
  localDir: readEnv('BINMAP_LOCAL_PG_DIR') ?? '.data/pgdata',
  /** Supabase's pooler terminates TLS with its own chain. */
  ssl: readEnv('DATABASE_SSL') !== 'false',
  poolMax: Number(readEnv('DATABASE_POOL_MAX') ?? 6),
  /** Applies pending migrations on first connection (dev convenience). */
  autoMigrate: readEnv('BINMAP_AUTO_MIGRATE') !== 'false',
};

/* -------------------------------- Supabase ------------------------------- */

const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const supabaseServiceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceKey);

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  /** Server-only. Never import this into a client component. */
  serviceRoleKey: supabaseServiceKey,
  binPhotoBucket: readEnv('SUPABASE_BIN_PHOTO_BUCKET') ?? 'bin-photos',
  evidenceBucket: readEnv('SUPABASE_EVIDENCE_BUCKET') ?? 'bin-evidence',
};

/**
 * Supabase Auth is the production authentication provider. Without Supabase
 * credentials the app falls back to its own password + session implementation
 * stored in the same PostgreSQL database (see supabase/migrations/0003).
 */
export const authDriver: AuthDriver = supabaseConfigured ? 'supabase' : 'local';

/** Supabase Storage in production; the local filesystem otherwise. */
export const storageDriver: StorageDriver = supabaseConfigured ? 'supabase' : 'local';

export const localStorageConfig = {
  dir: readEnv('BINMAP_UPLOAD_DIR') ?? '.data/uploads',
  /**
   * Signs the short-lived URLs the local driver hands out, mirroring Supabase
   * signed URLs. Falls back to an ephemeral per-process secret in development.
   */
  signingSecret: readEnv('BINMAP_MEDIA_SIGNING_SECRET'),
  signedUrlTtlSeconds: Number(readEnv('BINMAP_SIGNED_URL_TTL') ?? 600),
};

/* --------------------------------- demo ---------------------------------- */

/**
 * Seeding is a deliberate, guarded act: `npm run demo:seed` refuses to run
 * against a production environment unless BINMAP_ALLOW_DEMO_SEED=true.
 * Nothing creates demonstration data implicitly.
 */
export const demoSeedAllowed =
  readEnv('BINMAP_ALLOW_DEMO_SEED') === 'true' || readEnv('NODE_ENV') !== 'production';

/**
 * Whether the UI shows the demonstration banner is decided by the data itself
 * (`count(*) where is_demo`), never by a flag — a flag could lie.
 */
/**
 * Demonstration records are no longer labelled in the interface — the product
 * should not read as a prototype. The separation is kept where it matters:
 * `is_demo` on every row, the seeding guard above, and `npm run demo:clean`.
 * Production holds only real submitted or verified information.
 */

/* ------------------------------ geography -------------------------------- */

export const DEFAULT_CITY_SLUG = readEnv('BINMAP_DEFAULT_CITY') ?? 'qarshi';

/** Used by the map shell before the cities table has been read. */
export const FALLBACK_CITY = {
  slug: 'qarshi',
  name: 'Qarshi',
  region: 'Qashqadaryo',
  country: 'Uzbekistan',
  centerLatitude: 38.8606,
  centerLongitude: 65.7891,
  defaultZoom: 14,
  /**
   * The rectangle the map may show. An urban extent covering Qarshi's
   * built-up area — chosen from the street network, NOT an official municipal
   * boundary, and never presented as one. The authoritative copy lives in
   * public.cities; this is only the fallback before that row is read.
   */
  extent: {
    minLatitude: 38.828,
    maxLatitude: 38.9,
    minLongitude: 65.735,
    maxLongitude: 65.845,
  },
};

/* ------------------------------ map behaviour ----------------------------- */

/**
 * Zoom feel.
 *
 * Leaflet's defaults step a whole zoom level per wheel notch, which on a
 * trackpad throws you from street level to province level in one gesture.
 * These values make a notch a quarter of a level and require roughly four
 * times the scroll distance per level, so zooming is gradual enough to land
 * where you meant to.
 *
 * `minZoom` is not fixed here: the map computes the zoom at which the city
 * extent exactly fills the viewport and refuses to go below it, so Qarshi can
 * never shrink into a country-level view on any screen size.
 */
export const mapBehaviour = {
  /** Allow quarter-level zooms rather than whole steps. */
  zoomSnap: 0.25,
  /** How much the +/- buttons and keyboard move. */
  zoomDelta: 0.5,
  /** Scroll distance for one whole zoom level. Leaflet's default is 60. */
  wheelPxPerZoomLevel: 240,
  /** Shorter than the default 40 ms, so the wheel feels attached to the map. */
  wheelDebounceTime: 25,
  /** Street level is as close as the tiles are useful. */
  maxZoom: 19,
  /** Floor for the computed minimum, in case the viewport is tiny. */
  minZoomFloor: 11,
  /** How firmly the extent pushes back when panned against. 1 = solid. */
  maxBoundsViscosity: 1,
};

export const NEARBY_DEFAULT_RADIUS_M = 800;
export const NEARBY_MAX_RADIUS_M = 10_000;
export const NEARBY_MAX_RESULTS = 50;

/** Submissions closer than this to an existing bin raise a duplicate warning. */
export const DUPLICATE_WARNING_RADIUS_M = 35;

/** Coverage grid cell size in degrees of latitude (~500 m at this latitude). */
export const COVERAGE_GRID_DEG = 0.0045;

/* --------------------------- map tile providers --------------------------- */

export interface TileProvider {
  id: string;
  label: string;
  urlTemplate: string;
  attributionHtml: string;
  maxZoom: number;
  note?: string;
}

/**
 * Raster tile sources that work without an account.
 *
 * CARTO's basemaps now require an API key, so they cannot be the default: an
 * unkeyed request returns "API KEY REQUIRED" tiles and the city disappears.
 * They remain available for anyone who has a key.
 */
const OSM_STANDARD: TileProvider = {
  id: 'osm',
  label: 'OpenStreetMap',
  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attributionHtml:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> hissadorlari',
  maxZoom: 19,
  note: 'OpenStreetMap Foundation jamoat serverlari. Katta yuklama uchun o‘z tile provayderingizni ulang.',
};

const ESRI_STREETS: TileProvider = {
  id: 'esri',
  label: 'Esri World Street Map',
  urlTemplate:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  attributionHtml:
    'Xarita: &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, HERE, Garmin, OpenStreetMap hissadorlari',
  maxZoom: 19,
};

const CARTO_VOYAGER: TileProvider = {
  id: 'carto-voyager',
  label: 'Carto Voyager',
  urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attributionHtml:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> hissadorlari, &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
  maxZoom: 20,
  note: 'CARTO hozirda API kalit talab qiladi.',
};

const TILE_PROVIDERS: Record<string, TileProvider> = {
  osm: OSM_STANDARD,
  esri: ESRI_STREETS,
  carto: CARTO_VOYAGER,
};

/**
 * OpenStreetMap *data* and the OpenStreetMap Foundation *tile servers* are
 * different things. The default below uses the OSMF servers, which are
 * community-funded and are not a production CDN: point BINMAP_TILE_URL at your
 * own provider before taking real traffic. Tiles are always fetched on demand
 * and never bulk-downloaded, and attribution is rendered on every map.
 */
export const tileProvider: TileProvider = (() => {
  const custom = readEnv('BINMAP_TILE_URL');
  if (custom) {
    return {
      id: 'custom',
      label: readEnv('BINMAP_TILE_LABEL') ?? 'Xarita provayderi',
      urlTemplate: custom,
      attributionHtml:
        readEnv('BINMAP_TILE_ATTRIBUTION') ??
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> hissadorlari',
      maxZoom: Number(readEnv('BINMAP_TILE_MAX_ZOOM') ?? 19),
    };
  }
  return TILE_PROVIDERS[readEnv('BINMAP_TILE_PROVIDER') ?? 'osm'] ?? OSM_STANDARD;
})();

/* ------------------------------- geocoding -------------------------------- */

/**
 * Search is optional and always explicit — never type-ahead. Nominatim's usage
 * policy forbids autocomplete, so the UI requires a submit, we send at most one
 * request per submit, identify ourselves, and cache results.
 */
export const geocoder = {
  provider: (readEnv('BINMAP_GEOCODER') ?? 'nominatim') as 'nominatim' | 'none',
  endpoint: readEnv('BINMAP_GEOCODER_URL') ?? 'https://nominatim.openstreetmap.org/search',
  email: readEnv('BINMAP_GEOCODER_EMAIL'),
  userAgent:
    readEnv('BINMAP_GEOCODER_USER_AGENT') ??
    'BinMapQarshi/0.1 (https://binmap.uz; info@binmap.uz)',
};

export const geocoderEnabled = geocoder.provider !== 'none';

/* ------------------------------- directions ------------------------------- */

export type DirectionsProviderId = 'osm' | 'google' | 'yandex' | '2gis';

export const directionsProvider: DirectionsProviderId =
  (readEnv('BINMAP_DIRECTIONS_PROVIDER') as DirectionsProviderId | undefined) ?? 'google';

/**
 * We link out to a real navigation service rather than claiming to compute
 * walking routes ourselves.
 */
export function directionsUrl(
  target: { latitude: number; longitude: number },
  from?: { latitude: number; longitude: number } | null,
  provider: DirectionsProviderId = directionsProvider,
): string {
  const lat = target.latitude.toFixed(6);
  const lng = target.longitude.toFixed(6);
  switch (provider) {
    case 'osm':
      return from
        ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${from.latitude.toFixed(6)}%2C${from.longitude.toFixed(6)}%3B${lat}%2C${lng}`
        : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
    case 'yandex':
      return `https://yandex.uz/maps/?rtext=${from ? `${from.latitude.toFixed(6)}%2C${from.longitude.toFixed(6)}` : ''}~${lat}%2C${lng}&rtt=pd`;
    case '2gis':
      return `https://2gis.uz/geo/${lng}%2C${lat}`;
    case 'google':
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  }
}

export const directionsProviderLabel: Record<DirectionsProviderId, string> = {
  osm: 'OpenStreetMap',
  google: 'Google Maps',
  yandex: 'Yandex Xarita',
  '2gis': '2GIS',
};

/* --------------------------------- uploads -------------------------------- */

export const uploadLimits = {
  maxBytes: Number(readEnv('BINMAP_MAX_UPLOAD_BYTES') ?? 6 * 1024 * 1024),
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
};

/* ------------------------------ rate limiting ----------------------------- */

export const rateLimits = {
  submission: { windowMs: 60 * 60 * 1000, max: 10 },
  report: { windowMs: 60 * 60 * 1000, max: 15 },
  reportPerBin: { windowMs: 12 * 60 * 60 * 1000, max: 2 },
  auth: { windowMs: 15 * 60 * 1000, max: 15 },
  geocode: { windowMs: 60 * 1000, max: 10 },
};

/* --------------------- configuration for the browser ---------------------- */

/**
 * Only NEXT_PUBLIC_* variables are inlined into client bundles, so a client
 * component that read `tileProvider` directly would silently get the defaults
 * instead of the deployment's actual settings. The server builds this object
 * and passes it down as props, which keeps every provider genuinely swappable.
 */
export interface PublicMapConfig {
  tile: {
    label: string;
    urlTemplate: string;
    attributionHtml: string;
    maxZoom: number;
    note: string | null;
  };
  behaviour: typeof mapBehaviour;
  directionsProvider: DirectionsProviderId;
  directionsProviderLabel: string;
  geocoderEnabled: boolean;
  nearbyDefaultRadiusM: number;
  nearbyMaxRadiusM: number;
  duplicateWarningRadiusM: number;
}

export function publicMapConfig(): PublicMapConfig {
  return {
    tile: {
      label: tileProvider.label,
      urlTemplate: tileProvider.urlTemplate,
      attributionHtml: tileProvider.attributionHtml,
      maxZoom: tileProvider.maxZoom,
      note: tileProvider.note ?? null,
    },
    behaviour: mapBehaviour,
    directionsProvider,
    directionsProviderLabel: directionsProviderLabel[directionsProvider],
    geocoderEnabled,
    nearbyDefaultRadiusM: NEARBY_DEFAULT_RADIUS_M,
    nearbyMaxRadiusM: NEARBY_MAX_RADIUS_M,
    duplicateWarningRadiusM: DUPLICATE_WARNING_RADIUS_M,
  };
}

/* ----------------------------- public metadata ---------------------------- */

export const siteConfig = {
  name: 'BinMap Qarshi',
  shortName: 'BinMap',
  tagline: 'Quti qayerda?',
  description:
    'Qarshi shahridagi jamoat chiqindi qutilarini toping. Yangi joylashuvlarni xaritaga qo‘shing va shahrimiz haqida foydali ma’lumotlar yaratishga hissa qo‘shing.',
  url: readEnv('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000',
  contactEmail: readEnv('NEXT_PUBLIC_CONTACT_EMAIL') ?? 'info@binmap.uz',
};
