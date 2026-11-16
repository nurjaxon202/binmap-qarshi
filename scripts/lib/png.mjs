/**
 * A minimal PNG writer, used only by the demonstration seeder.
 *
 * It produces deliberately abstract placeholder images — a hatched ivory
 * ground with a forest-green plate — so that a demonstration record can carry
 * a picture without anyone mistaking it for a photograph of a real place in
 * Qarshi. Nothing here is used at runtime by the application.
 *
 * Plain zlib + CRC32, no image dependency.
 */

import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Encodes an RGB pixel buffer (width * height * 3) as a PNG. */
export function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const IVORY = [247, 243, 232];
const MOSS = [175, 197, 181];
const FOREST = [22, 65, 43];
const LIME = [203, 230, 115];

/**
 * Draws the placeholder: ivory ground, diagonal moss hatching, and a centred
 * forest plate with a lime band — the brand's map-plate shape, abstracted.
 * `variant` shifts the hatch phase so the seeded records are not identical.
 */
export function demoPlaceholderPng(width = 640, height = 480, variant = 0) {
  const rgb = Buffer.alloc(width * height * 3);

  const plateW = Math.round(width * 0.34);
  const plateH = Math.round(height * 0.42);
  const plateX = Math.round((width - plateW) / 2);
  const plateY = Math.round((height - plateH) / 2);
  const bandY = plateY + Math.round(plateH * 0.3);
  const bandH = Math.max(4, Math.round(plateH * 0.09));

  const set = (offset, colour) => {
    rgb[offset] = colour[0];
    rgb[offset + 1] = colour[1];
    rgb[offset + 2] = colour[2];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      const inPlate = x >= plateX && x < plateX + plateW && y >= plateY && y < plateY + plateH;

      if (inPlate) {
        set(offset, y >= bandY && y < bandY + bandH ? LIME : FOREST);
        continue;
      }
      // 24px diagonal hatch; the variant rotates its phase.
      set(offset, (x + y + variant * 7) % 24 < 3 ? MOSS : IVORY);
    }
  }

  return encodePng(width, height, rgb);
}
