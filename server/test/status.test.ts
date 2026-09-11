import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '@emberwatch/shared/simulation';
import {
  towerEffect,
  towerStats,
  damageAfterDefense,
  ENEMIES,
  pathPosition,
  getRoute,
  type TowerKind,
} from '@emberwatch/shared';
let id = 0;
const send = (s: Simulation, data: Record<string, unknown>) => s.command('p', { id: String(++id), ...data });
function setup(kind: TowerKind) {
  const s = new Simulation();
  s.addPlayer('p', 'Hüter', { xp: 1300, loadout: [kind] });
  s.state.players.get('p')!.gold = 1000;
  const result = send(s, { action: 'build', kind, x: -4, z: 1 });
  assert.ok(result.ok);
  s.state.wave = 1;
  s.state.phase = 'combat';
  const e = s.spawn('ogre');
  Object.assign(e, pathPosition(13), { progress: 13, speed: 0, hp: 1000, maxHp: 1000 });
  let hit = false;
  s.onImpact = () => {
    hit = true;
  };
  s.step();
  assert.equal(e.hp, 1000);
  assert.equal(e.burn + e.poison + e.slow, 0);
  for (let i = 0; i < 100 && !hit; i++) s.step();
  assert.ok(hit);
  send(s, { action: 'sell', towerId: result.towerId });
  return { s, e };
}
for (const kind of ['inferno', 'venom'] as const)
  test(`${kind}: damage starts at collision and lasts exactly its duration after sale`, () => {
    const { s, e } = setup(kind),
      effect = towerEffect(kind)!;
    const before = e.hp,
      type = kind === 'inferno' ? 'fire' : 'poison';
    for (let i = 0; i < Math.ceil(effect.duration / 0.05) + 2; i++) s.step();
    assert.ok(
      Math.abs(before - e.hp - damageAfterDefense(effect.dps * effect.duration, ENEMIES.ogre.defense[type])) <
        1e-7,
    );
    assert.equal(e[effect.kind as 'burn' | 'poison'], 0);
    const end = e.hp;
    s.step();
    assert.equal(e.hp, end);
  });
test('burn and poison coexist; equal applications refresh and weaker applications cannot extend stronger damage', () => {
  const { s, e } = setup('inferno');
  const apply = (s as any).applyEffect.bind(s);
  apply(e, towerEffect('venom'), 'p');
  assert.ok(e.burn > 0 && e.poison > 0);
  const hp = e.hp;
  s.step();
  assert.ok(Math.abs(hp - e.hp - (damageAfterDefense(12, 20) + damageAfterDefense(8, 15)) * 0.05) < 1e-8);
  apply(e, towerEffect('inferno', 3), 'p');
  s.step();
  const remaining = e.burn;
  apply(e, towerEffect('inferno', 1), 'p');
  assert.equal(e.burn, remaining);
  apply(e, towerEffect('inferno', 3), 'p');
  assert.equal(e.burn, 4);
});
test('frost applies splash on hit, never stacks to a stop and restores the exact base speed', () => {
  const { s, e } = setup('frost');
  assert.equal(e.slowAmount, 0.35);
  e.speed = 1;
  const progress = e.progress;
  s.step();
  assert.ok(Math.abs(e.progress - progress - 0.05 * 0.65) < 1e-8);
  const apply = (s as any).applyEffect.bind(s);
  apply(e, towerEffect('frost', 5, 15), 'p');
  assert.ok(e.slowAmount <= 0.6);
  const strong = e.slowAmount;
  apply(e, towerEffect('frost'), 'p');
  assert.equal(e.slowAmount, strong);
  for (let i = 0; i < 100; i++) s.step();
  assert.equal(e.slowAmount, 0);
  assert.equal(e.speed, 1);
  const p = e.progress;
  s.step();
  assert.ok(Math.abs(e.progress - p - 0.05) < 1e-8);
});
test('status timers pause with the simulation, expire on leaks and do not leak into restarted runs', () => {
  const { s, e } = setup('venom');
  s.state.paused = true;
  const before = JSON.stringify(s.state.toJSON());
  s.advance(0.25);
  s.step();
  assert.equal(JSON.stringify(s.state.toJSON()), before);
  s.state.paused = false;
  e.progress = getRoute(s.map, e.routeId).length;
  const gold = s.state.players.get('p')!.gold;
  s.step();
  assert.equal(s.state.players.get('p')!.gold, gold);
  assert.equal((s as any).ailments.size, 0);
  s.state.phase = 'defeat';
  send(s, { action: 'restart' });
  assert.equal((s as any).ailments.size, 0);
});
test('DOT kill gives gold once, ends the final mission and survives a permanent owner departure', () => {
  const { s, e } = setup('inferno');
  s.state.mode = 'coop';
  s.addPlayer('heir');
  s.removePlayer('p');
  s.state.ruleSet = 'campaign';
  s.state.missionId = 'mission-01';
  s.state.wave = 4;
  e.hp = 0.1;
  const gold = s.state.players.get('heir')!.gold;
  s.step();
  assert.equal(s.state.kills, 1);
  assert.equal(s.state.phase, 'victory');
  assert.equal(s.state.players.get('heir')!.gold, gold + 28);
  s.step();
  assert.equal(s.state.kills, 1);
  assert.equal(s.state.players.get('heir')!.rewards.size, 1);
});
test('research and combat upgrades improve DOT; frost slow is capped independently of direct damage', () => {
  for (const k of ['inferno', 'venom'] as const)
    assert.ok(towerEffect(k, 5, 15)!.dps > towerEffect(k)!.dps * 6);
  assert.ok(towerEffect('frost', 5, 15)!.slow <= 0.6);
  assert.ok(towerStats('frost', 5, 15).damage > 10);
});
