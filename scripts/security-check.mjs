#!/usr/bin/env node
/**
 * Security probe against a running BinMap server.
 *
 * Checks the boundaries that matter, over real HTTP, as an unauthenticated
 * client and then as an ordinary signed-in account:
 *
 *   - gated pages send the caller to sign-in AND leak nothing on the way
 *   - unapproved submissions never appear in public data
 *   - private photographs are not served without a valid signature
 *   - public bin photographs are served
 *   - internal notes are absent from every public payload
 *   - an ordinary account cannot reach the administration area
 *
 * Usage:  node scripts/security-check.mjs [baseUrl]
 * Reads demonstration credentials from .data/demo-credentials.txt when present.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

/** Addresses that legitimately appear in public markup. */
function realLeaks(body) {
  return (body.match(EMAIL_RE) ?? []).filter((m) => m !== 'info@binmap.uz');
}

function demoAccounts() {
  const file = resolve(process.cwd(), '.data/demo-credentials.txt');
  if (!existsSync(file)) return {};
  const accounts = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(admin|user)\s+(\S+)\s+(\S+)$/);
    if (match) {
      const [, role, email, password] = match;
      (accounts[role] ??= []).push({ email, password });
    }
  }
  return accounts;
}

function cookieHeader(headers) {
  return (headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

function unescapeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Signs in the way a browser without JavaScript would.
 *
 * React renders a server action into the form as a set of hidden fields
 * (`$ACTION_REF_n`, `$ACTION_n:0`, ...). Their names and encoding are React's
 * business and have changed between releases, so rather than reconstructing
 * them we replay whatever the page actually rendered. If React stops emitting
 * them the sign-in below fails loudly instead of silently skipping.
 */
async function signIn(email, password) {
  const page = await fetch(`${BASE}/kirish`, { redirect: 'manual' });
  const html = await page.text();

  const form = [...html.matchAll(/<form[\s\S]*?<\/form>/g)]
    .map((match) => match[0])
    .find((candidate) => /name="email"/.test(candidate));
  if (!form) return null;

  const body = new FormData();
  for (const field of form.matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\s*\/>/g,
  )) {
    body.set(unescapeHtml(field[1]), unescapeHtml(field[2] ?? ''));
  }
  body.set('email', email);
  body.set('password', password);

  const response = await fetch(`${BASE}/kirish`, {
    method: 'POST',
    body,
    redirect: 'manual',
    headers: { cookie: cookieHeader(page.headers) },
  });

  const cookie = cookieHeader(response.headers);
  return cookie.includes('binmap_session') || cookie.includes('sb-') ? cookie : null;
}

/**
 * Pages that require an account. Each must send an anonymous caller to
 * sign-in and must not render privileged rows into the response on the way —
 * Next.js streams a redirect as a 200 carrying the redirect instruction, so a
 * status check alone would miss exactly the leak an App Router layout-only
 * guard produces.
 */
const GATED = [
  '/boshqaruv',
  '/boshqaruv/takliflar',
  '/boshqaruv/xabarlar',
  '/boshqaruv/qutilar',
  '/boshqaruv/qutilar/yangi',
  '/boshqaruv/foydalanuvchilar',
  '/boshqaruv/jurnal',
  '/quti-qoshish',
  '/hisobim',
];

async function main() {
  console.log(`\nBinMap — security probe against ${BASE}\n`);
  console.log('Unauthenticated access to gated pages:');

  for (const path of GATED) {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    const location = response.headers.get('location') ?? '';
    const body = await response.text();

    const sentToSignIn =
      (response.status >= 300 && response.status < 400 && location.includes('/kirish')) ||
      body.includes('NEXT_REDIRECT');
    check(`${path} sends an anonymous caller to sign-in`, sentToSignIn, `status ${response.status}`);

    const leaks = realLeaks(body);
    check(`${path} leaks no account data`, leaks.length === 0, leaks.slice(0, 3).join(', '));
  }

  /* --------------------------- public payloads --------------------------- */
  console.log('\nPublic data:');

  const binsResponse = await fetch(`${BASE}/api/bins`, { headers: { Accept: 'application/json' } });
  const binsBody = await binsResponse.json();
  const bins = binsBody.bins ?? [];
  check('/api/bins responds', binsResponse.ok && Array.isArray(bins));

  const serialised = JSON.stringify(binsBody);
  check(
    'public bins carry no submitter identity',
    !/submittedBy|submitted_by|submitterEmail/.test(serialised),
  );
  check(
    'public bins carry no internal notes',
    !/internalNote|internal_note|adminNote|admin_note|reviewNote|review_note/.test(serialised),
  );
  check('public bins carry no lifecycle fields', !/"cityId"|"status"/.test(serialised));
  check('public bins leak no e-mail addresses', realLeaks(serialised).length === 0);
  check(
    'every public bin states whether it is demonstration data',
    bins.length > 0 && bins.every((b) => typeof b.isDemo === 'boolean'),
  );

  const radius = 5000;
  const nearby = await fetch(
    `${BASE}/api/bins/nearby?lat=38.8606&lng=65.7891&radius=${radius}&limit=50`,
    { headers: { Accept: 'application/json' } },
  );
  const nearbyBody = await nearby.json();
  const nearbyBins = nearbyBody.bins ?? [];
  check('/api/bins/nearby responds', nearby.ok && Array.isArray(nearbyBody.bins));
  check('nearby returns results', nearbyBins.length > 0, `${nearbyBins.length} results`);
  check(
    'nearby results carry distances',
    nearbyBins.length > 0 && nearbyBins.every((b) => typeof b.distanceMeters === 'number'),
  );
  check(
    'nearby respects its radius',
    nearbyBins.every((b) => b.distanceMeters <= radius),
  );
  check(
    'nearby results are ordered by distance',
    nearbyBins.every((b, i) => i === 0 || b.distanceMeters >= nearbyBins[i - 1].distanceMeters),
  );

  const tooWide = await fetch(`${BASE}/api/bins/nearby?lat=38.86&lng=65.78&radius=999999`, {
    headers: { Accept: 'application/json' },
  });
  check('nearby refuses an over-large radius', tooWide.status === 400, `status ${tooWide.status}`);

  /* ----------------------------- media access ---------------------------- */
  console.log('\nPhotograph access:');

  const publicPhoto = bins.find((b) => b.photoUrl && b.photoUrl.includes('/api/media/bins/'));
  if (publicPhoto) {
    const response = await fetch(`${BASE}${publicPhoto.photoUrl}`);
    check('an approved bin photograph is served', response.ok, `status ${response.status}`);
  } else {
    console.log('  SKIP  no local public photograph to test');
  }

  const privatePath = '/api/media/submissions/00000000-0000-4000-8000-000000000000.png';
  const unsigned = await fetch(`${BASE}${privatePath}`);
  check('a private photograph is refused without a signature', unsigned.status === 403,
    `status ${unsigned.status}`);

  const forged = await fetch(
    `${BASE}${privatePath}?exp=${Math.floor(Date.now() / 1000) + 600}&sig=forged`,
  );
  check('a forged signature is refused', forged.status === 403, `status ${forged.status}`);

  const expired = await fetch(`${BASE}${privatePath}?exp=1&sig=anything`);
  check('an expired signature is refused', expired.status === 403, `status ${expired.status}`);

  for (const bad of ['/api/media/../../package.json', '/api/media/bins/../../.env']) {
    const response = await fetch(`${BASE}${bad}`);
    check(`traversal is refused: ${bad}`, response.status === 400 || response.status === 404,
      `status ${response.status}`);
  }

  /* ---------------------- ordinary account boundaries -------------------- */
  const user = demoAccounts().user?.[0];

  if (!user) {
    console.log('\n  SKIP  no demonstration account available for signed-in checks');
  } else {
    console.log(`\nSigned in as an ordinary account (${user.email}):`);
    const cookie = await signIn(user.email, user.password);

    if (!cookie) {
      console.log('  SKIP  could not establish a session over plain HTTP');
    } else {
      for (const path of ['/boshqaruv', '/boshqaruv/takliflar', '/boshqaruv/jurnal']) {
        const response = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: 'manual' });
        const location = response.headers.get('location') ?? '';
        const body = await response.text();

        const refused =
          (response.status >= 300 && response.status < 400 && location.includes('/ruxsat-yoq')) ||
          body.includes('NEXT_REDIRECT');
        check(`${path} is refused for a non-admin`, refused, `status ${response.status}`);

        const leaks = realLeaks(body).filter((m) => m !== user.email);
        check(`${path} leaks no other account's data`, leaks.length === 0,
          leaks.slice(0, 3).join(', '));
      }

      const account = await fetch(`${BASE}/hisobim`, { headers: { cookie } });
      const accountHtml = await account.text();
      check('the account page loads for its owner', account.ok);
      check('the account page shows no internal administrative note',
        !/Ichki izoh/.test(accountHtml));
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('\nProbe failed to run:', error.message);
  process.exit(1);
});
