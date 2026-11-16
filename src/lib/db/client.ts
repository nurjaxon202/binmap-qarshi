import 'server-only';

import type { Pool as PgPool, PoolClient as PgClient } from 'pg';
import type { PGlite as PGliteInstance, Transaction as PGliteTx } from '@electric-sql/pglite';

import { dbConfig, dbDriver } from '@/lib/config';

/**
 * One PostgreSQL access layer for every environment.
 *
 * Production points DATABASE_URL at Supabase (use the pooler connection string
 * on serverless platforms). Development with no DATABASE_URL runs PGlite — the
 * same PostgreSQL engine compiled to WebAssembly — against a local data
 * directory. Both speak the same SQL, run the same migrations and use `$1`
 * placeholders, so no query in this codebase is written twice.
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs several statements as one unit; rolls back if `fn` throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Executes a multi-statement script (migrations only). */
  exec(script: string): Promise<void>;
}

export class DbError extends Error {
  readonly code: string | undefined;
  readonly constraint: string | undefined;

  constructor(message: string, code?: string, constraint?: string) {
    super(message);
    this.name = 'DbError';
    this.code = code;
    this.constraint = constraint;
  }
}

/** Postgres error codes we translate into user-facing outcomes. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_CHECK_VIOLATION = '23514';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

function wrapError(error: unknown): never {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; code?: string; constraint?: string };
    throw new DbError(e.message ?? 'Database error', e.code, e.constraint);
  }
  throw new DbError(String(error));
}

/* ------------------------------ pg (remote) ------------------------------- */

function pgQueryable(runner: PgPool | PgClient, owned: boolean): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      try {
        const res = await runner.query(text, params as never[]);
        return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
      } catch (error) {
        wrapError(error);
      }
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      if (owned) {
        // Already inside a transaction — reuse it rather than nesting.
        return fn(pgQueryable(runner, true));
      }
      const client = await (runner as PgPool).connect();
      try {
        await client.query('begin');
        const result = await fn(pgQueryable(client, true));
        await client.query('commit');
        return result;
      } catch (error) {
        try {
          await client.query('rollback');
        } catch {
          /* the connection is already broken; nothing to salvage */
        }
        wrapError(error);
      } finally {
        client.release();
      }
    },
    async exec(script: string) {
      try {
        await runner.query(script);
      } catch (error) {
        wrapError(error);
      }
    },
  };
}

async function createPgPool(): Promise<Queryable> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: dbConfig.url,
    max: dbConfig.poolMax,
    // Supabase terminates TLS with its own chain; verifying it needs the CA
    // bundle, which hosted platforms do not ship. The connection is still
    // encrypted. Set DATABASE_SSL=false for a local plaintext Postgres.
    ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
    application_name: 'binmap',
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (error) => {
    console.error('[binmap] idle PostgreSQL client error', error.message);
  });
  return pgQueryable(pool, false);
}

/* ----------------------------- PGlite (local) ----------------------------- */

function pgliteQueryable(runner: PGliteInstance | PGliteTx, isTx: boolean): Queryable {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      try {
        const res = await runner.query<T>(text, params);
        return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
      } catch (error) {
        wrapError(error);
      }
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      if (isTx) return fn(pgliteQueryable(runner, true));
      try {
        return (await (runner as PGliteInstance).transaction(async (tx) =>
          fn(pgliteQueryable(tx, true)),
        )) as T;
      } catch (error) {
        wrapError(error);
      }
    },
    async exec(script: string) {
      try {
        await (isTx ? runner.exec(script) : (runner as PGliteInstance).exec(script));
      } catch (error) {
        wrapError(error);
      }
    },
  };
}

async function createPglite(): Promise<Queryable> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { resolve } = await import('node:path');
  const { mkdir } = await import('node:fs/promises');
  // The directory is configurable, so the bundler cannot know it statically.
  // It is only ever read at runtime on the local driver, so opt out of tracing
  // rather than pulling the entire project into the server bundle.
  const dir = resolve(/* turbopackIgnore: true */ process.cwd(), dbConfig.localDir);
  // PGlite creates its data directory but not the parents.
  await mkdir(dir, { recursive: true });
  const instance = await PGlite.create({ dataDir: dir });
  return pgliteQueryable(instance, false);
}

/* ------------------------------- singleton -------------------------------- */

interface DbGlobal {
  __binmapDb?: Promise<Queryable>;
  __binmapMigrated?: Promise<void>;
}

const globalRef = globalThis as unknown as DbGlobal;

/**
 * Connects (once per process) and applies any pending migrations before the
 * first query is allowed through.
 */
export async function getDb(): Promise<Queryable> {
  if (!globalRef.__binmapDb) {
    globalRef.__binmapDb = dbDriver === 'postgres' ? createPgPool() : createPglite();
  }
  const db = await globalRef.__binmapDb;

  if (dbConfig.autoMigrate && process.env.NODE_ENV !== 'production') {
    if (!globalRef.__binmapMigrated) {
      globalRef.__binmapMigrated = (async () => {
        const { runMigrations } = await import('@/lib/db/migrate');
        await runMigrations(db);
      })().catch((error) => {
        // Let the next request retry rather than poisoning the process.
        globalRef.__binmapMigrated = undefined;
        throw error;
      });
    }
    await globalRef.__binmapMigrated;
  }

  return db;
}

/** Connects without triggering auto-migration — used by the migration scripts. */
export async function getRawDb(): Promise<Queryable> {
  if (!globalRef.__binmapDb) {
    globalRef.__binmapDb = dbDriver === 'postgres' ? createPgPool() : createPglite();
  }
  return globalRef.__binmapDb;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}
