import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation';
import { sweptSphere } from '../src/collision';
import {
  pathPosition,
  TOWERS,
  towerStats,
  ENEMIES,
  damageAfterDefense,
  PATH_LENGTH,
  type TowerKind,
  type EnemyKind,
  type ImpactEvent,
} from '@emberwatch/shared';

function setup(kind: TowerKind = 'ballista', research = 0) {
  const s = new Simulation();
  s.addPlayer('alice', 'Hüter', {
    loadout: [kind],
    xp: research ? 3000 : 1300,
    research: { [kind]: research },
  });
  s.state.players.get('alice')!.gold = 10000;
  const result = s.command('alice', { id: 'build', action: 'build', kind, x: -4, z: 1 });
  assert.ok(result.ok);
  s.state.phase = 'combat';
  s.state.wave = 1;
  return { s, tower: s.state.towers.get(result.towerId!)! };
}
function enemy(s: Simulation, progress = 13, kind: EnemyKind = 'goblin') {
  const e = s.spawn(kind);
  Object.assign(e, pathPosition(progress), { progress, speed: 0 });
  return e;
}
function advance(s: Simulation, until: () => boolean, limit = 100) {
  for (let i = 0; i < limit && !until(); i++) s.step();
  assert.ok(until(), 'expected condition within tick limit');
}

