'use client';

import { MapContainer, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet';

import type { PublicMapConfig } from '@/lib/config';
import { observationLabel, type CellObservation, type ObservationKind } from '@/lib/analysis';
import type { City } from '@/lib/types';
import L from 'leaflet';
import { useEffect } from 'react';

/**
 * The coverage grid, drawn over the city.
 *
 * Each rectangle is one grid cell and is filled according to what the database
 * contains there — never according to a score. The tooltip shows the raw
 * counts the classification came from, so a reader can disagree with the rule
 * and still use the numbers.
 */

/** The analysis map stays on the city too. */
function KeepToCity({ city, floor }: { city: City; floor: number }) {
  const map = useMap();
  useEffect(() => {
    if (!city.extent) return;
    const bounds = L.latLngBounds(
      [city.extent.minLatitude, city.extent.minLongitude],
      [city.extent.maxLatitude, city.extent.maxLongitude],
    );
    const apply = () => {
      const min = Math.max(floor, Math.floor(map.getBoundsZoom(bounds) * 4) / 4);
      map.setMinZoom(min);
      map.setMaxBounds(bounds.pad(0.04));
      if (map.getZoom() < min) map.setZoom(min);
    };
    apply();
    map.on('resize', apply);
    return () => {
      map.off('resize', apply);
    };
  }, [map, city, floor]);
  return null;
}

const FILL: Record<ObservationKind, string> = {
  documented: '#15402a',
  sparse: '#5e7d68',
  reported_problems: '#9c3a24',
  disputed: '#a97716',
  undocumented_with_signals: '#4c7093',
};

const OPACITY: Record<ObservationKind, number> = {
  documented: 0.52,
  sparse: 0.32,
  reported_problems: 0.46,
  disputed: 0.4,
  undocumented_with_signals: 0.26,
};

export default function CoverageMap({
  city,
  observations,
  mapConfig,
}: {
  city: City;
  observations: CellObservation[];
  mapConfig: PublicMapConfig;
}) {
  return (
    <MapContainer
      center={[city.centerLatitude, city.centerLongitude]}
      zoom={city.defaultZoom - 1}
      maxZoom={mapConfig.behaviour.maxZoom}
      scrollWheelZoom={false}
      zoomSnap={mapConfig.behaviour.zoomSnap}
      zoomDelta={mapConfig.behaviour.zoomDelta}
      maxBoundsViscosity={mapConfig.behaviour.maxBoundsViscosity}
      className="size-full"
      aria-label={`${city.name} bo‘yicha ma’lumot qamrovi xaritasi`}
    >
      <TileLayer
        url={mapConfig.tile.urlTemplate}
        attribution={mapConfig.tile.attributionHtml}
        maxZoom={mapConfig.tile.maxZoom}
        detectRetina
      />
      <KeepToCity city={city} floor={mapConfig.behaviour.minZoomFloor} />
      {observations.map((cell) =>
        cell.bounds ? (
          <Rectangle
            key={cell.cell}
            bounds={[
              [cell.bounds.minLat, cell.bounds.minLng],
              [cell.bounds.maxLat, cell.bounds.maxLng],
            ]}
            pathOptions={{
              color: FILL[cell.kind],
              weight: 1,
              fillColor: FILL[cell.kind],
              fillOpacity: OPACITY[cell.kind],
              // A dashed edge marks a cell with no recorded bins, so "we have
              // no data here" never looks like a measurement.
              dashArray: cell.binCount === 0 ? '4 3' : undefined,
            }}
          >
            <Tooltip direction="top" opacity={1}>
              <span className="block text-xs">
                <strong className="block">{observationLabel[cell.kind]}</strong>
                <span className="mt-1 block">
                  Tasdiqlangan quti: {cell.binCount}
                  {cell.verifiedCount > 0 ? ` (${cell.verifiedCount} joyida tekshirilgan)` : ''}
                </span>
                <span className="block">Ochiq xabar: {cell.openReportCount}</span>
                {cell.missingReportCount > 0 ? (
                  <span className="block">«Mavjud emas» xabari: {cell.missingReportCount}</span>
                ) : null}
                {cell.pendingSubmissionCount > 0 ? (
                  <span className="block">
                    Ko‘rilmagan taklif: {cell.pendingSubmissionCount}
                  </span>
                ) : null}
              </span>
            </Tooltip>
          </Rectangle>
        ) : null,
      )}
    </MapContainer>
  );
}
