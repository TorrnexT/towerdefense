import { chromium, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  guests = [];
const send = (room, c) =>
  new Promise((resolve) => {
    const id = crypto.randomUUID();
    const off = room.onMessage('result', (r) => {
      if (r.id === id) {
        off();
        resolve(r);
      }
    });
    room.send('command', { id, ...c });
  });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?verify=1');
  await expect(page.getByRole('button', { name: 'Multispieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Multispieler', exact: true }).click();
  await page.getByRole('button', { name: /Endless/ }).click();
  await page.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await page.waitForFunction(() => window.__game.getState()?.lobby && window.__game.connection.room?.roomId);
  const roomId = await page.evaluate(() => window.__game.connection.room.roomId);
  await page.locator('.build-zones summary').click();
  await expect(page.getByRole('button', { name: 'Jeder darf überall bauen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Sektoren um die Kartenmitte', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sektoren um die Kartenmitte', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__game.getState().buildMode)).toBe('sectors');
  const client = new Client('http://127.0.0.1:2567');
  for (const name of ['Mira', 'Finn']) {
    const g = await client.joinById(roomId, { name });
    g.onMessage('shot', () => {});
    g.onMessage('impact', () => {});
    guests.push(g);
  }
  await expect.poll(() => page.evaluate(() => Object.keys(window.__game.getState().players).length)).toBe(3);
  await page.getByRole('button', { name: 'Sektoren um die Kartenmitte', exact: true }).click();
  await expect.poll(() => guests[0].state.buildMode).toBe('sectors');
  await expect(page.locator('.zone-assignments select')).toHaveCount(3);
  await page
    .getByRole('combobox', { name: 'Spieler für Gebiet 1', exact: true })
    .selectOption(guests[0].sessionId);
  await expect.poll(() => guests[1].state.zoneOwners[0]).toBe(guests[0].sessionId);
  await page.locator('.zone-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'verification/output/territories-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.zone-map').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'verification/output/territories-mobile.png', animations: 'disabled' });
  expect(await page.locator('.build-zones').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(
    (await send(guests[0], { action: 'setBuildZones', mode: 'all', owners: [...guests[0].state.zoneOwners] }))
      .ok,
  ).toBe(false);
  await page.getByRole('button', { name: 'Streifen · West nach Ost', exact: true }).click();
  for (const g of guests) await send(g, { action: 'ready', ready: true });
  for (const c of [{ action: 'ready', ready: true }, { action: 'startGame' }])
    expect(
      (await page.evaluate((c) => window.__game.connection.send({ id: crypto.randomUUID(), ...c }), c)).ok,
    ).toBe(true);
  if (await page.getByRole('button', { name: 'Koop schließen', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Koop schließen', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  const card = page.locator('.tower-dock [data-tower="ballista"]');
  await card.scrollIntoViewIfNeeded();
  const rect = await card.boundingBox();
  const point = await page.evaluate(() => window.__game.world.project({ x: -11, z: 1 }));
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 15 });
  await expect
    .poll(() => page.evaluate(() => !!window.__game.world.scene.getObjectByName('foreign-build-areas')))
    .toBe(true);
  const area = await page.evaluate(() => {
    const root = window.__game.world.scene.getObjectByName('build-territories');
    return {
      foreign: root.getObjectByName('foreign-build-areas').geometry.attributes.position.count,
      own: root.getObjectByName('own-build-areas').geometry.attributes.position.count,
      lines: root.getObjectByName('territory-boundaries').geometry.attributes.position.count,
    };
  });
  expect(area.foreign).toBeGreaterThan(0);
  expect(area.own).toBeGreaterThan(0);
  expect(area.lines).toBeGreaterThan(0);
  await page.screenshot({ path: 'verification/output/territories-drag.png' });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await page.evaluate(() => !!window.__game.world.scene.getObjectByName('foreign-build-areas'))).toBe(
    false,
  );
  expect(await page.evaluate(() => !!window.__game.world.scene.getObjectByName('territory-boundaries'))).toBe(
    true,
  );
  // Left-hand point belongs to Mira after assignment swap.
  const result = await page.evaluate(() =>
    window.__game.connection.send({
      id: crypto.randomUUID(),
      action: 'build',
      kind: 'ballista',
      x: -11,
      z: 1,
    }),
  );
  expect(result.ok).toBe(false);
  expect(result.error).toContain('Baugebiet');
  expect((await send(guests[0], { action: 'build', kind: 'ballista', x: -11, z: 1 })).ok).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    'Territories OK: lobby defaults, 3-player preview, assignment swap, synchronized settings, host-only changes, build enforcement, responsive layout',
  );
} finally {
  for (const g of guests) await g.leave();
  await browser.close();
}
