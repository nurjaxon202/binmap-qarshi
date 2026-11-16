import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test as setup, type Browser, type Page } from '@playwright/test';

import { demoAccounts, STORAGE, type Account } from './accounts';

/**
 * Signs in once per role and saves the session for the rest of the suite.
 *
 * Not just a speed-up: sign-in is rate limited (fifteen attempts per fifteen
 * minutes), and a suite that signed in for every test tripped that limit on a
 * second run. Reusing the session means a handful of sign-ins per run instead
 * of dozens — and the limiter stays as strict as it should be.
 *
 * A saved session that still works is reused rather than replaced, so running
 * the suite repeatedly costs no sign-ins at all. That matters while iterating:
 * the limit is correct, and the tests should live within it rather than ask
 * for it to be raised.
 */

const accounts = demoAccounts();

/** True when the stored cookies still reach a page only an account can see. */
async function sessionStillValid(browser: Browser, path: string) {
  if (!existsSync(path)) return false;

  const context = await browser.newContext({ storageState: path });
  try {
    const response = await context.request.get('/hisobim');
    if (!response.ok()) return false;
    // A signed-out caller gets the sign-in page instead; this heading belongs
    // to the account page itself.
    return (await response.text()).includes('Mening takliflarim');
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

async function saveSession(page: Page, account: Account, path: string) {
  mkdirSync(resolve(process.cwd(), '.auth'), { recursive: true });

  await page.goto('/kirish');
  await page.getByLabel('Elektron pochta').fill(account.email);
  await page.getByLabel('Parol').fill(account.password);
  await page.getByRole('button', { name: 'Kirish' }).click();

  await expect(
    page,
    'sign-in failed — the auth rate limit may still be cooling down, or the seeded password has changed',
  ).toHaveURL(/\/hisobim/);

  await page.context().storageState({ path });
}

async function ensureSession(browser: Browser, page: Page, account: Account, path: string) {
  if (await sessionStillValid(browser, path)) return;
  await saveSession(page, account, path);
}

setup('sign in as a contributor', async ({ browser, page }) => {
  setup.skip(!accounts.user, 'run `npm run demo:seed` first');
  await ensureSession(browser, page, accounts.user!, STORAGE.user);
});

setup('sign in as a second contributor', async ({ browser, page }) => {
  setup.skip(!accounts.secondUser, 'only one contributor account was seeded');
  await ensureSession(browser, page, accounts.secondUser!, STORAGE.secondUser);
});

setup('sign in as a moderator', async ({ browser, page }) => {
  setup.skip(!accounts.admin, 'run `npm run demo:seed` first');
  await ensureSession(browser, page, accounts.admin!, STORAGE.admin);
});
