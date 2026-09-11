import test from 'node:test';
import assert from 'node:assert/strict';
import { waveAnnouncement, type WaveMoment } from '../../gameclient/src/waveAnnouncements';
const preparing: WaveMoment = { wave: 0, completedWaves: 0, phase: 'preparing' };
const combat: WaveMoment = { wave: 1, completedWaves: 0, phase: 'combat' };

test('announces wave start once, including a final campaign wave', () => {
  assert.deepEqual(waveAnnouncement(preparing, combat, 4), { kind: 'start', wave: 1 });
  assert.equal(waveAnnouncement(combat, combat, 4), null);
  assert.deepEqual(
    waveAnnouncement(
      { wave: 3, completedWaves: 3, phase: 'preparing' },
      { wave: 4, completedWaves: 3, phase: 'combat' },
      4,
    ),
    { kind: 'final', wave: 4 },
  );
});
test('announces completion and lets a newer wave replace outdated completion', () => {
  assert.deepEqual(waveAnnouncement(combat, { wave: 1, completedWaves: 1, phase: 'preparing' }), {
    kind: 'complete',
    wave: 1,
  });
  assert.deepEqual(waveAnnouncement(combat, { wave: 2, completedWaves: 1, phase: 'combat' }), {
    kind: 'start',
    wave: 2,
  });
});
test('joining, reconnecting and restarting do not replay historical announcements', () => {
  assert.equal(waveAnnouncement(null, combat), null);
  assert.equal(waveAnnouncement(combat, preparing), null);
  assert.equal(waveAnnouncement(preparing, preparing), null);
});
test('endless never announces a final wave; victory and defeat retain their own dialogs', () => {
  assert.deepEqual(
    waveAnnouncement(
      { wave: 99, completedWaves: 99, phase: 'preparing' },
      { wave: 100, completedWaves: 99, phase: 'combat' },
    ),
    { kind: 'start', wave: 100 },
  );
  assert.equal(waveAnnouncement(combat, { wave: 1, completedWaves: 1, phase: 'victory' }), null);
  assert.equal(waveAnnouncement(combat, { wave: 1, completedWaves: 0, phase: 'defeat' }), null);
});
