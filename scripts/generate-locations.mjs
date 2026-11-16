#!/usr/bin/env node
/**
 * Builds the demonstration location set for Qarshi.
 *
 * Run once by a maintainer; its output
 * (scripts/lib/qarshi-locations.json) is committed so that seeding needs no
 * network and produces the same dataset every time.
 *
 *   node scripts/generate-locations.mjs            # from cached OSM extracts
 *   node scripts/generate-locations.mjs --fetch    # re-fetch from Overpass
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND IS NOT
 *
 * The *geography* is real: candidate points are sampled along street
 * centrelines from OpenStreetMap, so every location sits on an actual Qarshi
 * street, and each description reflects what OSM says is genuinely nearby.
 *
 * The *bins* are not real. Nothing here asserts that a public bin has been
 * installed at any of these points. They exist so the platform can be
 * explored before the first field survey, they are written with is_demo set,
 * and they never reach a production database.
 * ---------------------------------------------------------------------------
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const TARGET = 420;

/** The urban extent used throughout the project. Not an official boundary. */
const EXTENT = { minLat: 38.828, maxLat: 38.9, minLng: 65.735, maxLng: 65.845 };
const CENTRE = { lat: 38.8606, lng: 65.7891 };

/** Minimum distance between two locations, in metres. */
const MIN_SPACING_M = 55;

/** How quickly density falls off from the centre, in metres. */
const CENTRE_FALLOFF_M = 2600;

/** A location adopts a nearby amenity's description within this distance. */
const POI_RADIUS_M = 70;

const CACHE = {
  streets: resolve(process.cwd(), 'scripts/data/qarshi-streets.json'),
  pois: resolve(process.cwd(), 'scripts/data/qarshi-pois.json'),
};
const OUTPUT = resolve(process.cwd(), 'scripts/lib/qarshi-locations.json');

/* ------------------------------ street weights ---------------------------- */

/**
 * How likely a bin is to stand beside each kind of way. Pedestrian streets and
 * footways score highest because that is where public bins actually go;
 * service roads and alleys score lowest.
 */
const STREET_WEIGHT = {
  pedestrian: 3.2,
  footway: 2.1,
  primary: 2.0,
  secondary: 1.8,
  tertiary: 1.5,
  living_street: 1.3,
  unclassified: 1.1,
  residential: 1.0,
  service: 0.3,
};

/* ------------------------- descriptions, by context ----------------------- */

const POI_DESCRIPTION = {
  bus_stop: 'Avtobus bekati yonida',
  bus_station: 'Avtostansiya hududidagi yo‘lka',
  marketplace: 'Bozor hududidagi yo‘lka',
  school: 'Maktab yaqinidagi yo‘lka',
  kindergarten: 'Bolalar bog‘chasi yonida',
  university: 'Oliy ta’lim binosi yaqinida',
  driving_school: 'O‘quv markazi yonida',
  hospital: 'Shifoxona hududi yonida',
  clinic: 'Poliklinika yonidagi yo‘lka',
  pharmacy: 'Dorixona oldidagi yo‘lka',
  bank: 'Bank filiali yonida',
  cafe: 'Kafe oldidagi maydoncha',
  internet_cafe: 'Internet-kafe yonida',
  supermarket: 'Supermarket oldidagi yo‘lka',
  convenience: 'Do‘kon oldidagi yo‘lka',
  bakery: 'Nonvoyxona yonida',
  mall: 'Savdo markazi oldidagi maydon',
  place_of_worship: 'Masjid yonidagi maydoncha',
};

const STREET_DESCRIPTION = {
  pedestrian: 'Piyodalar zonasidagi yo‘lka',
  footway: 'Piyodalar yo‘lkasi chetida',
  primary: 'Asosiy ko‘cha yo‘lkasida',
  secondary: 'Ko‘cha yo‘lkasi bo‘yida',
  tertiary: 'Ko‘cha yo‘lkasi chetida',
  living_street: 'Hovli ichidagi yo‘lka',
  unclassified: 'Ko‘cha burchagidagi maydoncha',
  residential: 'Turar-joy ko‘chasidagi yo‘lka',
  service: 'Xizmat yo‘li chetidagi maydoncha',
};

/* --------------------------------- geometry ------------------------------- */

const R = 6_371_008.8;
const toRad = (d) => (d * Math.PI) / 180;

