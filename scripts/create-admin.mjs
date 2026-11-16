#!/usr/bin/env node
/**
 * Promotes an account to moderator, or creates one.
 *
 * This is the only bootstrap path into the administrator role. The role is
 * never derived from a sign-up payload, never writable by the account itself,
 * and the database refuses a role change coming from an API session
 * (binmap_guard_role_change in supabase/migrations/0001). Running this script
 * requires access to the database credentials, which is the point.
 *
 * Usage:
 *   npm run admin:create -- someone@example.uz
 *   npm run admin:create -- someone@example.uz --create
 *   npm run admin:create -- --list
 *   npm run admin:create -- someone@example.uz --demote
 *
 * With --create and no password, one is generated and printed once.
 */

import { randomBytes, scryptSync } from 'node:crypto';

import { connect, driver, loadEnv, migrate } from './lib/db.mjs';

loadEnv();

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();

const passwordArg = args.find((a) => a.startsWith('--password='))?.split('=')[1];

function hashPassword(password) {
  const salt = randomBytes(16);
  const N = 65536;
  const r = 8;
  const p = 1;
  const derived = scryptSync(password.normalize('NFKC'), salt, 32, {
    N,
    r,
    p,
    maxmem: 192 * 1024 * 1024,
  });
  return ['scrypt', N, r, p, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

function usage() {
  console.log(`
BinMap — administrator setup

  npm run admin:create -- <email>              promote an existing account
  npm run admin:create -- <email> --create     create the account, then promote
  npm run admin:create -- <email> --demote     remove the moderator role
  npm run admin:create -- --list               list current moderators

Options:
  --password=<value>   use this password instead of generating one (--create)
`);
}

async function main() {
  const db = await connect();
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;

  try {
    await migrate(db, { log: () => {} });

    if (flags.has('--list') || (!email && !flags.has('--help'))) {
      if (!flags.has('--list')) {
        usage();
      }
      const admins = await q(
        "select email, full_name, created_at from public.profiles where role = 'admin' order by created_at",
      );
      console.log(`Moderators (${driver()}): ${admins.length}`);
      for (const a of admins) {
        console.log(`  ${a.email}${a.full_name ? `  (${a.full_name})` : ''}`);
      }
      if (admins.length === 0) {
        console.log('  none yet — promote one with: npm run admin:create -- <email>');
      }
      return;
    }

    if (flags.has('--help')) {
      usage();
      return;
    }

    const existing = await q(
      'select id, email, role from public.profiles where lower(email) = lower($1)',
      [email],
    );

    /* ------------------------------- demote ------------------------------ */
    if (flags.has('--demote')) {
      if (existing.length === 0) {
        console.error(`No account found for ${email}.`);
        process.exitCode = 1;
        return;
      }
      const admins = await q("select count(*)::int as n from public.profiles where role = 'admin'");
      if (existing[0].role === 'admin' && admins[0].n <= 1) {
        console.error('Refusing to remove the only moderator — promote another one first.');
        process.exitCode = 1;
        return;
      }
      await q("update public.profiles set role = 'user' where id = $1", [existing[0].id]);
      console.log(`${email} is no longer a moderator.`);
      return;
    }

    /* ------------------------------- promote ----------------------------- */
    let userId = existing[0]?.id;

    if (!userId) {
      if (!flags.has('--create')) {
        console.error(`\nNo account found for ${email}.`);
        console.error('Sign up in the app first, or pass --create to make the account here.\n');
        process.exitCode = 1;
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const password = passwordArg ?? `BinMap-${randomBytes(9).toString('base64url')}`;

      if (supabaseUrl && supabaseKey) {
        // Supabase Auth owns accounts on that path.
        const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password, email_confirm: true }),
        });
        if (!response.ok) {
          throw new Error(`Supabase refused to create the account: ${await response.text()}`);
        }
        userId = (await response.json()).id;
      } else {
        const created = await q(
          `insert into public.profiles (email, role) values ($1, 'user') returning id`,
          [email],
        );
        userId = created[0].id;
        await q(
          `insert into public.local_credentials (user_id, password_hash, email_verified_at)
           values ($1, $2, now())`,
          [userId, hashPassword(password)],
        );
      }

      if (!passwordArg) {
        console.log(`\nAccount created. Password (shown once): ${password}`);
        console.log('Change it after the first sign-in.\n');
      }
    }

    const before = await q('select role from public.profiles where id = $1', [userId]);
    if (before[0].role === 'admin') {
      console.log(`${email} is already a moderator.`);
      return;
    }

    await q("update public.profiles set role = 'admin' where id = $1", [userId]);

    // Recorded like any other privileged change, with no acting administrator
    // because this one came from the command line.
    await q(
      `insert into public.admin_audit_log (administrator_id, action, entity_type, entity_id, details)
       values (null, 'profile.role_changed', 'profile', $1, $2::jsonb)`,
      [userId, JSON.stringify({ field: 'role', from: 'user', to: 'admin', source: 'cli', email })],
    );

    console.log(`${email} is now a moderator.`);
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('\nFailed:', error.message);
  process.exit(1);
});
