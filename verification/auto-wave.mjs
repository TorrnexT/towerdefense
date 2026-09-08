import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await p.goto('http://127.0.0.1:5173/?verify=1');
  await expect(p.getByRole('button', { name: 'Einzelspieler', exact: true })).toBeEnabled({ timeout: 30000 });
  await p.getByRole('button', { name: 'Einzelspieler', exact: true }).tap();
  await p.getByRole('button', { name: /Endless/ }).tap();
  await p.getByRole('button', { name: 'Spiel starten', exact: true }).tap();
  await p.getByRole('button', { name: 'In die Schlacht' }).tap();
  const toggle = p.getByRole('button', { name: 'Nächste Runde nicht automatisch starten', exact: true });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await p.evaluate(() => window.__game.getState().autoStart)).toBe(false);
  await p.getByRole('button', { name: 'Erste Welle starten', exact: true }).tap();
  await expect(toggle).toBeEnabled();
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await p.evaluate(() => window.__game.getState().autoStart)).toBe(true);
  await toggle.tap();
  await expect(toggle).toHaveText('✓Auto-Start aus');
  await p.screenshot({ path: 'verification/output/auto-wave-mobile.png' });
  console.log('Auto-wave OK: touch toggle, worker synchronization, combat toggle, manual first wave');
} finally {
  await browser.close();
}
