'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronUp, Plus } from 'lucide-react';

import { cn } from '@/lib/cn';
import type { PublicMapConfig } from '@/lib/config';
import { formatDistance, haversineMeters, type LatLng } from '@/lib/geo';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/primitives';
import { BinDetailPanel, type BinDetail } from '@/components/map/BinDetailPanel';
import {
  applyFilters,
  ConfidenceLegend,
  defaultFilters,
  MapFilterControls,
  MapSearch,
  NearbyList,
  type GeocodeHit,
  type MapFilters,
  type NearbyEntry,
} from '@/components/map/MapSidebar';
import { useGeolocation } from '@/components/map/useGeolocation';
import type { BinSource, City, PublicBin, VerificationStatus } from '@/lib/types';

/**
 * Leaflet is browser-only — it reads `window` while the module evaluates — so
 * the canvas is loaded without SSR and shows a placeholder meanwhile.
 */
const MapCanvas = dynamic(() => import('@/components/map/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="plan-grid grid size-full place-items-center bg-paper-200">
      <Spinner label="Xarita yuklanmoqda" className="text-forest-700" />
    </div>
  ),
});

export interface MapExperienceProps {
  city: City;
  initialBins: PublicBin[];
  mapConfig: PublicMapConfig;
  signedIn: boolean;
  /** Deep link `?quti=<id>`: rendered by the server, so it paints immediately. */
  initialDetail: BinDetail | null;
  loadError: string | null;
}

/** Detail is held keyed by bin id, so a stale response can never be shown. */
interface DetailState {
  id: string;
  data: BinDetail | null;
  loading: boolean;
}

