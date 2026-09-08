import { chromium, devices, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  errors = [],
  report = {};
async function start(options) {
  const c = await browser.newContext(options),
    p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:5173/?verify=1');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({ timeout: 30000 });
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await p.getByRole('button', { name: /Endless/ }).click();
  await p.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await p.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(p.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  return p;
}
const send = (p, data) =>
  p.evaluate((data) => window.__game.connection.send({ id: crypto.randomUUID(), ...data }), data);
const point = (p, id) =>
  p.evaluate((id) => {
    const w = window.__game.world,
      t = window.__game.getState().towers[id],
      v = w.camera.position.clone().set(t.x, 1, t.z).project(w.camera),
      r = w.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) * r.width) / 2, y: r.top + ((1 - v.y) * r.height) / 2 };
  }, id);
const inspect = (p) =>
  p.evaluate(() => {
    const w = window.__game.world;
    return {
      hover: w.hoveredId,
      selected: w.selectedId,
      hoverRange: w.hoverRange?.userData,
      range: w.selection?.userData,
      cursor: w.renderer.domElement.style.cursor,
      ranges: w.scene.children.filter((x) => ['tower-range', 'tower-hover-range'].includes(x.name)).length,
    };
  });
try {
  const p = await start({ viewport: { width: 1440, height: 900 } });
  const a = await send(p, { action: 'build', kind: 'ballista', x: -4, z: 1 }),
    b = await send(p, { action: 'build', kind: 'ballista', x: -1, z: 1 });
  expect(a.ok && b.ok).toBe(true);
  await p.waitForFunction((id) => !!window.__game.world.towerObjects.get(id), b.towerId);
  const pa = await point(p, a.towerId),
    pb = await point(p, b.towerId);
  await p.mouse.move(pa.x, pa.y);
  await expect.poll(async () => (await inspect(p)).hover).toBe(a.towerId);
  expect((await inspect(p)).hoverRange.radius).toBe(4.8);
  await p.mouse.click(pa.x, pa.y);
  await expect.poll(async () => (await inspect(p)).selected).toBe(a.towerId);
  expect((await inspect(p)).range.radius).toBe(4.8);
  await p.mouse.move(pb.x, pb.y);
  await expect.poll(async () => (await inspect(p)).hover).toBe(b.towerId);
  expect((await inspect(p)).ranges).toBe(2);
  expect((await inspect(p)).selected).toBe(a.towerId);
  await p.screenshot({ path: 'verification/output/tower-hover-desktop.png', animations: 'disabled' });
  await p.getByRole('button', { name: 'Ton einschalten' }).hover();
  await expect.poll(async () => (await inspect(p)).hover).toBe(null);
  expect((await inspect(p)).ranges).toBe(1);
  expect((await send(p, { action: 'sell', towerId: b.towerId })).ok).toBe(true);
  expect((await send(p, { action: 'upgrade', towerId: a.towerId })).ok).toBe(true);
  await expect.poll(async () => (await inspect(p)).range?.radius).toBe(5.02);
  await p.mouse.move(pa.x, pa.y);
  await p.mouse.move(10, 10);
  await p.keyboard.press('Escape');
  await expect.poll(async () => (await inspect(p)).ranges).toBe(0);
  for (let i = 0; i < 12; i++) {
    await p.mouse.move(pa.x, pa.y);
    await p.mouse.move(10, 10);
  }
  expect((await inspect(p)).ranges).toBe(0);
  await p.mouse.move(pa.x, pa.y);
  await send(p, { action: 'sell', towerId: a.towerId });
  await expect.poll(async () => (await inspect(p)).ranges).toBe(0);
  report.desktop = {
    hover: true,
    selectionPersists: true,
    secondHover: true,
    upgradeRadius: true,
    saleCleanup: true,
  };
  const m = await start({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const t = await send(m, { action: 'build', kind: 'ballista', x: -4, z: 1 });
  await m.waitForFunction((id) => !!window.__game.world.towerObjects.get(id), t.towerId);
  const pm = await point(m, t.towerId);
  await m.touchscreen.tap(pm.x, pm.y);
  await expect.poll(async () => (await inspect(m)).selected).toBe(t.towerId);
  expect((await inspect(m)).hover).toBe(null);
  expect((await inspect(m)).range.radius).toBe(4.8);
  await m.screenshot({ path: 'verification/output/tower-selected-mobile.png', animations: 'disabled' });
  const panel = await m.locator('.sidebar.has-selection').boundingBox();
  expect(panel.y).toBeGreaterThan(pm.y + 30);
  report.touchSelection = true;
  expect(errors).toEqual([]);
  report.errors = errors;
  await writeFile('verification/output/hover-report.json', JSON.stringify(report, null, 2));
  console.log('Hover OK', report);
} catch (e) {
  process.exitCode = 1;
  console.error(e);
} finally {
  await browser.close();
}
