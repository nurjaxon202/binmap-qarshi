/**
 * Captures the documentation screenshots in docs/screenshots.
 *
 *   npm run demo:seed       # so the map has something on it
 *   npm run dev             # or set BINMAP_SHOT_URL at a running server
 *   node scripts/screenshots.mjs
 *
 * Signs in with a demonstration moderator account so the administration
 * pages can be photographed. Reads the credentials from the file the seeder
 * writes, which is why this only ever works against a demonstration
 * database: there is nothing to read in production.
 */
import { chromium, devices } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BASE = process.env.BINMAP_SHOT_URL ?? 'http://localhost:3000';
const OUT = resolve(process.cwd(), 'docs/screenshots');

async function moderator() {
  const file = resolve(process.cwd(), '.data/demo-credentials.txt');
  if (!existsSync(file)) return null;
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^admin\s+(\S+)\s+(\S+)$/);
    if (match) return { email: match[1], password: match[2] };
  }
  return null;
}

/** Leaflet keeps painting after load; wait for tiles rather than a timer. */
async function settleMap(page) {
  await page.locator('.leaflet-container').first().waitFor({ timeout: 60_000 });
  await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const tiles = [...document.querySelectorAll('.leaflet-tile')];
      return tiles.length > 0 && tiles.every((t) => t.classList.contains('leaflet-tile-loaded'));
    },
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(600);
}

const SHOTS = [
  { name: 'homepage', path: '/', map: true, fullPage: false },
  { name: 'map', path: '/xarita', map: true, fullPage: false },
  { name: 'analysis', path: '/tahlil', map: true, fullPage: true },
  { name: 'dashboard', path: '/boshqaruv', admin: true, fullPage: true },
  { name: 'admin-bins', path: '/boshqaruv/qutilar', admin: true, fullPage: false },
  { name: 'admin-submissions', path: '/boshqaruv/takliflar', admin: true, fullPage: false },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const account = await moderator();

for (const profile of [
  { suffix: '', context: { viewport: { width: 1440, height: 900 }, locale: 'uz-UZ' } },
  { suffix: '-mobile', context: { ...devices['Pixel 7'], locale: 'uz-UZ' } },
]) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();

  // Repeated runs can trip the sign-in rate limiter, which is doing its job.
  // Photograph what is reachable rather than failing the whole run, and say
  // which pages were missed.
  let signedIn = false;
  if (account) {
    await page.goto(`${BASE}/kirish`);
    await page.getByLabel('Elektron pochta').fill(account.email);
    await page.getByLabel('Parol', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Kirish', exact: true }).click();
    signedIn = await page
      .waitForURL((url) => !url.pathname.includes('/kirish'), { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!signedIn) {
      console.warn('could not sign in (rate limited?) — skipping administration pages');
    }
  }

  for (const shot of SHOTS) {
    if (shot.admin && !signedIn) continue;
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
    if (shot.map) await settleMap(page);
    const file = join(OUT, `${shot.name}${profile.suffix}.png`);
    await page.screenshot({ path: file, fullPage: shot.fullPage });
    console.log('wrote', file);
  }

  await context.close();
}

await browser.close();
console.log('\nScreenshots in', OUT);
