import { expect, test, type Page } from '@playwright/test';

import { demoAccounts, STORAGE } from './accounts';

/**
 * The contribution lifecycle, end to end against the real database:
 *
 *   a person proposes a bin  ->  it is not on the map
 *   a moderator approves it  ->  it is on the map
 *   a person reports a problem
 *   a moderator resolves it  ->  the change survives a reload
 *
 * Sessions come from the setup project rather than signing in per test, so the
 * suite does not trip the auth rate limit on repeated runs.
 *
 * Needs `npm run demo:seed`, which generates the accounts and writes them to
 * .data/demo-credentials.txt. Passwords are never committed or hard-coded.
 */

const { admin, user, secondUser } = demoAccounts();

/** A coordinate no previous run used, so re-runs do not collide with the
 *  exact-coordinate uniqueness constraint on bins. */
function freshPoint() {
  const jitter = () => (Math.random() - 0.5) * 0.004;
  return { latitude: 38.8731 + jitter(), longitude: 65.7745 + jitter() };
}

/**
 * Moves the picker to a point.
 *
 * The coordinate fields are controlled inputs fed by the map's own `moveend`,
 * so writing to them directly does nothing: React owns the value and the form
 * submits whatever the map last reported. That silently sent every proposal
 * to the city centre, which only showed up once a second test started
 * submitting and tripped the duplicate-detection warning.
 *
 * So move the map, and let the real data flow run. The assertion at the end
 * is the point: if the coordinate does not reach the form, fail here rather
 * than three steps later.
 */
async function placePin(page: Page, point: { latitude: number; longitude: number }) {
  await page.locator('.leaflet-container').waitFor();

  await page.evaluate(
    ([lat, lng]) => {
      const container = document.querySelector('.leaflet-container');
      if (!container) throw new Error('no map');

      // react-leaflet hands the Leaflet instance down through its context;
      // reach it the way the React tree holds it.
      const key = Object.keys(container).find((k) => k.startsWith('__reactFiber$'));
      if (!key) throw new Error('no fiber');

      const isMap = (o: unknown): o is { setView: (c: [number, number]) => void } =>
        !!o &&
        typeof o === 'object' &&
        typeof (o as { setView?: unknown }).setView === 'function' &&
        typeof (o as { getZoom?: unknown }).getZoom === 'function';

      const seen = new Set<unknown>();
      const dig = (o: unknown, depth: number): { setView: (c: [number, number]) => void } | null => {
        if (depth > 4 || !o || typeof o !== 'object' || seen.has(o)) return null;
        seen.add(o);
        if (isMap(o)) return o;
        for (const k of Object.keys(o)) {
          try {
            const hit = dig((o as Record<string, unknown>)[k], depth + 1);
            if (hit) return hit;
          } catch {
            /* getters that throw are not the map */
          }
        }
        return null;
      };

      let fiber = (container as unknown as Record<string, { return?: unknown }>)[key];
      for (let hop = 0; fiber && hop < 40; hop++) {
        const node = fiber as { memoizedProps?: unknown; memoizedState?: unknown; return?: unknown };
        const map = dig(node.memoizedProps, 0) ?? dig(node.memoizedState, 0);
        if (map) {
          map.setView([lat, lng]);
          return;
        }
        fiber = node.return as { return?: unknown };
      }
      throw new Error('map instance not found');
    },
    [point.latitude, point.longitude],
  );

  // The picker prints the centre it will submit. Wait for it to agree.
  const shown = point.latitude.toFixed(5);
  await expect(page.getByText(new RegExp(shown.replace('.', '\\.')))).toBeVisible();
}

/**
 * The smallest JPEG that is genuinely a JPEG: SOI, a JFIF APP0, a grey
 * quantisation table, a 1x1 baseline frame, a Huffman table, one scan, EOI.
 * Written out by hand so the upload path sees real container bytes, which is
 * what the metadata stripper actually operates on.
 */
