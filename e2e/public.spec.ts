import { expect, test, type Page } from '@playwright/test';

/**
 * What a visitor can do without an account.
 *
 * Map exploration is deliberately open — only contributing needs a sign-in —
 * so these run with no session at all.
 */

/**
 * A single bin marker, not a cluster bubble.
 *
 * Both are `.binmap-marker`; only a bin carries the labelled SVG, which is
 * also how a screen reader tells them apart.
 */
function binMarker(page: Page) {
  return page.locator('.binmap-marker svg[role="img"]');
}

async function waitForMap(page: Page) {
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
}

/**
 * The map chrome is rendered twice — a column for desktop, a sheet for mobile
 * — and CSS shows whichever fits. Matching only the visible copy keeps one
 * assertion honest on both layouts.
 */
function onScreen(page: Page, text: string | RegExp) {
  return page.getByText(text).locator('visible=true').first();
}

/** On a phone the map chrome starts collapsed into the bottom sheet. */
async function openSheetOnMobile(page: Page, projectName: string) {
  if (projectName !== 'mobile') return;
  await page.getByRole('button', { name: /Yaqin atrofdagi qutilar/ }).first().click();
}

test.describe('the public site', () => {
  test('the homepage opens on the product, not on a pitch', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Quti qayerda?' })).toBeVisible();

    // The hero carries a live map rather than an illustration.
    await waitForMap(page);

    // Attribution is a condition of using the tiles.
    await expect(page.getByText('OpenStreetMap').first()).toBeVisible();

    await expect(page.getByRole('link', { name: 'Xaritani ochish' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quti qo‘shish' }).first()).toBeVisible();
  });

  test('the homepage reports real counts, not invented ones', async ({ page, request }) => {
    const { bins } = await (await request.get('/api/bins')).json();

    await page.goto('/');
    const counts = page.locator('dl').first();
    await expect(counts).toBeVisible();

    // The headline figure is the number of bins the API actually returns.
    await expect(counts).toContainText(String(bins.length));
  });

  test('the map shows Qarshi with markers and a confidence legend', async ({
    page,
  }, testInfo) => {
    await page.goto('/xarita');
    await waitForMap(page);
    await openSheetOnMobile(page, testInfo.project.name);

    // The legend is the key to the whole map, so it is shown, not hidden.
    await expect(onScreen(page, 'Belgilar izohi')).toBeVisible();
    await expect(onScreen(page, 'Joyida tekshirilgan')).toBeVisible();
    await expect(onScreen(page, 'Tekshirilmagan')).toBeVisible();

    await expect(binMarker(page).first()).toBeVisible();
    expect(await binMarker(page).count()).toBeGreaterThan(0);
  });

  test('selecting a marker opens its details with directions', async ({ page }) => {
    await page.goto('/xarita');
    await waitForMap(page);

    await binMarker(page).first().click();

    // The panel states the verification status in words, never by colour alone.
    await expect(
      onScreen(page, /Joyida tekshirilgan|Tekshirilmagan|Qayta tekshirish kerak/),
    ).toBeVisible();

    await expect(
      page.getByRole('link', { name: /Yo‘l ko‘rsatish/ }).locator('visible=true').first(),
    ).toBeVisible();

    // BinMap does not claim to compute walking routes itself.
    await expect(onScreen(page, /marshrutni o‘zi hisoblamaydi/)).toBeVisible();

    // Reporting needs an account, and the panel says so rather than failing later.
    await expect(onScreen(page, /tizimga kiring/)).toBeVisible();
  });

  test('a shared bin link opens that bin directly', async ({ page, request }) => {
    const { bins } = await (await request.get('/api/bins')).json();
    test.skip(bins.length === 0, 'no bins in the database');

    await page.goto(`/xarita?quti=${bins[0].id}`);

    // Rendered by the server, so the panel is in the first paint.
    await expect(
      page.getByRole('link', { name: /Yo‘l ko‘rsatish/ }).locator('visible=true').first(),
    ).toBeVisible();
  });

  test('every bin states who recorded it', async ({ page, request }, testInfo) => {
    const { bins } = await (await request.get('/api/bins')).json();
    test.skip(bins.length === 0, 'no bins in the database');

    // Provenance is a property of the record, not a label chosen per bin.
    for (const bin of bins as { source: string }[]) {
      expect(['admin', 'community']).toContain(bin.source);
    }

    await page.goto('/xarita');
    await waitForMap(page);
    await openSheetOnMobile(page, testInfo.project.name);

    // The legend reports the split, and the numbers are the ones the API gave.
    const admin = (bins as { source: string }[]).filter((b) => b.source === 'admin').length;
    await expect(onScreen(page, 'Ma’lumot manbasi')).toBeVisible();
    await expect(onScreen(page, 'Administrator kiritgan')).toBeVisible();
    await expect(onScreen(page, String(admin))).toBeVisible();

    // And the open bin repeats it, so a shared link carries the attribution.
    await page.goto(`/xarita?quti=${bins[0].id}`);
    await expect(
      page
        .getByText(bins[0].source === 'admin' ? 'Administrator kiritgan' : 'Foydalanuvchi yuborgan')
        .locator('visible=true')
        .first(),
    ).toBeVisible();
  });

  test('the interface carries no demonstration disclaimers', async ({ page }, testInfo) => {
    // Removing the labels must not turn into removing the separation: the
    // `is_demo` column below is what still keeps the two apart.
    const disclaimer = /namuna ma’lumotlari|namuna yozuvi|haqiqiy joylashuvlar emas|norasmiy/i;

    for (const path of ['/', '/xarita', '/tahlil', '/loyiha']) {
      await page.goto(path);
      if (path === '/xarita') {
        await waitForMap(page);
        await openSheetOnMobile(page, testInfo.project.name);
      }
      await expect(page.getByText(disclaimer)).toHaveCount(0);
    }
  });

  test('demonstration records stay distinguishable in the data', async ({ request }) => {
    const { bins } = await (await request.get('/api/bins')).json();
    test.skip(bins.length === 0, 'no bins in the database');

    // The flag travels with the record even though nothing renders it. This is
    // what `npm run demo:clean` keys on, and what the seeding guard protects.
    for (const bin of bins as { isDemo: unknown }[]) {
      expect(typeof bin.isDemo).toBe('boolean');
    }
  });

  test('the analysis page publishes its criteria and its limitations', async ({ page }) => {
    await page.goto('/tahlil');

    await expect(page.getByRole('heading', { level: 1, name: 'Geografik tahlil' })).toBeVisible();

    // A classification without a stated rule would be worse than none.
    await expect(page.getByText('Turkumlar va ularning mezonlari')).toBeVisible();
    await expect(page.getByText(/Mezon:/).first()).toBeVisible();

    // The inferences the data cannot support are published, not buried.
    await expect(page.getByText('Bu ma’lumot nimani ko‘rsatmaydi')).toBeVisible();
    await expect(page.getByText(/quti yo‘q degani emas/).first()).toBeVisible();
  });

  test('the project page explains verification and privacy', async ({ page }) => {
    await page.goto('/loyiha');

    await expect(page.getByRole('heading', { name: 'Ma’lumot qanday tekshiriladi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ma’lumotlar va maxfiylik' })).toBeVisible();

    // The EXIF promise is made in public, so it has to stay true.
    await expect(page.getByText(/EXIF/)).toBeVisible();
  });

  test('contributing requires an account', async ({ page }) => {
    await page.goto('/quti-qoshish');
    await expect(page).toHaveURL(/\/kirish/);

    await page.goto('/hisobim');
    await expect(page).toHaveURL(/\/kirish/);
  });

  test('the administration area is unreachable, and leaks nothing', async ({ page }) => {
    await page.goto('/boshqaruv/takliflar');
    await expect(page).toHaveURL(/\/kirish/);

    // The redirect alone is not enough: the response itself must not have
    // carried privileged rows on the way out. Fetched separately, because the
    // page has already navigated away by the time the assertion runs.
    const raw = await page.request.get('/boshqaruv/takliflar');
    expect(await raw.text()).not.toMatch(/@namuna\.binmap\.uz/);
  });

  test('Uzbek Latin characters render correctly', async ({ page }) => {
    await page.goto('/');
    // oʻ and gʻ are the characters most likely to break in a font fallback.
    const body = await page.locator('body').innerText();
    expect(body).toContain('qo‘shing');
    expect(body).toContain('ma’lumot');
  });

  test('every page has one h1 and a skip link', async ({ page }) => {
    for (const path of ['/', '/xarita', '/tahlil', '/loyiha', '/kirish']) {
      await page.goto(path);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('link', { name: 'Asosiy mazmunga o‘tish' })).toBeAttached();
    }
  });
});

/**
 * The map belongs to one city.
 *
 * Both of these regress silently — a Leaflet option dropped in a refactor
 * looks like nothing until someone scrolls out to a map of Central Asia — so
 * they are asserted from the outside, through the tile level the map actually
 * requests rather than through Leaflet's internals.
 */
test.describe('staying on Qarshi', () => {
  /** The `z` of the loaded tiles, which tracks the map's own zoom. */
  async function tileZoom(page: Page) {
    return page.evaluate(() => {
      const levels = [...document.querySelectorAll('img.leaflet-tile-loaded')]
        .map((tile) => Number((tile as HTMLImageElement).src.match(/\/(\d+)\/\d+\/\d+/)?.[1]))
        .filter((level) => Number.isFinite(level));
      return levels.length ? Math.min(...levels) : null;
    });
  }

  test('cannot be zoomed out to the region', async ({ page }) => {
    await page.goto('/xarita');
    await waitForMap(page);

    const zoomOut = page.locator('.leaflet-control-zoom-out');
    const opening = await tileZoom(page);
    expect(opening).not.toBeNull();

    // Far more presses than the floor is away, so this cannot pass by the
    // control simply being slow.
    for (let press = 0; press < 12; press++) {
      if (await zoomOut.evaluate((el) => el.classList.contains('leaflet-disabled'))) break;
      await zoomOut.click();
      await page.waitForTimeout(250);
    }

    // The control reports the limit rather than quietly doing nothing.
    await expect(zoomOut).toHaveClass(/leaflet-disabled/);
    await expect(zoomOut).toHaveAttribute('aria-disabled', 'true');

    // A city still fills the screen. Qarshi at tile level 11 or below would be
    // a dot in a map of the region.
    const floor = await tileZoom(page);
    expect(floor).toBeGreaterThanOrEqual(12);

    // Pressing on past the limit changes nothing.
    await zoomOut.click({ force: true });
    await page.waitForTimeout(400);
    expect(await tileZoom(page)).toBe(floor);
  });

  test('one wheel notch is a fraction of a zoom level', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'wheel is a desktop input');

    await page.goto('/xarita');
    await waitForMap(page);

    const before = await tileZoom(page);
    await page.locator('.leaflet-container').hover();
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(600);

    // Leaflet's defaults move two whole levels on one notch. A quarter-level
    // step does not cross a tile boundary at all, so the level is unchanged.
    expect(await tileZoom(page)).toBe(before);
  });
});

