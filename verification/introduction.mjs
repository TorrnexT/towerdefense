import { chromium, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let guest;
const errors = [];
const send = (room, command) =>
  new Promise((resolve) => {
    const id = crypto.randomUUID();
    const off = room.onMessage('result', (r) => {
      if (r.id === id) {
        off();
        resolve(r);
      }
    });
    room.send('command', { id, ...command });
  });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?verify=1');
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Einzelspieler', exact: true }).tap();
  await page.getByRole('button', { name: /Endless/ }).tap();
  await page.getByRole('button', { name: 'Spiel starten', exact: true }).tap();
  await page.getByRole('button', { name: 'In die Schlacht' }).tap();
  await page.getByRole('button', { name: 'Erste Welle starten', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Koboldläufer' })).toBeVisible();
  expect(await page.evaluate(() => window.__game.getState().paused)).toBe(true);
  await expect(page.locator('.enemy-intro-portrait canvas')).toBeVisible();
  await expect(page.locator('.enemy-intro')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'verification/output/introduction-mobile.png' });
  await page.getByRole('button', { name: 'Verstanden · Weiter', exact: true }).tap();
  await expect(page.locator('.enemy-intro')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.getState().paused)).toBe(false);
  await page.reload();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Multispieler', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Multispieler', exact: true }).click();
  await page.getByRole('button', { name: /Endless/ }).click();
  await page.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await page.waitForFunction(() => window.__game.connection.room?.roomId && window.__game.getState()?.lobby);
  const id = await page.evaluate(() => window.__game.connection.room.roomId);
  guest = await new Client('http://127.0.0.1:2567').joinById(id, { name: 'Mira' });
  guest.onMessage('shot', () => {});
  guest.onMessage('impact', () => {});
  await expect.poll(() => page.evaluate(() => Object.keys(window.__game.getState().players).length)).toBe(2);
  await send(guest, { action: 'ready', ready: true });
  for (const command of [{ action: 'ready', ready: true }, { action: 'startGame' }, { action: 'startWave' }])
    expect(
      (await page.evaluate((c) => window.__game.connection.send({ id: crypto.randomUUID(), ...c }), command))
        .ok,
    ).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Koboldläufer' })).toBeVisible();
  await page.getByRole('button', { name: /Verstanden · Weiter/ }).click();
  await expect(page.getByRole('button', { name: /Warte auf die Gruppe/ })).toBeDisabled();
  await expect(page.locator('.intro-readiness')).toContainText('Mira');
  expect(await page.evaluate(() => window.__game.getState().paused)).toBe(true);
  await page.screenshot({ path: 'verification/output/introduction-coop.png' });
  expect((await send(guest, { action: 'ackIntroduction', kind: 'goblin' })).ok).toBe(true);
  await expect(page.locator('.enemy-intro')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.getState().paused)).toBe(false);
  expect(errors).toEqual([]);
  console.log(
    'Introduction OK: mobile 3D modal, solo pause, two-client cooperative acknowledgements and badges',
  );
} finally {
  await guest?.leave();
  await browser.close();
}
