/**
 * Waits until an account can sign in again.
 *
 * Sign-in is limited to fifteen attempts per fifteen minutes per address, and
 * iterating on the browser suite can spend that. A blocked attempt is refused
 * before it is recorded, so polling does not extend the window.
 *
 *   node scripts/wait-for-auth.mjs            # the first seeded moderator
 *   node scripts/wait-for-auth.mjs <email>    # a particular address
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BINMAP_URL ?? 'http://localhost:3000';
const DEADLINE_MS = 20 * 60 * 1000;

function account(role, wanted) {
  const file = resolve(process.cwd(), '.data/demo-credentials.txt');
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(admin|user)\s+(\S+)\s+(\S+)$/);
    if (!match) continue;
    const [, found, email, password] = match;
    if (wanted ? email === wanted : found === role) return { email, password };
  }
  return null;
}

const unescapeHtml = (v) =>
  v
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const cookiesOf = (h) => (h.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

async function attempt({ email, password }) {
  const page = await fetch(`${BASE}/kirish`, { redirect: 'manual' });
  const html = await page.text();
  const form = [...html.matchAll(/<form[\s\S]*?<\/form>/g)]
    .map((m) => m[0])
    .find((f) => /name="email"/.test(f));
  if (!form) return { ok: false, why: 'no sign-in form' };

  const body = new FormData();
  for (const f of form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\s*\/>/g)) {
    body.set(unescapeHtml(f[1]), unescapeHtml(f[2] ?? ''));
  }
  body.set('email', email);
  body.set('password', password);

  const res = await fetch(`${BASE}/kirish`, {
    method: 'POST',
    body,
    redirect: 'manual',
    headers: { cookie: cookiesOf(page.headers) },
  });
  const text = await res.text();
  if (cookiesOf(res.headers).includes('binmap_session')) return { ok: true };
  const limited = text.match(/Juda ko‘p urinish\.?\s*([^<"]{0,40})/);
  return { ok: false, why: limited ? `rate limited (${limited[1].trim()})` : 'refused' };
}

const who = account('admin', process.argv[2]);
if (!who) {
  console.error('no such account in .data/demo-credentials.txt — run `npm run demo:seed`');
  process.exit(1);
}

console.log(`waiting until ${who.email} can sign in...`);
const started = Date.now();
for (let round = 1; Date.now() - started < DEADLINE_MS; round++) {
  const result = await attempt(who);
  if (result.ok) {
    console.log(`signed in after ${Math.round((Date.now() - started) / 1000)}s`);
    process.exit(0);
  }
  console.log(`  attempt ${round}: ${result.why}`);
  await new Promise((r) => setTimeout(r, 30_000));
}

console.error('still blocked after 20 minutes — check the server rather than waiting longer');
process.exit(1);