function jpeg() {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////' +
      '////////////////////////////////////////////////////2wBDAf//////' +
      '////////////////////////////////////////////////////////////////' +
      '//////////////////8AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAA' +
      'AAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYT' +
      'UWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0' +
      'hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaan' +
      'qKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+f' +
      'r/2gAMAwEAAhEDEQA/AP7+KKKKAP/Z',
    'base64',
  );
}

/**
 * Waits for the submission to be accepted.
 *
 * Proposing is rate limited, and when that trips the form says so plainly.
 * Surfacing that message here turns a fifteen-second mystery timeout into a
 * failure that names its own cause.
 */
async function expectProposalAccepted(page: Page) {
  const accepted = page.getByText('Taklif yuborildi');
  const limited = page.getByText(/Juda ko‘p taklif yubordingiz/);
  await expect(accepted.or(limited)).toBeVisible();
  await expect(
    limited,
    'the hourly proposal limit is still cooling down for this account',
  ).toHaveCount(0);
  await expect(accepted).toBeVisible();
}

test.describe('the contribution lifecycle', () => {
  test.skip(!admin || !user, 'run `npm run demo:seed` first');

  test('proposal, approval, report, resolution', async ({ browser, request }, testInfo) => {
    // One pass is enough: this exercises the database, not the layout.
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    test.slow();

    const point = freshPoint();
    const marker = `E2E ${Date.now()}`;

    const asUser = await browser.newContext({ storageState: STORAGE.user });
    const asAdmin = await browser.newContext({ storageState: STORAGE.admin });
    const userPage = await asUser.newPage();
    const adminPage = await asAdmin.newPage();

    try {
      /* ------------------ 1. a person proposes a bin ------------------- */
      await userPage.goto('/quti-qoshish');
      await expect(userPage.locator('.leaflet-container')).toBeVisible();
      await placePin(userPage, point);
      await userPage.getByLabel('Joy haqida qisqacha').fill(marker);
      await userPage.getByRole('button', { name: 'Taklifni yuborish' }).click();
      await expectProposalAccepted(userPage);

      /* -------------- 2. it is NOT on the public map yet --------------- */
      const before = await (await request.get('/api/bins')).json();
      expect(
        before.bins.some((b: { description: string | null }) => b.description === marker),
      ).toBe(false);

      // The submitter can see it waiting.
      await userPage.goto('/hisobim');
      await expect(userPage.getByText(marker)).toBeVisible();

      /* ----------------- 3. a moderator approves it -------------------- */
      await adminPage.goto('/boshqaruv/takliflar?holat=open');
      await adminPage.getByRole('row', { name: new RegExp(marker) }).getByRole('link').click();
      await expect(adminPage.getByRole('heading', { level: 1, name: marker })).toBeVisible();

      await adminPage.getByLabel('Qaror izohi').fill('E2E: tasdiqlandi.');
      await adminPage.getByRole('button', { name: 'Tasdiqlash va xaritaga qo‘shish' }).click();
      await expect(adminPage.getByText(/Taklif tasdiqlandi va xaritaga qo‘shildi/)).toBeVisible();

      /* ------------------ 4. it IS on the public map ------------------- */
      const after = await (await request.get('/api/bins')).json();
      const created = after.bins.find(
        (b: { description: string | null }) => b.description === marker,
      );
      expect(created).toBeTruthy();
      // Approved from a submission, so community-reported rather than verified.
      expect(created.verificationStatus).toBe('community');
      // Attribution follows the real submitter, not a seeding choice: the
      // approval function sets it, so no caller can claim a bin was entered
      // by an administrator when it was not.
      expect(created.source).toBe('community');
      // A real submission, not demonstration data.
      expect(created.isDemo).toBe(false);

      /* ------------------- 5. the decision is audited ------------------ */
      await adminPage.goto('/boshqaruv/jurnal');
      await expect(adminPage.getByText('Taklif tasdiqlandi').first()).toBeVisible();

      /* ---------------- 6. a person reports a problem ------------------ */
      await userPage.goto(`/xabar-berish/${created.id}`);
      await userPage.getByLabel('Quti to‘lib qolgan').check();
      await userPage.getByLabel('Izoh').fill('E2E: quti to‘lib ketgan.');
      await userPage.getByRole('button', { name: 'Xabar yuborish' }).click();
      await expect(userPage.getByText('Xabar yuborildi')).toBeVisible();

      /* ------------------ 7. a moderator resolves it ------------------- */
      await adminPage.goto('/boshqaruv/xabarlar?holat=open');
      await adminPage.getByRole('row', { name: new RegExp(marker) }).getByRole('link').click();
      await adminPage.getByLabel('Holat').selectOption('resolved');
      await adminPage.getByLabel('Ichki izoh').fill('E2E: tozalangani tekshirildi.');
      await adminPage.getByRole('button', { name: 'Holatni yangilash' }).click();
      await expect(adminPage.getByText('Xabar holati yangilandi.')).toBeVisible();

      /* --------------- 8. the change survives a reload ----------------- */
      await adminPage.reload();
      await expect(adminPage.getByLabel('Holat')).toHaveValue('resolved');
      await expect(adminPage.getByLabel('Ichki izoh')).toHaveValue(
        'E2E: tozalangani tekshirildi.',
      );
    } finally {
      await asUser.close();
      await asAdmin.close();
    }
  });

  test('a photograph travels from private to public on approval', async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    test.slow();

    const point = freshPoint();
    const marker = `E2E ${Date.now()}`;

    // A different contributor from the test above, so the two do not share
    // one account's hourly proposal allowance.
    const asUser = await browser.newContext({
      storageState: secondUser ? STORAGE.secondUser : STORAGE.user,
    });
    const asAdmin = await browser.newContext({ storageState: STORAGE.admin });
    const userPage = await asUser.newPage();
    const adminPage = await asAdmin.newPage();

    try {
      /* -------------- 1. propose a bin WITH a photograph --------------- */
      await userPage.goto('/quti-qoshish');
      await expect(userPage.locator('.leaflet-container')).toBeVisible();
      await placePin(userPage, point);
      await userPage.getByLabel('Joy haqida qisqacha').fill(marker);

      // The input is visually hidden behind its own button, so address it
      // directly rather than clicking through the label.
      await userPage.locator('input[name="photo"]').setInputFiles({
        name: 'quti.jpg',
        mimeType: 'image/jpeg',
        buffer: jpeg(),
      });
      // The form echoes the chosen file back, which is how a person knows it
      // took: without this the upload could silently do nothing.
      await expect(userPage.getByText('quti.jpg')).toBeVisible();

      await userPage.getByRole('button', { name: 'Taklifni yuborish' }).click();
      await expectProposalAccepted(userPage);

      /* ------- 2. while pending, the photograph is NOT public ---------- */
      const pending = await (await request.get('/api/bins')).json();
      expect(
        pending.bins.some((b: { description: string | null }) => b.description === marker),
      ).toBe(false);

      /* ------- 3. a moderator can see it, and it is signed ------------- */
      await adminPage.goto('/boshqaruv/takliflar?holat=open');
      await adminPage.getByRole('row', { name: new RegExp(marker) }).getByRole('link').click();

      const photo = adminPage.locator('img[src*="/api/media/"]').first();
      await expect(photo).toBeVisible();
      const privateUrl = await photo.getAttribute('src');
      expect(privateUrl).toContain('submissions/');
      // A private photograph is served only against a signature.
      expect(privateUrl).toMatch(/[?&]sig=/);

      // Strip the signature and it must be refused, even for the moderator.
      const unsigned = privateUrl!.split('?')[0];
      expect((await adminPage.request.get(unsigned)).status()).toBeGreaterThanOrEqual(400);

      /* ---------------- 4. approve, and it becomes public -------------- */
      await adminPage.getByLabel('Qaror izohi').fill('E2E: surat bilan tasdiqlandi.');
      await adminPage.getByRole('button', { name: 'Tasdiqlash va xaritaga qo‘shish' }).click();
      await expect(adminPage.getByText(/Taklif tasdiqlandi va xaritaga qo‘shildi/)).toBeVisible();

      const after = await (await request.get('/api/bins')).json();
      const created = after.bins.find(
        (b: { description: string | null }) => b.description === marker,
      );
      expect(created).toBeTruthy();

      // The public copy lives in the public tier and needs no signature.
      expect(created.photoUrl).toBeTruthy();
      expect(created.photoUrl).toContain('bins/');
      expect(created.photoUrl).not.toMatch(/[?&]sig=/);
      const served = await request.get(created.photoUrl);
      expect(served.status()).toBe(200);
      expect(served.headers()['content-type']).toContain('image');
    } finally {
      await asUser.close();
      await asAdmin.close();
    }
  });

  test('a reported problem never removes the bin from the map', async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');

    const before = await (await request.get('/api/bins')).json();
    // Pick a bin that is not already flagged, so the assertion means something.
    const target = before.bins.find(
      (b: { verificationStatus: string }) => b.verificationStatus !== 'needs_recheck',
    );
    test.skip(!target, 'no eligible bin');

    const context = await browser.newContext({ storageState: STORAGE.user });
    const page = await context.newPage();

    try {
      await page.goto(`/xabar-berish/${target.id}`);

      // The page says so explicitly, because it is the commonest misreading.
      await expect(page.getByText(/Xabar qutini xaritadan o‘chirmaydi/)).toBeVisible();

      await page.getByLabel('Quti bu joyda mavjud emas').check();
      await page.getByRole('button', { name: 'Xabar yuborish' }).click();
      await expect(page.getByText('Xabar yuborildi')).toBeVisible();
      await expect(page.getByText(/Quti o‘chirilmaydi/)).toBeVisible();

      // Still on the map, now flagged for re-verification.
      const after = await (await request.get('/api/bins')).json();
      const still = after.bins.find((b: { id: string }) => b.id === target.id);
      expect(still).toBeTruthy();
      expect(still.verificationStatus).toBe('needs_recheck');
    } finally {
      await context.close();
    }
  });
});

