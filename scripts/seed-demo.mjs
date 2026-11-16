#!/usr/bin/env node
/**
 * Builds the BinMap Qarshi demonstration environment.
 *
 * Locations come from scripts/lib/qarshi-locations.json, which was generated
 * by scripts/generate-locations.mjs: points sampled along real OpenStreetMap
 * street centrelines in Qarshi, described from amenities genuinely nearby.
 * The geography is real; the bins are not. Nothing here asserts that a public
 * bin has been installed anywhere.
 *
 * Every row carries is_demo = true. That flag is how `--clean-only` finds
 * them again and how production stays free of them; it is deliberately not
 * surfaced in the interface.
 *
 * The seeder works through the same database functions the application calls
 * — binmap_create_bin, binmap_approve_submission, binmap_reject_submission,
 * binmap_create_report, binmap_review_report — so the rows, the status
 * transitions and the audit trail come from the real code path.
 *
 * Usage:
 *   npm run demo:seed            # add demonstration data
 *   npm run demo:reset           # delete it and seed again
 *   npm run demo:clean           # delete it and stop
 */

import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { connect, driver, loadEnv, migrate } from './lib/db.mjs';
import { demoPlaceholderPng } from './lib/png.mjs';

loadEnv();

const args = new Set(process.argv.slice(2));
const doReset = args.has('--reset');
const cleanOnly = args.has('--clean-only');

/* ------------------------------- the guard -------------------------------- */

if (process.env.NODE_ENV === 'production' && process.env.BINMAP_ALLOW_DEMO_SEED !== 'true') {
  console.error('\nRefusing to seed demonstration data: NODE_ENV=production.');
  console.error('Production must contain only real submitted or verified information.');
  console.error('Set BINMAP_ALLOW_DEMO_SEED=true only if you genuinely intend this.\n');
  process.exit(1);
}

/* -------------------------------- the data -------------------------------- */

const LOCATIONS = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/lib/qarshi-locations.json'), 'utf8'),
);

/**
 * Roughly nine in ten locations are entered by platform administrators doing
 * field survey; the rest arrive as resident submissions and reach the map
 * through the real approval path.
 */
const COMMUNITY_SHARE = 0.1;

/** Deterministic, so re-seeding gives the same environment. */
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20261103);
const pick = (list) => list[Math.floor(random() * list.length)];

/* ------------------------------ photo storage ----------------------------- */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabaseStorage = Boolean(supabaseUrl && supabaseKey);
const publicBucket = process.env.SUPABASE_BIN_PHOTO_BUCKET || 'bin-photos';
const evidenceBucket = process.env.SUPABASE_EVIDENCE_BUCKET || 'bin-evidence';
const uploadRoot = resolve(process.cwd(), process.env.BINMAP_UPLOAD_DIR || '.data/uploads');

let photoCounter = 0;

async function storePlaceholder(prefix) {
  const path = `${prefix}/${randomUUID()}.png`;
  const bytes = demoPlaceholderPng(640, 480, photoCounter++);

  if (useSupabaseStorage) {
    const bucket = prefix === 'bins' ? publicBucket : evidenceBucket;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'image/png',
        'Cache-Control': '31536000',
      },
      body: bytes,
    });
    if (!response.ok) {
      throw new Error(
        `Upload to Supabase bucket "${bucket}" failed (${response.status}). ` +
          `Create it first: "${publicBucket}" public, "${evidenceBucket}" private.`,
      );
    }
    return path;
  }

  const file = join(uploadRoot, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  return path;
}

async function removeStoredPhotos(paths) {
  if (paths.length === 0) return;

  if (useSupabaseStorage) {
    const byBucket = new Map();
    for (const path of paths) {
      const bucket = path.startsWith('bins/') ? publicBucket : evidenceBucket;
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(path);
    }
    for (const [bucket, bucketPaths] of byBucket) {
      await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefixes: bucketPaths }),
      }).catch(() => {});
    }
    return;
  }

  const { rm } = await import('node:fs/promises');
  for (const path of paths) {
    await rm(join(uploadRoot, path), { force: true }).catch(() => {});
  }
}

/* -------------------------------- accounts -------------------------------- */

