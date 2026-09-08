import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation';
import { BALANCE, enemyStats, pathPosition, PATH_LENGTH } from '@emberwatch/shared';

function lobby(count = 4) {
  const sim = new Simulation();
  sim.state.mode = 'coop';
  sim.state.lobby = true;
  for (let i = 0; i < count; i++)
    sim.addPlayer('p' + i, 'Hüter ' + i, {
      completed: 1,
      loadout: ['ballista', 'arcane', 'fire', 'grenade'],
    });
  return sim;
}
let sequence = 0;
function command(sim: Simulation, id: string, payload: Record<string, unknown>) {
  return sim.command(id, { id: String(++sequence), ...payload });
}
function start(sim: Simulation) {
  for (const p of sim.state.players.values())
    assert.ok(command(sim, p.id, { action: 'ready', ready: true }).ok);
  assert.ok(command(sim, sim.state.hostId, { action: 'startGame' }).ok);
}
test('coop lobby validates readiness, host controls, names and frozen team strength', () => {
  const sim = lobby();
  assert.equal(sim.state.hostId, 'p0');
  assert.ok(command(sim, 'p1', { action: 'setName', name: 'Bela' }).ok);
  assert.equal(sim.state.players.get('p1')!.name, 'Bela');
  assert.equal(command(sim, 'p1', { action: 'setName', name: 42 }).ok, false);
  assert.deepEqual(
    [...sim.state.players.values()].map((p) => p.color),
    [0, 1, 2, 3],
  );
  assert.equal(command(sim, 'p0', { action: 'build', kind: 'ballista', x: -4, z: 1 }).ok, false);
  assert.equal(command(sim, 'p0', { action: 'startWave' }).ok, false);
  assert.equal(command(sim, 'p0', { action: 'startGame' }).ok, false);
  assert.equal(command(sim, 'p1', { action: 'setSpeed', speed: 10 }).ok, false);
  assert.equal(command(sim, 'p1', { action: 'ready', ready: 'yes' }).ok, false);
  for (const p of sim.state.players.values()) p.ready = true;
  sim.state.players.get('p3')!.connected = false;
  assert.equal(command(sim, 'p0', { action: 'startGame' }).ok, false);
  sim.state.players.get('p3')!.connected = true;
  start(sim);
  assert.equal(sim.state.teamSize, 4);
  assert.equal(command(sim, 'p1', { action: 'startWave' }).ok, false);
  assert.ok(command(sim, 'p0', { action: 'startWave' }).ok);
  const e = sim.spawn('goblin');
  assert.equal(e.hp, enemyStats('goblin', 1, 4).hp);
  sim.removePlayer('p3');
  assert.equal(sim.state.teamSize, 4, 'leaving cannot lower difficulty mid-run');
  assert.equal(sim.spawn('goblin').hp, e.hp);
});
test('coop shares real impact rewards fairly, including disconnected reserved members', () => {
  const sim = lobby(3);
  start(sim);
  assert.ok(command(sim, 'p0', { action: 'build', kind: 'grenade', x: -4, z: 1 }).ok);
  sim.state.wave = 1;
  sim.state.phase = 'combat';
  sim.state.players.get('p2')!.connected = false;
  const e = sim.spawn('goblin');
  Object.assign(e, pathPosition(12), { progress: 12, speed: 0, hp: 1 });
  const before = [...sim.state.players.values()].map((p) => p.gold);
  for (let i = 0; i < 100 && sim.state.kills === 0; i++) sim.step();
  assert.equal(sim.state.kills, 1);
  assert.deepEqual(
    [...sim.state.players.values()].map((p, i) => p.gold - before[i]),
    [14, 14, 14],
  );
  assert.equal(sim.state.projectiles.size, 0);
});
test('coop host succession preserves towers and funds; lobby departures cannot farm gold', () => {
  const sim = lobby(3);
  sim.removePlayer('p2');
  assert.equal(sim.state.players.get('p0')!.gold, 240);
  sim.addPlayer('p2', '\u0000 A'.repeat(30));
  assert.ok(sim.state.players.get('p2')!.name.length <= 20);
  assert.ok(!sim.state.players.get('p2')!.name.includes('\u0000'));
  start(sim);
  const build = command(sim, 'p0', { action: 'build', kind: 'ballista', x: -4, z: 1 });
  const ownerGold = sim.state.players.get('p0')!.gold;
  sim.state.players.get('p0')!.connected = false;
  sim.updatePresence();
  assert.equal(sim.state.hostId, 'p1');
  assert.equal(sim.state.paused, false);
  assert.equal(sim.state.towers.get(build.towerId!)!.owner, 'p0', 'drop retains ownership');
  sim.removePlayer('p0');
  assert.equal(sim.state.players.get('p1')!.gold, 240 + ownerGold);
  assert.equal(sim.state.towers.get(build.towerId!)!.owner, 'p1');
  assert.equal(command(sim, 'p2', { action: 'sell', towerId: build.towerId }).ok, false);
  assert.ok(command(sim, 'p1', { action: 'upgrade', towerId: build.towerId }).ok);
});
test('all disconnected pauses; return restores controls; base damage scales without rewarding leaks', () => {
  const sim = lobby(2);
  start(sim);
  sim.state.wave = 1;
  sim.state.phase = 'combat';
  const e = sim.spawn('goblin');
  e.progress = PATH_LENGTH;
  for (const p of sim.state.players.values()) p.connected = false;
  sim.updatePresence();
  assert.equal(sim.state.paused, true);
  sim.advance(0.25);
  assert.equal(sim.state.baseHp, 100);
  sim.state.players.get('p1')!.connected = true;
  sim.updatePresence();
  sim.step();
  assert.equal(sim.state.hostId, 'p1');
  assert.equal(sim.state.baseHp, 100 - enemyStats('goblin', 1, 2).damage.physical);
  assert.equal(sim.state.kills, 0);
  assert.deepEqual(
    [...sim.state.players.values()].map((p) => p.gold),
    [240, 240],
  );
});
test('host-only rematch resets the same roster and requires fresh readiness', () => {
  const sim = lobby(2);
  start(sim);
  assert.equal(command(sim, 'p0', { action: 'restart' }).ok, false);
  command(sim, 'p0', { action: 'build', kind: 'ballista', x: -4, z: 1 });
  sim.state.phase = 'defeat';
  sim.state.baseHp = 0;
  sim.state.speed = 10;
  assert.equal(command(sim, 'p1', { action: 'restart' }).ok, false);
  const cmd = { id: 'rematch', action: 'restart' };
  assert.ok(sim.command('p0', cmd).ok);
  assert.equal(sim.state.lobby, true);
  assert.equal(sim.state.run, 1);
  assert.equal(sim.state.speed, 1);
  assert.equal(sim.state.baseHp, BALANCE.baseHp);
  assert.equal(sim.state.towers.size + sim.state.enemies.size + sim.state.projectiles.size, 0);
  assert.deepEqual(
    [...sim.state.players.values()].map((p) => [p.gold, p.ready]),
    [
      [240, false],
      [240, false],
    ],
  );
  assert.ok(sim.command('p0', cmd).ok);
  assert.equal(sim.state.run, 1);
  sim.removePlayer('p1');
  start(sim);
  assert.equal(sim.state.teamSize, 1);
});

test('a new lobby arrival restores presence when existing members are disconnected', () => {
  const sim = lobby(1);
  sim.state.players.get('p0')!.connected = false;
  sim.updatePresence();
  assert.equal(sim.state.paused, true);
  sim.addPlayer('p1', 'Neuer Hüter');
  assert.equal(sim.state.paused, false);
  assert.equal(sim.state.hostId, 'p1');
  assert.ok(command(sim, 'p1', { action: 'ready', ready: true }).ok);
});
