import 'server-only';

import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
import { promisify } from 'node:util';

/** promisify() cannot see the overload that takes options, so narrow it here. */
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password hashing for the non-Supabase authentication path.
 *
 * scrypt from node:crypto — memory-hard, in the standard library, no native
 * build step. Parameters are stored with the hash so they can be raised later
 * without invalidating existing passwords.
 *
 * Nothing here ever stores or logs a plaintext password.
 */

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** cost=2^16, blockSize=8, parallelisation=1 — about 100 ms on a laptop. */
const PARAMS = { N: 65536, r: 8, p: 1 } as const;
const MAX_MEMORY = 192 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEMORY,
  });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/** Constant-time verification. Returns false for any malformed stored value. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters from a tampered row rather than allocating GBs.
  if (N > 1 << 20 || r > 32 || p > 16) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(parts[5] as string, 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  try {
    const salt = Buffer.from(parts[4] as string, 'base64url');
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* --------------------------------- tokens --------------------------------- */

/** A session or reset token: 32 random bytes, URL-safe. */
export function createToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Only the digest is stored. A leaked database dump therefore contains no
 * usable session or reset token.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
