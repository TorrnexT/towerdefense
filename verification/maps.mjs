import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const source = '/@fs' + fileURLToPath(new URL('../shared/src/maps.ts', import.meta.url));
const ids = ['waldtal', 'silberfurt', 'bernsteinhain', 'frostklamm', 'glutspalten'];
const names = ['Waldtal', 'Silberfurt', 'Bernsteinhain', 'Frostklamm', 'Glutspalten'];
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  contexts = [],
  report = { maps: {}, layouts: [], performance: {} };
async function page(options) {
  const context = await browser.newContext(options);
  contexts.push(context);
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
async function ready(p) {
  await p.goto(url + '/?verify=1');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({ timeout: 20000 });
}
async function select(p, id) {
  if ((await p.locator('.main-menu').count()) === 0)
    await p.getByRole('button', { name: 'Hauptmenü', exact: true }).click();
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await p.getByRole('button', { name: /Endless/ }).click();
  await p.getByRole('button', { name: names[ids.indexOf(id)], exact: true }).click();
  await p.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await p.getByRole('button', { name: 'In die Schlacht', exact: true }).click();
  await expect.poll(() => p.evaluate(() => window.__game?.getState()?.mapId)).toBe(id);
  await expect(p.locator('.map-selector')).toHaveCount(0);
  await expect(p.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  await expect.poll(() => p.evaluate(() => window.__game.world.metrics().mapId)).toBe(id);
}
async function buildingSite(p, routeIndex = 0) {
  return p.evaluate(
    async ({ source, routeIndex }) => {
      const { MAPS, pathPosition, placementError, distance } = await import(source),
        game = window.__game,
        state = game.getState(),
        map = MAPS[state.mapId];
      const r = map.routes[routeIndex % map.routes.length],
        target = pathPosition(9, map, r.id),
        candidates = [];
      for (let x = -12.5; x < 13; x += 0.5)
        for (let z = -8; z < 9; z += 0.5) {
          const point = { x, z };
          if (placementError(point, Object.values(state.towers), map)) continue;
          const screen = game.world.project(point);
          if (document.elementFromPoint(screen.x, screen.y) !== game.world.renderer.domElement) continue;
          candidates.push({ point, screen, d: distance(point, target) });
        }
      candidates.sort((a, b) => a.d - b.d);
      return candidates[0];
    },
    { source, routeIndex },
  );
}
async function drag(p, destination, touch = false) {
  const r = await p.locator('.tower-card.ballista').boundingBox(),
    start = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  if (touch) {
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    await p.waitForTimeout(280);
    for (let i = 1; i <= 12; i++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((destination.x - start.x) * i) / 12,
            y: start.y + ((destination.y - start.y) * i) / 12,
            id: 1,
          },
        ],
      });
    await expect(p.locator('.build-hint')).toContainText('Loslassen zum Bauen');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await p.mouse.move(start.x, start.y);
    await p.mouse.down();
    await p.mouse.move(destination.x, destination.y, { steps: 12 });
    await expect(p.locator('.build-hint')).toContainText('Loslassen zum Bauen');
    await p.mouse.up();
  }
}
try {
  const p = await page({ viewport: { width: 1440, height: 900 } });
  await p.addInitScript(() => {
    if (!localStorage.getItem('records-fixture')) {
      localStorage.setItem('emberwatch-best', '12');
      localStorage.setItem('records-fixture', '1');
    }
  });
  await ready(p);
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await p.getByRole('button', { name: /Endless/ }).click();
  await expect(p.locator('.map-option')).toHaveCount(5);
  await expect(p.getByRole('button', { name: 'Waldtal', exact: true })).toContainText('Rekord: 12');
  await expect(p.getByRole('button', { name: 'Silberfurt', exact: true })).not.toContainText('Rekord: 12');
  await p.screenshot({ animations: 'disabled', path: new URL('map-picker-desktop.png', output).pathname });
  await p.getByRole('button', { name: 'Kartenauswahl schließen' }).click();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    await select(p, id);
    await drag(p, (await buildingSite(p)).screen);
    await expect(p.getByTestId('gold')).toHaveText('140');
    await p.getByRole('button', { name: 'Auswahl schließen' }).click();
    await drag(p, (await buildingSite(p, 1)).screen);
    await expect(p.getByTestId('gold')).toHaveText('40');
    await p.getByRole('button', { name: 'Auswahl schließen' }).click();
    await p.screenshot({ animations: 'disabled', path: new URL(`map-${id}-desktop.png`, output).pathname });
    await p.evaluate(() => {
      window.__routesSeen = new Set();
      window.__game.connection.room.onStateChange((s) => {
        for (const e of Object.values(s.toJSON().enemies)) window.__routesSeen.add(e.routeId);
      });
    });
    await p.getByRole('button', { name: /^Spielgeschwindigkeit:/ }).click();
    await p.getByRole('button', { name: /^Spielgeschwindigkeit:/ }).click();
    await p.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
    await expect
      .poll(() => p.evaluate(() => window.__routesSeen.size), { timeout: 12000 })
      .toBe([1, 2, 2, 3, 3][i]);
    await expect
      .poll(() => p.evaluate(() => window.__game.getState().kills), { timeout: 18000 })
      .toBeGreaterThan(0);
    report.maps[id] = { build: true, routes: true, kills: true };
    if (id === 'silberfurt') {
      await p.reload();
      await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
      expect(await p.evaluate(() => !!window.__game.connection.room)).toBe(false);
      report.reloadDiscardsCombat = true;
    }
  }
  // Fresh, idle room keeps the server from overwriting the graphics-only fixture.
  await select(p, 'waldtal');
  for (const id of ids) {
    await p.evaluate(async (id) => {
      window.__stopStress?.();
      const { rendererStress } = await import('/src/stress.ts');
      window.__stopStress = rendererStress(window.__game.world, id);
    }, id);
    // Exclude shader compilation, landscape construction and screenshot readback from steady-state FPS.
    // World.metrics averages 300 frames, so collect a full fresh window after each map swap.
    const firstFrame = await p.evaluate(() => window.__game.world.metrics().frames);
    await p.waitForFunction((start) => window.__game.world.metrics().frames >= start + 420, firstFrame, {
      timeout: 30000,
      polling: 100,
    });
    const metrics = await p.evaluate(() => window.__game.world.metrics());
    report.performance[id] = metrics;
    console.log('Map graphics:', id, JSON.stringify(metrics));
    expect(metrics.fps).toBeGreaterThan(45);
    expect(metrics.landscapes).toBe(1);
    expect(await p.evaluate(() => window.__game.world.towerObjects.size)).toBe(30);
    expect(await p.evaluate(() => window.__game.world.enemyObjects.size)).toBe(100);
    await p.screenshot({ animations: 'disabled', path: new URL(`map-${id}-stress.png`, output).pathname });
  }
  await p.evaluate(() => window.__stopStress());
  const memory = [];
  for (let cycle = 0; cycle < 3; cycle++)
    for (const id of ids) {
      await p.evaluate((id) => {
        const state = window.__game.getState();
        window.__game.world.update({ ...state, mapId: id, towers: {}, enemies: {}, projectiles: {} });
      }, id);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      memory.push({ id, cycle, ...(await p.evaluate(() => window.__game.world.metrics())) });
    }
  for (const id of ids) {
    const samples = memory.filter((m) => m.id === id);
    expect(samples[2].geometries).toBeLessThanOrEqual(samples[1].geometries + 1);
    expect(samples[2].textures).toBeLessThanOrEqual(samples[1].textures + 1);
  }
  report.mapSwitchMemory = memory;
  const mobile = await page(devices['iPhone 13']);
  await ready(mobile);
  await mobile.getByRole('button', { name: 'Einzelspieler', exact: true }).tap();
  await mobile.getByRole('button', { name: /Endless/ }).tap();
  await mobile.screenshot({
    animations: 'disabled',
    path: new URL('map-picker-mobile.png', output).pathname,
  });
  await mobile.getByRole('button', { name: 'Frostklamm', exact: true }).tap();
  await mobile.getByRole('button', { name: 'Spiel starten', exact: true }).tap();
  await mobile.getByRole('button', { name: 'In die Schlacht', exact: true }).tap();
  await expect.poll(() => mobile.evaluate(() => window.__game?.getState()?.mapId)).toBe('frostklamm');
  await drag(mobile, (await buildingSite(mobile)).screen, true);
  await expect(mobile.getByTestId('gold')).toHaveText('140');
  await mobile.getByRole('button', { name: 'Auswahl schließen' }).tap();
  await mobile.screenshot({
    animations: 'disabled',
    path: new URL('map-frostklamm-mobile.png', output).pathname,
  });
  await mobile.setViewportSize({ width: 844, height: 390 });
  await select(mobile, 'glutspalten');
  await mobile.screenshot({
    animations: 'disabled',
    path: new URL('map-glutspalten-landscape.png', output).pathname,
  });
  const tablet = await page({ viewport: { width: 768, height: 1024 } });
  await ready(tablet);
  await tablet.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await tablet.getByRole('button', { name: /Endless/ }).click();
  await tablet.screenshot({
    animations: 'disabled',
    path: new URL('map-picker-tablet.png', output).pathname,
  });
  await tablet.getByRole('button', { name: 'Kartenauswahl schließen' }).click();
  await select(tablet, 'bernsteinhain');
  await tablet.screenshot({
    animations: 'disabled',
    path: new URL('map-bernsteinhain-tablet.png', output).pathname,
  });
  // The host's selection is authoritative; changing it clears both ready markers.
  await p.evaluate(() => window.__game.world.update(window.__game.getState()));
  await p.getByRole('button', { name: 'Koop spielen', exact: true }).click();
  await p.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).click();
  await p.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await expect(p.getByTestId('room-code')).toBeVisible();
  const code = await p.getByTestId('room-code').textContent();
  const guest = await page({ viewport: { width: 1024, height: 768 } });
  await guest.goto(url + '/?verify=1&room=' + encodeURIComponent(code));
  await expect(guest.getByRole('button', { name: 'Ich bin bereit', exact: true })).toBeVisible();
  for (const peer of [p, guest])
    await peer.getByRole('button', { name: 'Ich bin bereit', exact: true }).click();
  await expect(guest.getByRole('button', { name: 'Karte ändern' })).toHaveCount(0);
  await p.getByRole('button', { name: 'Karte ändern' }).click();
  await p.getByRole('button', { name: 'Silberfurt', exact: true }).click();
  await p.getByRole('button', { name: 'Karte übernehmen', exact: true }).click();
  for (const peer of [p, guest]) {
    await expect(peer.locator('.party-map')).toContainText('Silberfurt');
    await expect(peer.getByRole('button', { name: 'Ich bin bereit', exact: true })).toBeVisible();
  }
  await expect.poll(() => guest.evaluate(() => window.__game?.world.metrics().mapId)).toBe('silberfurt');
  await p.screenshot({ animations: 'disabled', path: new URL('map-coop-lobby.png', output).pathname });
  report.coopSelection = true;
  report.layouts = ['1440x900', '390x664 touch', '844x390', '768x1024'];
  expect(errors).toEqual([]);
  report.errors = errors;
  await writeFile(new URL('maps-report.json', output), JSON.stringify(report, null, 2));
  console.log(
    'Maps OK:',
    JSON.stringify({
      maps: report.maps,
      coop: report.coopSelection,
      fps: Object.fromEntries(Object.entries(report.performance).map(([id, m]) => [id, Math.round(m.fps)])),
      errors,
    }),
  );
} catch (error) {
  for (let i = 0; i < contexts.length; i++)
    await contexts[i]
      .pages()[0]
      ?.screenshot({ animations: 'disabled', path: new URL(`maps-failure-${i}.png`, output).pathname })
      .catch(() => {});
  throw error;
} finally {
  for (const c of contexts)
    for (const p of c.pages())
      await p
        .evaluate(() => {
          window.__stopStress?.();
          return window.__game?.connection.room?.leave();
        })
        .catch(() => {});
  await browser.close();
}
