'use client';

import L from 'leaflet';
import Supercluster from 'supercluster';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

import type { PublicMapConfig } from '@/lib/config';
import { verificationStatusLabel } from '@/lib/i18n/uz';
import type { MapExtent, PublicBin } from '@/lib/types';
import {
  binMarkerHtml,
  binMarkerLabel,
  clusterHtml,
  clusterSize,
  CROSSHAIR_HTML,
  MARKER_SIZE,
  MARKER_SIZE_SELECTED,
  userLocationHtml,
} from '@/components/map/markers';

/**
 * The Leaflet canvas.
 *
 * Loaded only in the browser (see the dynamic imports that wrap it) because
 * Leaflet touches `window` at module scope.
 *
 * Two behaviours matter as much as the rendering:
 *
 *  - **The map belongs to one city.** It opens on Qarshi, will not pan beyond
 *    the city's map extent, and cannot zoom out past the point where that
 *    extent fills the viewport. There is no zoom level at which the city
 *    becomes a dot in a country.
 *
 *  - **Zoom is gradual.** Leaflet's defaults jump a whole level per wheel
 *    notch, which on a trackpad crosses several levels in one flick.
 *    Quarter-level steps and a much longer scroll distance per level make it
 *    land where you meant.
 *
 * Markers are clustered with Supercluster: a couple of hundred bins would
 * otherwise be a couple of hundred DOM nodes, each with its own SVG.
 */

export interface MapCanvasProps {
  /** Tile provider, zoom feel and limits, resolved on the server. */
  mapConfig: PublicMapConfig;
  center: [number, number];
  zoom: number;
  /** The rectangle the map may show. Null leaves the map unconstrained. */
  extent: MapExtent | null;
  bins: PublicBin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  userPosition: { latitude: number; longitude: number; approximate: boolean } | null;
  /** Location-picking mode: a fixed crosshair, and the centre is reported back. */
  pickMode?: boolean;
  onCenterChange?: (center: { latitude: number; longitude: number }) => void;
  /** Imperatively recentre the map (search result, locate button). */
  flyTo?: { latitude: number; longitude: number; zoom?: number; key: number } | null;
  className?: string;
  ariaLabel?: string;
}

function toBounds(extent: MapExtent): L.LatLngBounds {
  return L.latLngBounds(
    [extent.minLatitude, extent.minLongitude],
    [extent.maxLatitude, extent.maxLongitude],
  );
}

export default function MapCanvas({
  mapConfig,
  center,
  zoom,
  extent,
  bins,
  selectedId,
  onSelect,
  userPosition,
  pickMode = false,
  onCenterChange,
  flyTo,
  className,
  ariaLabel,
}: MapCanvasProps) {
  const { behaviour } = mapConfig;

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={zoom}
        maxZoom={Math.min(behaviour.maxZoom, mapConfig.tile.maxZoom)}
        scrollWheelZoom
        zoomControl={false}
        attributionControl
        // Gradual zoom: quarter-level steps, and four times Leaflet's default
        // scroll distance per level.
        zoomSnap={behaviour.zoomSnap}
        zoomDelta={behaviour.zoomDelta}
        wheelPxPerZoomLevel={behaviour.wheelPxPerZoomLevel}
        wheelDebounceTime={behaviour.wheelDebounceTime}
        // Do not rubber-band past the limits; it reads as a glitch.
        bounceAtZoomLimits={false}
        maxBoundsViscosity={behaviour.maxBoundsViscosity}
        className="size-full"
        aria-label={ariaLabel ?? 'Qarshi shahridagi qutilar xaritasi'}
      >
        <TileLayer
          url={mapConfig.tile.urlTemplate}
          attribution={mapConfig.tile.attributionHtml}
          maxZoom={mapConfig.tile.maxZoom}
          detectRetina
        />
        <ConstrainToCity extent={extent} floor={behaviour.minZoomFloor} />
        <ZoomControls />
        {!pickMode ? (
          <ClusteredBins bins={bins} selectedId={selectedId} onSelect={onSelect} />
        ) : null}
        {userPosition ? <UserMarker position={userPosition} /> : null}
        {pickMode && onCenterChange ? <CenterReporter onCenterChange={onCenterChange} /> : null}
        <FlyTo target={flyTo ?? null} />
      </MapContainer>
      {pickMode ? (
        <div className="binmap-crosshair" dangerouslySetInnerHTML={{ __html: CROSSHAIR_HTML }} />
      ) : null}
    </div>
  );
}

/* ------------------------------ the city lock ----------------------------- */

/**
 * Keeps the map on one city.
 *
 * The minimum zoom is computed rather than hard-coded, because "far enough
 * out to see the whole city" is a different number on a phone and on a wide
 * monitor. Recomputed on resize, so rotating a phone cannot escape it.
 */
function ConstrainToCity({ extent, floor }: { extent: MapExtent | null; floor: number }) {
  const map = useMap();

  useEffect(() => {
    if (!extent) return;

    const bounds = toBounds(extent);

    const apply = () => {
      // The largest zoom at which the whole extent still fits the viewport.
      const fit = map.getBoundsZoom(bounds);
      const min = Math.max(floor, Math.floor(fit * 4) / 4);

      map.setMinZoom(min);
      map.setMaxBounds(bounds.pad(0.04));
      if (map.getZoom() < min) map.setZoom(min);
    };

    apply();
    map.on('resize', apply);
    return () => {
      map.off('resize', apply);
    };
  }, [map, extent, floor]);

  return null;
}

/* ------------------------------ zoom controls ----------------------------- */

function ZoomControls() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.zoom({
      position: 'bottomright',
      zoomInTitle: 'Yaqinlashtirish',
      zoomOutTitle: 'Uzoqlashtirish',
    });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}

