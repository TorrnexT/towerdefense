import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import { towerStats, FIRE_BREATH, pathPosition, damageAfterDefense, ENEMIES } from '@emberwatch/shared';
function fixture() {
  const s = new Simulation();
  s.addPlayer('p', 'Flamme', { loadout: ['fire'] });
  const r = s.command('p', { id: 'build', action: 'build', kind: 'fire', x: -4, z: 1 });
  assert.ok(r.ok);
  s.state.phase = 'combat';
  s.state.wave = 1;
  const a = s.spawn('ogre'),
    b = s.spawn('ogre'),
    outside = s.spawn('ogre');
  for (const e of [a, b, outside])
    Object.assign(e, pathPosition(13), { progress: 13, speed: 0, hp: 1000, maxHp: 1000 });
  // Freeze deterministic test positions while exercising the actual cone/damage handler.
  s.step();
  const p = [...s.state.projectiles.values()][0];
  assert.ok(p);
  const length = Math.hypot(p.vx, p.vz),
    ux = p.vx / length,
    uz = p.vz / length;
  Object.assign(a, { x: p.x + ux * 2, z: p.z + uz * 2 });
  Object.assign(b, { x: p.x + ux * 3 + uz * 0.3, z: p.z + uz * 3 - ux * 0.3 });
  Object.assign(outside, { x: p.x - ux * 2, z: p.z - uz * 2 });
  const tick = () => (s as any).moveProjectiles(0.05, new Map());
  return { s, a, b, outside, tick, towerId: r.towerId! };
}
test('flame damages multiple enemies throughout the cone, honors fire defense and expires', () => {
  const { s, a, b, outside, tick } = fixture();
  tick();
  assert.ok(a.hp < 1000 && a.hp > 990);
  assert.equal(a.hp, b.hp);
  assert.equal(outside.hp, 1000);
  for (let i = 1; i < 16; i++) tick();
  const expected = damageAfterDefense(towerStats('fire').damage, ENEMIES.ogre.defense.fire);
  assert.ok(Math.abs(1000 - a.hp - expected) < 1e-8);
  assert.equal(a.hp, b.hp);
  assert.equal(s.state.projectiles.size, 0);
  assert.equal(FIRE_BREATH.duration, 0.8);
});
test('flame rejects side and out-of-range targets; sale stops a live breath immediately', () => {
  const { s, a, b, outside, tick, towerId } = fixture();
  const p = [...s.state.projectiles.values()][0],
    len = Math.hypot(p.vx, p.vz);
  Object.assign(b, { x: p.x + (p.vz / len) * 3, z: p.z - (p.vx / len) * 3 });
  Object.assign(outside, { x: p.x + p.vx * 2, z: p.z + p.vz * 2 });
  tick();
  assert.equal(b.hp, 1000);
  assert.equal(outside.hp, 1000);
  s.command('p', { id: 'sell', action: 'sell', towerId });
  assert.equal(s.state.projectiles.size, 0);
  const hp = a.hp;
  tick();
  assert.equal(a.hp, hp);
});
