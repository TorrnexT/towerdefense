import { chromium, devices, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const out = new URL('./output/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  report = {};
const contexts = [];
async function create(options) {
  const c = await browser.newContext(options);
  contexts.push(c);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url + '/?verify=1');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({ timeout: 30000 });
  return p;
}
async function atlas(p) {
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await p.getByRole('button', { name: /Kampagne/ }).click();
  await expect(p.locator('.campaign-screen')).toBeVisible();
}
async function screenshot(p, name) {
  await p.screenshot({ animations: 'disabled', path: new URL(name + '.png', out).pathname });
}
async function drag(p, source, target, touch = false) {
  await source.scrollIntoViewIfNeeded();
  const a = await source.boundingBox(),
    b = await target.boundingBox(),
    from = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (touch) {
    const c = await p.context().newCDPSession(p);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
    await p.waitForTimeout(280);
    for (let i = 1; i <= 12; i++)
      await c.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12, id: 1 },
        ],
      });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await c.detach();
  } else {
    await p.mouse.move(from.x, from.y);
    await p.mouse.down();
    await p.mouse.move(to.x, to.y, { steps: 12 });
    await p.mouse.up();
  }
}
try {
  const page = await create({ viewport: { width: 1440, height: 900 } });
  let matchmaking = 0;
  page.on('request', (r) => {
    if (r.url().includes('/matchmake/')) matchmaking++;
  });
  await atlas(page);
  await expect(page.locator('.mission-node')).toHaveCount(15);
  await screenshot(page, 'campaign-desktop');
  const before = await page.locator('.campaign-atlas').getAttribute('style');
  await page.getByRole('button', { name: 'Kampagnenkarte vergrößern' }).click();
  expect(await page.locator('.campaign-atlas').getAttribute('style')).not.toBe(before);
  await page.locator('[data-mission="mission-02"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Vorherige Mission abschließen' })).toBeDisabled();
  await page.locator('[data-mission="mission-01"]').focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Mission zentrieren' }).click();
  await page.getByRole('button', { name: 'Team zusammenstellen' }).click();
  await expect(page.locator('.team-slot')).toHaveCount(10);
  await expect(page.locator('.team-slot.locked')).toHaveCount(7);
  await expect(page.locator('.team-catalog .tower-card')).toHaveCount(13);
  await drag(
    page,
    page.getByRole('button', { name: 'Slot 1: Balliste' }),
    page.locator('[data-team-slot="1"]'),
  );
  await expect(page.getByRole('button', { name: 'Slot 2: Balliste' })).toBeVisible();
  await drag(
    page,
    page.getByRole('button', { name: 'Slot 2: Balliste' }),
    page.locator('[data-team-slot="0"]'),
  );
  await expect(page.getByRole('button', { name: 'Slot 1: Balliste' })).toBeVisible();
  await page.getByRole('button', { name: 'Granatwerfer auswählen' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Slot 3: Feuerturm' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Slot 3: Granatwerfer' })).toBeVisible();
  await page.getByRole('button', { name: 'Feuerturm auswählen' }).click();
  await page.getByRole('button', { name: 'Slot 3: Granatwerfer' }).click();
  await screenshot(page, 'team-desktop');
  await page.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(page.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.__game.connection.local)).toBe(true);
  expect(matchmaking).toBe(0);
  await expect(page.locator('.tower-dock .tower-card')).toHaveCount(3);
  const plan = JSON.parse(await readFile(new URL('balance-campaign.json', out), 'utf8'))[0];
  for (let wave = 0; wave < plan.actions.length; wave++) {
    await page.waitForFunction(
      (w) => window.__game.getState().phase === 'preparing' && window.__game.getState().completedWaves === w,
      wave,
      { timeout: 45000 },
    );
    for (const action of plan.actions[wave]) {
      const result = await page.evaluate(
        (action) => window.__game.connection.send({ id: crypto.randomUUID(), ...action }),
        action,
      );
      expect(result.ok, JSON.stringify(action)).toBe(true);
    }
    await page.evaluate(() =>
      window.__game.connection.send({ id: crypto.randomUUID(), action: 'setSpeed', speed: 10 }),
    );
    await page.evaluate(() =>
      window.__game.connection.send({ id: crypto.randomUUID(), action: 'startWave' }),
    );
    if (wave === 0) {
      await page.waitForFunction(() => Object.keys(window.__game.getState().enemies).length > 0);
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect.poll(() => page.evaluate(() => window.__game.getState().paused)).toBe(true);
      const frozen = await page.evaluate(() => JSON.stringify(window.__game.getState().enemies));
      await page.waitForTimeout(350);
      expect(await page.evaluate(() => JSON.stringify(window.__game.getState().enemies))).toBe(frozen);
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await expect.poll(() => page.evaluate(() => window.__game.getState().paused)).toBe(false);
      report.backgroundPause = true;
    }
  }
  await expect(page.getByRole('heading', { name: 'Das Feuer brennt weiter.' })).toBeVisible({
    timeout: 45000,
  });
  await expect.poll(() => page.evaluate(() => window.__game.profile.value.completed)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__game.profile.value.xp)).toBe(100);
  await expect.poll(() => page.evaluate(() => window.__game.profile.value.claimed.length)).toBe(1);
  await screenshot(page, 'campaign-victory');
  await page.getByRole('button', { name: 'Nächste Mission', exact: true }).click();
  await expect(page.locator('.team-slot.locked')).toHaveCount(6);
  await page.getByRole('button', { name: 'Turmauswahl schließen' }).click();
  await page.getByRole('button', { name: 'Zur Kampagnenkarte' }).click();
  await expect(page.locator('[data-mission="mission-02"]')).toHaveClass(/available/);
  await screenshot(page, 'campaign-unlocked');
  report.soloVictory = { hp: plan.hp, firstWinXP: 100, slots: 4, matchmaking };
  // Exercise all ten slots with a structurally valid completed campaign fixture.
  await page.getByRole('button', { name: 'Kampagne schließen' }).click();
  await page.getByRole('button', { name: 'Zum Hauptmenü', exact: true }).click();
  await page.evaluate(async () => {
    const p = window.__game.profile;
    await p.update((v) => {
      v.completed = 13;
      v.xp = 1300;
      for (let i = 1; i <= 13; i++)
        v.missions['mission-' + String(i).padStart(2, '0')] = { hp: 80, kills: 100 };
      v.loadout = [
        'ballista',
        'arcane',
        'fire',
        'grenade',
        'sniper',
        'repeater',
        'runemortar',
        'prism',
        'ember',
        'meteor',
      ];
    });
  });
  await atlas(page);
  await page.getByRole('button', { name: 'Team zusammenstellen' }).click();
  await expect(page.locator('.team-slot.locked')).toHaveCount(0);
  await page.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(page.locator('.team-picker')).toHaveCount(0);
  await expect(page.locator('.tower-dock .tower-card')).toHaveCount(10);
  await screenshot(page, 'ten-tower-dock');
  const mobile = await create(devices['iPhone 13']);
  await atlas(mobile);
  await screenshot(mobile, 'campaign-mobile');
  const cdp = await mobile.context().newCDPSession(mobile);
  const region = await mobile.locator('.campaign-viewport').boundingBox();
  const y = region.y + region.height * 0.5,
    x = region.width * 0.5;
  const view = await mobile.locator('.campaign-atlas').getAttribute('style');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - 30, y, id: 1 },
      { x: x + 30, y, id: 2 },
    ],
  });
  for (let i = 1; i <= 10; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - 30 - i * 4, y, id: 1 },
        { x: x + 30 + i * 4, y, id: 2 },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await mobile.locator('.campaign-atlas').getAttribute('style')).not.toBe(view);
  await cdp.detach();
  await mobile.getByRole('button', { name: 'Team zusammenstellen' }).tap();
  await screenshot(mobile, 'team-mobile');
  await drag(
    mobile,
    mobile.getByRole('button', { name: 'Granatwerfer auswählen' }),
    mobile.locator('[data-team-slot="1"]'),
    true,
  );
  await expect(mobile.getByRole('button', { name: 'Slot 2: Granatwerfer' })).toBeVisible();
  await screenshot(mobile, 'team-touch-drag');
  await mobile.getByRole('button', { name: 'In die Schlacht' }).tap();
  await expect(mobile.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  await screenshot(mobile, 'campaign-mobile-battle');
  for (const size of [
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 360, height: 740 },
  ]) {
    await mobile.setViewportSize(size);
    await mobile.getByRole('button', { name: 'Hauptmenü', exact: true }).click();
    await atlas(mobile);
    await screenshot(mobile, `campaign-${size.width}x${size.height}`);
    await mobile.getByRole('button', { name: 'Team zusammenstellen' }).click();
    await expect(mobile.getByRole('button', { name: 'In die Schlacht' })).toBeInViewport();
    const button = await mobile.getByRole('button', { name: 'In die Schlacht' }).boundingBox(),
      panel = await mobile.locator('.team-picker').boundingBox();
    expect(button.y + button.height).toBeLessThanOrEqual(panel.y + panel.height);
    await screenshot(mobile, `team-${size.width}x${size.height}`);
    await mobile.getByRole('button', { name: 'In die Schlacht' }).click();
    await expect(mobile.locator('.team-picker')).toHaveCount(0);
  }
  await mobile.getByRole('button', { name: 'Hauptmenü', exact: true }).click();
  await mobile.evaluate(async () => {
    await window.__game.profile.update((p) => {
      p.completed = 13;
      p.xp = 1300;
      for (let i = 1; i <= 13; i++)
        p.missions['mission-' + String(i).padStart(2, '0')] = { hp: 80, kills: 100 };
      p.loadout = [
        'ballista',
        'arcane',
        'fire',
        'grenade',
        'sniper',
        'repeater',
        'runemortar',
        'prism',
        'ember',
        'meteor',
      ];
    });
  });
  await atlas(mobile);
  await mobile.getByRole('button', { name: 'Team zusammenstellen' }).click();
  await mobile.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(mobile.locator('.team-picker')).toHaveCount(0);
  const dock = await mobile.locator('.tower-cards').boundingBox(),
    swipe = await mobile.context().newCDPSession(mobile);
  for (let n = 0; n < 4; n++) {
    await swipe.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: dock.x + dock.width - 35, y: dock.y + dock.height / 2, id: 1 }],
    });
    for (let i = 1; i <= 10; i++) {
      await swipe.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: dock.x + dock.width - 35 - (i * (dock.width - 70)) / 10, y: dock.y + dock.height / 2, id: 1 },
        ],
      });
      await mobile.waitForTimeout(16);
    }
    await swipe.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe.detach();
  expect(await mobile.locator('.tower-cards').evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
  await expect(mobile.locator('.tower-dock .meteor')).toBeInViewport();
  await expect(mobile.locator('.build-hint')).toHaveCount(0);
  await screenshot(mobile, 'ten-towers-mobile-scrolled');
  report.tenCardTouchScroll = true;
  const reduced = await create({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce' });
  await atlas(reduced);
  await reduced.getByRole('button', { name: 'Team zusammenstellen' }).click();
  await expect(reduced.locator('.team-picker')).toHaveCSS('animation-name', 'none');
  report.drag = {
    mouseSwap: true,
    keyboardPlacement: true,
    touchHold: true,
    pinchZoom: true,
    responsive: true,
  };
  expect(errors).toEqual([]);
  report.errors = errors;
  console.log('Campaign OK', report);
  await writeFile(new URL('campaign-report.json', out), JSON.stringify(report, null, 2));
} catch (e) {
  for (const c of contexts)
    for (const p of c.pages()) await screenshot(p, 'campaign-failure-' + contexts.indexOf(c)).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
