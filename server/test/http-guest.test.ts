import test from 'node:test';
import assert from 'node:assert/strict';
import { createId } from '@emberwatch/shared';

test('HTTP guest profiles stay in memory, serialize updates and ignore persistent storage', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { isSecureContext: false, addEventListener() {} },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  // No localStorage, IndexedDB or browser locks exist in this test.
  const { ProfileStore } = await import('../../gameclient/src/profile');
  const store = new ProfileStore();
  await store.load();
  assert.equal(store.guest, true);
  assert.equal(store.ready, true);
  assert.equal(store.error, '');
  await Promise.all([
    store.update((p) => {
      p.records.waldtal += 1;
    }),
    store.update((p) => {
      p.records.waldtal += 2;
    }),
  ]);
  assert.equal(store.value.records.waldtal, 3);
  await store.load();
  assert.equal(store.value.records.waldtal, 3);
  await assert.rejects(store.saveTeam([]));
  assert.equal(store.error, '');
  assert.equal(store.value.records.waldtal, 3);
  await assert.rejects(store.restoreBackup(), /Gastmodus/);
  const reloaded = new ProfileStore();
  await reloaded.load();
  assert.equal(reloaded.value.records.waldtal, 0);
});

test('game IDs remain valid and distinct without secure-context randomUUID', (t) => {
  const previous = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  t.after(() => {
    if (previous) Object.defineProperty(crypto, 'randomUUID', previous);
    else Reflect.deleteProperty(crypto, 'randomUUID');
  });
  const ids = Array.from({ length: 100 }, () => createId());
  assert.equal(new Set(ids).size, 100);
  for (const id of ids)
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
