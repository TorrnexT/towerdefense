import { chromium, devices, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true }),
  errors = [],
  report = {};
try {
  for (const [kind, label, status, mobile] of [
    ['inferno', 'Brandbake', 'burn', false],
    ['venom', 'Giftkessel', 'poison', false],
    ['frost', 'Frostobelisk', 'slow', true],
  ]) {
    const context = await browser.newContext(
        mobile
          ? { ...devices['iPhone 13'], reducedMotion: 'reduce' }
          : { viewport: { width: 1440, height: 900 } },
      ),
      p = await context.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('http://127.0.0.1:5173/?verify=1');
    await expect(p.getByRole('button', { name: 'Türme', exact: true })).toBeEnabled({ timeout: 30000 });
    await p.getByRole('button', { name: 'Türme', exact: true }).click();
    await p.getByRole('button', { name: `${label} erforschen` }).click();
    await expect(p.locator('.research-detail h3')).toHaveText(label);
    await expect(p.locator('.research-stats')).toContainText(
      kind === 'frost' ? 'Verlangsamung' : 'über Zeit',
    );
    await p.screenshot({ path: `verification/output/status-${kind}-research.png`, animations: 'disabled' });
    await p.getByRole('button', { name: 'Forschung schließen' }).click();
    await p.evaluate((kind) => window.__game.profile.saveTeam([kind]), kind);
    await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
    await p.getByRole('button', { name: /Endless/ }).click();
    await p.getByRole('button', { name: 'Spiel starten', exact: true }).click();
    await expect(p.locator('.team-catalog .tower-card')).toHaveCount(13);
    await p.getByRole('button', { name: 'In die Schlacht' }).click();
    await expect(p.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
    expect(
      (
        await p.evaluate(
          (kind) =>
            window.__game.connection.send({ id: crypto.randomUUID(), action: 'build', kind, x: -4, z: 1 }),
          kind,
        )
      ).ok,
    ).toBe(true);
    await p.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
    await p.waitForFunction(
      (status) => Object.values(window.__game.getState().enemies).some((e) => e[status] > 0),
      status,
      { timeout: 30000 },
    );
    await p.evaluate(() =>
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }),
    );
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => p.evaluate(() => window.__game.getState().paused)).toBe(true);
    const result = await p.evaluate((status) => {
      const g = window.__game,
        e = Object.values(g.getState().enemies).find((e) => e[status] > 0);
      return {
        active: e[status],
        marker: g.world.enemyObjects.get(e.id).root.getObjectByName('status-' + status).visible,
      };
    }, status);
    expect(result.marker).toBe(true);
    report[kind] = result;
    await p.screenshot({ path: `verification/output/status-${kind}-battle.png`, animations: 'disabled' });
    await context.close();
  }
  expect(errors).toEqual([]);
  report.errors = errors;
  await writeFile('verification/output/status-report.json', JSON.stringify(report, null, 2));
  console.log('Status towers OK', report);
} catch (e) {
  process.exitCode = 1;
  console.error(e);
} finally {
  await browser.close();
}
