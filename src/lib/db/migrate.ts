import 'server-only';

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

import type { Queryable } from '@/lib/db/client';

/**
 * Applies the SQL files in supabase/migrations in filename order, once each,
 * recording them in public.schema_migrations.
 *
 * The same files are what `supabase db push` applies to a hosted project, so
 * local and production schemas cannot diverge. Each file runs as a single
 * multi-statement script inside one transaction: a file either applies
 * completely or not at all.
 */

const MIGRATIONS_DIR = 'supabase/migrations';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

async function ensureMigrationsTable(db: Queryable): Promise<void> {
  await db.exec(`
    create table if not exists public.schema_migrations (
      version    text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

export async function runMigrations(
  db: Queryable,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<MigrationResult> {
  const dir = resolve(process.cwd(), options.dir ?? MIGRATIONS_DIR);
  const log = options.log ?? (() => {});

  await ensureMigrationsTable(db);

  const existing = await db.query<{ version: string; checksum: string }>(
    'select version, checksum from public.schema_migrations',
  );
  const appliedMap = new Map(existing.rows.map((r) => [r.version, r.checksum]));

  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    log(`[binmap] no migrations directory at ${dir}`);
    return { applied: [], skipped: [] };
  }

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of entries) {
    const sql = await readFile(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 32);
    const previous = appliedMap.get(file);

    if (previous) {
      if (previous !== checksum) {
        // Editing an applied migration would make environments diverge
        // silently; refuse rather than guess.
        throw new Error(
          `Migration ${file} has changed since it was applied. Add a new migration instead of editing it.`,
        );
      }
      result.skipped.push(file);
      continue;
    }

    log(`[binmap] applying ${file}`);
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(
        'insert into public.schema_migrations (version, checksum) values ($1, $2)',
        [file, checksum],
      );
    });
    result.applied.push(file);
  }

  return result;
}
