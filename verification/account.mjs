import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/?verify=1');
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({
    timeout: 30000,
  });
  await expect(page.locator('.profile-badge')).toHaveCount(0);
  await expect(page.getByText('BAUEN. VERTEIDIGEN. ÜBERLEBEN.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Account' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Registrieren' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Login', exact: true })).toBeDisabled();
  await expect(dialog).toContainText('Noch 100 EP bis Level 2');
  await page.evaluate(async () => {
    const store = window.__game.profile;
    await store.update((p) => {
      p.xp = 200;
    });
    await store.recordStatistics('account-test:0', { kills: 37, completedWaves: 12, phase: 'victory' });
    await store.recordStatistics('account-test:0', { kills: 37, completedWaves: 12, phase: 'victory' });
  });
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  await expect(dialog.locator('.level-ring')).toHaveAttribute(
    'aria-label',
    'Level 2 · 50 % bis zum nächsten Level',
  );
  await expect(dialog.locator('dd').nth(1)).toHaveText('37');
  await expect(dialog.locator('dd').first()).toHaveText('12 Wellen');
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'verification/output/account-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(dialog.locator('dd').nth(1)).toHaveText('37');
  for (const size of [
    { width: 360, height: 740 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Login', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Login', exact: true })).toBeInViewport();
    await page.screenshot({ path: `verification/output/account-${size.width}x${size.height}.png` });
  }
  expect(errors).toEqual([]);
  console.log(
    'Account OK: ring, XP, statistics, deduplication, encrypted reload, modal keyboard, responsive scrolling',
  );
} finally {
  await browser.close();
}
