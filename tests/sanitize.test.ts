import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { detectFormat, sanitizeImage, ImageRejected } from '@/lib/storage/sanitize';

/**
 * These tests are the guarantee that a photograph's GPS coordinates never
 * reach storage. They build real container bytes rather than mocking, because
 * the whole point of the module is correct container parsing.
 */

const OPTIONS = { maxBytes: 6 * 1024 * 1024 };

/* ---------------------------------- JPEG ---------------------------------- */

function jpegSegment(marker: number, payload: Buffer): Buffer {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2, 0);
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload]);
}

/** A structurally valid JPEG carrying an EXIF block with a GPS IFD marker. */
function buildJpeg(options: { withExif?: boolean; withComment?: boolean } = {}): Uint8Array {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])]; // SOI

  // APP0 / JFIF — legitimate, must survive.
  parts.push(jpegSegment(0xe0, Buffer.concat([Buffer.from('JFIF\0', 'ascii'), Buffer.alloc(9)])));

  if (options.withExif) {
    // APP1 / EXIF, with a recognisable GPS payload.
    parts.push(
      jpegSegment(
        0xe1,
        Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), Buffer.from('GPSLatitude38.8606N', 'ascii')]),
      ),
    );
  }
  if (options.withComment) {
    parts.push(jpegSegment(0xfe, Buffer.from('taken with a phone', 'ascii')));
  }

  // A minimal frame header and quantisation table, then scan data.
  parts.push(jpegSegment(0xdb, Buffer.alloc(65)));
  parts.push(jpegSegment(0xc0, Buffer.from([0x08, 0, 16, 0, 16, 1, 0x11, 0x00])));
  parts.push(jpegSegment(0xda, Buffer.from([0x01, 0x00, 0x00, 0x00, 0x3f, 0x00])));
  parts.push(Buffer.from([0x12, 0x34, 0x56, 0xff, 0xd9])); // entropy data + EOI

  return new Uint8Array(Buffer.concat(parts));
}

describe('JPEG handling', () => {
  it('recognises a JPEG from its magic bytes', () => {
    expect(detectFormat(buildJpeg())).toBe('jpeg');
  });

  it('removes the EXIF block, GPS coordinates and all', () => {
    const withExif = buildJpeg({ withExif: true });
    expect(Buffer.from(withExif).includes('GPSLatitude')).toBe(true);

    const result = sanitizeImage(withExif, OPTIONS);

    expect(Buffer.from(result.bytes).includes('GPSLatitude')).toBe(false);
    expect(Buffer.from(result.bytes).includes('Exif')).toBe(false);
    expect(result.removed).toContain('jpeg:0xE1');
  });

  it('removes free-text comments', () => {
    const result = sanitizeImage(buildJpeg({ withComment: true }), OPTIONS);
    expect(Buffer.from(result.bytes).includes('taken with a phone')).toBe(false);
    expect(result.removed).toContain('jpeg:0xFE');
  });

  it('keeps the JFIF density segment and the image data', () => {
    const result = sanitizeImage(buildJpeg({ withExif: true }), OPTIONS);
    const out = Buffer.from(result.bytes);
    expect(out.includes('JFIF')).toBe(true);
    // SOI preserved, EOI preserved.
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
  });

  it('leaves a clean JPEG byte-identical', () => {
    const clean = buildJpeg();
    const result = sanitizeImage(clean, OPTIONS);
    expect(result.removed).toEqual([]);
    expect(Buffer.from(result.bytes).equals(Buffer.from(clean))).toBe(true);
  });

  it('reports the right content type and extension', () => {
    const result = sanitizeImage(buildJpeg(), OPTIONS);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.extension).toBe('jpg');
  });
});

