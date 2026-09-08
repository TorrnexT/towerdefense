import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?verify=1');
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.evaluate(() => window.__game.profile.saveTeam(['fire']));
  await page.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await page.getByRole('button', { name: /Endless/ }).click();
  await page.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await page.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(page.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  expect(
    (
      await page.evaluate(() =>
        window.__game.connection.send({ id: 'laser-build', action: 'build', kind: 'fire', x: -4, z: 1 }),
      )
    ).ok,
  ).toBe(true);
  await page.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  await page.waitForFunction(
    () => Object.values(window.__game.getState().projectiles).some((p) => p.kind === 'fire'),
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__game.getState().paused)).toBe(true);
  const beam = await page.evaluate(() => {
    const g = window.__game,
      p = Object.values(g.getState().projectiles).find((p) => p.kind === 'fire'),
      o = g.world.projectileObjects.get(p.id);
    return {
      target:
        Object.values(g.getState().enemies).find((e) => e.hp < e.maxHp)?.id ||
        Object.values(g.getState().enemies)[0].id,
      source: p.sourceId,
      length: Math.hypot(p.vx, p.vz),
      visible: o.root.visible,
      parts: o.root.children.length,
      hp:
        Object.values(g.getState().enemies).find((e) => e.hp < e.maxHp)?.hp ||
        Object.values(g.getState().enemies)[0].hp,
    };
  });
  expect(beam.length).toBeGreaterThan(1);
  expect(beam.visible).toBe(true);
  expect(beam.parts).toBe(24);
  await page.screenshot({ path: 'verification/output/fire-breath.png' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate((id) => window.__game.getState().enemies[id]?.hp || 0, beam.target))
    .toBeLessThan(beam.hp);
  expect(errors).toEqual([]);
  console.log('Flame OK: synchronized cone, animated fire geometry, worker damage and pause');
} finally {
  await browser.close();
}
