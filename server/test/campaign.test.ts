import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import { Simulation as ServerSimulation } from '../src/simulation';
import {
  MISSIONS,
  TOWERS,
  MAPS,
  slotCount,
  profileLevel,
  loadoutError,
  missionUnlocked,
  enemyStats,
  pathPosition,
  getRoute,
  towerStats,
  placementError,
  type TowerKind,
} from '@emberwatch/shared';
let id = 0;
const command = (s: Simulation, payload: Record<string, unknown>, who = 'p') =>
  s.command(who, { id: String(++id), ...payload });
function game(n = 1) {
  const s = new Simulation({ ruleSet: 'campaign', missionId: MISSIONS[n - 1].id });
  s.addPlayer('p', 'Hüter', { completed: n - 1 });
  return s;
}
test('campaign catalogue and every unlock/slot boundary match the progression', () => {
  assert.equal(MISSIONS.length, 15);
  assert.deepEqual(
    MISSIONS.map((m) => m.waves),
    [4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 12, 12, 13, 14],
  );
  for (let i = 0; i <= 15; i++) {
    assert.equal(slotCount(i), 3 + [1, 3, 5, 7, 9, 11, 13].filter((n) => n <= i).length);
    assert.equal(Math.min(8, profileLevel(i)), slotCount(i) - 2);
    for (const m of MISSIONS) assert.equal(missionUnlocked(m.id, i), m.number <= i + 1);
  }
  for (const m of MISSIONS) {
    assert.equal(m.healthMultiplier, 1 + (m.number - 1) * 0.05);
    assert.equal(m.damageMultiplier, 1 + (m.number - 1) * 0.03);
    assert.ok(MAPS[m.mapId]);
  }
});
test('invalid missions, progress, duplicate/unknown/oversized/empty teams are rejected before playing', () => {
  assert.throws(() => new Simulation({ ruleSet: 'campaign', missionId: 'missing' }));
  assert.throws(() => game().addPlayer('bad', 'bad', { completed: NaN }));
  assert.throws(() => new Simulation({ ruleSet: 'campaign', missionId: 'mission-02' }).addPlayer('bad'));
  for (const team of [[], ['ballista', 'ballista'], ['nope'], Object.keys(TOWERS)])
    assert.ok(loadoutError(team, 0));
  assert.equal(loadoutError(Object.keys(TOWERS).slice(0, 10), 13), null);
  const s = game();
  assert.equal(command(s, { action: 'build', kind: 'meteor', x: -4, z: 1 }).ok, false);
  assert.equal(command(s, { action: 'setLoadout', loadout: ['meteor'] }).ok, false);
  assert.equal(s.state.players.get('p')!.gold, 240);
});
test('final wave waits for flying projectiles, wins exactly once and survives restart', () => {
  const s = game();
  s.state.wave = 4;
  s.state.phase = 'combat';
  command(s, { action: 'build', kind: 'ballista', x: -4, z: 1 });
  const e = s.spawn('goblin');
  Object.assign(e, pathPosition(13), { progress: 13, speed: 0 });
  s.step();
  assert.ok(s.state.projectiles.size);
  s.state.enemies.clear();
  command(s, { action: 'sell', towerId: [...s.state.towers.keys()][0] });
  s.step();
  assert.equal(s.state.phase, 'combat');
  for (let i = 0; i < 200; i++) s.step();
  assert.equal(s.state.phase, 'victory');
  assert.equal(s.state.players.get('p')!.completed, 1);
  const final = JSON.stringify(s.state.toJSON());
  for (let i = 0; i < 20; i++) s.advance(0.25);
  assert.equal(JSON.stringify(s.state.toJSON()), final);
  assert.ok(command(s, { action: 'restart' }).ok);
  assert.equal(s.state.missionId, 'mission-01');
  s.state.wave = 4;
  s.state.phase = 'combat';
  s.step();
  assert.equal(s.state.players.get('p')!.completed, 1);
});
test('endless never wins and a lethal leak defeats a mission only once', () => {
  const e = new Simulation();
  e.addPlayer('p');
  e.state.wave = 100;
  e.state.phase = 'combat';
  e.step();
  assert.equal(e.state.phase, 'preparing');
  assert.equal(e.state.players.get('p')!.completed, 0);
  const s = game(15);
  s.state.phase = 'combat';
  s.state.wave = 14;
  s.state.baseHp = 1;
  const enemy = s.spawn('ogre');
  enemy.progress = getRoute(s.map, enemy.routeId).length;
  s.step();
  assert.equal(s.state.phase, 'defeat');
  assert.equal(s.state.players.get('p')!.completed, 14);
  assert.equal(s.state.kills, 0);
});
test('mission health and fortress damage follow the shared multipliers', () => {
  const s = game(9);
  s.state.wave = 2;
  s.state.phase = 'combat';
  const e = s.spawn('ogre');
  const base = enemyStats('ogre', 2, 1);
  assert.equal(e.hp, Math.round(base.hp * 1.4));
  e.progress = getRoute(s.map, e.routeId).length;
  s.step();
  assert.equal(s.state.baseHp, 100 - Object.values(base.damage).reduce((a, b) => a + b, 0) * 1.24);
});
test('coop mission intersection, individual teams, readiness and reserved-member victories', () => {
  const s = game(2);
  s.state.mode = 'coop';
  s.state.lobby = true;
  s.addPlayer('guest', 'Gast', { completed: 0, loadout: ['meteor'] });
  assert.equal(command(s, { action: 'setMission', missionId: 'mission-02' }).ok, false);
  assert.equal(command(s, { action: 'ready', ready: true }, 'guest').ok, false);
  assert.equal(command(s, { action: 'setMission', missionId: 'mission-01' }, 'guest').ok, false);
  assert.ok(command(s, { action: 'setMission', missionId: 'mission-01' }).ok);
  for (const who of ['p', 'guest']) assert.ok(command(s, { action: 'ready', ready: true }, who).ok);
  assert.ok(command(s, { action: 'setLoadout', loadout: ['sniper'] }, 'guest').ok);
  assert.equal(s.state.players.get('guest')!.ready, false);
  assert.equal(s.state.players.get('p')!.ready, true);
  command(s, { action: 'ready', ready: true }, 'guest');
  assert.ok(command(s, { action: 'startGame' }).ok);
  s.state.players.get('guest')!.connected = false;
  s.updatePresence();
  s.state.wave = 4;
  s.state.phase = 'combat';
  s.step();
  assert.equal(s.state.phase, 'victory');
  assert.equal(s.state.players.get('guest')!.completed, 1);
  assert.equal(s.state.players.get('p')!.completed, 1);
  assert.ok(command(s, { action: 'restart' }).ok);
  assert.equal(s.state.lobby, true);
  assert.deepEqual([...s.state.players.get('guest')!.loadout], ['sniper']);
});
test('browser and server entrypoints produce identical state from the same command stream', () => {
  const local = game(4),
    server = new ServerSimulation({ ruleSet: 'campaign', missionId: 'mission-04' });
  server.addPlayer('p', 'Hüter', { completed: 3 });
  for (const s of [local, server]) {
    s.command('p', { id: 'speed', action: 'setSpeed', speed: 5 });
    s.command('p', { id: 'start', action: 'startWave' });
  }
  for (let tick = 0; tick < 160; tick++) {
    local.advance(0.05);
    server.advance(0.05);
    assert.deepEqual(local.state.toJSON(), server.state.toJSON());
  }
});
for (const kind of Object.keys(TOWERS) as TowerKind[])
  test(`${kind} team allows repeat placements and all five upgrade levels`, () => {
    const s = new Simulation();
    s.addPlayer('p', 'Hüter', { loadout: [kind] });
    s.state.players.get('p')!.gold = 10000;
    const r = command(s, { action: 'build', kind, x: -4, z: 1 });
    assert.ok(r.ok);
    assert.ok(command(s, { action: 'build', kind, x: -9, z: -1 }).ok);
    for (let level = 1; level < 5; level++) {
      const before = s.state.players.get('p')!.gold;
      assert.ok(command(s, { action: 'upgrade', towerId: r.towerId }).ok);
      assert.equal(before - s.state.players.get('p')!.gold, towerStats(kind, level).upgradeCost);
    }
    assert.equal(command(s, { action: 'upgrade', towerId: r.towerId }).ok, false);
  });