/* ----------------------------------- PNG ---------------------------------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer: Buffer): number {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) {
    c ^= buffer[i] as number;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ -1) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function buildPng(options: { withExif?: boolean; withText?: boolean } = {}): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const parts: Buffer[] = [PNG_SIGNATURE, pngChunk('IHDR', ihdr)];
  if (options.withExif) {
    parts.push(pngChunk('eXIf', Buffer.from('GPSLatitude38.8606N', 'ascii')));
  }
  if (options.withText) {
    parts.push(pngChunk('tEXt', Buffer.from('Comment\0taken with a phone', 'ascii')));
  }
  parts.push(pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255]))));
  parts.push(pngChunk('IEND', Buffer.alloc(0)));

  return new Uint8Array(Buffer.concat(parts));
}

describe('PNG handling', () => {
  it('recognises a PNG from its signature', () => {
    expect(detectFormat(buildPng())).toBe('png');
  });

  it('removes the eXIf chunk', () => {
    const result = sanitizeImage(buildPng({ withExif: true }), OPTIONS);
    expect(Buffer.from(result.bytes).includes('GPSLatitude')).toBe(false);
    expect(result.removed).toContain('png:eXIf');
  });

  it('removes tEXt metadata', () => {
    const result = sanitizeImage(buildPng({ withText: true }), OPTIONS);
    expect(Buffer.from(result.bytes).includes('taken with a phone')).toBe(false);
    expect(result.removed).toContain('png:tEXt');
  });

  it('keeps IHDR, IDAT and IEND', () => {
    const result = sanitizeImage(buildPng({ withExif: true, withText: true }), OPTIONS);
    const out = Buffer.from(result.bytes);
    expect(out.includes('IHDR')).toBe(true);
    expect(out.includes('IDAT')).toBe(true);
    expect(out.includes('IEND')).toBe(true);
    expect(out.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });
});

/* ---------------------------------- WebP ---------------------------------- */

function buildWebp(withExif: boolean): Uint8Array {
  const vp8 = Buffer.concat([Buffer.from('VP8 ', 'ascii'), uint32le(4), Buffer.from([1, 2, 3, 4])]);
  const exif = withExif
    ? Buffer.concat([
        Buffer.from('EXIF', 'ascii'),
        uint32le(20),
        Buffer.from('GPSLatitude38.8606N!', 'ascii'),
      ])
    : Buffer.alloc(0);

  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), vp8, exif]);
  return new Uint8Array(
    Buffer.concat([Buffer.from('RIFF', 'ascii'), uint32le(body.length), body]),
  );
}

function uint32le(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value, 0);
  return b;
}

describe('WebP handling', () => {
  it('recognises a WebP from its RIFF header', () => {
    expect(detectFormat(buildWebp(false))).toBe('webp');
  });

  it('removes the EXIF chunk and corrects the RIFF size', () => {
    const result = sanitizeImage(buildWebp(true), OPTIONS);
    const out = Buffer.from(result.bytes);

    expect(out.includes('GPSLatitude')).toBe(false);
    expect(result.removed).toContain('webp:EXIF');
    // The declared RIFF size must match what is actually there, or decoders
    // reject the file.
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });
});

/* -------------------------------- rejection -------------------------------- */

describe('rejection', () => {
  it('rejects a file that is not an image, whatever it claims to be', () => {
    const notAnImage = new TextEncoder().encode('<?php echo "hello"; ?>');
    expect(() => sanitizeImage(notAnImage, OPTIONS)).toThrow(ImageRejected);
  });

  it('rejects an SVG, which can carry script', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectFormat(svg)).toBeNull();
    expect(() => sanitizeImage(svg, OPTIONS)).toThrow(ImageRejected);
  });

  it('rejects an empty file', () => {
    expect(() => sanitizeImage(new Uint8Array(0), OPTIONS)).toThrow(/bo‘sh/);
  });

  it('rejects a file over the size limit before parsing it', () => {
    const big = new Uint8Array(2048);
    big.set(buildJpeg());
    expect(() => sanitizeImage(big, { maxBytes: 1024 })).toThrow(/MB/);
  });

  it('respects an allow-list narrower than the default', () => {
    expect(() => sanitizeImage(buildPng(), { ...OPTIONS, allowedFormats: ['jpeg'] })).toThrow(
      ImageRejected,
    );
  });

  it('reports failures in Uzbek, since the message reaches the user', () => {
    try {
      sanitizeImage(new TextEncoder().encode('nope'), OPTIONS);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('JPEG');
      expect((error as Error).name).toBe('ImageRejected');
    }
  });
});
