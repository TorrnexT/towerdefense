import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const report = {};
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
async function ready(p) {
  await p.goto(url + '/?verify=1');
  await p.waitForFunction(() => window.__game?.profile.ready);
  await p.evaluate(() => window.__game.profile.saveTeam(['ballista', 'fire', 'grenade']));
  if (
    await p.evaluate(
      () => !new URL(location.href).searchParams.has('room') && !sessionStorage.getItem('emberwatch-room'),
    )
  ) {
    await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
    await p.getByRole('button', { name: /Endless/ }).click();
    await p.getByRole('button', { name: 'Spiel starten', exact: true }).click();
    await p.getByRole('button', { name: 'In die Schlacht', exact: true }).click();
  }
  await p.waitForFunction(
    () => window.__game?.getState()?.players && Object.keys(window.__game.getState().players).length > 0,
  );
  await expect(p.locator('.loading-layer')).toHaveCount(0);
  await expect(p.getByTestId('gold')).toHaveText('240');
}
async function point(p, x, z) {
  const local = await p.evaluate(({ x, z }) => window.__game.world.project({ x, z }), { x, z });
  const rect = await p.locator('.world').boundingBox();
  return { x: rect.x + local.x, y: rect.y + local.y };
}
async function dragTo(p, kind, destination, touch = false) {
  const card = p.locator('.tower-card.' + kind);
  const rect = await card.boundingBox();
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const cdp = touch ? await p.context().newCDPSession(p) : null;
  if (cdp)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
  else {
    await p.mouse.move(start.x, start.y);
    await p.mouse.down();
  }
  if (cdp) await p.waitForTimeout(280);
  for (let i = 1; i <= 12; i++) {
    const pos = {
      x: start.x + ((destination.x - start.x) * i) / 12,
      y: start.y + ((destination.y - start.y) * i) / 12,
    };
    if (cdp)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...pos, id: 1 }] });
    else await p.mouse.move(pos.x, pos.y);
  }
  return {
    cdp,
    async release() {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else await p.mouse.up();
    },
    async cancel() {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await cdp.detach();
      } else {
        await p.keyboard.press('Escape');
        await p.mouse.up();
      }
    },
  };
}
async function build(p, x, z, touch = false, kind = 'ballista', cost = 100) {
  const gold = Number(await p.getByTestId('gold').textContent());
  const drag = await dragTo(p, kind, await point(p, x, z), touch);
  await expect(p.locator('.tower-card.' + kind)).toHaveClass(/dragging/);
  await expect(p.locator('.build-hint')).toContainText('Loslassen zum Bauen');
  await expect(p.getByTestId('gold')).toHaveText(String(gold));
  const preview = await p.evaluate(() => {
    const ghost = window.__game.world.scene.getObjectByName('build-preview');
    const range = window.__game.world.scene.getObjectByName('tower-range');
    return { visible: ghost?.visible, x: ghost?.position.x, z: ghost?.position.z, range: !!range };
  });
  expect(preview.visible).toBe(true);
  expect(preview.range).toBe(true);
  expect(preview.x).toBeCloseTo(x, 1);
  expect(preview.z).toBeCloseTo(z, 1);
  await p.screenshot({
    path: new URL(touch ? 'touch-drag-preview.png' : 'mouse-drag-preview.png', output).pathname,
  });
  await drag.release();
  await expect(p.getByTestId('gold')).toHaveText(String(gold - cost));
  await expect(p.locator('.build-hint')).toHaveCount(0);
  expect(await p.evaluate(() => !!window.__game.world.scene.getObjectByName('build-preview'))).toBe(false);
}

