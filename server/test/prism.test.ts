import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import { towerStats, PRISM_BEAM, pathPosition, damageAfterDefense, ENEMIES } from '@emberwatch/shared';
function setup(level = 1, research = 0) {
  const s = new Simulation();
  s.addPlayer('p', 'Laser', { xp: 1300, loadout: ['prism'] });
  const result = s.command('p', { id: 'build', action: 'build', kind: 'prism', x: -4, z: 1 });
  assert.ok(result.ok);
  const t = s.state.towers.get(result.towerId!)!;
  t.level = level;
  t.research = research;
  s.state.phase = 'combat';
  s.state.wave = 1;
  const e = s.spawn('ogre');
  Object.assign(e, pathPosition(13), { progress: 13, speed: 0, hp: 100000, maxHp: 100000 });
  s.step();
  assert.equal(e.hp, 100000);
  assert.equal(s.state.projectiles.size, 1);
  return { s, t, e };
}
for (const [level, research] of [
  [1, 0],
  [3, 7],
  [5, 15],
])
  test(`prism ${level}/${research}: sustained damage matches duration, resists armor and never overlaps`, () => {
    const { s, t, e } = setup(level, research),
      stats = towerStats('prism', level, research);
    const expected = damageAfterDefense(
      (stats.damage / PRISM_BEAM.duration) * stats.beamDuration,
      ENEMIES.ogre.defense.arcane,
    );
    const ticks = Math.ceil(stats.beamDuration / 0.05);
    for (let i = 0; i < ticks; i++) {
      s.step();
      assert.ok(s.state.projectiles.size <= 1);
    }
    assert.ok(Math.abs(100000 - e.hp - expected) < 1e-6);
    assert.equal(s.state.projectiles.size, 0);
    s.command('p', { id: 'sell', action: 'sell', towerId: t.id });
    const hp = e.hp;
    s.step();
    assert.equal(e.hp, hp);
  });
test('prism stops on sale, target loss or leaving range and pauses with simulation', () => {
  for (const mode of ['sale', 'range', 'death']) {
    const { s, t, e } = setup();
    s.step();
    const hp = e.hp;
    s.state.paused = true;
    s.step();
    assert.equal(e.hp, hp);
    s.state.paused = false;
    if (mode === 'sale') s.command('p', { id: 'sell', action: 'sell', towerId: t.id });
    if (mode === 'range') e.progress = 0;
    if (mode === 'death') s.state.enemies.delete(e.id);
    s.step();
    assert.equal(s.state.projectiles.size, 0);
    assert.equal(e.hp, hp);
  }
});
test('prism kill awards gold once and final mission does not wait for a dead beam', () => {
  const { s, e } = setup();
  s.state.ruleSet = 'campaign';
  s.state.missionId = 'mission-01';
  // Use the actual catalogue mission selected by configure.
  s.configure({ ruleSet: 'campaign', missionId: 'mission-01' });
  s.state.wave = s.mission!.waves;
  e.hp = 1;
  const gold = s.state.players.get('p')!.gold;
  s.step();
  assert.equal(s.state.kills, 1);
  assert.equal(s.state.phase, 'victory');
  const rewarded = s.state.players.get('p')!.gold;
  assert.ok(rewarded > gold);
  s.step();
  assert.equal(s.state.players.get('p')!.gold, rewarded);
});
