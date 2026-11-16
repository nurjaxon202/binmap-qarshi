import type { PublicBin, VerificationStatus } from '@/lib/types';

/**
 * Map symbols.
 *
 * Markers are the "plate with a pointer" from the brand mark, so a bin on the
 * map and the logo in the header are recognisably the same object.
 *
 * With a couple of hundred locations on screen the symbol has to stay legible
 * at a glance and small enough not to hide the street under it, so it is
 * drawn tight, with a single ring for contrast against both pale pavement and
 * dark parkland.
 *
 * Confidence is carried by fill *and* by shape — a dotted outline for a
 * location that needs re-checking — so the distinction survives greyscale and
 * colour blindness.
 */

export interface MarkerAppearance {
  fill: string;
  ring: string;
  glyph: string;
  /** Dotted edge marks a location whose existence is in doubt. */
  dashed?: boolean;
}

const APPEARANCE: Record<VerificationStatus, MarkerAppearance> = {
  verified: { fill: '#15402a', ring: '#fdfbf5', glyph: '#cbe673' },
  community: { fill: '#5e7d68', ring: '#fdfbf5', glyph: '#fdfbf5' },
  needs_recheck: { fill: '#a97716', ring: '#fdfbf5', glyph: '#faf0d9', dashed: true },
};

export const MARKER_SIZE = { width: 24, height: 31 } as const;
export const MARKER_SIZE_SELECTED = { width: 34, height: 44 } as const;

export interface MarkerOptions {
  verificationStatus: VerificationStatus;
  hasOpenReports: boolean;
  selected: boolean;
  label?: string;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** SVG for one bin marker, used as the inner HTML of a Leaflet divIcon. */
export function binMarkerHtml({
  verificationStatus,
  hasOpenReports,
  selected,
  label,
}: MarkerOptions): string {
  const look = APPEARANCE[verificationStatus];
  const { width, height } = selected ? MARKER_SIZE_SELECTED : MARKER_SIZE;

  // react-leaflet's `alt` prop only applies to image icons, so a divIcon needs
  // its own accessible name or the marker is announced as nothing.
  const title = label ? escapeAttribute(label) : '';

  return `
<svg width="${width}" height="${height}" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg"
     ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}
     style="filter:drop-shadow(0 1px 2px rgba(6,19,13,.4))">
  ${title ? `<title>${title}</title>` : ''}
  <path d="M5 1.5h20a3.5 3.5 0 0 1 3.5 3.5v15.5a3.5 3.5 0 0 1-3.5 3.5h-6.6L15 36.2l-3.4-12.2H5a3.5 3.5 0 0 1-3.5-3.5V5A3.5 3.5 0 0 1 5 1.5Z"
        fill="${look.fill}"
        stroke="${look.ring}"
        stroke-width="${selected ? 2.8 : 2.2}"
        ${look.dashed ? 'stroke-dasharray="3 2"' : ''}/>
  <path d="M9.6 8.4h10.8" stroke="${look.glyph}" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M12.9 11h4.2l-.5 7.2a1.4 1.4 0 0 1-1.4 1.3h-.4a1.4 1.4 0 0 1-1.4-1.3L12.9 11Z" fill="${look.glyph}"/>
  ${
    hasOpenReports
      ? `<circle cx="24.5" cy="5.5" r="5" fill="#973823" stroke="${look.ring}" stroke-width="2"/>
         <path d="M24.5 3.2v2.8M24.5 7.7v.8" stroke="#fdfbf5" stroke-width="1.6" stroke-linecap="round"/>`
      : ''
  }
</svg>`.trim();
}

/** Accessible name for a marker. */
export function binMarkerLabel(bin: PublicBin, statusLabel: string): string {
  const parts = [bin.description?.trim() || 'Chiqindi qutisi', statusLabel];
  if (bin.openReportCount > 0) parts.push(`${bin.openReportCount} ochiq xabar`);
  return parts.join(', ');
}

/* -------------------------------- clusters -------------------------------- */

export function clusterSize(count: number): number {
  if (count < 10) return 32;
  if (count < 30) return 38;
  if (count < 80) return 44;
  return 50;
}

/**
 * Cluster bubble. The ring thickens with the count, so a dense part of the
 * city reads as dense before the number is even parsed.
 */
export function clusterHtml(count: number, hasOpenReports: boolean): string {
  const size = clusterSize(count);
  return `
<div style="
  width:${size}px;height:${size}px;border-radius:999px;
  display:grid;place-items:center;
  background:#15402a;color:#fdfbf5;
  font:600 ${count > 99 ? 12 : 13}px/1 var(--font-archivo, system-ui);
  font-variant-numeric:tabular-nums;
  border:2px solid #fdfbf5;
  box-shadow:0 1px 4px rgba(6,19,13,.38);
  position:relative;
">${count}${
    hasOpenReports
      ? `<span style="position:absolute;top:-2px;right:-2px;width:11px;height:11px;border-radius:999px;background:#973823;border:2px solid #fdfbf5"></span>`
      : ''
  }</div>`.trim();
}

/** The "you are here" dot. Visually unlike a bin marker on purpose. */
export function userLocationHtml(accuracyKnown: boolean): string {
  return `
<div style="position:relative;width:20px;height:20px">
  <div style="
    position:absolute;inset:0;border-radius:999px;
    background:#2f5f93;border:3px solid #fdfbf5;
    box-shadow:0 1px 5px rgba(6,19,13,.45);
  "></div>
  ${
    accuracyKnown
      ? ''
      : `<div style="position:absolute;inset:-6px;border-radius:999px;border:1px dashed #2f5f93;opacity:.6"></div>`
  }
</div>`.trim();
}

/** The crosshair shown while choosing a location for a new bin. */
export const CROSSHAIR_HTML = `
<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg"
     style="filter:drop-shadow(0 1px 3px rgba(6,19,13,.35))">
  <circle cx="28" cy="28" r="15" stroke="#15402a" stroke-width="2" stroke-dasharray="4 3"/>
  <circle cx="28" cy="28" r="3.2" fill="#15402a"/>
  <path d="M28 4v9M28 43v9M4 28h9M43 28h9" stroke="#15402a" stroke-width="2" stroke-linecap="round"/>
</svg>`.trim();