test('swept collision detects tunneling, moving targets, tangency and misses', () => {
  const zero = { x: 0, y: 0, z: 0 };
  assert.equal(sweptSphere({ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, zero, zero, 1), 0.45);
  assert.equal(sweptSphere(zero, zero, { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 1), 0.45);
  assert.equal(sweptSphere({ x: -2, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }, zero, zero, 1), 0.5);
  assert.equal(sweptSphere({ x: -2, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }, zero, zero, 1), null);
  assert.equal(sweptSphere(zero, zero, zero, zero, 1), 0);
  assert.equal(sweptSphere({ x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, zero, zero, 1), null);
});

for (const kind of Object.keys(TOWERS).filter((kind) => kind !== 'prism' && kind !== 'fire') as TowerKind[])
  for (const rank of [0, 15]) {
    test(`${kind} research ${rank}: damage happens at collision, uses correct defense, and consumes the projectile`, () => {
      const { s } = setup(kind, rank);
      const e = enemy(s, kind === 'ember' ? 12 : 13, 'ogre');
      e.hp = e.maxHp = 1000; // Keep the target alive even under a fully researched heavy projectile.
      const initialHp = e.hp;
      const impacts: ImpactEvent[] = [];
      s.onImpact = (event) => impacts.push(event);
      s.step();
      assert.equal(e.hp, initialHp);
      assert.equal(impacts.length, 0);
      const p = [...s.state.projectiles.values()][0];
      assert.ok(p);
      advance(s, () => impacts.length > 0);
      assert.equal(impacts.length, 1);
      assert.equal(impacts[0].projectileId, p.id);
      assert.equal(s.state.projectiles.has(p.id), false);
      assert.equal(
        e.hp,
        initialHp -
          damageAfterDefense(towerStats(kind, 1, rank).damage, ENEMIES.ogre.defense[TOWERS[kind].type]),
      );
      assert.ok(Math.hypot(impacts[0].at.x - e.x, impacts[0].at.z - e.z) < 1);
    });
  }

test('a fast bolt hits the first collider along its flight, not its originally selected target', () => {
  const { s } = setup();
  const near = enemy(s, 10);
  const far = enemy(s, 13);
  s.step();
  const p = [...s.state.projectiles.values()][0];
  // Exercise an entire segment crossing two enemies in one 50 ms tick.
  Object.assign(p, { ...pathPosition(9), y: 0.52, vx: 0, vy: 0, vz: 100 });
  s.step();
  assert.equal(near.hp, 45 - 17);
  assert.equal(far.hp, 45);
  assert.equal(s.state.projectiles.size, 0);
});

test('a missing target is not damaged and missed shots expire before the next wave', () => {
  const { s, tower } = setup('arcane');
  const e = enemy(s);
  let impacts = 0;
  s.onImpact = () => impacts++;
  s.step();
  s.state.enemies.delete(e.id);
  s.command('alice', { id: 'sell', action: 'sell', towerId: tower.id });
  const gold = s.state.players.get('alice')!.gold;
  s.step();
  assert.equal(s.state.phase, 'combat');
  advance(s, () => s.state.phase === 'preparing');
  assert.equal(s.state.projectiles.size, 0);
  assert.equal(impacts, 0);
  assert.equal(s.state.kills, 0);
  assert.equal(s.state.players.get('alice')!.gold, gold);
});

test('bolts can miss when a target changes movement after launch', () => {
  const { s, tower } = setup();
  const e = enemy(s);
  s.step();
  e.speed = 12;
  s.command('alice', { id: 'sell', action: 'sell', towerId: tower.id });
  advance(s, () => s.state.projectiles.size === 0);
  assert.equal(e.hp, 45);
  assert.equal(s.state.kills, 0);
});

for (const kind of ['arcane', 'grenade'] as const) {
  test(`${kind}: moving enemies remain hittable around a path corner`, () => {
    const { s, tower } = setup(kind);
    const e = enemy(s, 13);
    e.speed = ENEMIES.goblin.speed;
    s.step();
    s.command('alice', { id: 'sell', action: 'sell', towerId: tower.id });
    advance(s, () => s.state.projectiles.size === 0);
    assert.ok(e.hp < 45, 'the projectile must catch or lead a moving target');
  });
}

test('grenade ground explosion damages only enemies within the blast radius after losing its target', () => {
  const { s, tower } = setup('grenade');
  const target = enemy(s, 13);
  const destination = { x: target.x, z: target.z };
  s.step();
  s.state.enemies.delete(target.id);
  s.command('alice', { id: 'sell', action: 'sell', towerId: tower.id });
  const inside = enemy(s, 10.7);
  const outside = enemy(s, 10.5);
  const impacts: ImpactEvent[] = [];
  s.onImpact = (impact) => impacts.push(impact);
  advance(s, () => impacts.length > 0);
  assert.ok(Math.abs(impacts[0].at.y - 0.12) < 1e-10);
  assert.ok(Math.hypot(impacts[0].at.x - destination.x, impacts[0].at.z - destination.z) < 1e-10);
  assert.equal(inside.hp, 0);
  assert.equal(outside.hp, 45);
  assert.equal(s.state.kills, 1);
});

test('one grenade can kill a group and grants each reward exactly once', () => {
  const { s } = setup('grenade');
  for (let i = 0; i < 3; i++) enemy(s, 12 + i * 0.2);
  const gold = s.state.players.get('alice')!.gold;
  s.step();
  assert.equal(s.state.kills, 0);
  advance(s, () => s.state.kills > 0);
  assert.equal(s.state.kills, 3);
  assert.equal(s.state.players.get('alice')!.gold, gold + 42);
  for (let i = 0; i < 10; i++) s.step();
  assert.equal(s.state.kills, 3);
  assert.equal(s.state.players.get('alice')!.gold, gold + 42);
});

test('in-flight damage is unchanged by upgrading and selling its tower', () => {
  const { s, tower } = setup();
  const e = enemy(s);
  s.step();
  assert.ok(s.command('alice', { id: 'upgrade', action: 'upgrade', towerId: tower.id }).ok);
  assert.ok(s.command('alice', { id: 'sell', action: 'sell', towerId: tower.id }).ok);
  advance(s, () => s.state.projectiles.size === 0);
  assert.equal(e.hp, 45 - 17);
});

test('projectile keeps the firing owner for rewards after a tower is sold', () => {
  const { s, tower } = setup();
  s.addPlayer('bob');
  const e = enemy(s);
  e.hp = 1;
  s.step();
  s.command('alice', { id: 'sell', action: 'sell', towerId: tower.id });
  const gold = s.state.players.get('alice')!.gold;
  advance(s, () => s.state.kills === 1);
  assert.equal(s.state.players.get('alice')!.gold, gold + 14);
  assert.equal(s.state.players.get('bob')!.gold, 240);
});

test('pause freezes projectiles; defeat clears pending shots without further damage', () => {
  const { s } = setup('grenade');
  enemy(s);
  s.step();
  assert.equal(s.state.projectiles.size, 1);
  s.state.paused = true;
  const snapshot = JSON.stringify(s.state.toJSON());
  for (let i = 0; i < 100; i++) s.step();
  assert.equal(JSON.stringify(s.state.toJSON()), snapshot);
  s.state.paused = false;
  s.state.baseHp = 1;
  enemy(s, PATH_LENGTH);
  s.step();
  assert.equal(s.state.phase, 'defeat');
  assert.equal(s.state.projectiles.size, 0);
  assert.equal(s.state.kills, 0);
});