const ACCOUNTS = [
  { key: 'admin', email: 'moderator@namuna.binmap.uz', fullName: 'Nozim Ergashev', role: 'admin' },
  { key: 'admin2', email: 'surveyor@namuna.binmap.uz', fullName: 'Gulnora Soliyeva', role: 'admin' },
  { key: 'user1', email: 'dilnoza@namuna.binmap.uz', fullName: 'Dilnoza Rahimova', role: 'user' },
  { key: 'user2', email: 'bekzod@namuna.binmap.uz', fullName: 'Bekzod Qurbonov', role: 'user' },
  { key: 'user3', email: 'sevara@namuna.binmap.uz', fullName: 'Sevara Yo‘ldosheva', role: 'user' },
  { key: 'user4', email: 'jahongir@namuna.binmap.uz', fullName: 'Jahongir Ernazarov', role: 'user' },
  { key: 'user5', email: 'malika@namuna.binmap.uz', fullName: 'Malika Tosheva', role: 'user' },
];

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

const generatePassword = () => `Namuna-${randomBytes(6).toString('base64url')}`;

/* -------------------------------- content --------------------------------- */

const REPORT_NOTES = {
  overflowing: [
    'Quti to‘lib ketgan, atrofga chiqindi to‘kilgan.',
    'Ertalabdan to‘lgan holatda turibdi.',
    'Hafta oxirida tez to‘lib qoladi.',
    'Uch kundan beri bo‘shatilmagan.',
    'Atrofida chiqindi sochilib yotibdi.',
  ],
  damaged: [
    'Qopqog‘i singan.',
    'Yon tomoni egilgan.',
    'Pedali ishlamaydi.',
    'Quti ag‘darilgan holatda.',
    'Tagligi yorilgan.',
  ],
  missing: [
    'Ko‘rsatilgan joyda quti topilmadi.',
    'Quti olib ketilganga o‘xshaydi.',
    'Bu yerda endi quti yo‘q.',
  ],
  other: [
    'Quti yo‘lkani to‘sib qo‘ygan.',
    'Atrofida yorug‘lik yo‘q, kechasi ko‘rinmaydi.',
    'Quti juda baland o‘rnatilgan.',
  ],
};

const ADMIN_NOTES = [
  'Hudud xizmatiga xabar berildi.',
  'Joyida ko‘rildi, holat tasdiqlandi.',
  'Tozalangani tekshirildi.',
  'Ta’mirlash rejalashtirildi.',
  'Qayta ko‘rildi — muammo topilmadi.',
];

const SUBMISSION_NOTES = {
  approved: [
    'Surat va koordinatalar mos keldi. Tasdiqlandi.',
    'Joyida ko‘rildi va tasdiqlandi.',
    'Qabul qilindi. Joyida tekshirish keyinroq o‘tkaziladi.',
  ],
  rejected: [
    'Bu joylashuv xaritada allaqachon mavjud — takroriy taklif.',
    'Koordinatalar Qarshi shahri hududidan tashqarida.',
    'Suratda quti ko‘rinmaydi. Aniqroq surat bilan qayta yuboring.',
  ],
};

const daysAgo = (days) => `now() - interval '${Number(days)} days'`;

/**
 * The simulated history runs between two fixed dates rather than backwards
 * from whenever the seeder happens to run, so the same seed produces the same
 * history and the dates on screen stay internally consistent with each other.
 *
 * These are simulated dates for demonstration records. They are not a record
 * of anything that happened. Production rows keep the real `now()` the
 * database writes when they are created.
 */
const TIMELINE = { start: '2026-10-24', end: '2026-11-19' };

/**
 * The window stops at today while the end date is still ahead of the clock.
 *
 * Nothing in a simulated history may be dated in the future, because the live
 * application keeps stamping the real `now()`: a genuine verification would
 * land *before* the creation date of a bin dated next week, and a genuinely
 * new submission would sort underneath every seeded one in the review queue.
 * Both are incoherent on screen and neither is the application misbehaving.
 *
 * Once the calendar passes the end date the full window is used, unchanged.
 */
{
  const DAY = 24 * 60 * 60 * 1000;
  const startedAt = Date.parse(`${TIMELINE.start}T00:00:00+05:00`);
  const endsAt = Math.min(Date.parse(`${TIMELINE.end}T21:00:00+05:00`), Date.now());
  TIMELINE.days = Math.max(1, Math.floor((endsAt - startedAt) / DAY) + 1);
  // Everything that clamps does so against this, not the configured end.
  TIMELINE.cap = new Date(endsAt).toISOString();
}

