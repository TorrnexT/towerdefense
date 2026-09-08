import { chromium, expect, devices } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {},
  errors = [];
async function ready(page) {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?verify=1');
  await expect(page.getByRole('button', { name: 'Türme', exact: true })).toBeEnabled({ timeout: 30000 });
}
const claim = (page, ids) =>
  page.evaluate(
    (ids) =>
      window.__game.profile.claimRewards(
        Object.fromEntries(ids.map((id) => [id, { xp: 100, research: 50, missionId: '', wave: 10 }])),
      ),
    ids,
  );
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
    a = await ctx.newPage(),
    b = await ctx.newPage();
  await ready(a);
  await ready(b);
  await Promise.all([claim(a, ['same-run:10']), claim(b, ['same-run:10'])]);
  await expect.poll(() => a.evaluate(() => window.__game.profile.value.xp)).toBe(100);
  await expect.poll(() => b.evaluate(() => window.__game.profile.value.xp)).toBe(100);
  const upgrade = (page) =>
    page.evaluate(() =>
      window.__game.profile.upgradeTower('ballista', 0).then(
        () => true,
        () => false,
      ),
    );
  const duplicates = await Promise.all([upgrade(a), upgrade(b)]);
  expect(duplicates.filter(Boolean)).toHaveLength(1);
  await expect.poll(() => a.evaluate(() => window.__game.profile.value.research.ballista)).toBe(1);
  expect(await a.evaluate(() => window.__game.profile.error)).toBe('');
  await a.getByRole('button', { name: 'Türme', exact: true }).click();
  await expect(a.locator('.research-balance')).toContainText('25 Forschungspunkte');
  await expect(a.locator('.research-upgrade')).toBeDisabled();
  await expect(a.locator('.research-shortfall')).toContainText('10 Forschungspunkte');
  report.duplicateRewardsAndPurchases = true;
  await claim(
    a,
    Array.from({ length: 30 }, (_, i) => `run-${i}:10`),
  );
  await expect(a.locator('.research-balance')).toContainText('1525 Forschungspunkte');
  for (let rank = 2; rank <= 15; rank++) {
    await a.locator('.research-upgrade').click();
    await expect.poll(() => a.evaluate(() => window.__game.profile.value.research.ballista)).toBe(rank);
    if ([5, 6, 10, 15].includes(rank)) {
      const stars = a.locator('.research-portrait .tower-stars svg');
      await expect(stars).toHaveCount(Math.ceil(rank / 5));
      await expect(a.locator('.research-portrait .full-star')).toHaveCount(Math.floor(rank / 5));
    }
  }
  await expect(a.locator('.research-upgrade')).toHaveText(/Drei Sterne erreicht/);
  await expect(a.locator('.research-balance')).toContainText('125 Forschungspunkte');
  await a.screenshot({ path: 'verification/output/research-desktop.png', animations: 'disabled' });
  await a.reload();
  await expect(a.getByRole('button', { name: 'Türme', exact: true })).toBeEnabled({ timeout: 30000 });
  expect(await a.evaluate(() => window.__game.profile.value.research.ballista)).toBe(15);
  expect(await a.evaluate(() => localStorage.getItem('emberwatch-profile-v1').includes('ballista'))).toBe(
    false,
  );
  report.starsAndEncryptedReload = true;
  await a.getByRole('button', { name: 'Einzelspieler', exact: true }).click();
  await a.getByRole('button', { name: /Endless/ }).click();
  await a.getByRole('button', { name: 'Spiel starten', exact: true }).click();
  await expect(a.locator('.team-slot.locked')).toHaveCount(0);
  await a.getByRole('button', { name: 'Arkanobelisk aufwerten', exact: true }).click();
  await expect(a.locator('.research-detail h3')).toHaveText('Arkanobelisk');
  await a.locator('.research-upgrade').click();
  await expect.poll(() => a.evaluate(() => window.__game.profile.value.research.arcane)).toBe(1);
  await a.getByRole('button', { name: 'Forschung schließen' }).click();
  await expect(a.locator('.team-picker')).toBeVisible();
  await expect(
    a
      .getByRole('button', { name: 'Slot 2: Arkanobelisk' })
      .getByRole('img', { name: /Forschungsstufe 1 von 15/ }),
  ).toHaveCount(1);
  await a.getByRole('button', { name: 'In die Schlacht' }).click();
  await expect(a.getByRole('button', { name: 'Erste Welle starten', exact: true })).toBeEnabled();
  const built = await a.evaluate(async () => {
    const c = window.__game.connection;
    return c.send({ id: crypto.randomUUID(), action: 'build', kind: 'ballista', x: -4, z: 1 });
  });
  expect(built.ok).toBe(true);
  await expect
    .poll(() => a.evaluate(() => Object.values(window.__game.getState().towers)[0]?.research))
    .toBe(15);
  await expect(a.locator('.tower-dock [data-tower="ballista"] .full-star')).toHaveCount(3);
  await a.evaluate(() =>
    window.__game.connection.send({ id: crypto.randomUUID(), action: 'setSpeed', speed: 10 }),
  );
  await a.getByRole('button', { name: 'Erste Welle starten', exact: true }).click();
  await a.waitForFunction(() => window.__game.getState().kills > 0, {}, { timeout: 30000 });
  report.workerResearchCombat = true;
  expect(
    await a.evaluate(() =>
      window.__game.connection.enter('coop', undefined, 'Forscher', 'waldtal', { ruleSet: 'endless' }),
    ),
  ).toBe(true);
  await a.waitForFunction(() => window.__game.getState().lobby);
  await a.evaluate(() =>
    window.__game.connection.send({ id: crypto.randomUUID(), action: 'ready', ready: true }),
  );
  await expect
    .poll(() =>
      a.evaluate(() => {
        const g = window.__game;
        return g.getState().players[g.connection.playerId].ready;
      }),
    )
    .toBe(true);
  await a.evaluate(() => window.__game.profile.upgradeTower('fire', 0));
  await expect
    .poll(() =>
      a.evaluate(() => {
        const g = window.__game;
        return g.getState().players[g.connection.playerId].research.fire;
      }),
    )
    .toBe(1);
  expect(
    await a.evaluate(() => {
      const g = window.__game;
      return g.getState().players[g.connection.playerId].ready;
    }),
  ).toBe(false);
  report.coopResearchReadiness = true;

  // Legacy encrypted campaign progress gets its existing XP and retroactive research budget.
  const legacy = await browser.newContext(),
    l = await legacy.newPage();
  await ready(l);
  await l.evaluate(async () => {
    const store = window.__game.profile;
    const p = structuredClone(store.value);
    p.completed = 2;
    p.missions = { 'mission-01': { hp: 100, kills: 50 }, 'mission-02': { hp: 90, kills: 60 } };
    delete p.xp;
    delete p.research;
    delete p.claimed;
    const key = await new Promise((resolve) => {
      const r = indexedDB.open('emberwatch-vault', 1);
      r.onsuccess = () => {
        const db = r.result,
          q = db.transaction('keys').objectStore('keys').get('profile');
        q.onsuccess = () => {
          db.close();
          resolve(q.result);
        };
      };
    });
    const iv = crypto.getRandomValues(new Uint8Array(12)),
      data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('emberwatch-profile-v1') },
        key,
        new TextEncoder().encode(JSON.stringify(p)),
      );
    const b64 = (x) => btoa(String.fromCharCode(...new Uint8Array(x)));
    localStorage.setItem('emberwatch-profile-v1', JSON.stringify({ v: 1, iv: b64(iv), data: b64(data) }));
  });
  await l.reload();
  await l.waitForFunction(() => window.__game?.profile.ready);
  expect(await l.evaluate(() => window.__game.profile.value.xp)).toBe(200);
  await l.getByRole('button', { name: 'Türme', exact: true }).click();
  await expect(l.locator('.research-balance')).toContainText('100 Forschungspunkte');
  report.legacyMigration = true;
  expect(
    await l.evaluate(async () => {
      const { sealProfile, openProfile } = await import('/src/profile.ts');
      const p = structuredClone(window.__game.profile.value);
      p.claimed = Array.from({ length: 5000 }, (_, i) => `long-lived-${i}-${crypto.randomUUID()}:10`);
      return (await openProfile(await sealProfile(p))).claimed.length;
    }),
  ).toBe(5000);
  report.largeEncryptedHistory = true;
  await legacy.close();
  for (const [name, size] of [
    ['phone', { width: 390, height: 844 }],
    ['landscape', { width: 844, height: 390 }],
    ['tablet', { width: 768, height: 1024 }],
  ]) {
    const c = await browser.newContext({ ...devices['iPhone 13'], viewport: size, reducedMotion: 'reduce' }),
      p = await c.newPage();
    await ready(p);
    await claim(p, ['mobile:10']);
    await p.getByRole('button', { name: 'Türme', exact: true }).tap();
    await p.locator('.research-upgrade').scrollIntoViewIfNeeded();
    await p.locator('.research-upgrade').tap();
    await expect.poll(() => p.evaluate(() => window.__game.profile.value.research.ballista)).toBe(1);
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await p.screenshot({ path: `verification/output/research-${name}.png`, animations: 'disabled' });
    await p.getByRole('button', { name: 'Forschung schließen' }).tap();
    await p.getByRole('button', { name: 'Einzelspieler', exact: true }).tap();
    await p.getByRole('button', { name: /Endless/ }).tap();
    await p.getByRole('button', { name: 'Spiel starten', exact: true }).tap();
    await p.getByRole('button', { name: 'Balliste aufwerten', exact: true }).scrollIntoViewIfNeeded();
    await p.getByRole('button', { name: 'Balliste aufwerten', exact: true }).tap();
    await expect(p.locator('.research-detail h3')).toHaveText('Balliste');
    await p.getByRole('button', { name: 'Forschung schließen' }).focus();
    await p.keyboard.press('Enter');
    await expect(p.locator('.team-picker')).toBeVisible();
    await p.screenshot({ path: `verification/output/research-team-${name}.png`, animations: 'disabled' });
    await c.close();
  }
  report.responsiveTouchKeyboard = true;
  expect(errors).toEqual([]);
  report.errors = errors;
  await writeFile('verification/output/research-report.json', JSON.stringify(report, null, 2));
  console.log('Research verification OK', report);
} catch (e) {
  process.exitCode = 1;
  console.error(e);
  for (const c of browser.contexts())
    for (const p of c.pages())
      await p.screenshot({ path: 'verification/output/research-failure.png' }).catch(() => {});
} finally {
  await browser.close();
}
