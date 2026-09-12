// Run after: VITE_BASE_PATH=/towerdefense/ VITE_SERVER_URL=/towerdefense/api pnpm build
// Requires nginx and Chrome; override NGINX_BINARY / CHROME_PATH when needed.
import { chromium, expect } from '@playwright/test';
import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { startServer } from '../server/dist/index.js';
import { createServer } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
async function port() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '0.0.0.0', r));
  const result = server.address().port;
  await new Promise((r) => server.close(r));
  return result;
}
const backendPort = await port(),
  httpPort = await port();
const address = Object.values(networkInterfaces())
  .flat()
  .find((i) => i.family === 'IPv4' && !i.internal)?.address;
assert.ok(address, 'A non-loopback IPv4 address is required to test an insecure HTTP origin');
const directory = await mkdtemp(`${tmpdir()}/emberwatch-subpath-`);
const dist = fileURLToPath(new URL('../gameclient/dist/', import.meta.url));
const game = await startServer(backendPort);
let nginx, browser, room;
const errors = [],
  failed = [],
  requests = [],
  sockets = [];
try {
  const config = `daemon off; master_process off; pid ${directory}/nginx.pid; error_log stderr; events {} http {
    access_log off; client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy; fastcgi_temp_path ${directory}/fastcgi; uwsgi_temp_path ${directory}/uwsgi; scgi_temp_path ${directory}/scgi;
    types { text/html html; text/css css; application/javascript js; application/manifest+json webmanifest; image/svg+xml svg; image/png png; image/webp webp; font/ttf ttf; }
    server { listen ${httpPort}; server_name "" ~^.*$; root ${dist};
      location = / { return 302 /towerdefense/; }
      location = /towerdefense { return 302 /towerdefense/; }
      location = /towerdefense/api { return 302 /towerdefense/api/; }
      location ^~ /towerdefense/ { alias ${dist}; index index.html; }
      location ^~ /towerdefense/api/ { proxy_pass http://127.0.0.1:${backendPort}/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
    }
  }`;
  await writeFile(`${directory}/nginx.conf`, config);
  nginx = spawn(process.env.NGINX_BINARY || 'nginx', ['-p', directory, '-c', `${directory}/nginx.conf`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  nginx.on('error', (error) => errors.push(error.message));
  const url = `http://${address}:${httpPort}/towerdefense`;
  for (let attempt = 0; ; attempt++) {
    try {
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
      break;
    } catch (e) {
      if (attempt > 50) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('emberwatch-profile-v1', 'preserve-existing-profile');
    localStorage.setItem('emberwatch-profile-v1-backup', 'preserve-existing-backup');
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (response) => {
    requests.push(response.url());
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto(url);
  assert.equal(page.url(), `${url}/`);
  assert.equal(await page.evaluate(() => window.isSecureContext), false);
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(page.locator('.account-modal')).toContainText('HTTP-Gastmodus');
  await page.getByRole('button', { name: 'Account schließen' }).click();
  await page.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await page.getByRole('button', { name: 'Kampagne', exact: true }).click();
  await page.getByRole('button', { name: 'Team zusammenstellen' }).click();
  await page.getByRole('button', { name: 'In die Schlacht', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  assert.deepEqual(
    await page.evaluate(() => [
      localStorage.getItem('emberwatch-profile-v1'),
      localStorage.getItem('emberwatch-profile-v1-backup'),
    ]),
    ['preserve-existing-profile', 'preserve-existing-backup'],
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Multispieler', exact: true }).click();
  await page.getByRole('button', { name: 'Endless', exact: true }).click();
  await page.getByRole('button', { name: 'Koop-Raum erstellen', exact: true }).click();
  await page.getByRole('button', { name: 'Lobby erstellen', exact: true }).click();
  await expect
    .poll(() => sockets.some((s) => s.startsWith(`ws://${address}:${httpPort}/towerdefense/api/`)))
    .toBe(true);
  room = await new Client(`${url}/api`).joinOrCreate('endless');
  await room.leave();
  room = undefined;
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.ok(requests.some((u) => u.includes('/towerdefense/assets/') && u.endsWith('.glb')));
  assert.deepEqual(
    requests
      .filter((u) => u.startsWith('http'))
      .map((u) => new URL(u).pathname)
      .filter((p) => p !== '/towerdefense' && !p.startsWith('/towerdefense/')),
    [],
  );
  // Localhost remains a secure context: test persisted profiles and scoped offline caching too.
  const secure = await browser.newContext(),
    securePage = await secure.newPage();
  securePage.on('pageerror', (e) => errors.push(e.message));
  await securePage.goto(`http://127.0.0.1:${httpPort}/towerdefense/`);
  await expect(securePage.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await securePage.waitForFunction(() => !!navigator.serviceWorker.controller);
  const cached = await securePage.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((n) => n.startsWith('emberwatch-')));
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  assert.ok(cached.length > 40);
  assert.ok(cached.every((p) => p.startsWith('/towerdefense/')));
  // API navigations must reach the server even with an active game service worker.
  const apiPage = await secure.newPage();
  const apiBase = `http://127.0.0.1:${httpPort}/towerdefense/api`;
  for (const endpoint of ['health', 'status']) {
    const response = await apiPage.goto(`${apiBase}/${endpoint}`);
    assert.equal(response.status(), 200);
    assert.equal(response.fromServiceWorker(), false);
    assert.match(response.headers()['content-type'], /application\/json/);
    assert.deepEqual(await response.json(), { ok: true, game: 'Emberwatch' });
    assert.equal(await apiPage.evaluate(() => !!navigator.serviceWorker.controller), true);
  }
  const redirectPromise = apiPage.waitForResponse((response) => response.url() === apiBase);
  await apiPage.goto(apiBase);
  const redirect = await redirectPromise;
  assert.equal(redirect.status(), 302);
  assert.equal(redirect.fromServiceWorker(), false);
  await apiPage.close();
  await secure.setOffline(true);
  await securePage.reload();
  await expect(securePage.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        frontend: '/towerdefense/',
        backend: '/towerdefense/api/',
        httpGuest: true,
        solo: true,
        websockets: sockets,
        cachedAssets: cached.length,
        apiNavigations: ['/towerdefense/api/health', '/towerdefense/api/status'],
        apiRedirect: true,
        offlineReload: true,
        errors,
        failed,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Test-owned rooms do not need a reconnect grace period during cleanup.
  for (const listing of await matchMaker.query({})) {
    const local = matchMaker.getLocalRoomById(listing.roomId);
    if (local) local.onDrop = () => {};
  }
  if (room) await room.leave();
  await browser?.close();
  if (nginx && nginx.exitCode === null) {
    const exited = new Promise((r) => nginx.once('exit', r));
    nginx.kill('SIGTERM');
    await exited;
  }
  await game.gracefullyShutdown(false);
  await rm(directory, { recursive: true, force: true });
}
