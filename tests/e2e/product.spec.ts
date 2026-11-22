import { test, expect, type Page } from '@playwright/test';
import type { Data } from '../../src/lib/service';
async function ready(page: Page) {
  await expect(page.getByRole('main')).toBeVisible();
}
async function demo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the live demo', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Make room for somewhere new.', exact: false }),
  ).toBeVisible();
}
async function go(page: Page, view: string, trip?: string) {
  await page.goto('/app/' + view + (trip ? '?trip=' + trip : ''));
  await ready(page);
  if (view !== 'trips')
    await expect(page.getByRole('combobox', { name: 'Selected journey' })).toBeVisible();
}
async function data(page: Page, trip?: string): Promise<Data> {
  const r = await page.request.get('/api/data' + (trip ? '?trip=' + trip : ''));
  expect(r.ok()).toBe(true);
  return r.json();
}
async function act(page: Page, input: Record<string, unknown>) {
  return page.request.post('/api/actions', { data: input });
}
async function sharing(page: Page, role: string) {
  await page.getByRole('button', { name: 'Share journey', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('combobox', { name: 'Link permission', exact: true }).selectOption(role);
  await modal.getByRole('button', { name: /Create (sharing|replacement) link/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('textbox', { name: 'Your sharing link' }),
  ).toBeVisible();
  return page.getByRole('dialog').getByRole('textbox', { name: 'Your sharing link' }).inputValue();
}
test('all product routes, authentic map state, keyboard navigation, themes, filters and responsive screenshots', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await demo(page);
  await page.getByRole('textbox', { name: 'Search journeys' }).fill('Portugal');
  await expect(page.locator('.trip-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Search journeys' }).fill('');
  await page.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(page.locator('.trip-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'All journeys', exact: true }).click();
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `public/screenshots/${info.project.name}-journeys.png`,
    fullPage: true,
    animations: 'disabled',
  });
  for (const view of [
    'itinerary',
    'map',
    'explore',
    'budget',
    'reservations',
    'checklist',
    'summary',
    'settings',
  ])
    await go(page, view);
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('dialog').getByRole('link', { name: 'My journeys', exact: true }).click();
  await expect(page.locator('.welcome-heading')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('.welcome-heading')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await go(page, 'itinerary');
  await expect(page.getByRole('region', { name: 'Interactive itinerary map' })).toBeVisible();
  await page.getByText('All mapped locations · 3', { exact: true }).click();
  await expect(page.locator('.mapped-places')).toContainText('Sensō-ji');
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('link', { name: 'Travel checklist', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Travel checklist', exact: true }),
    ).toBeVisible();
    await go(page, 'itinerary');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `public/screenshots/${info.project.name}-itinerary.png`,
    fullPage: true,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});
test('multi-city destination creation, editing and removal persist without changing the selected journey', async ({
  page,
}, info) => {
  await demo(page);
  const d = await data(page);
  await go(page, 'itinerary', d.trips[1].id);
  await page.getByRole('button', { name: 'Add destination', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Sample destination' }).selectOption('Paris');
  await dialog.getByLabel('Arrival date', { exact: true }).fill('2027-06-11');
  await dialog.getByLabel('Departure date', { exact: true }).fill('2027-06-12');
  await dialog.getByRole('button', { name: 'Add destination', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  let after = await data(page, d.trips[1].id);
  const stop = after.stops.find((s) => s.city === 'Paris')!;
  expect(stop.timezone).toBe('Europe/Paris');
  await page.locator('.route-ribbon').getByRole('button', { name: /Paris/ }).click();
  await page.getByRole('button', { name: 'Edit destination', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('City', { exact: true }).fill('Paris chapter');
  await dialog.getByRole('button', { name: 'Save destination' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Selected journey' })).toHaveValue(d.trips[1].id);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Journey map', exact: true })
    .click();
  await expect(page.getByRole('combobox', { name: 'Selected journey' })).toHaveValue(d.trips[1].id);
  await page.getByRole('button', { name: 'Edit Paris chapter', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove destination' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  after = await data(page, d.trips[1].id);
  expect(after.stops.some((s) => s.id === stop.id)).toBe(false);
});
test('activity CRUD, day selection, local scheduling and conflict feedback use persistent server data', async ({
  page,
}) => {
  await demo(page);
  await go(page, 'itinerary');
  await page.getByRole('button', { name: 'DAY 2 Apr 13', exact: true }).click();
  await page.getByRole('button', { name: 'Plan this day', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create a day plan' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.activity-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Order nearby', exact: true }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('not a road route');
  await page.getByRole('button', { name: 'Add a little something to this day' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Activity title').fill('E2E evening walk');
  await dialog.getByLabel('Local start time').fill('2027-04-13T18:00');
  await dialog.getByRole('button', { name: 'Add to itinerary' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.activity-card')).toHaveCount(4);
  await page.getByRole('button', { name: 'Edit E2E evening walk' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Activity title').fill('E2E riverside walk');
  await dialog.getByRole('button', { name: 'Save activity' }).click();
  await expect(dialog).toHaveCount(0);
  let d = await data(page);
  const a = d.stops[0].activities.find((a) => a.title === 'E2E riverside walk')!;
  expect(a.startsAt).toBe('2027-04-13T09:00:00.000Z');
  await page.getByRole('button', { name: 'Delete E2E riverside walk' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  d = await data(page);
  expect(d.stops[0].activities.some((x) => x.id === a.id)).toBe(false);
});
test('curated place search adds actual coordinates and unavailable worldwide search stays explicit', async ({
  page,
}) => {
  await demo(page);
  await go(page, 'explore');
  await page.getByRole('textbox', { name: 'Place search', exact: true }).fill('temple');
  await page.getByRole('button', { name: 'Search places', exact: true }).click();
  await expect(page.locator('.place-card')).toHaveCount(1);
  await expect(page.locator('.place-card')).toContainText('CURATED SAMPLE');
  await page.getByRole('button', { name: 'Add to a day', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Local start time').fill('2027-04-14T10:00');
  await page.getByRole('dialog').getByRole('button', { name: 'Add to itinerary' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const d = await data(page);
  expect(
    d.stops[0].activities.find((a) => a.localStart === '2027-04-14T10:00')!.latitude,
  ).toBeCloseTo(35.7148, 4);
  await page.getByRole('combobox', { name: 'Place search source' }).selectOption('MAPTILER');
  await page.getByRole('button', { name: 'Search places', exact: true }).click();
  await expect(page.locator('.notice[role=alert]')).toContainText('not configured');
});
test('expense journal preserves exact original amounts, deduplicates and persists deletion', async ({
  page,
}) => {
  await demo(page);
  const before = await data(page);
  await go(page, 'budget');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Expense title').fill('E2E café notebook');
  await dialog.getByLabel('Amount', { exact: true }).fill('12.34');
  await dialog.getByRole('combobox', { name: 'Category', exact: true }).selectOption('FOOD');
  await dialog.getByRole('button', { name: 'Record expense' }).click();
  await expect(dialog).toHaveCount(0);
  let d = await data(page);
  const expense = d.expenses.find((e) => e.title === 'E2E café notebook')!;
  expect(expense.amount).toBe('12.34');
  expect(expense.convertedAmount).toBe('12.34');
  expect(Number(d.budget!.spent) - Number(before.budget!.spent)).toBeCloseTo(12.34, 8);
  await page.getByRole('textbox', { name: 'Search expenses' }).fill('notebook');
  await expect(page.getByRole('table')).toContainText('E2E café notebook');
  await page.getByRole('button', { name: 'Delete E2E café notebook' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  d = await data(page);
  expect(d.expenses.some((e) => e.id === expense.id)).toBe(false);
  const body = {
    action: 'expense.create',
    tripId: before.trip!.id,
    title: 'E2E retry',
    category: 'FOOD',
    amount: '0.30',
    currency: 'USD',
    date: new Date().toISOString().slice(0, 10),
    idempotencyKey: crypto.randomUUID(),
  };
  expect((await act(page, body)).ok()).toBe(true);
  expect((await act(page, body)).ok()).toBe(true);
  expect((await data(page)).expenses.filter((e) => e.title === 'E2E retry')).toHaveLength(1);
});
test('private reservations and checklists support complete create/update/delete journeys', async ({
  page,
}) => {
  await demo(page);
  await go(page, 'reservations');
  await page.getByRole('button', { name: 'Add reservation', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reservation title').fill('E2E private guesthouse');
  await dialog.getByLabel('Location / route').fill('Tokyo');
  await dialog.getByLabel('Booking reference (private)').fill('E2E-PRIVATE-REFERENCE');
  await dialog.getByRole('button', { name: 'Save reservation' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'E2E private guesthouse' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('E2E-PRIVATE-REFERENCE', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete E2E private guesthouse' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await go(page, 'checklist');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Reminder', { exact: true }).fill('E2E pack a sketchbook');
  await dialog.getByRole('button', { name: 'Add reminder', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'E2E pack a sketchbook' }).check();
  await expect(page.getByRole('checkbox', { name: 'E2E pack a sketchbook' })).toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'E2E pack a sketchbook' })).toBeChecked();
  await page.getByRole('button', { name: 'Delete E2E pack a sketchbook' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'E2E pack a sketchbook' })).toHaveCount(0);
});
test('share viewer/editor permissions, private-data projection and revocation work without guest accounts', async ({
  page,
  browser,
}) => {
  await demo(page);
  const d = await data(page);
  await go(page, 'itinerary');
  const viewer = await sharing(page, 'VIEWER');
  const guest = await browser.newContext();
  try {
    const p = await guest.newPage();
    await p.goto(viewer);
    await expect(p.getByRole('heading', { name: d.trip!.name, exact: true })).toBeVisible();
    expect(await p.getByRole('button', { name: 'Add activity' }).count()).toBe(0);
    const projection = await (await p.request.get(viewer.replace('/share/', '/api/share/'))).json();
    expect(projection.expenses).toBeUndefined();
    expect(JSON.stringify(projection)).not.toContain('DEMO-TOKYO-ONLY');
    expect((await p.request.get('/api/data')).status()).toBe(401);
    expect(
      (
        await p.request.post(viewer.replace('/share/', '/api/share/'), {
          data: { action: 'activity.delete', tripId: d.trip!.id, id: d.stops[0].activities[0].id },
        })
      ).status(),
    ).toBe(403);
    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
    const editor = await sharing(page, 'EDITOR');
    expect((await p.request.get(viewer.replace('/share/', '/api/share/'))).status()).toBe(404);
    await p.goto(editor);
    await p.getByRole('button', { name: 'Add activity', exact: true }).first().click();
    const form = p.getByRole('dialog');
    await form.getByLabel('Activity title').fill('E2E shared afternoon');
    await form.getByLabel('Local start time').fill('2027-04-15T14:00');
    await form.getByRole('button', { name: 'Add to itinerary' }).click();
    await expect(form).toHaveCount(0);
    expect(
      (await data(page)).stops[0].activities.some((a) => a.title === 'E2E shared afternoon'),
    ).toBe(true);
    expect(
      (
        await p.request.post(editor.replace('/share/', '/api/share/'), {
          data: { action: 'trip.delete', id: d.trip!.id, tripId: d.trip!.id },
        })
      ).status(),
    ).toBe(403);
    await page.getByRole('dialog').getByRole('button', { name: 'Revoke sharing link' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await p.request.get(editor.replace('/share/', '/api/share/'))).status()).toBe(404);
  } finally {
    await guest.close();
  }
});
test('export, nested tenant authorization and isolated reset preserve another visitor’s journal', async ({
  page,
  browser,
}) => {
  await demo(page);
  const before = await data(page);
  await go(page, 'summary');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Export itinerary' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('roamly-itinerary.csv');
  const csv = await (await page.request.get('/api/export?trip=' + before.trip!.id)).text();
  expect(csv).toContain('Asia/Tokyo');
  expect(csv).toContain('UTC start');
  expect(csv).not.toContain('DEMO-TOKYO-ONLY');
  const isolated = await browser.newContext();
  try {
    const other = await isolated.newPage();
    await demo(other);
    const otherData = await data(other);
    expect(otherData.workspace.id).not.toBe(before.workspace.id);
    expect((await other.request.get('/api/data?trip=' + before.trip!.id)).status()).toBe(404);
    expect((await other.request.get('/api/export?trip=' + before.trip!.id)).status()).toBe(404);
    expect(
      (
        await act(other, {
          action: 'activity.delete',
          tripId: otherData.trip!.id,
          id: before.stops[0].activities[0].id,
        })
      ).status(),
    ).toBe(404);
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Restore demo', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await data(other)).trip!.id).toBe(otherData.trip!.id);
  } finally {
    await isolated.close();
  }
  expect((await data(page)).trips).toHaveLength(3);
});
test('private registration, journey CRUD, settings, login and CSRF protection', async ({
  page,
}) => {
  const email = 'roam-' + crypto.randomUUID() + '@example.test',
    password = 'Synthetic journey password 123';
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Synthetic traveler');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(page.locator('.welcome-heading')).toBeVisible();
  expect((await data(page)).trips).toHaveLength(0);
  await page.getByRole('button', { name: 'Plan a new journey' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Journey name', { exact: true }).fill('E2E private adventure');
  await form.getByRole('button', { name: 'Create journey', exact: true }).click();
  await expect(form).toHaveCount(0);
  const d = await data(page);
  expect(d.trip!.name).toBe('E2E private adventure');
  await go(page, 'settings', d.trip!.id);
  await page
    .getByRole('textbox', { name: 'Journey name', exact: true })
    .fill('E2E adventure revised');
  await page.getByRole('button', { name: 'Save journey details' }).click();
  await expect(page.locator('.notice[role=status]')).toContainText('saved');
  expect((await act(page, { action: 'demo.reset' })).status()).toBe(403);
  expect(
    (
      await page.request.post('/api/actions', {
        headers: { origin: 'https://untrusted.example' },
        data: { action: 'trip.delete', id: d.trip!.id },
      })
    ).status(),
  ).toBe(403);
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3206/');
  await page.goto('/app/trips');
  await expect(page).toHaveURL(/sign-in/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.welcome-heading')).toBeVisible();
  expect((await data(page)).trip!.name).toBe('E2E adventure revised');
  await go(page, 'settings');
  await page.getByRole('button', { name: 'Delete journey', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove permanently' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await data(page)).trips).toHaveLength(0);
});

test('interactive map settles into a loaded or explicit degraded state and keeps location inspection usable', async ({
  page,
}, info) => {
  const failed: string[] = [];
  page.on('requestfailed', (r) => {
    if (r.url().includes('tiles.openfreemap.org'))
      failed.push(r.failure()?.errorText || 'network failure');
  });
  await demo(page);
  await go(page, 'itinerary');
  await expect
    .poll(async () => page.locator('.map-status').allTextContents(), { timeout: 20000 })
    .not.toContain('Loading the map…');
  const canvas = page.getByRole('region', { name: 'Interactive itinerary map' });
  await expect(canvas).toBeVisible();
  const marker = canvas.getByRole('button', { name: 'Sensō-ji temple', exact: true });
  if (await marker.count()) {
    await marker.click();
    await expect(page.locator('.maplibregl-popup')).toContainText('Sensō-ji temple');
    await page.getByRole('button', { name: 'Close popup', exact: true }).click();
  } else await expect(page.locator('.map-status')).toContainText('unavailable');
  const status = await page.locator('.map-status').allTextContents();
  await info.attach('map-provider-state', {
    body: JSON.stringify({ status, failed, canvasCount: await canvas.locator('canvas').count() }),
    contentType: 'application/json',
  });
  console.log('Map provider state', info.project.name, JSON.stringify({ status, failed }));
  await page.mouse.move(0, 0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: `public/screenshots/${info.project.name}-itinerary.png`,
    fullPage: true,
    animations: 'disabled',
  });
});