/** A timestamp literal `d` days into the timeline, at a plausible hour. */
function timelineAt(dayIndex, random) {
  const day = Math.min(Math.max(Math.round(dayIndex), 0), TIMELINE.days - 1);
  // Field surveys happen in working hours, not at four in the morning.
  const hour = 8 + Math.floor(random() * 11);
  const minute = Math.floor(random() * 60);
  return `timestamptz '${TIMELINE.start} 00:00:00+05' + interval '${day} days ${hour} hours ${minute} minutes'`;
}

/**
 * Weights per day, so additions cluster the way survey work actually does:
 * a few heavy days, several quiet ones, and some days with nothing at all.
 * Squaring the draw is what produces the skew — a flat random() would give
 * the uniform scatter this is meant to avoid.
 */
function dayWeights(random) {
  const weights = [];
  for (let day = 0; day < TIMELINE.days; day++) {
    const draw = random();
    weights.push(draw < 0.12 ? 0 : 0.25 + 4 * draw * draw);
  }
  // Never let every day come out empty.
  if (weights.every((w) => w === 0)) weights[0] = 1;
  return weights;
}

/** Picks a day index from the weights. */
function pickDay(weights, random) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let day = 0; day < weights.length; day++) {
    roll -= weights[day];
    if (roll <= 0) return day;
  }
  return weights.length - 1;
}

/* ---------------------------------- main ---------------------------------- */