try {
  await ready(page);
  await page.screenshot({ path: new URL('desktop.png', output).pathname });
  await expect(page.locator('.topbar, .footer, .map-heading, .map-badges')).toHaveCount(0);
  await expect(page.locator('.sidebar')).toBeHidden();
  const speedButton = page.getByRole('button', { name: /^Spielgeschwindigkeit:/ });
  await expect(speedButton).toContainText('1×');
  for (const speed of [2, 5, 10, 1]) {
    await speedButton.click();
    await expect(speedButton).toContainText(`${speed}×`);
    await expect.poll(() => page.evaluate(() => window.__game.getState().speed)).toBe(speed);
  }
  report.speed = { desktopCycle: true };

  const fullWorld = await page.locator('.world').boundingBox();
  expect(fullWorld).toEqual({ x: 0, y: 0, width: 1440, height: 900 });

  const zoom = page.getByRole('button', { name: 'Vergrößern', exact: true });
  await zoom.hover();
  await expect
    .poll(() => zoom.evaluate((el) => parseFloat(getComputedStyle(el).translate.split(' ')[1]) || 0))
    .toBeLessThan(-1);
  await page.mouse.down();
  await expect
    .poll(() => zoom.evaluate((el) => parseFloat(getComputedStyle(el).scale) || 1))
    .toBeLessThan(0.98);
  await page.mouse.up();
  // A spring overshoots its resting size on release, then settles without an inline transform.
  const peak = await zoom.evaluate(
    (el) =>
      new Promise((resolve) => {
        let max = 1;
        const start = performance.now();
        const sample = () => {
          max = Math.max(max, parseFloat(getComputedStyle(el).scale) || 1);
          if (performance.now() - start < 600) requestAnimationFrame(sample);
          else resolve(max);
        };
        sample();
      }),
  );
  expect(peak).toBeGreaterThan(1.015);
  expect(
    await zoom.evaluate((el) => el.getAnimations().filter((a) => a.playState === 'running').length),
  ).toBe(0);
  await page.getByRole('button', { name: 'Kamera zurücksetzen' }).click();
  await page.getByRole('button', { name: 'Spielanleitung', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.help-modal')).toBeVisible();
  expect(await page.locator('.help-modal').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'ui-pop',
  );
  await page.getByRole('button', { name: 'Anleitung schließen' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.help-modal')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Spielanleitung', exact: true }).click();
  await expect(page.locator('.help-modal')).toBeVisible();
  expect(await page.locator('.help-modal').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(
    await page
      .getByRole('button', { name: 'Spielanleitung', exact: true })
      .evaluate((el) => el.getAnimations().length),
  ).toBe(0);
  await page.getByRole('button', { name: 'Anleitung schließen' }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  report.motion = {
    pressCompression: true,
    releaseOvershoot: true,
    hoverSpring: true,
    keyboard: true,
    modalPop: true,
    reducedMotion: true,
  };

  // Clicking a card never arms a later map click.
  await page.locator('.tower-card.ballista').click();
  const emptySpot = await point(page, -4, 1);
  await page.mouse.click(emptySpot.x, emptySpot.y);
  await expect(page.locator('.build-hint')).toHaveCount(0);
  await expect(page.getByTestId('gold')).toHaveText('240');
  expect(await page.evaluate(() => Object.keys(window.__game.getState().towers).length)).toBe(0);
  const invalid = await dragTo(page, 'ballista', await point(page, -9, -5));
  await expect(page.locator('.build-hint.invalid')).toContainText('Weg');
  await page.screenshot({ path: new URL('invalid-drag-preview.png', output).pathname });
  await invalid.release();
  await expect(page.getByTestId('gold')).toHaveText('240');
  await expect(page.locator('.build-hint')).toHaveCount(0);
  const escape = await dragTo(page, 'ballista', emptySpot);
  await escape.cancel();
  await expect(page.locator('.build-hint')).toHaveCount(0);
  await expect(page.getByTestId('gold')).toHaveText('240');
  const outside = await dragTo(page, 'ballista', { x: 700, y: 40 });
  await expect(page.locator('.drag-cursor')).toBeVisible();
  await outside.release();
  await expect(page.getByTestId('gold')).toHaveText('240');
  expect(await page.evaluate(() => window.__game.world.controls.enabled)).toBe(true);
  report.drag = { clickDoesNotArm: true, invalidDrop: true, escape: true, outsideDrop: true };
  await build(page, -4, 1);
  await expect(page.getByTestId('gold')).toHaveText('140');
  await page.getByRole('button', { name: 'Aufwerten 80', exact: true }).click();
  await expect(page.getByTestId('gold')).toHaveText('60');
  await expect(page.locator('.detail-level')).toContainText('STUFE 2');
  await page.getByRole('button', { name: 'Turm verkaufen +126 Gold', exact: true }).click();
  await expect(page.getByTestId('gold')).toHaveText('186');
  await build(page, -9, -1);
  await expect(page.getByTestId('gold')).toHaveText('86');
  await page.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  await page.waitForFunction(() => window.__game.getState().kills > 0, {}, { timeout: 20000 });
  const fighting = await page.evaluate(() => window.__game.getState());
  expect(fighting.players[Object.keys(fighting.players)[0]].gold).toBeGreaterThan(86);
  await page.screenshot({ path: new URL('combat.png', output).pathname });
  // Browser-only runs are intentionally discarded by a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => !!window.__game.connection.room)).toBe(false);
  await page.getByRole('button', { name: 'Spielanleitung', exact: true }).click();
  await expect(page.locator('.help-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Verstanden. Auf ins Tal.' }).click();
  report.desktop = {
    build: true,
    upgrade: true,
    sell: true,
    combatGold: true,
    reloadDiscardsCombat: true,
    help: true,
  };
  const mortar = await desktop.newPage();
  mortar.on('pageerror', (e) => errors.push(e.message));
  await ready(mortar);
  await expect(mortar.locator('.tower-card')).toHaveCount(3);
  await build(mortar, -9, -1, false, 'grenade', 190);
  await expect(mortar.getByTestId('gold')).toHaveText('50');
  await mortar.evaluate(() => {
    window.__impacts = [];
    const connection = window.__game.connection,
      previous = connection.onImpact;
    connection.onImpact = (event) => {
      previous(event);
      window.__impacts.push(event);
    };
  });
  await mortar.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  await mortar.waitForFunction(
    () => Object.values(window.__game.getState().projectiles).some((p) => p.kind === 'grenade' && p.y > 3),
    {},
    { timeout: 20000 },
  );
  expect(await mortar.evaluate(() => window.__game.world.metrics().projectiles)).toBeGreaterThan(0);
  await mortar.screenshot({ path: new URL('grenade-flight.png', output).pathname });
  await mortar.waitForFunction(
    () => window.__impacts.length > 0 && window.__game.getState().kills > 0,
    {},
    { timeout: 15000 },
  );
  const hit = await mortar.evaluate(() => ({ impact: window.__impacts[0], state: window.__game.getState() }));
  expect(hit.impact.splash).toBe(2.4);
  expect(hit.state.projectiles[hit.impact.projectileId]).toBeUndefined();
  expect(hit.state.players[Object.keys(hit.state.players)[0]].gold).toBeGreaterThan(50);
  await mortar.screenshot({ path: new URL('grenade-combat.png', output).pathname });
  report.projectiles = {
    grenadeBuild: true,
    dragBuild: true,
    visibleFlight: true,
    serverImpact: true,
    killGold: true,
  };
  await mortar.close();
  const mobile = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await ready(mp);
  const mobileSpeed = mp.getByRole('button', { name: /^Spielgeschwindigkeit:/ });
  for (const speed of [2, 5, 10, 1]) {
    await mobileSpeed.tap();
    await expect(mobileSpeed).toContainText(`${speed}×`);
  }
  report.speed.touchCycle = true;

  await mp.screenshot({ path: new URL('mobile-portrait.png', output).pathname });
  await expect(mp.locator('.tower-card.grenade')).toBeInViewport();
  await mp.locator('.tower-card.grenade').tap();
  await expect(mp.locator('.build-hint')).toHaveCount(0);
  const touchCancel = await dragTo(mp, 'grenade', await point(mp, -9, -1), true);
  await expect(mp.locator('.build-hint')).toBeVisible();
  await touchCancel.cancel();
  await expect(mp.getByTestId('gold')).toHaveText('240');
  await expect(mp.locator('.build-hint')).toHaveCount(0);
  const multitouchPoint = await point(mp, -9, -1);
  const multitouch = await dragTo(mp, 'grenade', multitouchPoint, true);
  await multitouch.cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...multitouchPoint, id: 1 },
      { x: multitouchPoint.x + 50, y: multitouchPoint.y, id: 2 },
    ],
  });
  await expect(mp.locator('.build-hint')).toHaveCount(0);
  await multitouch.release();
  await expect(mp.getByTestId('gold')).toHaveText('240');
  await build(mp, -9, -1, true, 'grenade', 190);
  await expect(mp.getByTestId('gold')).toHaveText('50');
  await mp.screenshot({ path: new URL('mobile-build.png', output).pathname });
  await mp.getByRole('button', { name: 'Auswahl schließen' }).click();
  await mp.setViewportSize({ width: 844, height: 390 });
  await mp.screenshot({ path: new URL('mobile-landscape.png', output).pathname });
  await expect(mp.locator('.wave-panel .primary')).toBeVisible();
  await expect(mp.locator('.tower-card.grenade')).toBeInViewport();
  // Sell the portrait-built mortar, then exercise a real drag in landscape too.
  const built = await point(mp, -9, -1);
  await mp.touchscreen.tap(built.x, built.y);
  await mp.getByRole('button', { name: 'Turm verkaufen +133 Gold', exact: true }).click();
  await expect(mp.getByTestId('gold')).toHaveText('183');
  await build(mp, -9, -1, true);
  await expect(mp.locator('.tower-card.grenade')).toBeDisabled();
  report.mobile = {
    touchBuild: true,
    portrait: true,
    landscape: true,
    touchCancel: true,
    secondFingerCancels: true,
    unaffordableDisabled: true,
  };
  await mobile.close();
  await page.close();
  // A separate renderer fixture measures graphics only; it cannot mutate server state.
  const perf = await desktop.newPage();
  await ready(perf);
  report.layouts = [];
  for (const [width, height] of [
    [1920, 1080],
    [1024, 768],
    [768, 1024],
    [640, 960],
    [360, 740],
  ]) {
    await perf.setViewportSize({ width, height });
    await expect.poll(async () => (await perf.locator('.world').boundingBox())?.width).toBe(width);
    await expect(perf.locator('.sidebar')).toBeHidden();
    const world = await perf.locator('.world').boundingBox();
    expect(world).toEqual({ x: 0, y: 0, width, height });
    const clusters = [];
    for (const selector of ['.hud-resources', '.top-actions', '.wave-panel', '.tower-dock']) {
      const r = await perf.locator(selector).boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(width + 1);
      expect(r.y + r.height).toBeLessThanOrEqual(height + 1);
      for (const other of clusters)
        expect(
          r.x < other.x + other.width &&
            r.x + r.width > other.x &&
            r.y < other.y + other.height &&
            r.y + r.height > other.y,
        ).toBe(false);
      clusters.push(r);
    }
    for (const card of await perf.locator('.tower-card').all()) await expect(card).toBeInViewport();
    await perf.screenshot({ path: new URL(`hud-${width}x${height}.png`, output).pathname });
    report.layouts.push(`${width}x${height}`);
  }
  await perf.setViewportSize({ width: 1440, height: 900 });

  await perf.evaluate(async () => {
    const { rendererStress } = await import('/src/stress.ts');
    window.__stopStress = rendererStress(window.__game.world);
    window.__stressFrame = window.__game.world.metrics().frames;
  });
  await perf.waitForFunction(
    () => window.__game.world.metrics().frames - window.__stressFrame >= 350,
    {},
    { timeout: 60000 },
  );
  report.graphics = await perf.evaluate(() => window.__game.world.metrics());
  await perf.screenshot({ path: new URL('stress-100-enemies-30-towers.png', output).pathname });
  await perf.evaluate(() => window.__stopStress());
  report.errors = errors;
  expect(errors).toEqual([]);
  await writeFile(new URL('browser-results.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