function haversine(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Deterministic PRNG, so re-running produces the same dataset. */
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ data loading ------------------------------ */

async function overpass(query) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'BinMapQarshi/0.1 (demonstration dataset build)',
          },
          signal: AbortSignal.timeout(90_000),
        });
        const text = await response.text();
        if (response.ok && text.trim().startsWith('{')) return JSON.parse(text);
        console.log(`  ${url} -> ${response.status}`);
      } catch (error) {
        console.log(`  ${url} -> ${error.message.slice(0, 50)}`);
      }
    }
    await new Promise((r) => setTimeout(r, 6000));
  }
  throw new Error('Overpass unavailable. Re-run later, or use the cached extracts.');
}

const bbox = `${EXTENT.minLat},${EXTENT.minLng},${EXTENT.maxLat},${EXTENT.maxLng}`;

async function loadStreets(refetch) {
  if (!refetch && existsSync(CACHE.streets)) {
    return JSON.parse(readFileSync(CACHE.streets, 'utf8'));
  }
  console.log('Fetching street geometry from OpenStreetMap...');
  const data = await overpass(`[out:json][timeout:60];
(way["highway"~"^(${Object.keys(STREET_WEIGHT).join('|')})$"](${bbox}););
out geom;`);

  const ways = data.elements
    .filter((e) => e.type === 'way' && e.geometry)
    .map((w) => ({
      t: w.tags?.highway,
      g: w.geometry.map((p) => [Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6))]),
    }));

  mkdirSync(dirname(CACHE.streets), { recursive: true });
  writeFileSync(CACHE.streets, JSON.stringify(ways));
  return ways;
}

async function loadPois(refetch) {
  if (!refetch && existsSync(CACHE.pois)) {
    return JSON.parse(readFileSync(CACHE.pois, 'utf8'));
  }
  console.log('Fetching amenities from OpenStreetMap...');
  const data = await overpass(`[out:json][timeout:45];
(
  node["highway"="bus_stop"](${bbox});
  node["amenity"~"school|hospital|clinic|pharmacy|marketplace|place_of_worship|kindergarten|university|bank|cafe|bus_station"](${bbox});
  node["shop"~"supermarket|mall|convenience|bakery"](${bbox});
);
out;`);

  const pois = data.elements
    .filter((e) => e.lat != null)
    .map((e) => {
      const tags = e.tags ?? {};
      const kind = tags.highway === 'bus_stop' ? 'bus_stop' : (tags.amenity ?? tags.shop);
      return kind ? { k: kind, lat: Number(e.lat.toFixed(6)), lon: Number(e.lon.toFixed(6)) } : null;
    })
    .filter(Boolean);

  mkdirSync(dirname(CACHE.pois), { recursive: true });
  writeFileSync(CACHE.pois, JSON.stringify(pois));
  return pois;
}

/* -------------------------------- placement ------------------------------- */

function sampleAlongWays(ways) {
  const candidates = [];
  const STEP_M = 30;

  for (const way of ways) {
    const weight = STREET_WEIGHT[way.t] ?? 0.5;
    for (let i = 1; i < way.g.length; i++) {
      const [aLat, aLng] = way.g[i - 1];
      const [bLat, bLng] = way.g[i];
      const length = haversine(aLat, aLng, bLat, bLng);
      if (length < 1) continue;

      const steps = Math.max(1, Math.floor(length / STEP_M));
      for (let s = 0; s < steps; s++) {
        const f = (s + 0.5) / steps;
        const lat = aLat + (bLat - aLat) * f;
        const lng = aLng + (bLng - aLng) * f;
        if (lat < EXTENT.minLat || lat > EXTENT.maxLat) continue;
        if (lng < EXTENT.minLng || lng > EXTENT.maxLng) continue;
        candidates.push({ lat, lng, type: way.t, weight });
      }
    }
  }
  return candidates;
}

/** A coarse grid makes the spacing check cheap enough for ~100k candidates. */
function makeSpatialIndex(cellMetres) {
  const cells = new Map();
  const latSize = (cellMetres / R) * (180 / Math.PI);
  const lngSize = latSize / Math.cos(toRad(CENTRE.lat));

  const key = (lat, lng) =>
    `${Math.floor(lat / latSize)}:${Math.floor(lng / lngSize)}`;

  return {
    neighbours(lat, lng) {
      const row = Math.floor(lat / latSize);
      const col = Math.floor(lng / lngSize);
      const out = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const bucket = cells.get(`${row + dr}:${col + dc}`);
          if (bucket) out.push(...bucket);
        }
      }
      return out;
    },
    add(point) {
      const k = key(point.lat, point.lng);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(point);
    },
  };
}