/* -------------------------------- clustering ------------------------------ */

interface BinProperties {
  binId: string;
  bin: PublicBin;
}

function ClusteredBins({
  bins,
  selectedId,
  onSelect,
}: {
  bins: PublicBin[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const map = useMap();
  const [view, setView] = useState(() => ({
    zoom: Math.round(map.getZoom()),
    bbox: boundsToBbox(map.getBounds()),
  }));

  const sync = useCallback(() => {
    setView({ zoom: Math.round(map.getZoom()), bbox: boundsToBbox(map.getBounds()) });
  }, [map]);

  useMapEvents({ moveend: sync, zoomend: sync, resize: sync });

  const index = useMemo(() => {
    const cluster = new Supercluster<BinProperties>({
      radius: 64,
      // Stop clustering near the top so individual bins stay selectable.
      maxZoom: 17,
      // Two is deliberate. A pair left unclustered draws two 24px pins over
      // each other wherever the bins are closer than about 60m — which, at
      // this density, is often — and the one underneath cannot be clicked at
      // all. Clustering the pair instead keeps every bin reachable: tap the
      // bubble, the map opens it out.
      minPoints: 2,
      map: (props) => ({ openReports: props.bin.openReportCount > 0 ? 1 : 0 }),
      reduce: (accumulated, props) => {
        accumulated.openReports = Math.max(
          accumulated.openReports,
          (props as { openReports: number }).openReports,
        );
      },
    });
    cluster.load(
      bins.map((bin) => ({
        type: 'Feature' as const,
        properties: { binId: bin.id, bin },
        geometry: { type: 'Point' as const, coordinates: [bin.longitude, bin.latitude] },
      })),
    );
    return cluster;
  }, [bins]);

  const clusters = useMemo(() => {
    try {
      return index.getClusters(view.bbox, view.zoom);
    } catch {
      return [];
    }
  }, [index, view]);

  return (
    <>
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const props = feature.properties as Record<string, unknown>;

        if (props.cluster) {
          const count = Number(props.point_count ?? 0);
          const size = clusterSize(count);
          const clusterId = Number(props.cluster_id);
          const icon = L.divIcon({
            html: clusterHtml(count, Number(props.openReports ?? 0) > 0),
            className: 'binmap-marker',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
          return (
            <Marker
              key={`c-${clusterId}`}
              position={[lat, lng]}
              icon={icon}
              keyboard
              alt={`${count} quti — kattalashtirish uchun bosing`}
              title={`${count} quti`}
              eventHandlers={{
                click: () => {
                  const next = Math.min(index.getClusterExpansionZoom(clusterId), map.getMaxZoom());
                  map.flyTo([lat, lng], next, { duration: 0.4 });
                },
              }}
            />
          );
        }

        const bin = (props as unknown as BinProperties).bin;
        const selected = bin.id === selectedId;
        const size = selected ? MARKER_SIZE_SELECTED : MARKER_SIZE;
        const label = binMarkerLabel(bin, verificationStatusLabel[bin.verificationStatus]);
        const icon = L.divIcon({
          html: binMarkerHtml({
            verificationStatus: bin.verificationStatus,
            hasOpenReports: bin.openReportCount > 0,
            selected,
            label,
          }),
          className: 'binmap-marker',
          iconSize: [size.width, size.height],
          // The pointer tip is the location, so anchor at the bottom centre.
          iconAnchor: [size.width / 2, size.height],
        });

        return (
          <Marker
            key={bin.id}
            position={[bin.latitude, bin.longitude]}
            icon={icon}
            keyboard
            zIndexOffset={selected ? 1000 : 0}
            alt={label}
            title={label}
            eventHandlers={{ click: () => onSelect(bin.id) }}
          />
        );
      })}
    </>
  );
}

function boundsToBbox(bounds: L.LatLngBounds): [number, number, number, number] {
  const west = Math.max(-180, bounds.getWest());
  const east = Math.min(180, bounds.getEast());
  const south = Math.max(-90, bounds.getSouth());
  const north = Math.min(90, bounds.getNorth());
  return [west, south, east, north];
}

/* ------------------------------ user position ----------------------------- */

function UserMarker({
  position,
}: {
  position: { latitude: number; longitude: number; approximate: boolean };
}) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html: userLocationHtml(!position.approximate),
        className: 'binmap-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    [position.approximate],
  );

  return (
    <Marker
      position={[position.latitude, position.longitude]}
      icon={icon}
      interactive={false}
      alt={position.approximate ? 'Taxminiy joylashuvingiz' : 'Sizning joylashuvingiz'}
    />
  );
}

/* ------------------------- centre reporting (picker) ---------------------- */

function CenterReporter({
  onCenterChange,
}: {
  onCenterChange: (center: { latitude: number; longitude: number }) => void;
}) {
  const map = useMap();
  const report = useCallback(() => {
    const c = map.getCenter();
    onCenterChange({ latitude: c.lat, longitude: c.lng });
  }, [map, onCenterChange]);

  useMapEvents({ moveend: report, zoomend: report });

  // Report the starting position too, so the form has coordinates immediately.
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    report();
  }, [report]);

  return null;
}

/* ---------------------------------- flyTo --------------------------------- */

function FlyTo({
  target,
}: {
  target: { latitude: number; longitude: number; zoom?: number; key: number } | null;
}) {
  const map = useMap();
  const lastKey = useRef<number | null>(null);

  useEffect(() => {
    if (!target || target.key === lastKey.current) return;
    lastKey.current = target.key;
    const zoom = Math.min(target.zoom ?? Math.max(map.getZoom(), 16), map.getMaxZoom());
    map.flyTo([target.latitude, target.longitude], zoom, { duration: 0.6 });
  }, [map, target]);

  return null;
}
