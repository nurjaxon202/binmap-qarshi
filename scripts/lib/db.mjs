/**
 * Command-line PostgreSQL bootstrap for the scripts in this folder.
 *
 * Deliberately plain JavaScript with no path aliases or bundler assumptions, so
 * `npm run db:migrate`, `npm run demo:seed` and `npm run admin:create` work
 * without a TypeScript loader. It mirrors src/lib/db/client.ts: DATABASE_URL
 * selects a real PostgreSQL server (Supabase in production), and its absence
 * selects the local PGlite instance. Same SQL either way.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

/** Minimal .env / .env.local loader — avoids a dependency for tooling. */
export function loadEnv(root = process.cwd()) {
  for (const name of ['.env', '.env.local']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      const quoted =
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"));
      if (quoted) value = value.slice(1, -1);
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

export const driver = () =>
  process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'postgres' : 'pglite';

/** Opens a connection and returns a tiny { query, exec, transaction, close }. */
export async function connect() {
  if (driver() === 'postgres') {
    const pg = await import('pg');
    const client = new pg.default.Client({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      application_name: 'binmap-cli',
    });
    await client.connect();
    const api = {
      kind: 'postgres',
      async query(text, params = []) {
        const res = await client.query(text, params);
        return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
      },
      async exec(script) {
        await client.query(script);
      },
      async transaction(fn) {
        await client.query('begin');
        try {
          const out = await fn(api);
          await client.query('commit');
          return out;
        } catch (error) {
          await client.query('rollback').catch(() => {});
          throw error;
        }
      },
      async close() {
        await client.end();
      },
    };
    return api;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = resolve(process.cwd(), process.env.BINMAP_LOCAL_PG_DIR || '.data/pgdata');
  // PGlite's node filesystem layer creates the data directory itself but not
  // its parents.
  mkdirSync(dir, { recursive: true });
  const db = await PGlite.create({ dataDir: dir });
  const wrap = (runner, isTx) => ({
    kind: 'pglite',
    async query(text, params = []) {
      const res = await runner.query(text, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(script) {
      await runner.exec(script);
    },
    async transaction(fn) {
      if (isTx) return fn(wrap(runner, true));
      return runner.transaction((tx) => fn(wrap(tx, true)));
    },
    async close() {
      if (!isTx) await runner.close();
    },
  });
  return wrap(db, false);
}

/** Applies supabase/migrations/*.sql once each, in filename order. */
export async function migrate(db, { log = console.log } = {}) {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  await db.exec(`
    create table if not exists public.schema_migrations (
      version    text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await db.query('select version, checksum from public.schema_migrations');
  const applied = new Map(rows.map((r) => [r.version, r.checksum]));

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const result = { applied: [], skipped: [] };

  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 32);
    const previous = applied.get(file);

    if (previous) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${file} has changed since it was applied. Add a new migration instead of editing it.`,
        );
      }
      result.skipped.push(file);
      continue;
    }

    log(`  applying ${file}`);
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('insert into public.schema_migrations (version, checksum) values ($1, $2)', [
        file,
        checksum,
      ]);
    });
    result.applied.push(file);
  }

  return result;
}