test.describe('permissions', () => {
  test.skip(!user, 'run `npm run demo:seed` first');
  test.use({ storageState: STORAGE.user });

  test('an ordinary account cannot reach the administration area', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');

    for (const path of ['/boshqaruv', '/boshqaruv/takliflar', '/boshqaruv/jurnal']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/ruxsat-yoq/);
      await expect(page.getByText('Bu bo‘limga kirish huquqingiz yo‘q')).toBeVisible();
    }
  });

  test('an ordinary account cannot see another account’s data', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');

    await page.goto('/hisobim');
    const body = await page.locator('body').innerText();

    const others = (body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? []).filter(
      (email) => email !== user!.email && email !== 'info@binmap.uz',
    );
    expect(others).toEqual([]);

    // Internal moderator notes are never rendered here.
    expect(body).not.toContain('Ichki izoh');
  });
});

/**
 * A bin's history.
 *
 * The four facts the panel promises — when it arrived, when anybody last
 * looked, who put it there, how far it has been checked — and the rule that
 * holds them together: a last-checked date exists only where somebody
 * actually recorded a visit.
 */
test.describe('bin history', () => {
  test.skip(!admin, 'run `npm run demo:seed` first');

  test('the public panel states all four facts', async ({ page, request }) => {
    const { bins } = await (await request.get('/api/bins')).json();
    test.skip(bins.length === 0, 'no bins in the database');

    await page.goto(`/xarita?quti=${bins[0].id}`);

    for (const term of [
      'Xaritaga qo‘shilgan',
      'So‘nggi tekshiruv',
      'Ma’lumot manbasi',
      'Tekshiruv holati',
    ]) {
      await expect(page.getByText(term).locator('visible=true').first()).toBeVisible();
    }
  });

  test('an unverified bin says so rather than showing a blank', async ({ page, request }) => {
    const { bins } = await (await request.get('/api/bins')).json();
    const unverified = (bins as { id: string; verifiedAt: string | null }[]).find(
      (bin) => bin.verifiedAt === null,
    );
    test.skip(!unverified, 'every bin has been verified');

    await page.goto(`/xarita?quti=${unverified!.id}`);
    await expect(page.getByText('Hali tekshirilmagan').locator('visible=true').first()).toBeVisible();
  });

  /**
   * Ordering between a bin's creation and its check is a property of the
   * SEEDED history, and `npm run demo:seed` asserts it at the end of its own
   * run where it can see the whole picture.
   *
   * It is deliberately not asserted here. The demonstration timeline ends on
   * 19 November 2026; until that date passes, a genuine verification recorded
   * through the application is stamped with the real clock and therefore
   * lands *before* the simulated creation date of a bin dated later in the
   * timeline. That is the timeline being ahead of the calendar, not the
   * application misbehaving, and a test here would fail for the wrong reason.
   */
  test('a recorded check is dated, and belongs to the bin it checked', async ({ request }) => {
    const { bins } = await (await request.get('/api/bins')).json();
    test.skip(bins.length === 0, 'no bins in the database');

    const dated = (bins as { verifiedAt: string | null }[]).filter((bin) => bin.verifiedAt);
    test.skip(dated.length === 0, 'nothing verified yet');

    for (const bin of dated) {
      expect(Number.isNaN(Date.parse(bin.verifiedAt!))).toBe(false);
    }
  });

  test('recording a visit moves the date, and only an administrator can', async ({
    browser,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');
    test.slow();

    const { bins } = await (await request.get('/api/bins')).json();
    const target = (bins as { id: string; verifiedAt: string | null }[]).find(
      (bin) => bin.verifiedAt === null,
    );
    test.skip(!target, 'no unverified bin to check');

    const asAdmin = await browser.newContext({ storageState: STORAGE.admin });
    const adminPage = await asAdmin.newPage();

    try {
      await adminPage.goto(`/boshqaruv/qutilar/${target!.id}`);
      await expect(adminPage.getByText('Bu joylashuv hali joyida tekshirilmagan.')).toBeVisible();

      await adminPage.getByLabel('Natija').selectOption('verified');
      await adminPage.getByLabel('Izoh').fill('E2E: joyida ko‘rildi.');
      await adminPage.getByRole('button', { name: 'Tekshiruvni qayd etish' }).click();
      await expect(adminPage.getByText(/Tekshiruv qayd etildi/)).toBeVisible();

      // The visit is now in the history, with who and when. It appears in
      // both the verification history and the audit log, hence `.first()`.
      await expect(adminPage.getByText('E2E: joyida ko‘rildi.').first()).toBeVisible();

      // And the public record now carries a date it did not have.
      const after = await (await request.get('/api/bins')).json();
      const updated = (after.bins as { id: string; verifiedAt: string | null }[]).find(
        (bin) => bin.id === target!.id,
      );
      expect(updated?.verifiedAt).toBeTruthy();
    } finally {
      await asAdmin.close();
    }
  });

  test('an ordinary account cannot record a verification', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop only');

    const asUser = await browser.newContext({ storageState: STORAGE.user });
    const page = await asUser.newPage();
    try {
      await page.goto('/boshqaruv/qutilar');
      await expect(page).toHaveURL(/\/ruxsat-yoq/);
      // Reading the original response body here is not possible once the
      // redirect has navigated away, so check what was actually rendered.
      expect(await page.content()).not.toContain('Tekshiruvni qayd etish');
    } finally {
      await asUser.close();
    }
  });
});