export function MapExperience({
  city,
  initialBins,
  mapConfig,
  signedIn,
  initialDetail,
  loadError,
}: MapExperienceProps) {
  const [bins] = useState<PublicBin[]>(initialBins);
  const [filters, setFilters] = useState<MapFilters>(defaultFilters);

  const [detail, setDetail] = useState<DetailState | null>(
    initialDetail ? { id: initialDetail.bin.id, data: initialDetail, loading: false } : null,
  );

  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [originLabel, setOriginLabel] = useState<string | null>(null);
  const [nearby, setNearby] = useState<NearbyEntry[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);

  const flyKey = useRef(1);
  // A deep-linked bin is centred on first paint rather than in an effect.
  const [flyTo, setFlyTo] = useState<
    { latitude: number; longitude: number; zoom?: number; key: number } | null
  >(
    initialDetail
      ? {
          latitude: initialDetail.bin.latitude,
          longitude: initialDetail.bin.longitude,
          zoom: 17,
          key: 0,
        }
      : null,
  );
  const [sheetOpen, setSheetOpen] = useState(Boolean(initialDetail));

  const visibleBins = useMemo(() => applyFilters(bins, filters), [bins, filters]);

  /** Legend counts come from the data on screen, so they never contradict it. */
  const verificationCounts = useMemo(() => {
    const counts: Record<VerificationStatus, number> = {
      verified: 0,
      community: 0,
      needs_recheck: 0,
    };
    for (const bin of visibleBins) counts[bin.verificationStatus] += 1;
    return counts;
  }, [visibleBins]);

  const sourceCounts = useMemo(() => {
    const counts: Record<BinSource, number> = { admin: 0, community: 0 };
    for (const bin of visibleBins) counts[bin.source] += 1;
    return counts;
  }, [visibleBins]);

  const requestFly = useCallback((point: LatLng, zoom?: number) => {
    flyKey.current += 1;
    setFlyTo({ ...point, zoom, key: flyKey.current });
  }, []);

  /* ----------------------------- bin selection ---------------------------- */

  const selectedId = detail?.id ?? null;

  /**
   * Selecting a marker fetches its detail here, in the event handler, rather
   * than through an effect watching the id. The request is tagged with the id
   * so a slow response for a deselected bin is discarded.
   */
  const selectBin = useCallback(
    (id: string | null) => {
      if (!id) {
        setDetail(null);
        setSheetOpen(false);
        return;
      }

      const known = bins.find((b) => b.id === id) ?? null;
      setDetail({ id, data: known ? { bin: known, reports: [] } : null, loading: true });
      setSheetOpen(true);
      if (known) requestFly(known);

      void (async () => {
        try {
          const response = await fetch(`/api/bins/${id}`, { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('not ok');
          const body = (await response.json()) as BinDetail;
          setDetail((current) =>
            current?.id === id ? { id, data: body, loading: false } : current,
          );
        } catch {
          // Keep whatever the map already knows; only drop the spinner.
          setDetail((current) => (current?.id === id ? { ...current, loading: false } : current));
        }
      })();
    },
    [bins, requestFly],
  );

  /* ------------------------------ nearby search --------------------------- */

  const loadNearby = useCallback(
    async (point: LatLng, label: string) => {
      setNearbyLoading(true);
      setNearbyError(null);
      setOrigin(point);
      setOriginLabel(label);

      try {
        const params = new URLSearchParams({
          lat: String(point.latitude),
          lng: String(point.longitude),
          radius: String(mapConfig.nearbyDefaultRadiusM),
          city: city.slug,
        });
        const response = await fetch(`/api/bins/nearby?${params}`, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('not ok');
        const body = (await response.json()) as { bins: NearbyEntry[] };
        setNearby(body.bins);
      } catch {
        setNearbyError(
          'Yaqin atrofdagi qutilarni olib bo‘lmadi. Internet aloqasini tekshirib, qayta urinib ko‘ring.',
        );
        setNearby(null);
      } finally {
        setNearbyLoading(false);
      }
    },
    [city.slug, mapConfig.nearbyDefaultRadiusM],
  );

  /**
   * Geolocation is only ever started by the button, and its result is handled
   * in the callback — no effect watching a position.
   */
  const geo = useGeolocation({
    onLocated: (position) => {
      const point = { latitude: position.latitude, longitude: position.longitude };
      const label = position.approximate
        ? `Taxminiy joylashuv (±${formatDistance(position.accuracyMeters ?? 0)})`
        : 'Joylashuvingiz';
      requestFly(point, 16);
      void loadNearby(point, label);
    },
  });

  const geoMessage =
    geo.state.status === 'denied' ||
    geo.state.status === 'unavailable' ||
    geo.state.status === 'timeout'
      ? geo.state.message
      : null;

  const locateState: 'idle' | 'locating' | 'ready' | 'error' =
    geo.state.status === 'locating'
      ? 'locating'
      : geo.state.status === 'ready'
        ? 'ready'
        : geoMessage
          ? 'error'
          : 'idle';

  const handleSearchPick = useCallback(
    (hit: GeocodeHit) => {
      const point = { latitude: hit.latitude, longitude: hit.longitude };
      requestFly(point, 16);
      void loadNearby(point, hit.label.split(',')[0] ?? 'Tanlangan joy');
    },
    [loadNearby, requestFly],
  );

  const userPosition =
    geo.state.status === 'ready'
      ? {
          latitude: geo.state.latitude,
          longitude: geo.state.longitude,
          approximate: geo.state.approximate,
        }
      : null;

  const distanceOrigin = origin ?? userPosition;

  const browsePanel = (
    <>
      <div className="shrink-0 space-y-3 border-b border-line px-5 py-4">
        <MapSearch enabled={mapConfig.geocoderEnabled} onPick={handleSearchPick} />
        <MapFilterControls filters={filters} onChange={setFilters} />
        <p className="text-xs text-ink-400">
          {city.name} bo‘yicha{' '}
          <span className="numeric text-ink-600">{visibleBins.length}</span> ta quti
          ko‘rsatilmoqda
          {visibleBins.length !== bins.length ? (
            <> (jami {bins.length})</>
          ) : null}
        </p>
      </div>
      <div className="shrink-0 border-b border-line px-5 py-4">
        <ConfidenceLegend counts={verificationCounts} sourceCounts={sourceCounts} />
      </div>
      <NearbyList
        entries={nearby}
        loading={nearbyLoading}
        error={nearbyError ?? geoMessage}
        radiusMeters={mapConfig.nearbyDefaultRadiusM}
        originLabel={originLabel}
        selectedId={selectedId}
        onSelect={selectBin}
        onLocate={geo.locate}
        locateState={locateState}
        className="min-h-0 flex-1"
      />
    </>
  );

  const detailPanel = detail ? (
    <BinDetailPanel
      detail={detail.data}
      loading={detail.loading}
      origin={distanceOrigin}
      mapConfig={mapConfig}
      signedIn={signedIn}
      onClose={() => selectBin(null)}
      className="h-full"
    />
  ) : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[23rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-line bg-surface lg:flex">
        {detailPanel ?? browsePanel}
      </aside>

      <div className="relative min-h-0 flex-1">
        {loadError ? (
          <div className="grid size-full place-items-center bg-paper-200 p-6">
            <EmptyState
              title="Xarita ma’lumotlarini yuklab bo‘lmadi"
              className="max-w-md bg-surface"
            >
              <p>{loadError}</p>
            </EmptyState>
          </div>
        ) : (
          <MapCanvas
            mapConfig={mapConfig}
            center={[city.centerLatitude, city.centerLongitude]}
            zoom={city.defaultZoom}
            extent={city.extent}
            bins={visibleBins}
            selectedId={selectedId}
            onSelect={selectBin}
            userPosition={userPosition}
            flyTo={flyTo}
            className="size-full"
            ariaLabel={`${city.name} shahridagi jamoat chiqindi qutilari xaritasi`}
          />
        )}

        {/* The honest empty state, drawn over the basemap so the city stays
            visible behind it. */}
        {!loadError && bins.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[450] flex justify-center p-4">
            <div className="pointer-events-auto max-w-md border border-line bg-surface p-5 shadow-panel">
              <h2 className="text-base text-ink-900">Hozircha tasdiqlangan qutilar mavjud emas</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                Yangi joylashuv qo‘shish orqali xaritani to‘ldirishga yordam bering. Har bir taklif
                moderator tomonidan ko‘rib chiqiladi.
              </p>
              <ButtonLink href="/quti-qoshish" size="sm" className="mt-4">
                <Plus aria-hidden className="size-4" />
                Quti qo‘shish
              </ButtonLink>
            </div>
          </div>
        ) : null}

        {!loadError && bins.length > 0 && visibleBins.length === 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[450] flex justify-center p-4">
            <p className="pointer-events-auto border border-line bg-surface px-4 py-2.5 text-sm text-ink-600 shadow-panel">
              Tanlangan filtrlarga mos quti topilmadi.
            </p>
          </div>
        ) : null}
      </div>

      {/* Mobile: a bottom sheet. Collapsed it is one tappable bar, so the map
          keeps the whole screen until something is actually selected. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] lg:hidden">
        <div
          className={cn(
            'pointer-events-auto mx-auto flex max-h-[78dvh] w-full flex-col rounded-t-2xl bg-surface shadow-raised transition-transform duration-200 ease-[var(--ease-out-soft)]',
            sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)]',
          )}
        >
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            aria-expanded={sheetOpen}
            className="flex h-17 shrink-0 items-center justify-between gap-3 rounded-t-2xl px-5 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink-900">
                {detail?.data
                  ? detail.data.bin.description?.trim() || 'Chiqindi qutisi'
                  : 'Yaqin atrofdagi qutilar'}
              </span>
              <span className="block text-xs text-ink-400">
                {detail?.data ? (
                  distanceOrigin ? (
                    <span className="numeric">
                      {formatDistance(haversineMeters(distanceOrigin, detail.data.bin))}
                    </span>
                  ) : (
                    'Batafsil ko‘rish'
                  )
                ) : (
                  <>
                    <span className="numeric">{visibleBins.length}</span> ta quti, {city.name}
                  </>
                )}
              </span>
            </span>
            <ChevronUp
              aria-hidden
              className={cn(
                'size-5 shrink-0 text-ink-400 transition-transform',
                sheetOpen && 'rotate-180',
              )}
            />
            <span className="sr-only">{sheetOpen ? 'Panelni yopish' : 'Panelni ochish'}</span>
          </button>

          <div className="flex min-h-0 flex-1 flex-col border-t border-line">
            {detail ? (
              <BinDetailPanel
                detail={detail.data}
                loading={detail.loading}
                origin={distanceOrigin}
                mapConfig={mapConfig}
                signedIn={signedIn}
                onClose={() => selectBin(null)}
                className="min-h-0 flex-1"
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">{browsePanel}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