function nearestPoi(lat, lng, pois) {
  let best = null;
  let bestDistance = Infinity;
  for (const poi of pois) {
    // Cheap rejection before the expensive formula.
    if (Math.abs(poi.lat - lat) > 0.0009 || Math.abs(poi.lon - lng) > 0.0012) continue;
    const d = haversine(lat, lng, poi.lat, poi.lon);
    if (d < bestDistance) {
      bestDistance = d;
      best = poi;
    }
  }
  return bestDistance <= POI_RADIUS_M ? { poi: best, distance: bestDistance } : null;
}

function main() {
  const refetch = process.argv.includes('--fetch');

  return (async () => {
    const [ways, pois] = await Promise.all([loadStreets(refetch), loadPois(refetch)]);
    console.log(`Streets: ${ways.length} ways, amenities: ${pois.length}`);

    const candidates = sampleAlongWays(ways);
    console.log(`Candidate points along street centrelines: ${candidates.length}`);

    // Score: street kind, then density falling off from the centre, then a
    // bonus for standing near somewhere people actually gather.
    const random = mulberry32(20261103);
    for (const c of candidates) {
      const fromCentre = haversine(c.lat, c.lng, CENTRE.lat, CENTRE.lng);
      const centreWeight = Math.exp(-fromCentre / CENTRE_FALLOFF_M);
      const near = nearestPoi(c.lat, c.lng, pois);
      c.poi = near?.poi ?? null;
      c.score = c.weight * centreWeight * (near ? 2.2 : 1) * (0.55 + random());
    }

    candidates.sort((a, b) => b.score - a.score);

    const index = makeSpatialIndex(MIN_SPACING_M);
    const chosen = [];

    for (const c of candidates) {
      if (chosen.length >= TARGET) break;
      const tooClose = index
        .neighbours(c.lat, c.lng)
        .some((p) => haversine(c.lat, c.lng, p.lat, p.lng) < MIN_SPACING_M);
      if (tooClose) continue;
      index.add(c);
      chosen.push(c);
    }

    console.log(`Selected ${chosen.length} locations (target ${TARGET})`);

    const locations = chosen.map((c) => ({
      lat: Number(c.lat.toFixed(6)),
      lng: Number(c.lng.toFixed(6)),
      description: c.poi
        ? (POI_DESCRIPTION[c.poi.k] ?? STREET_DESCRIPTION[c.type])
        : STREET_DESCRIPTION[c.type],
      context: c.poi ? c.poi.k : c.type,
    }));

    // Report the mix, so a reviewer can see it is not uniform scatter.
    const byContext = {};
    for (const l of locations) byContext[l.context] = (byContext[l.context] ?? 0) + 1;
    console.log('Context mix:', JSON.stringify(byContext, null, 0));

    const spacings = [];
    for (let i = 0; i < locations.length; i++) {
      let nearest = Infinity;
      for (let j = 0; j < locations.length; j++) {
        if (i === j) continue;
        const d = haversine(locations[i].lat, locations[i].lng, locations[j].lat, locations[j].lng);
        if (d < nearest) nearest = d;
      }
      spacings.push(nearest);
    }
    spacings.sort((a, b) => a - b);
    console.log(
      `Nearest-neighbour spacing: min ${Math.round(spacings[0])} m, ` +
        `median ${Math.round(spacings[Math.floor(spacings.length / 2)])} m, ` +
        `max ${Math.round(spacings[spacings.length - 1])} m`,
    );

    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          note:
            'Demonstration locations for Qarshi. Points are sampled along real ' +
            'OpenStreetMap street centrelines and described from genuinely nearby ' +
            'amenities, but no claim is made that a public bin exists at any of ' +
            'them. Generated by scripts/generate-locations.mjs; seeded rows carry ' +
            'is_demo = true and never reach production.',
          source: 'OpenStreetMap contributors, ODbL',
          generated: new Date().toISOString().slice(0, 10),
          extent: EXTENT,
          count: locations.length,
          locations,
        },
        null,
        0,
      ),
    );
    console.log(`Wrote ${OUTPUT}`);
  })();
}

main().catch((error) => {
  console.error('\nFailed:', error.message);
  process.exit(1);
});
