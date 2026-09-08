import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  report = {},
  errors = [];
try {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
    p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:5173/?verify=1');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({ timeout: 30000 });
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await p.getByRole('button', { name: /Endless/ }).click();
  await p.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await p.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(p.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  const boundary = await p.evaluate(
    async (path) => {
      const { placementError, MAPS } = await import(path);
      const w = window.__game.world,
        canvas = w.renderer.domElement;
      for (let y = 290; y < 610; y += 1)
        for (let x = 380; x < 920; x += 1) {
          if (document.elementFromPoint(x, y) !== canvas) continue;
          const point = w.screenPoint(x, y);
          if (placementError(point, [], MAPS.waldtal)) continue;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (placementError(w.screenPoint(x + dx, y + dy), [], MAPS.waldtal))
              return { green: { x, y }, red: { x: x + dx, y: y + dy }, point };
        }
    },
    '/@fs' + process.cwd() + '/shared/src/maps.ts',
  );
  expect(boundary).toBeTruthy();
  const card = p.locator('.tower-dock [data-tower="ballista"]'),
    box = await card.boundingBox();
  async function drag(target) {
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(target.x, target.y, { steps: 14 });
  }
  await drag(boundary.green);
  await expect(p.locator('.build-hint')).not.toHaveClass(/invalid/);
  const snapshot = await p.evaluate(() => {
    const w = window.__game.world;
    const colors = [];
    w.ghost.traverse((o) => {
      if (o.isMesh) colors.push(o.material.color.getHex());
    });
    return { point: { x: w.ghost.position.x, z: w.ghost.position.z }, colors };
  });
  // Inject a newly synchronized obstruction while the pointer is stationary.
  const tint = await p.evaluate(() => {
    const w = window.__game.world,
      s = structuredClone(window.__game.getState());
    s.towers.remote = {
      id: 'remote',
      owner: 'peer',
      kind: 'ballista',
      level: 1,
      research: 0,
      invested: 100,
      x: w.ghost.position.x,
      z: w.ghost.position.z,
      angle: 0,
    };
    w.update(s);
    const colors = [];
    w.ghost.traverse((o) => {
      if (o.isMesh) colors.push(o.material.color.getHex());
    });
    w.update(window.__game.getState());
    return colors;
  });
  expect(tint.every((c) => c === 0xe27c68)).toBe(true);
  report.stationaryPreviewRecolors = true;
  await p.screenshot({ path: 'verification/output/placement-edge-preview.png', animations: 'disabled' });
  const cdp = await c.newCDPSession(p);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: boundary.red.x,
    y: boundary.red.y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await cdp.detach();
  await expect.poll(() => p.evaluate(() => Object.keys(window.__game.getState().towers).length)).toBe(1);
  const built = await p.evaluate(() => Object.values(window.__game.getState().towers)[0]);
  expect(built.x).toBeCloseTo(snapshot.point.x, 8);
  expect(built.z).toBeCloseTo(snapshot.point.z, 8);
  report.releaseUsesVisiblePoint = true;
  // Red drops keep the wallet intact and explain the refusal.
  await p.keyboard.press('Escape');
  await drag(boundary.red);
  await expect(p.locator('.build-hint')).toHaveClass(/invalid/);
  const gold = await p.getByTestId('gold').textContent();
  await p.mouse.up();
  await expect(p.locator('.toast')).toBeVisible();
  expect(await p.getByTestId('gold').textContent()).toBe(gold);
  expect(await p.evaluate(() => Object.keys(window.__game.getState().towers).length)).toBe(1);
  report.invalidDropExplained = true;
  expect(errors).toEqual([]);
  report.errors = errors;
  await writeFile('verification/output/placement-report.json', JSON.stringify(report, null, 2));
  console.log('Placement OK', report);
} catch (e) {
  process.exitCode = 1;
  console.error(e);
} finally {
  await browser.close();
}
