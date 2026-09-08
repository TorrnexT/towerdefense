import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const url = process.env.GAME_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {};
try {
  const context = await browser.newContext(),
    a = await context.newPage();
  await a.addInitScript(() => {
    if (!localStorage.getItem('fixture')) {
      localStorage.setItem('emberwatch-best', '12');
      localStorage.setItem('emberwatch-best-silberfurt', '7');
      localStorage.setItem('fixture', '1');
    }
  });
  await a.goto(url + '/?verify=1');
  await a.waitForFunction(() => window.__game?.profile.ready);
  report.migration = await a.evaluate(() => ({
    records: window.__game.profile.value.records,
    removed: localStorage.getItem('emberwatch-best') === null,
  }));
  expect(report.migration.records.waldtal).toBe(12);
  expect(report.migration.records.silberfurt).toBe(7);
  expect(report.migration.removed).toBe(true);
  const encryption = await a.evaluate(async () => {
    const { openProfile, sealProfile, PROFILE_KEY } = await import('/src/profile.ts');
    const p = window.__game.profile.value,
      first = await sealProfile(p),
      second = await sealProfile(p);
    const request = indexedDB.open('emberwatch-vault', 1);
    const key = await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const db = request.result,
          r = db.transaction('keys').objectStore('keys').get('profile');
        r.onsuccess = () => {
          db.close();
          resolve(r.result);
        };
        r.onerror = () => reject(r.error);
      };
    });
    return {
      roundtrip: JSON.stringify(await openProfile(first)) === JSON.stringify(p),
      newIV: JSON.parse(first).iv !== JSON.parse(second).iv,
      plaintext: localStorage.getItem(PROFILE_KEY).includes('completed'),
      extractable: key.extractable,
      bits: key.algorithm.length,
    };
  });
  expect(encryption).toEqual({
    roundtrip: true,
    newIV: true,
    plaintext: false,
    extractable: false,
    bits: 256,
  });
  report.encryption = encryption;
  const b = await context.newPage();
  await b.goto(url + '/?verify=1');
  await b.waitForFunction(() => window.__game?.profile.ready);
  const win = (page) =>
    page.evaluate(() =>
      window.__game.profile.record({
        ruleSet: 'campaign',
        phase: 'victory',
        missionId: 'mission-01',
        baseHp: 93,
        kills: 58,
      }),
    );
  await Promise.all([win(a), win(b)]);
  await expect.poll(() => a.evaluate(() => window.__game.profile.value.completed)).toBe(1);
  await Promise.all([
    a.evaluate(() =>
      window.__game.profile.update((p) => {
        p.records.waldtal = Math.max(p.records.waldtal, 14);
      }),
    ),
    b.evaluate(() =>
      window.__game.profile.update((p) => {
        p.records.silberfurt = Math.max(p.records.silberfurt, 11);
      }),
    ),
  ]);
  await expect.poll(() => a.evaluate(() => window.__game.profile.value.records.silberfurt)).toBe(11);
  await expect.poll(() => b.evaluate(() => window.__game.profile.value.records.waldtal)).toBe(14);
  report.parallelTabs = true;
  // A full disk must retain the last encrypted main version and retry the pending mutation.
  const quota = await a.evaluate(async () => {
    const { PROFILE_KEY } = await import('/src/profile.ts');
    const before = localStorage.getItem(PROFILE_KEY),
      original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === PROFILE_KEY) throw new DOMException('Speicher voll', 'QuotaExceededError');
      return original.call(this, k, v);
    };
    try {
      await window.__game.profile.update((p) => {
        p.records.glutspalten = 9;
      });
    } catch {}
    const preserved = localStorage.getItem(PROFILE_KEY) === before,
      error = window.__game.profile.error;
    try {
      await window.__game.profile.update((p) => {
        p.records.frostklamm = 8;
      });
    } catch {}
    await window.__game.profile.retry();
    const retryStillFull = !!window.__game.profile.error;
    Storage.prototype.setItem = original;
    await window.__game.profile.retry();
    return {
      preserved,
      error,
      retryStillFull,
      retried:
        window.__game.profile.value.records.glutspalten === 9 &&
        window.__game.profile.value.records.frostklamm === 8,
    };
  });
  expect(quota.preserved).toBe(true);
  expect(quota.error).toBeTruthy();
  expect(quota.retried).toBe(true);
  expect(quota.retryStillFull).toBe(true);
  report.quota = quota;
  await b.close();
  await a.evaluate(() => localStorage.setItem('emberwatch-profile-v1', 'broken'));
  await a.reload();
  await a.waitForFunction(() => window.__game?.profile.error);
  expect(await a.evaluate(() => localStorage.getItem('emberwatch-profile-v1'))).toBe('broken');
  await a.getByRole('button', { name: 'Sicherung wiederherstellen' }).click();
  await expect(a.locator('.save-error')).toHaveCount(0);
  report.backup = true;
  // Corrupt content cannot be silently replaced when the key has gone away.
  await a.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase('emberwatch-vault');
      r.onsuccess = resolve;
      r.onerror = reject;
    });
  });
  const cipher = await a.evaluate(() => localStorage.getItem('emberwatch-profile-v1'));
  await a.reload();
  await expect(a.locator('.save-error')).toBeVisible();
  expect(await a.evaluate(() => localStorage.getItem('emberwatch-profile-v1'))).toBe(cipher);
  report.missingKeyPreserved = true;
  console.log('Storage OK', report);
  await writeFile(new URL('./output/storage-report.json', import.meta.url), JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
