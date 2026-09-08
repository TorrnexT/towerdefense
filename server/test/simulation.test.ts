import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation';
import {
  BALANCE,
  ENEMIES,
  MAP,
  PATH_LENGTH,
  damageAfterDefense,
  sellRefund,
  enemyStats,
  pathPosition,
  placementError,
  towerStats,
  waveComposition,
  type Command,
} from '@emberwatch/shared';
let id = 0;
function game() {
  const s = new Simulation();
  s.addPlayer('alice', 'Hüter', { completed: 1, loadout: ['ballista', 'arcane', 'fire', 'grenade'] });
  return s;
}
function command(s: Simulation, c: Record<string, unknown>, player = 'alice') {
  return s.command(player, { id: String(++id), ...c });
}
function build(s: Simulation, x = -4, z = 1, kind = 'ballista') {
  const r = command(s, { action: 'build', kind, x, z });
  assert.equal(r.ok, true, r.error);
  return s.state.towers.get(r.towerId!)!;
}
test('resistances use diminishing reduction for each damage type', () => {
  assert.equal(damageAfterDefense(100, 0), 100);
  assert.equal(damageAfterDefense(100, 100), 50);
  assert.equal(damageAfterDefense(100, 300), 25);
  assert.ok(
    damageAfterDefense(48, ENEMIES.ogre.defense.arcane) >
      damageAfterDefense(48, ENEMIES.ogre.defense.physical),
  );
  assert.ok(
    damageAfterDefense(25, ENEMIES.wraith.defense.fire) >
      damageAfterDefense(25, ENEMIES.wraith.defense.arcane),
  );
});
test('map rejects path, edge, obstacles, fortress, overlapping towers and malformed coordinates', () => {
  for (const p of [
    { x: 50, z: 0 },
    { x: NaN, z: 0 },
    { x: 0, z: Infinity },
    MAP.path[1],
    MAP.base,
    MAP.obstacles[0],
  ])
    assert.ok(placementError(p, []));
  assert.ok(placementError({ x: -4, z: 1 }, [{ x: -4, z: 1 }]));
  assert.equal(placementError({ x: -4, z: 1 }, []), null);
  assert.deepEqual(pathPosition(PATH_LENGTH + 100), MAP.path.at(-1));
});
test('starts with enough gold for two ballistas and buys atomically', () => {
  const s = game();
  build(s);
  build(s, 0, -2);
  assert.equal(s.state.players.get('alice')!.gold, 40);
  assert.equal(command(s, { action: 'build', kind: 'fire', x: 7, z: 3 }).ok, false);
  assert.equal(s.state.towers.size, 2);
  assert.equal(s.state.players.get('alice')!.gold, 40);
});
test('duplicate command is idempotent even after its turret is upgraded', () => {
  const s = game();
  const c = { id: 'duplicate', action: 'build', kind: 'ballista', x: -4, z: 1 };
  const first = s.command('alice', c);
  assert.deepEqual(s.command('alice', c), first);
  assert.equal(s.state.towers.size, 1);
  assert.equal(s.state.players.get('alice')!.gold, 140);
  assert.deepEqual(s.command('alice', { ...c, x: 7 }), first);
});
test('rejects malformed and unknown commands without mutating gold', () => {
  const s = game();
  for (const c of [
    null,
    42,
    {},
    { id: 'x', action: 'build', kind: '__proto__', x: 0, z: 0 },
    { id: 'x2', action: 'build', kind: 'ballista', x: '0', z: 0 },
    { id: 'x3', action: 'upgrade', towerId: {} },
    { id: 'x4', action: 'giveGold', gold: 100000 },
  ])
    assert.equal(s.command('alice', c).ok, false);
  assert.equal(s.state.players.get('alice')!.gold, 240);
  assert.equal(s.state.towers.size, 0);
});
test('upgrades stop at five, preview matches actual stats, sale refunds total investment once', () => {
  const s = game();
  s.state.players.get('alice')!.gold = 10000;
  const t = build(s);
  let invested = 100;
  for (let level = 1; level < 5; level++) {
    const expected = towerStats(t.kind, level + 1);
    const cost = towerStats(t.kind, level).upgradeCost;
    assert.equal(command(s, { action: 'upgrade', towerId: t.id }).ok, true);
    invested += cost;
    assert.equal(t.level, level + 1);
    assert.equal(towerStats(t.kind, t.level).damage, expected.damage);
  }
  assert.equal(t.invested, invested);
  assert.equal(command(s, { action: 'upgrade', towerId: t.id }).ok, false);
  const old = s.state.players.get('alice')!.gold;
  assert.equal(command(s, { action: 'sell', towerId: t.id }).ok, true);
  assert.equal(s.state.players.get('alice')!.gold, old + Math.floor((invested * 70) / 100));
  assert.equal(command(s, { action: 'sell', towerId: t.id }).ok, false);
});
test('players cannot upgrade or sell each others towers', () => {
  const s = game();
  s.addPlayer('bob');
  const t = build(s);
  for (const action of ['sell', 'upgrade'])
    assert.equal(command(s, { action, towerId: t.id }, 'bob').ok, false);
  assert.equal(s.state.towers.size, 1);
});
test('a kill awards gold exactly once, and selects most advanced enemy', () => {
  const s = game();
  build(s, -4, 1);
  s.state.phase = 'combat';
  s.state.wave = 1;
  const a = s.spawn('goblin');
  Object.assign(a, pathPosition(12), { hp: 10, progress: 12, speed: 0 });
  const b = s.spawn('goblin');
  Object.assign(b, pathPosition(13), { hp: 10, progress: 13, speed: 0 });
  s.step();
  assert.equal(b.hp, 10, 'no damage on launch');
  for (let i = 0; i < 12 && s.state.enemies.has(b.id); i++) s.step();
  assert.equal(s.state.enemies.has(b.id), false);
  assert.equal(s.state.enemies.has(a.id), true);
  assert.equal(s.state.kills, 1);
  assert.equal(s.state.players.get('alice')!.gold, 154);
});
test('fire cone resolves each kill once', () => {
  const s = game();
  build(s, -4, 1, 'fire');
  s.state.phase = 'combat';
  s.state.wave = 1;
  for (let i = 0; i < 3; i++) {
    const e = s.spawn('goblin');
    Object.assign(e, pathPosition(12 + i * 0.3), { hp: 1, progress: 12 + i * 0.3, speed: 0 });
  }
  s.step();
  assert.equal(s.state.kills, 0, 'flame damage starts on the next simulation step');
  for (let i = 0; i < 20 && s.state.enemies.size; i++) s.step();
  assert.equal(s.state.kills, 3);
  assert.equal(s.state.enemies.size, 0);
  assert.equal(s.state.players.get('alice')!.gold, 80 + 42);
});
test('enemies damage the base once and never grant escape gold', () => {
  const s = game();
  s.state.phase = 'combat';
  s.state.wave = 1;
  const e = s.spawn('goblin');
  e.progress = PATH_LENGTH - 0.01;
  s.step();
  assert.equal(s.state.baseHp, 96);
  assert.equal(s.state.players.get('alice')!.gold, 240);
  assert.equal(s.state.enemies.size, 0);
  assert.equal(s.state.kills, 0);
  s.step();
  assert.equal(s.state.baseHp, 96);
});
test('defeat freezes combat and prohibits further spending', () => {
  const s = game();
  s.state.phase = 'combat';
  s.state.wave = 1;
  s.state.baseHp = 1;
  const e = s.spawn('ogre');
  e.progress = PATH_LENGTH;
  s.step();
  assert.equal(s.state.baseHp, 0);
  assert.equal(s.state.phase, 'defeat');
  const snapshot = JSON.stringify(s.state.toJSON());
  for (let i = 0; i < 50; i++) s.step();
  assert.equal(JSON.stringify(s.state.toJSON()), snapshot);
  assert.equal(command(s, { action: 'build', kind: 'ballista', x: -4, z: 1 }).ok, false);
});
test('first wave needs input; later waves auto-start after 15 seconds', () => {
  const s = game();
  for (let i = 0; i < 500; i++) s.step();
  assert.equal(s.state.wave, 0);
  assert.equal(command(s, { action: 'startWave' }).ok, true);
  assert.equal(s.state.wave, 1);
  assert.equal(command(s, { action: 'startWave' }).ok, false);
  s.state.baseHp = 10000;
  for (let i = 0; i < 3000 && s.state.phase === 'combat'; i++) s.step();
  assert.equal(s.state.phase, 'preparing');
  assert.equal(s.state.completedWaves, 1);
  assert.equal(s.state.countdown, 15);
  for (let i = 0; i < 299; i++) s.step();
  assert.equal(s.state.wave, 1);
  s.step();
  s.step();
  assert.equal(s.state.wave, 2);
});
test('manual early start cancels the remaining build pause', () => {
  const s = game();
  s.state.wave = 2;
  s.state.countdown = 9;
  assert.equal(command(s, { action: 'startWave' }).ok, true);
  assert.equal(s.state.wave, 3);
  assert.equal(s.state.phase, 'combat');
  assert.equal(s.state.countdown, 0);
});
test('waves unlock archetypes and scale health, damage, rewards without uncapped counts/speeds', () => {
  assert.ok(waveComposition(2).every((k) => k === 'goblin'));
  assert.ok(waveComposition(3).includes('ogre'));
  assert.ok(!waveComposition(4).includes('wraith'));
  assert.ok(waveComposition(5).includes('wraith'));
  assert.equal(enemyStats('ogre', 5).level, 1);
  assert.equal(enemyStats('ogre', 6).level, 2);
  assert.ok(enemyStats('ogre', 6).damage.physical > enemyStats('ogre', 5).damage.physical);
  assert.ok(enemyStats('goblin', 100).hp > enemyStats('goblin', 99).hp);
  assert.equal(waveComposition(10000).length, 100);
  assert.ok(enemyStats('goblin', 100).speed <= ENEMIES.goblin.speed * 1.5);
});
test('disconnected solo room stays paused and rejects commands', () => {
  const s = game();
  command(s, { action: 'startWave' });
  s.state.paused = true;
  s.state.players.get('alice')!.connected = false;
  const snapshot = JSON.stringify(s.state.toJSON());
  for (let i = 0; i < 1200; i++) s.step();
  assert.equal(JSON.stringify(s.state.toJSON()), snapshot);
  assert.equal(command(s, { action: 'build', kind: 'ballista', x: -4, z: 1 }).ok, false);
});
test('simulation handles 100 enemies and 30 towers within tick budget', () => {
  const s = game();
  s.state.players.get('alice')!.gold = 100000;
  for (let x = -13; x < 14 && s.state.towers.size < 30; x += 1.7)
    for (let z = -8; z < 9 && s.state.towers.size < 30; z += 1.7) {
      if (!placementError({ x, z }, s.state.towers.values()))
        build(s, x, z, ['ballista', 'arcane', 'fire', 'grenade'][s.state.towers.size % 4]);
    }
  assert.equal(s.state.towers.size, 30);
  s.state.phase = 'combat';
  s.state.wave = 40;
  s.state.baseHp = 1e9;
  for (let i = 0; i < 100; i++) {
    const e = s.spawn(['goblin', 'ogre', 'wraith'][i % 3] as 'goblin');
    Object.assign(e, pathPosition((i / 100) * PATH_LENGTH), { progress: (i / 100) * PATH_LENGTH });
  }
  const start = performance.now();
  for (let i = 0; i < 200; i++) s.step();
  const average = (performance.now() - start) / 200;
  assert.ok(average < 50, `Average ${average}ms exceeds 50ms tick`);
  console.log(`Simulation: 100 enemies / 30 towers, ${average.toFixed(2)} ms per tick`);
});

test('sale percentage never loses gold to floating point rounding', () => {
  assert.equal(sellRefund(180), 126);
  assert.equal(sellRefund(100), 70);
  assert.equal(sellRefund(181), 126);
});

test('very late endless waves never produce non-finite health or damage', () => {
  const enemy = enemyStats('goblin', 10000);
  assert.ok(Number.isFinite(enemy.hp));
  assert.ok(Object.values(enemy.damage).every(Number.isFinite));
  assert.equal(enemy.damage.arcane, 0);
});
