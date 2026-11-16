'use client';

import L from 'leaflet';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';

import type { PublicMapConfig } from '@/lib/config';
import { binMarkerHtml, MARKER_SIZE } from '@/components/map/markers';
import { verificationStatusLabel } from '@/lib/i18n/uz';
import type { City, PublicBin } from '@/lib/types';

/**
 * The homepage's live map.
 *
 * Not a screenshot and not a decorative illustration — it is the real map with
 * the real records, because the map is the product and the hero should open on
 * it. Interaction is deliberately limited: no scroll-wheel zoom (it would trap
 * the page scroll) and no marker panels. The whole surface is one link to the
 * full map.
 *
 * This is also where the site's single orchestrated motion lives: markers plot
 * in sequence once, which reads as a survey being recorded. `prefers-reduced-
 * motion` removes it.
 */
export default function HeroMap({
  city,
  bins,
  mapConfig,
}: {
  city: City;
  bins: PublicBin[];
  mapConfig: PublicMapConfig;
}) {
  // Keep the hero light: a readable scatter, not every record.
  const shown = useMemo(() => bins.filter((_, i) => i % 3 === 0).slice(0, 70), [bins]);

  return (
    <div className="relative size-full">
      <MapContainer
        center={[city.centerLatitude, city.centerLongitude]}
        zoom={city.defaultZoom}
        maxZoom={mapConfig.behaviour.maxZoom}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        dragging={false}
        touchZoom={false}
        keyboard={false}
        attributionControl
        className="size-full"
      >
        <TileLayer
          url={mapConfig.tile.urlTemplate}
          attribution={mapConfig.tile.attributionHtml}
          maxZoom={mapConfig.tile.maxZoom}
          detectRetina
        />
        <FitToBins bins={shown} />
        <PlottedMarkers bins={shown} />
      </MapContainer>

      {/* One link over the whole surface rather than marker-level interaction:
          the hero's job is to get somebody to the real map. */}
      <Link
        href="/xarita"
        className="absolute inset-0 z-[500] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-lime-500"
      >
        <span className="sr-only">
          {city.name} xaritasini ochish — {bins.length} ta quti
        </span>
      </Link>
    </div>
  );
}

/**
 * Frames the records rather than the city centre, so the hero opens on the
 * survey itself. The padding keeps markers clear of the panel's edges and of
 * the headline column that overlaps it on wide screens.
 */
function FitToBins({ bins }: { bins: PublicBin[] }) {
  const map = useMap();

  useEffect(() => {
    if (bins.length === 0) return;
    const bounds = L.latLngBounds(bins.map((bin) => [bin.latitude, bin.longitude]));
    map.fitBounds(bounds, { padding: [48, 48], animate: false, maxZoom: 15 });
  }, [map, bins]);

  return null;
}

function PlottedMarkers({ bins }: { bins: PublicBin[] }) {
  const map = useMap();
  const [ready, setReady] = useState(false);

  // Wait a frame so the stagger starts after the tiles begin painting.
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 120);
    map.invalidateSize();
    return () => window.clearTimeout(id);
  }, [map]);

  if (!ready) return null;

  return (
    <>
      {bins.map((bin, index) => {
        const icon = L.divIcon({
          html: `<span class="plot-in" style="display:block;animation-delay:${Math.min(index * 14, 700)}ms">${binMarkerHtml(
            {
              verificationStatus: bin.verificationStatus,
              hasOpenReports: bin.openReportCount > 0,
              selected: false,
              // The hero is one link to the map; individual markers are
              // decorative there and must not be announced one by one.
            },
          )}</span>`,
          className: 'binmap-marker',
          iconSize: [MARKER_SIZE.width, MARKER_SIZE.height],
          iconAnchor: [MARKER_SIZE.width / 2, MARKER_SIZE.height],
        });
        return (
          <Marker
            key={bin.id}
            position={[bin.latitude, bin.longitude]}
            icon={icon}
            interactive={false}
            alt={verificationStatusLabel[bin.verificationStatus]}
          />
        );
      })}
    </>
  );
}
