/** Pure geographic helpers. No DOM, no network — unit-tested in tests/geo.test.ts. */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Bounding box that contains every point within `radiusMeters` of `center`.
 * Lets the database do the cheap filtering before exact distances are computed.
 */
export function boundingBoxAround(center: LatLng, radiusMeters: number): BoundingBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const cosLat = Math.cos(toRad(center.latitude));
  // Near the poles cosLat collapses; fall back to the whole longitude range.
  const lngDelta =
    Math.abs(cosLat) < 1e-9 ? 180 : (radiusMeters / (EARTH_RADIUS_M * cosLat)) * (180 / Math.PI);

  return {
    minLat: clampLatitude(center.latitude - latDelta),
    maxLat: clampLatitude(center.latitude + latDelta),
    minLng: center.longitude - Math.abs(lngDelta),
    maxLng: center.longitude + Math.abs(lngDelta),
  };
}

export function clampLatitude(lat: number): number {
  return Math.min(90, Math.max(-90, lat));
}

export function isValidLatitude(lat: unknown): lat is number {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: unknown): lng is number {
  return typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

/** Human-readable distance in Uzbek units ("120 m", "1,4 km"). */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  const text = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return `${text.replace('.', ',')} km`;
}

/** Coordinates in the fixed 5-decimal form we show everywhere (about 1 m precision). */
export function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export function formatLatLng(point: LatLng): string {
  return `${formatCoordinate(point.latitude)}, ${formatCoordinate(point.longitude)}`;
}

/** Rough walking time at 1.35 m/s, rounded up to whole minutes. */
export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 1.35 / 60));
}

/**
 * Deterministic grid cell id for a coordinate, used for duplicate detection and
 * coverage analysis. `sizeDeg` of 0.0045 is roughly 500 m of latitude.
 */
export function gridCell(point: LatLng, sizeDeg: number): string {
  const row = Math.floor(point.latitude / sizeDeg);
  const col = Math.floor(point.longitude / sizeDeg);
  return `${row}:${col}`;
}

export function gridCellCenter(cell: string, sizeDeg: number): LatLng | null {
  const [rowRaw, colRaw] = cell.split(':');
  const row = Number(rowRaw);
  const col = Number(colRaw);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return {
    latitude: (row + 0.5) * sizeDeg,
    longitude: (col + 0.5) * sizeDeg,
  };
}

/** Bounds of a grid cell, for drawing coverage rectangles. */
export function gridCellBounds(cell: string, sizeDeg: number): BoundingBox | null {
  const [rowRaw, colRaw] = cell.split(':');
  const row = Number(rowRaw);
  const col = Number(colRaw);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return {
    minLat: row * sizeDeg,
    maxLat: (row + 1) * sizeDeg,
    minLng: col * sizeDeg,
    maxLng: (col + 1) * sizeDeg,
  };
}
