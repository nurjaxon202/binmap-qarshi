import 'server-only';

import { randomUUID, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

import { localStorageConfig, storageDriver, supabaseConfig, uploadLimits } from '@/lib/config';
import { sanitizeImage, type SanitizedImage } from '@/lib/storage/sanitize';

/**
 * Photo storage with two tiers:
 *
 *   bins/*         — photographs of approved, public bins. Publicly readable.
 *   submissions/*  — photographs attached to proposals awaiting review.
 *   reports/*      — evidence attached to problem reports.
 *
 * Everything outside `bins/` is private: it is reachable only through a
 * short-lived signed URL that the server mints *after* checking that the
 * requester owns the record or is an administrator. When a submission is
 * approved its photo is copied into the public tier, so an unapproved photo is
 * never publicly addressable.
 *
 * Supabase Storage backs this in production (a public bucket and a private
 * one); the local filesystem backs it in development, with HMAC-signed URLs
 * that mirror Supabase's signed-URL semantics.
 */

export type MediaPrefix = 'bins' | 'submissions' | 'reports';

export function isPublicPath(path: string): boolean {
  return path.startsWith('bins/');
}

export interface StorageProvider {
  readonly kind: 'local' | 'supabase';
  put(prefix: MediaPrefix, image: SanitizedImage): Promise<string>;
  /** Copies a private object into the public tier; returns the new path. */
  promoteToPublic(path: string): Promise<string>;
  /** A URL the browser can load, signed and short-lived for private objects. */
  urlFor(path: string | null): Promise<string | null>;
  remove(path: string): Promise<void>;
  /** Streams bytes back. Only the local provider serves its own files. */
  read(path: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
}

/* --------------------------- path and type rules -------------------------- */

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Rejects traversal and anything outside the three known prefixes. */
export function assertSafePath(path: string): void {
  if (!/^(bins|submissions|reports)\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) {
    throw new Error(`Unsafe media path: ${path}`);
  }
}

function newPath(prefix: MediaPrefix, extension: string): string {
  return `${prefix}/${randomUUID()}.${extension}`;
}

/* ------------------------------ local driver ------------------------------ */

async function localRoot(): Promise<string> {
  const { resolve } = await import('node:path');
  // Configurable at runtime, so the bundler cannot know it statically. Opt out
  // of tracing rather than letting it pull the whole project into the bundle;
  // this branch only runs on the local storage driver.
  return resolve(/* turbopackIgnore: true */ process.cwd(), localStorageConfig.dir);
}

let cachedSecret: Buffer | null = null;

/**
 * Signing key for local private URLs. Taken from the environment when set, and
 * otherwise generated once and persisted beside the uploads so that a dev
 * server restart does not invalidate URLs already on screen.
 */
async function signingSecret(): Promise<Buffer> {
  if (cachedSecret) return cachedSecret;
  if (localStorageConfig.signingSecret) {
    cachedSecret = Buffer.from(localStorageConfig.signingSecret, 'utf8');
    return cachedSecret;
  }
  const { join } = await import('node:path');
  const { readFile, writeFile, mkdir } = await import('node:fs/promises');
  const root = await localRoot();
  const file = join(root, '.signing-key');
  try {
    cachedSecret = Buffer.from((await readFile(file, 'utf8')).trim(), 'hex');
    if (cachedSecret.length >= 32) return cachedSecret;
  } catch {
    /* first run */
  }
  const generated = randomBytes(32);
  await mkdir(root, { recursive: true });
  await writeFile(file, generated.toString('hex'), 'utf8');
  cachedSecret = generated;
  return cachedSecret;
}

function signature(secret: Buffer, path: string, expiresAt: number): string {
  return createHmac('sha256', secret).update(`${path}:${expiresAt}`).digest('base64url');
}

/** Verifies a locally signed media URL. Used by /api/media. */
export async function verifyLocalSignature(
  path: string,
  expiresAt: number,
  provided: string,
): Promise<boolean> {
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return false;
  const expected = signature(await signingSecret(), path, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createLocalProvider(): StorageProvider {
  return {
    kind: 'local',

    async put(prefix, image) {
      const { join, dirname } = await import('node:path');
      const { mkdir, writeFile } = await import('node:fs/promises');
      const path = newPath(prefix, image.extension);
      const file = join(await localRoot(), path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, image.bytes);
      return path;
    },

    async promoteToPublic(path) {
      assertSafePath(path);
      if (isPublicPath(path)) return path;
      const { join, dirname, extname } = await import('node:path');
      const { mkdir, copyFile } = await import('node:fs/promises');
      const root = await localRoot();
      const target = newPath('bins', extname(path).replace('.', ''));
      const targetFile = join(root, target);
      await mkdir(dirname(targetFile), { recursive: true });
      await copyFile(join(root, path), targetFile);
      return target;
    },

    async urlFor(path) {
      if (!path) return null;
      assertSafePath(path);
      if (isPublicPath(path)) return `/api/media/${path}`;
      const expiresAt = Math.floor(Date.now() / 1000) + localStorageConfig.signedUrlTtlSeconds;
      const sig = signature(await signingSecret(), path, expiresAt);
      return `/api/media/${path}?exp=${expiresAt}&sig=${sig}`;
    },

    async remove(path) {
      assertSafePath(path);
      const { join } = await import('node:path');
      const { rm } = await import('node:fs/promises');
      await rm(join(await localRoot(), path), { force: true });
    },

    async read(path) {
      assertSafePath(path);
      const { join, extname } = await import('node:path');
      const { readFile } = await import('node:fs/promises');
      try {
        const bytes = await readFile(join(await localRoot(), path));
        const ext = extname(path).replace('.', '');
        return {
          bytes: new Uint8Array(bytes),
          contentType: CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream',
        };
      } catch {
        return null;
      }
    },
  };
}

/* ----------------------------- Supabase driver ---------------------------- */

function bucketFor(path: string): string {
  return isPublicPath(path) ? supabaseConfig.binPhotoBucket : supabaseConfig.evidenceBucket;
}

function createSupabaseProvider(): StorageProvider {
  const client = async () => {
    const { getServiceClient } = await import('@/lib/supabase/service');
    return getServiceClient();
  };

  return {
    kind: 'supabase',

    async put(prefix, image) {
      const path = newPath(prefix, image.extension);
      const supabase = await client();
      const { error } = await supabase.storage
        .from(bucketFor(path))
        .upload(path, image.bytes, {
          contentType: image.contentType,
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return path;
    },

    async promoteToPublic(path) {
      assertSafePath(path);
      if (isPublicPath(path)) return path;
      const supabase = await client();
      const extension = path.split('.').pop() ?? 'jpg';
      const target = newPath('bins', extension);

      const download = await supabase.storage.from(supabaseConfig.evidenceBucket).download(path);
      if (download.error || !download.data) {
        throw new Error(`Storage copy failed: ${download.error?.message ?? 'no data'}`);
      }
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const { error } = await supabase.storage
        .from(supabaseConfig.binPhotoBucket)
        .upload(target, bytes, {
          contentType: CONTENT_TYPE_BY_EXT[extension] ?? 'image/jpeg',
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) throw new Error(`Storage copy failed: ${error.message}`);
      return target;
    },

    async urlFor(path) {
      if (!path) return null;
      assertSafePath(path);
      const supabase = await client();
      if (isPublicPath(path)) {
        return supabase.storage.from(supabaseConfig.binPhotoBucket).getPublicUrl(path).data
          .publicUrl;
      }
      const { data, error } = await supabase.storage
        .from(supabaseConfig.evidenceBucket)
        .createSignedUrl(path, localStorageConfig.signedUrlTtlSeconds);
      if (error || !data) return null;
      return data.signedUrl;
    },

    async remove(path) {
      assertSafePath(path);
      const supabase = await client();
      await supabase.storage.from(bucketFor(path)).remove([path]);
    },

    async read() {
      // Supabase serves its own objects; nothing proxies through the app.
      return null;
    },
  };
}

/* -------------------------------- selection ------------------------------- */

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!provider) {
    provider = storageDriver === 'supabase' ? createSupabaseProvider() : createLocalProvider();
  }
  return provider;
}

/* --------------------------------- uploads -------------------------------- */

export interface UploadOutcome {
  path: string | null;
  error: string | null;
}

/**
 * Takes a `File` straight off a multipart form, validates it, strips metadata
 * and stores it. An absent or empty file is not an error — photographs are
 * optional throughout BinMap.
 */
export async function storeUploadedImage(
  file: FormDataEntryValue | null,
  prefix: MediaPrefix,
): Promise<UploadOutcome> {
  if (!file || typeof file === 'string') return { path: null, error: null };
  const blob = file as File;
  if (!blob.size) return { path: null, error: null };

  if (blob.size > uploadLimits.maxBytes) {
    const mb = (uploadLimits.maxBytes / (1024 * 1024)).toFixed(0);
    return { path: null, error: `Surat hajmi ${mb} MB dan oshmasligi kerak.` };
  }

  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const image = sanitizeImage(bytes, { maxBytes: uploadLimits.maxBytes });
    const path = await getStorage().put(prefix, image);
    return { path, error: null };
  } catch (error) {
    if (error instanceof Error && error.name === 'ImageRejected') {
      return { path: null, error: error.message };
    }
    console.error('[binmap] upload failed', error);
    return { path: null, error: 'Suratni saqlab bo‘lmadi. Keyinroq urinib ko‘ring.' };
  }
}

/** Resolves several paths to URLs in one pass, de-duplicating the work. */
export async function resolvePhotoUrls(
  paths: (string | null)[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const storage = getStorage();
  const entries = await Promise.all(
    unique.map(async (path) => {
      try {
        return [path, await storage.urlFor(path)] as const;
      } catch {
        return [path, null] as const;
      }
    }),
  );
  return new Map(entries);
}
