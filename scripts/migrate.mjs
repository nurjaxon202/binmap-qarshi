#!/usr/bin/env node
/** Applies supabase/migrations/*.sql to the configured PostgreSQL database. */
import { connect, driver, loadEnv, migrate } from './lib/db.mjs';

loadEnv();

const db = await connect();
console.log(`BinMap — migrating PostgreSQL (${driver()})`);
try {
  const result = await migrate(db);
  if (result.applied.length === 0) {
    console.log(`  up to date (${result.skipped.length} migrations already applied)`);
  } else {
    console.log(`  applied ${result.applied.length}, skipped ${result.skipped.length}`);
  }
  const { rows } = await db.query('select count(*)::int as n from public.cities');
  console.log(`  cities configured: ${rows[0].n}`);
} finally {
  await db.close();
}
