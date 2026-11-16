'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser geolocation, with every outcome represented explicitly.
 *
 * The permission prompt only ever appears when the person presses the locate
 * control — nothing requests a position on page load, and nothing retries after
 * a refusal. A successful fix is delivered through `onLocated` rather than
 * being watched by an effect, so the caller reacts once, where the action
 * started.
 */

export interface LocatedPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  /** True when the fix is coarse enough that the UI should say so. */
  approximate: boolean;
}

export type GeolocationState =
  | { status: 'idle' }
  | { status: 'locating' }
  | ({ status: 'ready' } & LocatedPosition)
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'timeout'; message: string };

/** Above this, a fix is "approximate" — typically network- or IP-derived. */
const APPROXIMATE_ACCURACY_M = 150;

export interface UseGeolocation {
  state: GeolocationState;
  locate: () => void;
  reset: () => void;
  supported: boolean;
}

export function useGeolocation(
  options: { onLocated?: (position: LocatedPosition) => void } = {},
): UseGeolocation {
  const [state, setState] = useState<GeolocationState>({ status: 'idle' });
  const pending = useRef(false);

  // Kept in a ref so `locate` stays stable across renders. Assigned in an
  // effect rather than during render, which would be a side effect in a
  // function React may re-run.
  const onLocated = useRef(options.onLocated);
  useEffect(() => {
    onLocated.current = options.onLocated;
  }, [options.onLocated]);

  const supported =
    typeof navigator !== 'undefined' && typeof navigator.geolocation !== 'undefined';

  const locate = useCallback(() => {
    if (!supported) {
      setState({
        status: 'unavailable',
        message: 'Brauzeringiz joylashuvni aniqlashni qo‘llab-quvvatlamaydi.',
      });
      return;
    }
    if (pending.current) return;

    pending.current = true;
    setState({ status: 'locating' });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        pending.current = false;
        const accuracy = Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null;
        const located: LocatedPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: accuracy,
          approximate: accuracy !== null && accuracy > APPROXIMATE_ACCURACY_M,
        };
        setState({ status: 'ready', ...located });
        onLocated.current?.(located);
      },
      (error) => {
        pending.current = false;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setState({
              status: 'denied',
              message:
                'Joylashuvga ruxsat berilmadi. Qutilarni qidirish uchun xaritadan joyni o‘zingiz tanlashingiz mumkin.',
            });
            break;
          case error.POSITION_UNAVAILABLE:
            setState({
              status: 'unavailable',
              message:
                'Joylashuvni aniqlab bo‘lmadi. GPS o‘chirilgan bo‘lishi mumkin — joyni xaritadan tanlang.',
            });
            break;
          case error.TIMEOUT:
            setState({
              status: 'timeout',
              message: 'Joylashuvni aniqlash uzoq davom etdi. Qayta urinib ko‘ring.',
            });
            break;
          default:
            setState({
              status: 'unavailable',
              message: 'Joylashuvni aniqlab bo‘lmadi. Joyni xaritadan tanlang.',
            });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        // A fix from the last half-minute is good enough and far faster.
        maximumAge: 30_000,
      },
    );
  }, [supported]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, locate, reset, supported };
}
