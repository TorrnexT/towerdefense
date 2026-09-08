import { chromium, expect } from '@playwright/test';
import { matchMaker } from '@colyseus/core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../server/dist/index.js';
const server = await startServer(2570),
  browser = await chromium.launch({ channel: 'chrome', headless: true }),
  url = 'http://127.0.0.1:2570',
  errors = [],
  report = {};
const workerPath = new URL('../gameclient/dist/service-worker.js', import.meta.url),
  originalWorker = await readFile(workerPath, 'utf8');
const out = new URL('./output/', import.meta.url);
await mkdir(out, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Observe the public worker protocol in a test-owned browser; no test API ships in production.
await context.addInitScript(() => {
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(url, options) {
      super(url, options);
      if (String(url).includes('simulation.worker')) {
        window.testWorker = this;
        this.addEventListener('message', (e) => {
          if (e.data.type === 'state') window.testState = e.data.state;
        });
      }
    }
  };
  window.testCommand = (command) =>
    new Promise((resolve, reject) => {
      const w = window.testWorker,
        id = crypto.randomUUID(),
        t = setTimeout(() => reject(Error('Worker command timeout')), 5000),
        listener = (e) => {
          if (e.data.type === 'result' && e.data.result.id === id) {
            w.removeEventListener('message', listener);
            clearTimeout(t);
            resolve(e.data.result);
          }
        };
      w.addEventListener('message', listener);
      w.postMessage({ type: 'command', command: { id, ...command } });
    });
});
let page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.locator('.account-modal')).toContainText('Offline bereit', { timeout: 30000 });
  await page.getByRole('button', { name: 'Account schließen' }).click();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys(),
      cache = await caches.open(keys.find((k) => k.startsWith('emberwatch-')));
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cache.filter((p) => p.includes('/campaign/') && p.endsWith('.webp'))).toHaveLength(12);
  expect(cache.some((p) => p.includes('simulation.worker'))).toBe(true);
  expect(cache.some((p) => p.endsWith('.glb'))).toBe(true);
  expect(await page.evaluate(() => typeof window.__game)).toBe('undefined');
  report.cachedAssets = cache.length;
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await page.getByRole('button', { name: /Kampagne/ }).click();
  await page.getByRole('button', { name: 'Team zusammenstellen' }).click();
  await page.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(page.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  const plan = JSON.parse(await readFile(new URL('balance-campaign.json', out), 'utf8'))[0];
  for (let wave = 0; wave < plan.actions.length; wave++) {
    await page.waitForFunction(
      (w) => window.testState?.phase === 'preparing' && window.testState.completedWaves === w,
      wave,
      { timeout: 45000 },
    );
    for (const action of plan.actions[wave])
      expect((await page.evaluate((action) => window.testCommand(action), action)).ok).toBe(true);
    await page.evaluate(() => window.testCommand({ action: 'setSpeed', speed: 10 }));
    await page.evaluate(() => window.testCommand({ action: 'startWave' }));
  }
  await expect(page.getByRole('heading', { name: 'Das Feuer brennt weiter.' })).toBeVisible({
    timeout: 45000,
  });
  await expect(page.locator('.victory')).toContainText('Spielstand-Level 2');
  await page.screenshot({ path: new URL('offline-victory.png', out).pathname });
  expect((await matchMaker.query({ name: 'endless' })).length).toBe(0);
  report.offlineVictory = true;
  await page.close();
  page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.locator('.account-modal')).toContainText('Level 2');
  await expect(page.locator('.account-modal')).toContainText('100 EP');
  await page.getByRole('button', { name: 'Account schließen' }).click();
  await page.getByRole('button', { name: 'Türme', exact: true }).click();
  await expect(page.locator('.research-balance')).toContainText('50 Forschungspunkte');
  await page.locator('.research-upgrade').click();
  await expect(page.locator('.research-balance')).toContainText('25 Forschungspunkte');
  await page.reload();
  await page.getByRole('button', { name: 'Türme', exact: true }).click();
  await expect(page.locator('.research-balance')).toContainText('25 Forschungspunkte');
  await expect(page.locator('.research-portrait .tower-stars')).toHaveAttribute(
    'aria-label',
    /Forschungsstufe 1 von 15/,
  );
  await page.getByRole('button', { name: 'Forschung schließen' }).click();
  report.offlineResearch = true;

  await context.setOffline(true);
  await context.setOffline(false);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole('button', { name: 'Multispieler', exact: true }).click();
  await expect(page.locator('.menu-error')).toContainText('Koop benötigt');
  await page.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await page.getByRole('button', { name: /Kampagne/ }).click();
  await expect(page.locator('[data-mission="mission-02"]')).toHaveClass(/available/);
  await page.screenshot({ path: new URL('offline-restored.png', out).pathname });
  await page.getByRole('button', { name: 'Kampagne schließen' }).click();
  report.offlineReopen = true;
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Multispieler', exact: true }).click();
  await page.getByRole('button', { name: /Kampagne/ }).click();
  await page.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  const code = await page.getByTestId('room-code').textContent(),
    room = matchMaker.getLocalRoomById(code);
  const guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    guest = await guestContext.newPage();
  guest.on('pageerror', (e) => errors.push(e.message));
  await guest.goto(url + '/?room=' + encodeURIComponent(code));
  await expect(guest.getByRole('button', { name: 'Ich bin bereit', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Karte ändern', exact: true }).click();
  await page.locator('[data-mission="mission-02"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Vorherige Mission abschließen' })).toBeDisabled();
  await page.getByRole('button', { name: 'Kampagne schließen' }).click();
  for (const p of [guest, page]) await p.getByRole('button', { name: 'Ich bin bereit', exact: true }).click();
  await page.getByRole('button', { name: 'Gemeinsam starten', exact: true }).click();
  await expect(guest.locator('.party-modal')).toHaveCount(0);
  // A reserved guest must receive the victory even if the host already opened the next lobby.
  await guestContext.setOffline(true);
  await expect
    .poll(() => [...room.state.players.values()].some((p) => !p.connected), { timeout: 15000 })
    .toBe(true);
  room.state.phase = 'combat';
  room.state.wave = 4;
  room.state.kills = 58;
  room.simulation.step();
  expect(room.state.phase).toBe('victory');
  await expect(page.getByRole('heading', { name: 'Das Feuer brennt weiter.' })).toBeVisible();
  await page.getByRole('button', { name: 'Mission wiederholen', exact: true }).click();
  await expect(page.locator('.party-modal')).toBeVisible();
  await guestContext.setOffline(false);
  await expect(guest.locator('.party-modal')).toBeVisible({ timeout: 15000 });
  await guest.getByRole('button', { name: 'Team bearbeiten' }).click();
  await expect(guest.locator('.team-picker')).toContainText('Spielstand-Level 2');
  await expect(guest.locator('.team-slot.locked')).toHaveCount(6);
  await guest.screenshot({ path: new URL('coop-earned-victory.png', out).pathname });
  await guest.getByRole('button', { name: 'Turmauswahl schließen' }).click();
  report.coopReservedVictory = true;
  for (const p of [guest, page]) await p.getByRole('button', { name: 'Ich bin bereit', exact: true }).click();
  await page.getByRole('button', { name: 'Gemeinsam starten', exact: true }).click();
  await page.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  for (let i = 0; i < 20000 && room.state.phase !== 'defeat'; i++) room.simulation.step();
  expect(room.state.phase).toBe('defeat');
  await expect(guest.getByRole('button', { name: 'Warte auf den Host' })).toBeDisabled();
  await page.getByRole('button', { name: 'Gemeinsam neu starten', exact: true }).click();
  await expect(guest.locator('.party-modal')).toBeVisible();
  report.coopDefeatRematch = true;
  // Install a test-owned cache revision: it must wait while a local battle is running.
  await page.getByRole('button', { name: 'Zurück zum Solo', exact: true }).click();
  await page.getByRole('button', { name: 'Gruppe verlassen', exact: true }).click();
  await page.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await page.getByRole('button', { name: /Endless/ }).click();
  await page.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await page.getByRole('button', { name: 'In die Schlacht' }).click();
  await page.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  await page.evaluate(() => {
    window.testControllerChanges = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.testControllerChanges++);
  });
  await writeFile(
    workerPath,
    originalWorker.replace(/const CACHE="([^"]+)"/, 'const CACHE="$1-update-test"'),
  );
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), {
      timeout: 15000,
    })
    .toBe(true);
  await page.getByRole('button', { name: 'Hauptmenü', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update laden', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.testControllerChanges)).toBe(0);
  // Reload intentionally ends the local run. The player can now activate the complete update.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Update laden', exact: true })).toBeVisible();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Update laden', exact: true }).click(),
  ]);
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  const updated = await page.evaluate(() => caches.keys());
  expect(updated.filter((k) => k.startsWith('emberwatch-'))).toHaveLength(1);
  expect(updated[0]).toContain('-update-test');
  report.updateWaitsForBattle = true;

  expect(errors).toEqual([]);
  report.errors = errors;
  console.log('Production / offline OK', report);
  await writeFile(new URL('production-report.json', out), JSON.stringify(report, null, 2));
} catch (e) {
  process.exitCode = 1;
  await page.screenshot({ path: new URL('production-failure.png', out).pathname }).catch(() => {});
  throw e;
} finally {
  for (const listing of await matchMaker.query({})) {
    const local = matchMaker.getLocalRoomById(listing.roomId);
    if (local) local.onDrop = () => {};
  }
  await browser.close();
  await writeFile(workerPath, originalWorker);
  await server.gracefullyShutdown(false);
}