async function main() {
  const db = await connect();
  const q = async (sql, params = []) => (await db.query(sql, params)).rows;

  console.log(`\nBinMap Qarshi — demonstration environment (PostgreSQL: ${driver()})`);

  try {
    await migrate(db, { log: (m) => console.log(m) });

    /* ------------------------------- cleanup ------------------------------ */

    if (doReset || cleanOnly) {
      console.log('\nRemoving existing demonstration data...');

      const photos = await q(
        `select photo_path from public.bins where is_demo and photo_path is not null
         union all
         select photo_path from public.bin_submissions where is_demo and photo_path is not null
         union all
         select photo_path from public.bin_reports where is_demo and photo_path is not null`,
      );
      await removeStoredPhotos(photos.map((row) => row.photo_path));

      const removed = await db.transaction(async (tx) => {
        const counts = {};
        const run = async (label, sql) => {
          counts[label] = (await tx.query(sql)).rowCount ?? 0;
        };

        await run(
          'audit',
          `delete from public.admin_audit_log
            where entity_id in (
              select id from public.bins where is_demo
              union all select id from public.bin_submissions where is_demo
              union all select id from public.bin_reports where is_demo
              union all select id from public.profiles where is_demo
            )
               or (details ->> 'is_demo') = 'true'`,
        );
        await run('verifications', 'delete from public.bin_verifications where is_demo');
        await run('reports', 'delete from public.bin_reports where is_demo');
        await run('submissions', 'delete from public.bin_submissions where is_demo');
        await run('bins', 'delete from public.bins where is_demo');
        await run(
          'sessions',
          `delete from public.sessions where user_id in
             (select id from public.profiles where is_demo)`,
        );
        await run('profiles', 'delete from public.profiles where is_demo');
        return counts;
      });

      console.log(
        `  removed: ${removed.bins} bins, ${removed.submissions} submissions, ` +
          `${removed.reports} reports, ` +
          `${removed.profiles} accounts, ${removed.audit} audit entries`,
      );

      if (cleanOnly) {
        console.log('\nDone.\n');
        return;
      }
    }

    const existing = await q('select count(*)::int as n from public.bins where is_demo');
    if (existing[0].n > 0) {
      console.log(
        `\nDemonstration data already present (${existing[0].n} bins). ` +
          'Run `npm run demo:reset` to rebuild it.\n',
      );
      return;
    }

    /* --------------------------------- city ------------------------------- */

    const cities = await q(
      "select id, name, min_latitude, max_latitude, min_longitude, max_longitude from public.cities where slug = 'qarshi'",
    );
    if (cities.length === 0) {
      throw new Error('Qarshi is not configured. Run `npm run db:migrate` first.');
    }
    const city = cities[0];
    console.log(`\nCity: ${city.name}`);
    console.log(
      `Map extent: ${city.min_latitude}–${city.max_latitude} N, ` +
        `${city.min_longitude}–${city.max_longitude} E`,
    );

    /* -------------------------------- accounts ---------------------------- */

    console.log('\nCreating demonstration accounts...');
    const credentials = [];
    const users = {};

    for (const spec of ACCOUNTS) {
      const password = generatePassword();
      let userId;

      if (supabaseUrl && supabaseKey) {
        const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: spec.email,
            password,
            email_confirm: true,
            user_metadata: { full_name: spec.fullName },
          }),
        });
        if (!response.ok) {
          throw new Error(`Could not create ${spec.email}: ${await response.text()}`);
        }
        userId = (await response.json()).id;
        await q('update public.profiles set is_demo = true, full_name = $2 where id = $1', [
          userId,
          spec.fullName,
        ]);
      } else {
        const inserted = await q(
          `insert into public.profiles (email, full_name, role, is_demo)
           values ($1, $2, 'user', true) returning id`,
          [spec.email, spec.fullName],
        );
        userId = inserted[0].id;
        await q(
          `insert into public.local_credentials (user_id, password_hash, email_verified_at)
           values ($1, $2, now())`,
          [userId, hashPassword(password)],
        );
      }

      // The role is set here, through the one privileged path.
      if (spec.role === 'admin') {
        await q("update public.profiles set role = 'admin' where id = $1", [userId]);
      }

      users[spec.key] = { id: userId, ...spec };
      credentials.push({ email: spec.email, password, role: spec.role });
    }
    console.log(`  ${ACCOUNTS.filter((a) => a.role === 'admin').length} moderators, ` +
      `${ACCOUNTS.filter((a) => a.role === 'user').length} residents`);

    const admins = [users.admin, users.admin2];
    const residents = [users.user1, users.user2, users.user3, users.user4, users.user5];

    /* ------------------------- split by provenance ------------------------ */

    const all = LOCATIONS.locations;
    const communityCount = Math.round(all.length * COMMUNITY_SHARE);

    // Spread the resident-contributed ones through the list rather than
    // taking a block, so they are scattered across the city.
    const communityIndices = new Set();
    const stride = all.length / communityCount;
    for (let i = 0; i < communityCount; i++) {
      communityIndices.add(Math.min(all.length - 1, Math.round(i * stride + stride / 2)));
    }

    const adminLocations = all.filter((_, i) => !communityIndices.has(i));
    const communityLocations = all.filter((_, i) => communityIndices.has(i));

    /* ------------------------ administrator-entered ----------------------- */

    console.log(`\nEntering ${adminLocations.length} locations as administrators...`);
    const binIds = [];
    let photosMade = 0;

    const weights = dayWeights(random);

    for (const [index, spot] of adminLocations.entries()) {
      // Most field-surveyed locations are verified; a few are awaiting a
      // check, and a couple are flagged.
      const roll = random();
      const verification = roll < 0.72 ? 'verified' : roll < 0.97 ? 'community' : 'needs_recheck';

      const withPhoto = random() < 0.22;
      const photoPath = withPhoto ? await storePlaceholder('bins') : null;
      if (withPhoto) photosMade++;

      const rows = await q(
        'select public.binmap_create_bin($1, $2, $3, $4, $5, $6, $7, true, $8) as bin_id',
        [
          city.id,
          pick(admins).id,
          spot.lat,
          spot.lng,
          spot.description,
          photoPath,
          verification,
          'demo_seed',
        ],
      );
      const binId = rows[0].bin_id;
      binIds.push(binId);

      // Entered on some day of the simulated survey, not spread evenly:
      // `weights` clusters them the way real survey days cluster.
      const addedDay = pickDay(weights, random);
      const addedAt = timelineAt(addedDay, random);
      await q(
        `update public.bins set created_at = ${addedAt}, updated_at = ${addedAt} where id = $1`,
        [binId],
      );
      await q(
        `update public.admin_audit_log set created_at = ${addedAt}
          where entity_id = $1 and action = 'bin.created'`,
        [binId],
      );

      // A verification is a visit, so it gets a row in the history and a date
      // that cannot precede the day the bin was added. Some were checked the
      // same day; others days later.
      if (verification === 'verified' || verification === 'needs_recheck') {
        // Measured forward from the moment the bin was entered rather than
        // drawn independently, so a check can never land before the thing it
        // checked. Drawing both and hoping gave same-day pairs in the wrong
        // order, which is exactly the kind of detail that makes seeded data
        // look seeded.
        const sameDay = random() < 0.25;
        const laterDays = sameDay ? 0 : 1 + Math.floor(random() * 14);
        const laterHours = sameDay ? 1 + Math.floor(random() * 6) : Math.floor(random() * 9);
        const checkedAt =
          `least(${addedAt} + interval '${laterDays} days ${laterHours} hours', ` +
          `timestamptz '${TIMELINE.cap}')`;
        const surveyor = pick(admins).id;

        await q(
          `insert into public.bin_verifications
             (bin_id, verified_by, outcome, note, is_demo, created_at)
           values ($1, $2, $3, $4, true, ${checkedAt})`,
          [binId, surveyor, verification, null],
        );

        // Only a confirmation sets the bin's own last-checked date; a bin
        // flagged for re-check is, by definition, not confirmed.
        await q(
          verification === 'verified'
            ? `update public.bins set verified_at = ${checkedAt}, verified_by = $2 where id = $1`
            : 'update public.bins set verified_at = null, verified_by = null where id = $1',
          verification === 'verified' ? [binId, surveyor] : [binId],
        );
      } else {
        await q('update public.bins set verified_at = null, verified_by = null where id = $1', [
          binId,
        ]);
      }

      if ((index + 1) % 50 === 0) console.log(`  ${index + 1}/${adminLocations.length}`);
    }
    console.log(`  ${binIds.length} entered, ${photosMade} with photographs`);

    // A couple taken out of service, so bin administration has something to
    // show and the public map can be seen to exclude them.
    const deactivated = [binIds[binIds.length - 1], binIds[binIds.length - 7]];
    for (const binId of deactivated) {
      await q("update public.bins set status = 'inactive' where id = $1", [binId]);
      await q(
        `insert into public.admin_audit_log
           (administrator_id, action, entity_type, entity_id, details, created_at)
         values ($1, 'bin.deactivated', 'bin', $2, $3::jsonb, ${daysAgo(5)})`,
        [
          admins[0].id,
          binId,
          JSON.stringify({
            from: 'active',
            to: 'inactive',
            note: 'Qurilish ishlari tufayli vaqtincha olib qo‘yilgan.',
            is_demo: true,
          }),
        ],
      );
    }
    console.log(`  ${deactivated.length} taken out of service`);

    /* ------------------------- resident submissions ----------------------- */

    console.log(`\nCreating resident submissions...`);
    let approved = 0;

    for (const [index, spot] of communityLocations.entries()) {
      const submitter = residents[index % residents.length];
      const withPhoto = random() < 0.6;
      const photoPath = withPhoto ? await storePlaceholder('submissions') : null;
      // Sent on some day of the timeline, reviewed one or two days later, so
      // the approval never predates the proposal.
      const sentDay = pickDay(weights, random);
      const sentAt = timelineAt(sentDay, random);
      // Forward from the proposal. Clamping an independently drawn day to the
      // end of the timeline could land the review earlier in the same day.
      const reviewDays = 1 + Math.floor(random() * 3);
      const reviewedAt =
        `least(${sentAt} + interval '${reviewDays} days ${Math.floor(random() * 8)} hours', ` +
        `timestamptz '${TIMELINE.cap}')`;

      const inserted = await q(
        `insert into public.bin_submissions
           (city_id, submitted_by, latitude, longitude, description, photo_path, status, is_demo, created_at)
         values ($1, $2, $3, $4, $5, $6, 'pending', true, ${sentAt})
         returning id`,
        [city.id, submitter.id, spot.lat, spot.lng, spot.description, photoPath],
      );
      const submissionId = inserted[0].id;

      // The real approval path: creates the bin, links it back, audits it.
      const markVerified = random() < 0.35;
      const result = await q(
        'select public.binmap_approve_submission($1, $2, null, null, null, $3, $4, $5) as bin_id',
        [
          submissionId,
          pick(admins).id,
          pick(SUBMISSION_NOTES.approved),
          markVerified,
          photoPath ? photoPath.replace('submissions/', 'bins/') : null,
        ],
      );
      const binId = result[0].bin_id;
      binIds.push(binId);
      approved++;

      if (photoPath) {
        const publicPath = photoPath.replace('submissions/', 'bins/');
        if (useSupabaseStorage) {
          await fetch(`${supabaseUrl}/storage/v1/object/copy`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              bucketId: evidenceBucket,
              sourceKey: photoPath,
              destinationBucket: publicBucket,
              destinationKey: publicPath,
            }),
          }).catch(() => {});
        } else {
          const { copyFile, mkdir } = await import('node:fs/promises');
          const target = join(uploadRoot, publicPath);
          await mkdir(dirname(target), { recursive: true });
          await copyFile(join(uploadRoot, photoPath), target).catch(() => {});
        }
      }

      await q(`update public.bin_submissions set reviewed_at = ${reviewedAt} where id = $1`, [
        submissionId,
      ]);
      await q(
        `update public.bins set created_at = ${reviewedAt}, updated_at = ${reviewedAt}
          where id = $1`,
        [binId],
      );
      await q(
        `update public.admin_audit_log set created_at = ${reviewedAt} where entity_id = $1`,
        [submissionId],
      );

      // An approval marked "verified" means somebody went and looked, so it
      // gets a visit in the history like any other verification.
      if (markVerified) {
        const surveyor = pick(admins).id;
        await q(
          `insert into public.bin_verifications
             (bin_id, verified_by, outcome, note, is_demo, created_at)
           values ($1, $2, 'verified', null, true, ${reviewedAt})`,
          [binId, surveyor],
        );
        await q(
          `update public.bins set verified_at = ${reviewedAt}, verified_by = $2 where id = $1`,
          [binId, surveyor],
        );
      } else {
        await q('update public.bins set verified_at = null, verified_by = null where id = $1', [
          binId,
        ]);
      }
    }
    console.log(`  ${approved} approved and now on the map`);

    /* ----------------------- submissions still in play -------------------- */

    // Proposals that have not been decided yet, so the review queue is not
    // empty, plus a few rejections so the history is not either. These sit
    // slightly off existing locations, the way a real duplicate would.
    const pendingSpots = all.slice(5, 17).map((spot, i) => ({
      ...spot,
      lat: Number((spot.lat + (i % 2 ? 0.0012 : -0.0011)).toFixed(6)),
      lng: Number((spot.lng + (i % 3 ? 0.0009 : -0.0013)).toFixed(6)),
    }));

    const outcomes = { pending: 0, under_review: 0, rejected: 0 };

    for (const [index, spot] of pendingSpots.entries()) {
      const outcome = index < 5 ? 'pending' : index < 8 ? 'under_review' : 'rejected';
      const submitter = residents[index % residents.length];
      const withPhoto = random() < 0.65;
      const photoPath = withPhoto ? await storePlaceholder('submissions') : null;
      const age = 1 + index * 2;

      const inserted = await q(
        `insert into public.bin_submissions
           (city_id, submitted_by, latitude, longitude, description, photo_path, status, is_demo, created_at)
         values ($1, $2, $3, $4, $5, $6, 'pending', true, ${daysAgo(age)})
         returning id`,
        [city.id, submitter.id, spot.lat, spot.lng, spot.description, photoPath],
      );
      const submissionId = inserted[0].id;

      if (outcome === 'under_review') {
        await q('select public.binmap_start_submission_review($1, $2)', [
          submissionId,
          pick(admins).id,
        ]);
      } else if (outcome === 'rejected') {
        await q('select public.binmap_reject_submission($1, $2, $3)', [
          submissionId,
          pick(admins).id,
          pick(SUBMISSION_NOTES.rejected),
        ]);
        await q(
          `update public.bin_submissions set reviewed_at = ${daysAgo(Math.max(0, age - 1))}
            where id = $1`,
          [submissionId],
        );
      }
      outcomes[outcome]++;
    }

    // An internal note on one pending proposal, so the admin-only field is
    // visible in the dashboard and demonstrably absent from the user's view.
    const firstPending = await q(
      `select id from public.bin_submissions
        where is_demo and status = 'pending' order by created_at desc limit 1`,
    );
    if (firstPending.length > 0) {
      await q('update public.bin_submissions set internal_note = $2 where id = $1', [
        firstPending[0].id,
        'Joyida tekshirish uchun navbatga qo‘yildi. Foydalanuvchiga ko‘rinmaydi.',
      ]);
    }

    console.log(
      `  ${outcomes.pending} awaiting review, ${outcomes.under_review} in review, ` +
        `${outcomes.rejected} rejected`,
    );

    /* -------------------------------- reports ----------------------------- */

    // Proportional to the map rather than a fixed number, so changing how
    // many locations are seeded does not quietly leave the city under- or
    // over-reported.
    const REPORT_COUNT = Math.round(binIds.length * 0.21);
    console.log(`\nCreating ${REPORT_COUNT} problem reports...`);
    const statuses = {};
    const types = ['overflowing', 'overflowing', 'overflowing', 'damaged', 'damaged', 'missing', 'other'];

    // Reports cluster on a subset of bins — in a real city a handful of
    // locations generate most of the complaints.
    const reportable = binIds
      .filter((_, i) => i % 3 === 0)
      .slice(0, Math.round(binIds.length * 0.13));

    for (let i = 0; i < REPORT_COUNT; i++) {
      const binId = reportable[Math.floor(random() * reportable.length)];
      const type = pick(types);
      const reporter = residents[i % residents.length];
      const withPhoto = random() < 0.3;
      const photoPath = withPhoto ? await storePlaceholder('reports') : null;
      const age = Math.floor(random() * 28);

      const created = await q(
        'select public.binmap_create_report($1, $2, $3, $4, $5, true) as report_id',
        [binId, reporter.id, type, pick(REPORT_NOTES[type]), photoPath],
      );
      const reportId = created[0].report_id;
      await q(`update public.bin_reports set created_at = ${daysAgo(age)} where id = $1`, [reportId]);

      // Older reports have mostly been dealt with; recent ones are open.
      const roll = random();
      const status =
        age > 14
          ? roll < 0.75
            ? 'resolved'
            : 'rejected'
          : age > 6
            ? roll < 0.5
              ? 'resolved'
              : roll < 0.8
                ? 'confirmed'
                : 'reviewing'
            : roll < 0.35
              ? 'reviewing'
              : 'submitted';

      if (status !== 'submitted') {
        await q('select public.binmap_review_report($1, $2, $3, $4)', [
          reportId,
          pick(admins).id,
          status,
          random() < 0.6 ? pick(ADMIN_NOTES) : null,
        ]);
        const reviewAge = Math.max(0, age - 1);
        await q(
          `update public.bin_reports
              set resolved_at = case when status = 'resolved' then ${daysAgo(reviewAge)} else null end
            where id = $1`,
          [reportId],
        );
        await q(
          `update public.admin_audit_log set created_at = ${daysAgo(reviewAge)} where entity_id = $1`,
          [reportId],
        );
      }

      statuses[status] = (statuses[status] ?? 0) + 1;
    }
    console.log(
      `  ${Object.entries(statuses).map(([s, n]) => `${n} ${s}`).join(', ')}`,
    );

    /* ------------------------------ credentials ---------------------------- */

    const credentialsFile = resolve(process.cwd(), '.data/demo-credentials.txt');
    mkdirSync(dirname(credentialsFile), { recursive: true });
    writeFileSync(
      credentialsFile,
      [
        'BinMap Qarshi — demonstration accounts',
        'Generated by `npm run demo:seed`. Not committed (.data is gitignored).',
        'These exist only in this database and only for exploring the product.',
        '',
        ...credentials.map((c) => `${c.role.padEnd(5)}  ${c.email}  ${c.password}`),
        '',
      ].join('\n'),
      'utf8',
    );

    /* -------------------------------- summary ------------------------------ */

    const stats = await q(
      `select
         (select count(*) from public.bins where status = 'active')::int as active,
         (select count(*) from public.bins)::int as total,
         (select count(*) from public.bins where source = 'admin' and status = 'active')::int as by_admin,
         (select count(*) from public.bins where source = 'community' and status = 'active')::int as by_community,
         (select count(*) from public.bins where status = 'active' and verification_status = 'verified')::int as verified,
         (select count(*) from public.bins where status = 'active' and verification_status = 'needs_recheck')::int as recheck,
         (select count(*) from public.bin_submissions)::int as submissions,
         (select count(*) from public.bin_submissions where status in ('pending','under_review'))::int as queue,
         (select count(*) from public.bin_reports)::int as reports,
         (select count(*) from public.bin_reports where status in ('submitted','reviewing','confirmed'))::int as open_reports,
         (select count(*) from public.bin_verifications)::int as verifications,
         (select count(*) from public.admin_audit_log)::int as audit`,
    );
    /* ----------------------- timeline self-check -------------------------- */

    // The simulated history has to be coherent with itself: nothing checked
    // before it existed, nothing decided before it arrived, nothing outside
    // the window. Asserted here rather than in the browser suite because
    // this is the only place that sees the whole seeded picture, before any
    // live action adds a real timestamp to it.
    const INVARIANTS = [
      ['a bin checked before it was added',
       'select count(*)::int as n from public.bins where verified_at < created_at'],
      ['a verified bin with no date',
       "select count(*)::int as n from public.bins where verification_status = 'verified' and verified_at is null"],
      ['a last-checked date with no visit behind it',
       "select count(*)::int as n from public.bins b where b.verified_at is not null and not exists (select 1 from public.bin_verifications v where v.bin_id = b.id and v.outcome = 'verified')"],
      ['a submission reviewed before it was sent',
       'select count(*)::int as n from public.bin_submissions where reviewed_at < created_at'],
      ['a record dated in the future',
       'select count(*)::int as n from public.bins where created_at > now() or verified_at > now()'],
      ['a record dated outside the timeline',
       `select count(*)::int as n from public.bins where created_at::date not between date '${TIMELINE.start}' and date '${TIMELINE.end}'`],
    ];

    const broken = [];
    for (const [label, sql] of INVARIANTS) {
      const [{ n }] = await q(sql);
      if (n > 0) broken.push(`${n} ${label}`);
    }
    if (broken.length > 0) {
      throw new Error(`seeded history is inconsistent:\n  - ${broken.join('\n  - ')}`);
    }

    const s = stats[0];
    const share = (n) => `${Math.round((n / s.active) * 100)}%`;

    console.log('\n--------------------------------------------------------------');
    console.log('Demonstration environment ready.');
    console.log(`  bins on the public map     ${s.active}  (of ${s.total} total)`);
    console.log(`    entered by administrator ${s.by_admin}  (${share(s.by_admin)})`);
    console.log(`    submitted by residents   ${s.by_community}  (${share(s.by_community)})`);
    console.log(`  verified on site           ${s.verified}`);
    console.log(`  flagged for re-check       ${s.recheck}`);
    console.log(`  submissions                ${s.submissions}  (${s.queue} awaiting review)`);
    console.log(`  reports                    ${s.reports}  (${s.open_reports} open)`);
    console.log(`  verification visits        ${s.verifications}`);
    console.log(`  audit entries              ${s.audit}`);
    console.log('');
    console.log('  Accounts and passwords:    .data/demo-credentials.txt');
    console.log('  Remove everything:         npm run demo:clean');
    console.log('--------------------------------------------------------------\n');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('\nSeeding failed:', error.message);
  if (process.env.BINMAP_DEBUG) console.error(error);
  process.exit(1);
});
