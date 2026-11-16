import { describe, expect, it } from 'vitest';

import { createToken, hashPassword, hashToken, verifyPassword } from '@/lib/auth/password';

/**
 * Security-critical: these tests assert the properties the local
 * authentication path depends on. They run against the real node:crypto
 * implementation, not a mock.
 */

describe('hashPassword', () => {
  it('never stores the password itself', async () => {
    const hash = await hashPassword('parol12345');
    expect(hash).not.toContain('parol12345');
  });

  it('salts, so the same password hashes differently every time', async () => {
    const a = await hashPassword('parol12345');
    const b = await hashPassword('parol12345');
    expect(a).not.toBe(b);
  });

  it('records its parameters so they can be raised later', async () => {
    const hash = await hashPassword('parol12345');
    const [scheme, N, r, p, salt, derived] = hash.split('$');
    expect(scheme).toBe('scrypt');
    expect(Number(N)).toBe(65536);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
    expect(salt!.length).toBeGreaterThan(16);
    expect(derived!.length).toBeGreaterThan(32);
  });
});

describe('verifyPassword', () => {
  it('accepts the right password', async () => {
    const hash = await hashPassword('parol12345');
    await expect(verifyPassword('parol12345', hash)).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('parol12345');
    await expect(verifyPassword('parol12346', hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
    await expect(verifyPassword('PAROL12345', hash)).resolves.toBe(false);
  });

  it('normalises Unicode, so a composed and decomposed password match', async () => {
    // "Oʻzbekiston" typed with a combining mark must still verify.
    const composed = 'Parolñ123';
    const decomposed = 'Parolñ123';
    const hash = await hashPassword(composed);
    await expect(verifyPassword(decomposed, hash)).resolves.toBe(true);
  });

  it('returns false for a malformed stored value instead of throwing', async () => {
    for (const stored of ['', 'nonsense', 'scrypt$1$2', 'bcrypt$1$2$3$4$5', 'scrypt$a$b$c$d$e']) {
      await expect(verifyPassword('parol12345', stored)).resolves.toBe(false);
    }
  });

  it('refuses absurd parameters from a tampered row rather than allocating', async () => {
    // A row claiming N = 2^30 would otherwise try to allocate gigabytes.
    const tampered = ['scrypt', 1 << 30, 8, 1, 'c2FsdA', 'ZGVyaXZlZA'].join('$');
    await expect(verifyPassword('parol12345', tampered)).resolves.toBe(false);
  });

  it('rejects a hash with an empty derived key', async () => {
    const empty = ['scrypt', 65536, 8, 1, 'c2FsdA', ''].join('$');
    await expect(verifyPassword('parol12345', empty)).resolves.toBe(false);
  });
});

describe('tokens', () => {
  it('generates URL-safe tokens with enough entropy', () => {
    const token = createToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes in base64url.
    expect(token.length).toBeGreaterThanOrEqual(42);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createToken()));
    expect(tokens.size).toBe(200);
  });

  it('stores only a digest, so a database dump cannot be replayed', () => {
    const token = createToken();
    const digest = hashToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
  });

  it('hashes deterministically, so a presented token can be looked up', () => {
    const token = createToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(createToken()));
  });
});
