import { describe, expect, it } from 'vitest';

import {
  boundingBoxAround,
  formatCoordinate,
  formatDistance,
  gridCell,
  gridCellBounds,
  gridCellCenter,
  haversineMeters,
  isValidLatitude,
  isValidLongitude,
  walkingMinutes,
} from '@/lib/geo';

const QARSHI = { latitude: 38.8606, longitude: 65.7891 };

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters(QARSHI, QARSHI)).toBe(0);
  });

  it('matches a known distance', () => {
    // One degree of latitude is ~111.2 km anywhere on the globe.
    const north = { latitude: QARSHI.latitude + 1, longitude: QARSHI.longitude };
    expect(haversineMeters(QARSHI, north)).toBeGreaterThan(111_000);
    expect(haversineMeters(QARSHI, north)).toBeLessThan(111_400);
  });

  it('is symmetric', () => {
    const other = { latitude: 38.87, longitude: 65.8 };
    expect(haversineMeters(QARSHI, other)).toBeCloseTo(haversineMeters(other, QARSHI), 6);
  });

  it('measures a short city distance the way the UI reports it', () => {
    // Two of the seeded demonstration coordinates, ~75 m apart.
    const a = { latitude: 38.8606, longitude: 65.7891 };
    const b = { latitude: 38.8612, longitude: 65.7887 };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(90);
  });
});

describe('boundingBoxAround', () => {
  it('contains the centre', () => {
    const box = boundingBoxAround(QARSHI, 500);
    expect(QARSHI.latitude).toBeGreaterThan(box.minLat);
    expect(QARSHI.latitude).toBeLessThan(box.maxLat);
    expect(QARSHI.longitude).toBeGreaterThan(box.minLng);
    expect(QARSHI.longitude).toBeLessThan(box.maxLng);
  });

  it('contains every point inside the radius', () => {
    const radius = 800;
    const box = boundingBoxAround(QARSHI, radius);
    // Sample points on the circle; all must fall inside the box, otherwise the
    // database pre-filter would silently drop real results.
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      const dLat = (radius / 6_371_008.8) * (180 / Math.PI) * Math.cos(rad);
      const dLng =
        ((radius / 6_371_008.8) * (180 / Math.PI) * Math.sin(rad)) /
        Math.cos((QARSHI.latitude * Math.PI) / 180);
      const lat = QARSHI.latitude + dLat;
      const lng = QARSHI.longitude + dLng;
      expect(lat).toBeGreaterThanOrEqual(box.minLat - 1e-9);
      expect(lat).toBeLessThanOrEqual(box.maxLat + 1e-9);
      expect(lng).toBeGreaterThanOrEqual(box.minLng - 1e-9);
      expect(lng).toBeLessThanOrEqual(box.maxLng + 1e-9);
    }
  });

  it('clamps latitude at the poles', () => {
    const box = boundingBoxAround({ latitude: 89.999, longitude: 0 }, 100_000);
    expect(box.maxLat).toBeLessThanOrEqual(90);
    expect(box.minLat).toBeGreaterThanOrEqual(-90);
  });
});

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(120.4)).toBe('120 m');
    expect(formatDistance(999)).toBe('999 m');
  });

  it('uses a comma as the decimal separator, as Uzbek does', () => {
    expect(formatDistance(1400)).toBe('1,4 km');
    expect(formatDistance(1000)).toBe('1,0 km');
  });

  it('drops the decimal above ten kilometres', () => {
    expect(formatDistance(12_400)).toBe('12 km');
  });

  it('refuses nonsense rather than printing it', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
    expect(formatDistance(-5)).toBe('—');
  });
});

describe('walkingMinutes', () => {
  it('never reports less than a minute', () => {
    expect(walkingMinutes(5)).toBe(1);
  });

  it('is about 12 minutes per kilometre', () => {
    expect(walkingMinutes(1000)).toBe(12);
  });
});

describe('coordinate validation', () => {
  it('accepts real coordinates', () => {
    expect(isValidLatitude(38.8606)).toBe(true);
    expect(isValidLongitude(65.7891)).toBe(true);
  });

  it('rejects out-of-range, non-finite and non-numeric values', () => {
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLatitude('38.8' as unknown)).toBe(false);
    expect(isValidLongitude(181)).toBe(false);
    expect(isValidLongitude(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('formatCoordinate', () => {
  it('always shows five decimals, so values line up between rows', () => {
    expect(formatCoordinate(38.8606)).toBe('38.86060');
    expect(formatCoordinate(65)).toBe('65.00000');
  });
});

describe('the coverage grid', () => {
  const size = 0.0045;

  it('puts nearby points in the same cell and distant points in different ones', () => {
    const a = gridCell({ latitude: 38.8606, longitude: 65.7891 }, size);
    const b = gridCell({ latitude: 38.8608, longitude: 65.7893 }, size);
    const far = gridCell({ latitude: 38.875, longitude: 65.805 }, size);
    expect(a).toBe(b);
    expect(a).not.toBe(far);
  });

  it('round-trips a cell id back to a point inside that cell', () => {
    const point = { latitude: 38.8606, longitude: 65.7891 };
    const cell = gridCell(point, size);
    const centre = gridCellCenter(cell, size);
    expect(centre).not.toBeNull();
    expect(gridCell(centre!, size)).toBe(cell);
  });

  it('produces bounds that contain the cell centre', () => {
    const cell = gridCell({ latitude: 38.8606, longitude: 65.7891 }, size);
    const bounds = gridCellBounds(cell, size);
    const centre = gridCellCenter(cell, size);
    expect(bounds).not.toBeNull();
    expect(centre!.latitude).toBeGreaterThan(bounds!.minLat);
    expect(centre!.latitude).toBeLessThan(bounds!.maxLat);
    expect(centre!.longitude).toBeGreaterThan(bounds!.minLng);
    expect(centre!.longitude).toBeLessThan(bounds!.maxLng);
  });

  it('returns null for a malformed cell id instead of guessing', () => {
    expect(gridCellCenter('not-a-cell', size)).toBeNull();
    expect(gridCellBounds('', size)).toBeNull();
  });
});
