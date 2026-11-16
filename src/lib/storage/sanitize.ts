/**
 * Image validation and metadata stripping.
 *
 * Two jobs, both done before a byte is written to storage:
 *
 *  1. Decide what the file actually is from its own magic bytes, never from the
 *     Content-Type the browser claimed.
 *  2. Remove embedded metadata — above all EXIF, which routinely carries the
 *     GPS coordinates of wherever the photo was taken, and often a device
 *     serial number. A bin photo is published; the photographer's exact
 *     position and phone should not be.
 *
 * Done by rewriting the container rather than re-encoding the image: no native
 * dependency, no quality loss, and the pixel data is passed through untouched.
 *
 * Unit-tested in tests/sanitize.test.ts.
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface SanitizedImage {
  bytes: Uint8Array;
  format: ImageFormat;
  contentType: string;
  extension: string;
  /** Metadata segments that were dropped, for logging. */
  removed: string[];
}

export class ImageRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageRejected';
  }
}

const CONTENT_TYPE: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const EXTENSION: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/** Identifies the format from the file's own leading bytes. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  return null;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = offset; i < offset + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] as number);
  }
  return out;
}

/* ---------------------------------- JPEG ---------------------------------- */

/**
 * Walks the JPEG marker chain and copies everything except the metadata
 * segments. APP0 (JFIF) is kept because it carries pixel density; APP1 holds
 * EXIF and XMP, APP2 holds ICC/FlashPix, APP13 holds Photoshop IRBs (which can
 * contain IPTC location data), and COM is a free-text comment.
 */
function stripJpeg(bytes: Uint8Array): { bytes: Uint8Array; removed: string[] } {
  const out: Uint8Array[] = [];
  const removed: string[] = [];
  let i = 0;

  // SOI
  out.push(bytes.subarray(0, 2));
  i = 2;

  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      // Not a marker boundary — the structure is not what we expect. Stop
      // rewriting and copy the remainder verbatim rather than corrupt it.
      out.push(bytes.subarray(i));
      break;
    }

    let marker = bytes[i + 1] as number;
    // Fill bytes: 0xFF may repeat before the marker code.
    let markerStart = i;
    while (marker === 0xff && markerStart + 2 < bytes.length) {
      markerStart += 1;
      marker = bytes[markerStart + 1] as number;
    }

    // Start of scan — entropy-coded data follows to the end of the file.
    if (marker === 0xda) {
      out.push(bytes.subarray(markerStart));
      break;
    }

    // Standalone markers with no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      out.push(bytes.subarray(markerStart, markerStart + 2));
      i = markerStart + 2;
      continue;
    }

    const lengthOffset = markerStart + 2;
    if (lengthOffset + 1 >= bytes.length) {
      out.push(bytes.subarray(markerStart));
      break;
    }
    const segmentLength = ((bytes[lengthOffset] as number) << 8) | (bytes[lengthOffset + 1] as number);
    const segmentEnd = lengthOffset + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) {
      out.push(bytes.subarray(markerStart));
      break;
    }

    const isExifLike =
      marker === 0xe1 || // APP1 — EXIF, XMP
      marker === 0xe2 || // APP2 — ICC profile, FlashPix
      marker === 0xed || // APP13 — Photoshop IRB / IPTC
      marker === 0xee || // APP14 — Adobe
      marker === 0xef || // APP15
      marker === 0xfe; // COM

    if (isExifLike) {
      removed.push(`jpeg:0x${marker.toString(16).toUpperCase()}`);
    } else {
      out.push(bytes.subarray(markerStart, segmentEnd));
    }

    i = segmentEnd;
  }

  return { bytes: concat(out), removed };
}

/* ----------------------------------- PNG ---------------------------------- */

/** Ancillary chunks that may carry metadata, comments or timestamps. */
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME', 'dSIG']);

function stripPng(bytes: Uint8Array): { bytes: Uint8Array; removed: string[] } {
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  const removed: string[] = [];
  let i = 8;

  while (i + 8 <= bytes.length) {
    const length = readUint32(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    const chunkEnd = i + 8 + length + 4; // length + type + data + crc
    if (chunkEnd > bytes.length) {
      out.push(bytes.subarray(i));
      break;
    }
    if (PNG_DROP.has(type)) {
      removed.push(`png:${type}`);
    } else {
      out.push(bytes.subarray(i, chunkEnd));
    }
    i = chunkEnd;
    if (type === 'IEND') break;
  }

  return { bytes: concat(out), removed };
}

/* ---------------------------------- WebP ---------------------------------- */

const WEBP_DROP = new Set(['EXIF', 'XMP ']);

function stripWebp(bytes: Uint8Array): { bytes: Uint8Array; removed: string[] } {
  const chunks: Uint8Array[] = [];
  const removed: string[] = [];
  let i = 12; // RIFF + size + WEBP

  while (i + 8 <= bytes.length) {
    const type = ascii(bytes, i, 4);
    const size = readUint32LE(bytes, i + 4);
    const padded = size + (size % 2); // chunks are even-aligned
    const chunkEnd = i + 8 + padded;
    if (chunkEnd > bytes.length) {
      chunks.push(bytes.subarray(i));
      break;
    }
    if (WEBP_DROP.has(type)) {
      removed.push(`webp:${type.trim()}`);
    } else {
      chunks.push(bytes.subarray(i, chunkEnd));
    }
    i = chunkEnd;
  }

  if (removed.length === 0) return { bytes, removed };

  const body = concat(chunks);
  // RIFF size covers "WEBP" plus every chunk that follows it.
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  writeUint32LE(header, 4, body.length + 4);
  return { bytes: concat([header, body]), removed };
}

/* --------------------------------- helpers -------------------------------- */

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) << 24) |
    ((bytes[offset + 1] as number) << 16) |
    ((bytes[offset + 2] as number) << 8) |
    (bytes[offset + 3] as number)
  ) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] as number) |
      ((bytes[offset + 1] as number) << 8) |
      ((bytes[offset + 2] as number) << 16) |
      ((bytes[offset + 3] as number) << 24)) >>>
    0
  );
}

function writeUint32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/* ----------------------------------- API ---------------------------------- */

export interface SanitizeOptions {
  maxBytes: number;
  allowedFormats?: readonly ImageFormat[];
}

/**
 * Validates an uploaded image and returns it with metadata removed.
 * Throws `ImageRejected` with an Uzbek message the UI can show directly.
 */
export function sanitizeImage(input: Uint8Array, options: SanitizeOptions): SanitizedImage {
  if (input.length === 0) {
    throw new ImageRejected('Fayl bo‘sh.');
  }
  if (input.length > options.maxBytes) {
    const mb = (options.maxBytes / (1024 * 1024)).toFixed(0);
    throw new ImageRejected(`Surat hajmi ${mb} MB dan oshmasligi kerak.`);
  }

  const format = detectFormat(input);
  if (!format) {
    throw new ImageRejected('Faqat JPEG, PNG yoki WebP formatidagi suratlar qabul qilinadi.');
  }
  const allowed = options.allowedFormats ?? (['jpeg', 'png', 'webp'] as const);
  if (!allowed.includes(format)) {
    throw new ImageRejected('Bu surat formati qo‘llab-quvvatlanmaydi.');
  }

  const stripped =
    format === 'jpeg' ? stripJpeg(input) : format === 'png' ? stripPng(input) : stripWebp(input);

  return {
    bytes: stripped.bytes,
    format,
    contentType: CONTENT_TYPE[format],
    extension: EXTENSION[format],
    removed: stripped.removed,
  };
}
