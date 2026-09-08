import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPS,
  MAP_IDS,
  PATH_LENGTH,
  routeSegments,
  entrances,
  pathPosition,
  getRoute,
  placementError,
  onWater,
  onBridge,
  inPolygon,
  distance,
  segmentDistance,
  type MapId,
} from '@emberwatch/shared';
import { Simulation } from '../src/simulation';
let seq = 0;
function command(sim: Simulation, action: Record<string, unknown>, id = 'alice') {
  return sim.command(id, { id: String(++seq), ...action });
}
function sim(mapId: MapId) {
  const s = new Simulation();
  s.state.mapId = mapId;
  s.addPlayer('alice', 'Hüter', { completed: 1, loadout: ['ballista', 'arcane', 'fire', 'grenade'] });
  return s;
}
export function buildSites(mapId: MapId) {
  const map = MAPS[mapId],
    sites: { x: number; z: number }[] = [];
  for (let x = -13; x <= 13; x += 0.75)
    for (let z = -9; z <= 9; z += 0.75) if (!placementError({ x, z }, sites, map)) sites.push({ x, z });
  return sites;
}
for (const id of MAP_IDS) {
  test(`${id}: routes, bridges, readable obstacles and starting build space`, () => {
    const map = MAPS[id];
    assert.ok(map.routes.length >= 1);
    assert.equal(new Set(map.routes.map((r) => r.id)).size, map.routes.length);
    assert.ok(buildSites(id).length >= 30, `${id} needs at least 30 non-overlapping tower sites`);
    for (const r of map.routes) {
      assert.ok(r.length >= PATH_LENGTH * 0.8 && r.length <= PATH_LENGTH * 1.2, `${id}/${r.id}: ${r.length}`);
      assert.ok(distance(r.points.at(-1)!, map.base) < 1.2);
      for (let i = 1; i < r.points.length; i++) assert.ok(distance(r.points[i - 1], r.points[i]) > 0);
      for (let d = 0; d <= r.length; d += 0.1) {
        const p = pathPosition(d, map, r.id);
        assert.ok(inPolygon(p, map.outline) || d === 0, `${id}/${r.id} leaves map at ${d}`);
        if (onWater(p, map))
          assert.ok(onBridge(p, map), `${id}/${r.id}: missing bridge at ${JSON.stringify(p)}`);
      }
      assert.deepEqual(pathPosition(r.length + 100, map, r.id), r.points.at(-1));
    }
    const keys = routeSegments(map).map((s) => JSON.stringify([s.a, s.b]));
    assert.equal(new Set(keys).size, keys.length);
    for (const o of map.obstacles)
      for (const { a, b } of routeSegments(map))
        assert.ok(
          segmentDistance(o, a, b) >= o.r + map.pathRadius - 0.12,
          `Obstacle blocks ${id} route at ${o.x},${o.z}`,
        );
  });
  test(`${id}: map-specific placement and a complete wave resolve every enemy exactly once`, () => {
    const s = sim(id),
      map = MAPS[id];
    const sites = buildSites(id);
    for (const point of sites.slice(0, 2))
      assert.ok(command(s, { action: 'build', kind: 'ballista', ...point }).ok);
    assert.equal(s.state.players.get('alice')!.gold, 40);
    assert.ok(command(s, { action: 'startWave' }).ok);
    const first = s.spawn('goblin');
    assert.equal(placementError({ x: 100, z: 0 }, [], map), 'Baue innerhalb der Insel.');
    for (const r of map.routes) assert.ok(placementError(pathPosition(r.length * 0.5, map, r.id), [], map));
    for (const w of map.waterways) assert.ok(placementError(w.points[0], [], map));
    for (const b of map.bridges)
      assert.ok(placementError({ x: (b.a.x + b.b.x) / 2, z: (b.a.z + b.b.z) / 2 }, [], map));
    s.state.enemies.delete(first.id); // Test-only spawn is excluded from the actual wave.
    s.state.towers.clear();
    for (let i = 0; i < 3000 && s.state.completedWaves === 0; i++) s.step();
    assert.equal(s.state.completedWaves, 1);
    assert.equal(s.state.baseHp, 60);
    assert.equal(s.state.kills, 0);
    assert.equal(s.state.players.get('alice')!.gold, 40);
  });
  test(`${id}: each route moves independently and receives collision projectiles with forward aim`, () => {
    for (const route of MAPS[id].routes)
      for (const kind of ['ballista', 'grenade'] as const) {
        const s = sim(id);
        s.state.phase = 'combat';
        s.state.wave = 1;
        const target = s.spawn('goblin');
        target.routeId = route.id;
        target.progress = 10;
        Object.assign(target, pathPosition(10, s.map, route.id));
        const before = { x: target.x, z: target.z };
        s.step();
        assert.ok(distance(before, target) > 0);
        assert.ok(distance(target, pathPosition(target.progress, s.map, route.id)) < 0.0001);
        // Find a genuine buildable site close enough to a long segment; damage must arrive on impact.
        const site = buildSites(id).find((p) => distance(p, target) < (kind === 'grenade' ? 6 : 4.6));
        assert.ok(site, `${id}/${route.id} needs a firing site`);
        assert.ok(command(s, { action: 'build', kind, ...site }).ok);
        for (let i = 0; i < 160 && target.hp === target.maxHp; i++) s.step();
        assert.ok(target.hp < target.maxHp, `${id}/${route.id}/${kind} never hit its moving target`);
      }
  });
  test(`${id}: 100 enemies and 30 towers stay within the server tick budget`, () => {
    const s = sim(id);
    s.state.players.get('alice')!.gold = 100000;
    for (const [i, p] of buildSites(id).slice(0, 30).entries()) {
      assert.ok(
        command(s, { action: 'build', kind: ['ballista', 'arcane', 'fire', 'grenade'][i % 4], ...p }).ok,
      );
    }
    assert.equal(s.state.towers.size, 30);
    s.state.phase = 'combat';
    s.state.wave = 40;
    s.state.baseHp = 1e9;
    for (let i = 0; i < 100; i++) {
      const e = s.spawn((['goblin', 'ogre', 'wraith'] as const)[i % 3]);
      e.progress = (i / 100) * getRoute(s.map, e.routeId).length;
      Object.assign(e, pathPosition(e.progress, s.map, e.routeId));
    }
    assert.equal(s.state.enemies.size, 100);
    const start = performance.now();
    for (let i = 0; i < 200; i++) s.step();
    const average = (performance.now() - start) / 200;
    assert.ok(average < 50, `${id}: ${average} ms exceeds 50 ms tick budget`);
    console.log(`${id}: 100 enemies / 30 towers, ${average.toFixed(2)} ms per tick`);
  });
}
test('maps expose the intended entrance and route topology', () => {
  assert.deepEqual(
    MAP_IDS.map((id) => [entrances(MAPS[id]).length, MAPS[id].routes.length]),
    [
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
      [1, 3],
    ],
  );
});
test('spawning distributes the unchanged wave evenly across routes and resets each wave', () => {
  const s = sim('glutspalten');
  command(s, { action: 'startWave' });
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 3000 && s.state.completedWaves === 0; i++) {
    s.step();
    for (const e of s.state.enemies.values())
      if (!seen.has(e.id)) {
        seen.add(e.id);
        ids.push(e.routeId);
      }
  }
  assert.equal(ids.length, 10);
  assert.deepEqual(
    ids,
    Array.from({ length: 10 }, (_, i) => s.map.routes[i % 3].id),
  );
  command(s, { action: 'startWave' });
  s.step();
  assert.equal([...s.state.enemies.values()][0].routeId, s.map.routes[0].id);
});
test('target selection compares remaining distance rather than traveled distance', () => {
  const s = sim('frostklamm');
  s.state.wave = 1;
  s.state.phase = 'combat';
  const far = s.spawn('ogre'),
    near = s.spawn('ogre');
  far.routeId = 'west-high';
  near.routeId = 'east';
  far.progress = getRoute(s.map, far.routeId).length - 7;
  near.progress = getRoute(s.map, near.routeId).length - 4;
  assert.ok(far.progress > near.progress, 'fixture distinguishes absolute progress');
  Object.assign(far, pathPosition(far.progress, s.map, far.routeId), { speed: 0 });
  Object.assign(near, pathPosition(near.progress, s.map, near.routeId), { speed: 0 });
  const site = buildSites('frostklamm').find((p) => distance(p, far) < 6.2 && distance(p, near) < 6.2)!;
  assert.ok(site);
  command(s, { action: 'build', kind: 'grenade', ...site });
  let shot: { to: { x: number; z: number } } | undefined;
  s.onShot = (v) => {
    shot = v;
  };
  s.step();
  assert.ok(shot);
  assert.ok(distance(shot.to, near) < 0.01);
});
test('host can change lobby map, real changes clear readiness, and active runs are locked', () => {
  const s = sim('waldtal');
  s.state.mode = 'coop';
  s.state.lobby = true;
  s.addPlayer('bob');
  for (const p of s.state.players.values()) p.ready = true;
  assert.equal(command(s, { action: 'setMap', mapId: 'silberfurt' }, 'bob').ok, false);
  assert.equal(command(s, { action: 'setMap', mapId: '__proto__' }).ok, false);
  assert.ok(command(s, { action: 'setMap', mapId: 'waldtal' }).ok);
  assert.ok([...s.state.players.values()].every((p) => p.ready));
  const action = { id: 'map-once', action: 'setMap', mapId: 'silberfurt' };
  assert.ok(s.command('alice', action).ok);
  assert.ok([...s.state.players.values()].every((p) => !p.ready));
  for (const p of s.state.players.values()) p.ready = true;
  assert.ok(s.command('alice', action).ok);
  assert.ok([...s.state.players.values()].every((p) => p.ready));
  command(s, { action: 'startGame' });
  assert.equal(command(s, { action: 'setMap', mapId: 'frostklamm' }).ok, false);
  s.state.phase = 'defeat';
  command(s, { action: 'restart' });
  assert.equal(s.state.mapId, 'silberfurt');
  assert.equal(s.state.lobby, true);
});
