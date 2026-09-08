import { chromium, devices, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const output = new URL('./output/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  rooms = [],
  contexts = [];
const report = {};
async function page(options) {
  const context = await browser.newContext(options);
  contexts.push(context);
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
async function ready(p, path = '/?verify=1') {
  await p.goto(url + path);
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
}
async function build(p, x, z, touch = false) {
  const destination = await p.evaluate(({ x, z }) => window.__game.world.project({ x, z }), { x, z });
  const rect = await p.locator('.tower-card.ballista').boundingBox();
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
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
async function command(room, payload) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout')), 3000);
    const off = room.onMessage('result', (r) => {
      if (r.id === id) {
        off();
        clearTimeout(timer);
        resolve(r);
      }
    });
    room.send('command', { id, ...payload });
  });
}
try {
  const host = await page({
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const guest = await page(devices['iPhone 13']);
  await ready(host);
  await host.getByRole('button', { name: 'Koop spielen', exact: true }).click();
  await host.getByLabel('Dein Name', { exact: true }).fill('Ada');
  await host.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).click();
  await host.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await expect(host.getByRole('heading', { name: 'Versammelt die Hüter.' })).toBeVisible();
  const code = await host.getByTestId('room-code').textContent();
  await host.getByRole('button', { name: 'Einladungslink kopieren', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Einladungslink kopiert' })).toBeVisible();
  const copied = await host.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).searchParams.get('room')).toBe(code);
  await ready(guest, '/?verify=1&room=' + encodeURIComponent(code));
  await guest.getByLabel('Dein Name', { exact: true }).fill('Bela');
  await guest.getByLabel('Dein Name', { exact: true }).blur();
  await expect(host.locator('.party-member').filter({ hasText: 'Bela' })).toBeVisible();
  // Code entry also works, from an already-running solo room.
  const third = await page({ viewport: { width: 1024, height: 768 } });
  await ready(third);
  await third.getByRole('button', { name: 'Koop spielen', exact: true }).click();
  await third.getByLabel('Dein Name', { exact: true }).fill('Cleo');
  await third.getByLabel('Raumcode oder Einladungslink').fill(code);
  await third.getByRole('button', { name: 'Raum beitreten', exact: true }).click();
  await expect(third.getByTestId('room-code')).toHaveText(code);
  const client = new Client(url);
  const fourth = await client.joinById(code, { name: 'Dora' });
  rooms.push(fourth);
  fourth.onMessage('result', () => {});
  fourth.onMessage('shot', () => {});
  fourth.onMessage('impact', () => {});
  await expect(host.locator('.party-code')).toContainText('4 / 4');
  await host.screenshot({ path: new URL('coop-lobby-desktop.png', output).pathname });
  await guest.screenshot({ path: new URL('coop-lobby-mobile.png', output).pathname });
  await expect(host.getByRole('button', { name: 'Gemeinsam starten', exact: true })).toBeDisabled();
  for (const p of [host, guest, third])
    await p.getByRole('button', { name: 'Ich bin bereit', exact: true }).click();
  expect((await command(fourth, { action: 'ready', ready: true })).ok).toBe(true);
  await expect(host.getByRole('button', { name: 'Gemeinsam starten', exact: true })).toBeEnabled();
  await host.getByRole('button', { name: 'Gemeinsam starten', exact: true }).click();
  for (const p of [host, guest, third]) await expect(p.locator('.party-modal')).toHaveCount(0);
  await expect(guest.getByRole('button', { name: /^Spielgeschwindigkeit:/ })).toBeDisabled();
  await build(host, -9, -1);
  await expect(host.getByTestId('gold')).toHaveText('140');
  await host.getByRole('button', { name: 'Auswahl schließen' }).click();
  await build(guest, -4, 1, true);
  await expect(guest.getByTestId('gold')).toHaveText('140');
  await guest.getByRole('button', { name: 'Auswahl schließen' }).click();
  await expect.poll(() => third.evaluate(() => Object.keys(window.__game.getState().towers).length)).toBe(2);
  const guestTower = await guest.evaluate(
    () =>
      Object.values(window.__game.getState().towers).find(
        (t) => t.owner === window.__game.connection.playerId,
      ).id,
  );
  await host.evaluate((id) => window.__game.world.onPick({ x: -4, z: 1 }, id), guestTower);
  await expect(host.locator('.tower-owner')).toContainText('Bela');
  await expect(host.getByRole('button', { name: /Aufwerten/ })).toHaveCount(0);
  await host.getByRole('button', { name: 'Auswahl schließen' }).click();
  const ownerColors = await host.evaluate(() =>
    [...window.__game.world.towerObjects.values()].map((t) =>
      t.root.getObjectByName('owner-marker').material.color.getHexString(),
    ),
  );
  expect(new Set(ownerColors).size).toBe(2);
  const playerId = await guest.evaluate(() => window.__game.connection.playerId);
  await guest.reload();
  await guest.waitForFunction(
    () => window.__game?.getState()?.players && Object.keys(window.__game.getState().players).length === 4,
  );
  expect(await guest.evaluate(() => window.__game.connection.playerId)).toBe(playerId);
  await expect(guest.getByTestId('gold')).toHaveText('140');
  await expect(guest.locator('.modal-backdrop')).toHaveCount(0);
  await host.getByRole('button', { name: /^Spielgeschwindigkeit:/ }).click();
  await expect(guest.getByRole('button', { name: /^Spielgeschwindigkeit:/ })).toContainText('2×');
  await host.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  await expect(guest.locator('.combat-status')).toBeVisible();
  await expect
    .poll(() => host.evaluate(() => window.__game.getState().kills), { timeout: 30000 })
    .toBeGreaterThan(0);
  const shared = await host.evaluate(() =>
    Object.values(window.__game.getState().players).map((p) => ({ name: p.name, gold: p.gold })),
  );
  expect(shared.find((p) => p.name === 'Cleo').gold).toBeGreaterThan(240);
  expect(shared.find((p) => p.name === 'Dora').gold).toBe(shared.find((p) => p.name === 'Cleo').gold);
  await host.screenshot({ path: new URL('coop-battle-desktop.png', output).pathname });
  await guest.screenshot({ path: new URL('coop-battle-mobile.png', output).pathname });
  await guest.setViewportSize({ width: 844, height: 390 });
  await guest.getByRole('button', { name: 'Gruppe anzeigen', exact: true }).click();
  await expect(guest.locator('.party-modal')).toBeVisible();
  await guest.screenshot({ path: new URL('coop-party-landscape.png', output).pathname });
  await guest.getByRole('button', { name: 'Koop schließen' }).click();
  await host.getByRole('button', { name: 'Gruppe anzeigen', exact: true }).click();
  await host.getByRole('button', { name: 'Zurück zum Solo', exact: true }).click();
  await host.getByRole('button', { name: 'Gruppe verlassen', exact: true }).click();
  await expect(host.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  expect(await host.evaluate(() => location.search.includes('room='))).toBe(false);
  await host.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await host.getByRole('button', { name: /Endless/ }).click();
  await host.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await host.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(host.getByRole('button', { name: 'Koop spielen', exact: true })).toBeVisible();
  await expect(guest.getByRole('button', { name: /^Spielgeschwindigkeit:/ })).toBeEnabled();
  await expect
    .poll(() =>
      guest.evaluate(() =>
        Object.values(window.__game.getState().towers).every(
          (t) => t.owner === window.__game.connection.playerId,
        ),
      ),
    )
    .toBe(true);
  // A bad code must show a useful error and retain the current solo game.
  await host.getByRole('button', { name: 'Koop spielen', exact: true }).click();
  await host.getByLabel('Raumcode oder Einladungslink').fill('expired-room');
  await host.getByRole('button', { name: 'Raum beitreten', exact: true }).click();
  await expect(host.getByRole('alert')).toContainText('Raum nicht verfügbar');
  await host.getByRole('button', { name: 'Koop schließen' }).click();
  await expect(host.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  Object.assign(report, {
    players: 4,
    codeAndLink: true,
    readiness: true,
    mouseAndTouchBuild: true,
    ownership: true,
    sharedRewards: true,
    reloadRecovery: true,
    hostSuccession: true,
    invalidCodeRecovery: true,
    errors,
  });
  await writeFile(new URL('coop-report.json', output), JSON.stringify(report, null, 2));
  console.log('Coop browser OK:', JSON.stringify(report));
} catch (error) {
  for (let i = 0; i < contexts.length; i++) {
    const p = contexts[i].pages()[0];
    await p?.screenshot({ path: new URL(`coop-failure-${i}.png`, output).pathname }).catch(() => {});
  }
  throw error;
} finally {
  // Explicitly leave test rooms so no 60-second abandoned reservations linger.
  for (const context of contexts)
    for (const p of context.pages())
      await p.evaluate(() => window.__game?.connection.room?.leave()).catch(() => {});
  await Promise.all(rooms.filter((r) => r.connection.isOpen).map((r) => r.leave().catch(() => {})));
  await browser.close();
}
