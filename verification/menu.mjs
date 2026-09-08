import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [],
  errors = [],
  report = {};
async function create(options) {
  const c = await browser.newContext(options);
  contexts.push(c);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
async function menu(p) {
  await p.goto(url + '/?verify=1');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(p.locator('.multi-choice')).toHaveCSS('opacity', '1');
}
try {
  const p = await create({ viewport: { width: 1440, height: 900 } });
  let matches = 0;
  p.on('request', (req) => {
    if (req.url().includes('/matchmake/')) matches++;
  });
  await menu(p);
  expect(matches).toBe(0);
  expect(await p.evaluate(() => !!window.__game.connection.room)).toBe(false);
  await expect(p.locator('.hud-resources')).toBeHidden();
  await expect(p.locator('.tower-dock')).toBeHidden();
  expect(await p.locator('.menu-choices button > span:not(.level-ring) > strong').allTextContents()).toEqual([
    'Einzelspieler',
    'Multispieler',
    'Türme',
    'Account',
  ]);
  expect(await p.locator('.menu-embers i').count()).toBe(18);
  expect(await p.locator('.world canvas').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'menu-drift',
  );
  await p.screenshot({ path: new URL('main-menu-desktop.png', output).pathname });
  await p.keyboard.press('Tab');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeFocused();
  await p.keyboard.press('Tab');
  await p.keyboard.press('Enter');
  await expect(p.locator('.mode-picker')).toBeVisible();
  await p.getByRole('button', { name: /Endless/ }).click();
  await expect(p.locator('.party-modal')).toBeVisible();
  expect(matches).toBe(0);
  await p.getByRole('button', { name: 'Koop schließen' }).click();
  await expect(p.locator('.main-menu')).toBeVisible();
  await p.getByRole('button', { name: 'Spielanleitung', exact: true }).click();
  await expect(p.locator('.help-modal')).toBeVisible();
  await p.getByRole('button', { name: 'Anleitung schließen' }).click();
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await p.getByRole('button', { name: /Endless/ }).click();
  await p.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await p.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(p.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  const id = await p.evaluate(() => window.__game.connection.room.roomId);
  const result = await p.evaluate(() =>
    window.__game.connection.send({ id: 'menu-build', action: 'build', kind: 'ballista', x: -4, z: 1 }),
  );
  expect(result.ok).toBe(true);
  await expect(p.getByTestId('gold')).toHaveText('140');
  await p.getByRole('button', { name: 'Hauptmenü', exact: true }).click();
  await expect(p.getByRole('button', { name: /Spiel fortsetzen/ })).toBeVisible();
  await p.getByRole('button', { name: /Spiel fortsetzen/ }).click();
  await expect(p.getByTestId('gold')).toHaveText('140');
  expect(await p.evaluate(() => window.__game.connection.room.roomId)).toBe(id);
  await p.reload();
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  expect(await p.evaluate(() => !!window.__game.connection.room)).toBe(false);
  const mobile = await create(devices['iPhone 13']);
  await menu(mobile);
  await mobile.screenshot({ path: new URL('main-menu-mobile.png', output).pathname });
  await mobile.getByRole('button', { name: 'Multispieler', exact: true }).tap();
  await mobile.getByRole('button', { name: /Endless/ }).tap();
  await mobile.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Lobby erstellen' }).tap();
  await expect(mobile.getByRole('heading', { name: 'Versammelt die Hüter.' })).toBeVisible();
  await expect.poll(() => mobile.evaluate(() => window.__game.getState()?.mode)).toBe('coop');
  await expect(mobile.locator('.main-menu')).toHaveCount(0);
  const compact = await create({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' });
  await menu(compact);
  expect(await compact.locator('.world canvas').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  );
  await expect(compact.locator('.menu-embers')).toBeHidden();
  for (const size of [
    { width: 360, height: 740 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    await compact.setViewportSize(size);
    for (const label of ['Einzelspieler', 'Multispieler']) {
      const button = compact.getByRole('button', { name: label, exact: true });
      await expect(button).toBeInViewport();
      const r = await button.boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(size.width);
    }
    await compact.screenshot({
      path: new URL(`main-menu-${size.width}x${size.height}.png`, output).pathname,
    });
  }
  // Solo starts even when all matchmaking requests are blocked.
  await compact.route('**/matchmake/**', (route) => route.abort());
  await compact.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await compact.getByRole('button', { name: /Endless/ }).click();
  await compact.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await compact.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(compact.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  expect(await compact.evaluate(() => window.__game.connection.local)).toBe(true);
  await compact.getByRole('button', { name: 'Hauptmenü', exact: true }).click();
  await expect(compact.getByRole('button', { name: 'Multispieler', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  Object.assign(report, {
    noRoomBeforeSelection: true,
    solo: true,
    multiplayer: true,
    preservedRun: true,
    reload: true,
    keyboard: true,
    touch: true,
    responsive: true,
    reducedMotion: true,
    soloWithoutServer: true,
    errors,
  });
  await writeFile(new URL('menu-report.json', output), JSON.stringify(report, null, 2));
  console.log('Main menu OK:', JSON.stringify(report));
} catch (error) {
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({ path: new URL(`menu-failure-${i}.png`, output).pathname })
      .catch(() => {});
  throw error;
} finally {
  for (const c of contexts)
    for (const p of c.pages())
      await p.evaluate(() => window.__game?.connection.room?.leave()).catch(() => {});
  await browser.close();
}