/**
 * Density.
 *
 * Every bin has to be reachable. A pin drawn on top of another one is not:
 * the browser hands the click to whichever is in front, and the one beneath
 * can never be opened. Raising the seeded locations from 225 to 420 made that
 * real, and it failed as a mysterious "subtree intercepts pointer events"
 * three tests away from the cause. Assert it directly instead.
 */
test.describe('marker density', () => {
  test('no bin marker is hidden underneath another', async ({ page }) => {
    await page.goto('/xarita');
    await waitForMap(page);

    const overlapping = await page.evaluate(() => {
      const pins = [...document.querySelectorAll('.binmap-marker')]
        .filter((node) => node.querySelector('svg[role="img"]'))
        .map((node) => node.getBoundingClientRect());

      const clashes: string[] = [];
      for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
          const a = pins[i];
          const b = pins[j];
          const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (across > 0 && down > 0) {
            clashes.push(
              `${Math.round(across)}x${Math.round(down)}px overlap near ` +
                `${Math.round(a.left)},${Math.round(a.top)}`,
            );
          }
        }
      }
      return clashes;
    });

    expect(overlapping, 'a pin drawn over another one cannot be clicked').toEqual([]);
  });
});

test.describe('the map on a phone', () => {
  test('fits the screen without sideways scrolling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile only');

    await page.goto('/xarita');
    await waitForMap(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the homepage fits the screen too', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile only');

    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('the bottom sheet reveals the nearby list', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile only');

    await page.goto('/xarita');
    await waitForMap(page);

    await page.getByRole('button', { name: /Yaqin atrofdagi qutilar/ }).first().click();
    await expect(page.getByRole('button', { name: /Joylashuvimni aniqlash/ })).toBeVisible();
  });

  test('controls meet the minimum touch target', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile only');

    await page.goto('/');
    const cta = page.getByRole('link', { name: 'Xaritani ochish' }).first();
    const box = await cta.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
